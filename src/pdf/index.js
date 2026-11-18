/**
 * PDF engine of the paper reader: opens complete PDF bytes through PDF.js in a
 * dedicated module worker, rasterizes pages, and builds the selectable text
 * layer that right-click questions read. Loaded lazily through the plugin's
 * `require.async` chunk so the application boot does not pay for PDF.js.
 */
import { getDocument, PDFWorker } from 'pdfjs-dist'
import { TextLayerBuilder } from 'pdfjs-dist/web/pdf_viewer.mjs'
import katex from 'katex'
import { assets, workerSource } from './assets.generated.js'
import { katexCss } from './katex.generated.js'

export { katexCss }

/**
 * Typeset one LaTeX fragment with KaTeX.
 * @param {string} tex - LaTeX source.
 * @param {boolean} displayMode - whether the formula stands on its own line.
 * @returns {string} KaTeX HTML, or empty text when the fragment cannot be parsed.
 */
export function renderMath(tex, displayMode) {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'html',
      maxSize: 20,
      maxExpand: 200,
    })
  } catch (error) {
    console.error('[paper-reader] KaTeX failed to render a formula', error)
    return ''
  }
}

/** Resolve PDF.js's binary resources from the bundle instead of the network. */
class PdfBinaryDataFactory {
  /**
   * @param {object} request - PDF.js resource kind and exact filename.
   * @returns {Promise<Uint8Array>} the bundled resource bytes.
   */
  async fetch({ kind, filename }) {
    const files = assets[kind] ?? {}
    const data = Object.hasOwn(files, filename) ? files[filename] : undefined
    if (data === undefined) throw new Error(`PDF.js asset is not bundled: ${kind}/${filename}`)
    return Uint8Array.from(atob(data), character => character.charCodeAt(0))
  }
}

/**
 * Open PDF bytes in one worker and resolve the document proxy.
 * @param {Uint8Array} data - complete file bytes.
 * @returns {Promise<{document: object, numPages: number, dispose: () => Promise<void>}>}
 */
export async function openPdf(data) {
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
  const worker = new Worker(url, { type: 'module', name: 'paper-reader-pdf' })
  const bridge = PDFWorker.create({ port: worker })
  const loading = getDocument({
    data: data.slice(),
    worker: bridge,
    BinaryDataFactory: PdfBinaryDataFactory,
    cMapPacked: true,
    useWorkerFetch: false,
    enableXfa: false,
    stopAtErrors: true,
    isEvalSupported: false,
  })
  const document = await loading.promise
  return {
    document,
    numPages: document.numPages,
    async dispose() {
      try {
        await loading.destroy()
      } catch (error) {
        console.error('[paper-reader] PDF destroy failed', error)
      }
      try {
        bridge.destroy()
      } catch (error) {
        console.error('[paper-reader] PDF worker bridge failed', error)
      }
      worker.terminate()
      URL.revokeObjectURL(url)
    },
  }
}

/**
 * Read one page's unscaled display size (CSS pixels at scale 1).
 * @param {object} document - PDF.js document proxy.
 * @param {number} pageNumber - 1-based page number.
 * @returns {Promise<{width: number, height: number}>}
 */
export async function pageSize(document, pageNumber) {
  const page = await document.getPage(pageNumber)
  try {
    const viewport = page.getViewport({ scale: 1 })
    return { width: viewport.width, height: viewport.height }
  } finally {
    page.cleanup()
  }
}

/**
 * Render one page into its own canvas and build its selectable text layer.
 * @param {object} document - PDF.js document proxy.
 * @param {number} pageNumber - 1-based page number.
 * @param {HTMLCanvasElement} canvas - canvas owned by this render.
 * @param {HTMLDivElement | null} textHost - overlay that receives the text layer.
 * @param {number} cssWidth - displayed page width in CSS pixels.
 * @param {AbortSignal} signal - render lifetime.
 * @returns {Promise<{width: number, height: number}>} displayed size.
 */
export async function renderPage(document, pageNumber, canvas, textHost, cssWidth, signal) {
  const page = await document.getPage(pageNumber)
  try {
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: cssWidth / base.width })
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2)
    const ratio = Math.min(dpr, Math.sqrt(16_777_216 / (viewport.width * viewport.height)))
    canvas.width = Math.max(1, Math.floor(viewport.width * ratio))
    canvas.height = Math.max(1, Math.floor(viewport.height * ratio))
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    const task = page.render({
      canvas,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    })
    let text
    if (textHost !== null) {
      textHost.replaceChildren()
      const layer = new TextLayerBuilder({
        pdfPage: page,
        onAppend: () => { textHost.append(layer.div) },
      })
      const container = layer.div
      container.style.setProperty('--total-scale-factor', String(viewport.scale * viewport.userUnit))
      container.style.setProperty('--scale-round-x', '1px')
      container.style.setProperty('--scale-round-y', '1px')
      text = { promise: layer.render({ viewport }), cancel: () => layer.cancel() }
    }
    const abort = () => {
      task.cancel()
      text?.cancel()
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      await Promise.all([task.promise, text?.promise])
    } finally {
      signal.removeEventListener('abort', abort)
    }
    if (signal.aborted) throw new DOMException('render aborted', 'AbortError')
    return { width: viewport.width, height: viewport.height }
  } finally {
    page.cleanup()
  }
}

/**
 * Extract one page's text, used when a question has no selected passage.
 * @param {object} document - PDF.js document proxy.
 * @param {number} pageNumber - 1-based page number.
 * @returns {Promise<string>} readable page text.
 */
export async function pageText(document, pageNumber) {
  const page = await document.getPage(pageNumber)
  try {
    const content = await page.getTextContent()
    const parts = []
    for (const item of content.items) {
      if (typeof item.str !== 'string') continue
      parts.push(item.str)
      if (item.hasEOL) parts.push('\n')
    }
    return parts.join(' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  } finally {
    page.cleanup()
  }
}
