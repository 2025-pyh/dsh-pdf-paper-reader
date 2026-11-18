/**
 * Browser half of the paper reader: a dedicated main panel that renders a PDF
 * page by page with a selectable text layer, a small toolbar for zoom and page
 * navigation, persistent text highlights, and a floating ask panel that sends
 * the selected passage to this bundle's Host half (which calls the configured
 * model) and streams the answer back without leaving the paper.
 *
 * PDF.js lives in the `./client.pdfjs.js` chunk and is required only when a
 * paper is opened.
 */
import * as React from 'react'

const h = React.createElement

/** Locale namespace owned by this plugin. */
const NS = 'paperReader'
/** The main-panel key the sidebar entry opens. */
const PANEL_ID = 'paper-reader'
/** Host route that streams one answer. */
const ASK_ROUTE = 'api/paper-reader/ask'
/** Lazily required chunk that carries PDF.js. */
const PDF_CHUNK = './client.pdfjs.js'
/** Browser storage key for highlights. */
const STORAGE_KEY = 'dsh.paper-reader.annotations.v1'
/** Zoom of the fit-width view. */
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_STEP = 0.15

const zh = {
  panel: '论文阅读',
  open: '打开 PDF',
  close: '关闭论文',
  emptyTitle: '在独立页面里读论文',
  emptyHint: '打开一个 PDF 文件，选中不懂的句子后右击（或点浮动小工具条），就可以直接问 DeepSeek，也可以把重点高亮记下来。',
  emptyDrop: '把 PDF 拖到这里，或点击「打开 PDF」',
  loading: '正在打开 PDF…',
  rendering: '正在渲染…',
  pageFailed: '这一页渲染失败：{message}',
  openFailed: '无法打开这个 PDF：{message}',
  hint: '选中文字后可问 DeepSeek，或右击',
  ask: '问 DeepSeek',
  highlight: '高亮',
  highlightAsk: '问 DeepSeek',
  highlightRemove: '删除高亮',
  copy: '复制选中文字',
  dismiss: '关闭菜单',
  askTitle: '问 DeepSeek',
  askEmpty: '选中文字后右击，或在这一页任意位置右击提问。',
  askQuote: '选中的内容',
  askPage: '第 {page} 页',
  askPlaceholder: '追问…（Enter 发送）',
  send: '发送',
  thinking: '正在思考…',
  failed: '回答失败：{message}',
  noAnswer: '（没有返回内容）',
  zoomOut: '缩小',
  zoomIn: '放大',
  zoomFit: '适合宽度',
  zoomValue: '{percent}%',
  pagePrev: '上一页',
  pageNext: '下一页',
  pageOf: '第 {page} 页 / 共 {total} 页',
  jump: '跳转',
  history: '历史阅读',
  historyTitle: '历史阅读',
  historyEmpty: '还没有读过论文。打开过的 PDF 会自动出现在这里，只保存在本机浏览器。',
  historyPages: '{pages} 页',
  historyRemove: '从历史里移除',
  historyClear: '清空历史',
  historyCount: '历史阅读（{count}）',
  dropNow: '松开即可打开这份 PDF',
  historyOpenFailed: '打开历史里的论文失败：{message}',
}

const en = {
  panel: 'Paper reader',
  open: 'Open PDF',
  close: 'Close paper',
  emptyTitle: 'Read a paper on its own page',
  emptyHint: 'Open a PDF, select a passage you do not understand, then right-click it (or use the floating toolbar) to ask DeepSeek, and highlight what matters.',
  emptyDrop: 'Drop a PDF here, or click “Open PDF”',
  loading: 'Opening PDF…',
  rendering: 'Rendering…',
  pageFailed: 'This page failed to render: {message}',
  openFailed: 'Could not open this PDF: {message}',
  hint: 'Select text to ask DeepSeek, or right-click',
  ask: 'Ask DeepSeek',
  highlight: 'Highlight',
  highlightAsk: 'Ask DeepSeek',
  highlightRemove: 'Remove highlight',
  copy: 'Copy selected text',
  dismiss: 'Close menu',
  askTitle: 'Ask DeepSeek',
  askEmpty: 'Select a passage and right-click, or right-click anywhere on the page.',
  askQuote: 'Selected passage',
  askPage: 'Page {page}',
  askPlaceholder: 'Ask a follow-up… (Enter to send)',
  send: 'Send',
  thinking: 'Thinking…',
  failed: 'The answer failed: {message}',
  noAnswer: '(no content returned)',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  zoomFit: 'Fit width',
  zoomValue: '{percent}%',
  pagePrev: 'Previous page',
  pageNext: 'Next page',
  pageOf: 'Page {page} of {total}',
  jump: 'Jump',
  history: 'History',
  historyTitle: 'Reading history',
  historyEmpty: 'No papers yet. Every PDF you open is remembered here, on this browser only.',
  historyPages: '{pages} pages',
  historyRemove: 'Remove from history',
  historyClear: 'Clear history',
  historyCount: 'History ({count})',
  dropNow: 'Release to open this PDF',
  historyOpenFailed: 'Could not open the paper from history: {message}',
}

/** Replace `{name}` placeholders of one dictionary entry. */
function format(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match))
}

/** LaTeX commands the answer panel turns into plain Unicode math. */
const MATH_SYMBOLS = {
  '\\times': '×',
  '\\cdot': '·',
  '\\div': '÷',
  '\\pm': '±',
  '\\mp': '∓',
  '\\approx': '≈',
  '\\neq': '≠',
  '\\ne': '≠',
  '\\leq': '≤',
  '\\le': '≤',
  '\\geq': '≥',
  '\\ge': '≥',
  '\\ll': '≪',
  '\\gg': '≫',
  '\\infty': '∞',
  '\\sum': '∑',
  '\\prod': '∏',
  '\\int': '∫',
  '\\partial': '∂',
  '\\nabla': '∇',
  '\\in': '∈',
  '\\notin': '∉',
  '\\subset': '⊂',
  '\\subseteq': '⊆',
  '\\cup': '∪',
  '\\cap': '∩',
  '\\forall': '∀',
  '\\exists': '∃',
  '\\rightarrow': '→',
  '\\to': '→',
  '\\leftarrow': '←',
  '\\Rightarrow': '⇒',
  '\\Leftarrow': '⇐',
  '\\leftrightarrow': '↔',
  '\\ldots': '…',
  '\\dots': '…',
  '\\cdots': '⋯',
  '\\vdots': '⋮',
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\epsilon': 'ε',
  '\\varepsilon': 'ε',
  '\\zeta': 'ζ',
  '\\eta': 'η',
  '\\theta': 'θ',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\nu': 'ν',
  '\\xi': 'ξ',
  '\\pi': 'π',
  '\\rho': 'ρ',
  '\\sigma': 'σ',
  '\\tau': 'τ',
  '\\phi': 'φ',
  '\\varphi': 'φ',
  '\\chi': 'χ',
  '\\psi': 'ψ',
  '\\omega': 'ω',
  '\\Gamma': 'Γ',
  '\\Delta': 'Δ',
  '\\Theta': 'Θ',
  '\\Lambda': 'Λ',
  '\\Xi': 'Ξ',
  '\\Pi': 'Π',
  '\\Sigma': 'Σ',
  '\\Phi': 'Φ',
  '\\Psi': 'Ψ',
  '\\Omega': 'Ω',
  '\\%': '%',
  '\\&': '&',
  '\\#': '#',
  '\\_': '_',
  '\\{': '{',
  '\\}': '}',
}

/**
 * Turn LaTeX fragments in a model answer into readable plain math, so a
 * formula like `\frac{QK^T}{\sqrt{d_k}}` reads `(QK^T)/(√(d_k))`.
 * @param {string} input - model answer text.
 * @returns {string} text with the common LaTeX constructs spelled out.
 */
function plainMath(input) {
  let text = String(input)
  for (let pass = 0; pass < 4; pass += 1) {
    text = text.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
    text = text.replace(/\\dfrac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
    text = text.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, '($2)^(1/$1)')
    text = text.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
    text = text.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|textrm|textit)\s*\{([^{}]*)\}/g, '$1')
  }
  text = text.replace(/\\(?:left|right|big|Big|bigg|Bigg)/g, '')
  text = text.replace(/\bsqrt\s*\(([^()]*)\)/g, '√($1)')
  text = text.replace(/\bsqrt\s*([A-Za-z0-9_]+)/g, '√$1')
  text = text.replace(/\^\{([^{}]*)\}/g, '^($1)')
  text = text.replace(/_\{([^{}]*)\}/g, '_($1)')
  text = text.replace(/\\[a-zA-Z]+/g, match => MATH_SYMBOLS[match] ?? match.slice(1))
  text = text.replace(/\\[,;:! ]/g, ' ')
  text = text.replace(/\$\$?/g, '')
  text = text.replace(/\\\(|\\\)|\\\[|\\\]/g, '')
  return text
}

/** Render one model answer for the floating panel: readable math, no markup noise. */
function readableAnswer(input) {
  const text = plainMath(input)
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '· ')
}

/** One LaTeX segment of an answer: `$$…$$`, `\[…\]`, `\(…\)`, or `$…$`. */
const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g

/**
 * Render one model answer, typesetting its LaTeX segments with KaTeX and
 * leaving the prose untouched.
 * @param {string} answer - model answer text.
 * @param {object|null} engine - lazily loaded chunk exposing `renderMath`.
 * @returns {Array|string} React children for the answer paragraph.
 */
function renderAnswer(answer, engine) {
  if (engine === null || typeof engine.renderMath !== 'function') return readableAnswer(answer)
  const nodes = []
  let last = 0
  let match
  MATH_PATTERN.lastIndex = 0
  while ((match = MATH_PATTERN.exec(answer)) !== null) {
    if (match.index > last) nodes.push(answer.slice(last, match.index))
    const tex = match[1] ?? match[2] ?? match[3] ?? match[4]
    const display = match[1] !== undefined || match[2] !== undefined
    nodes.push(h('span', {
      key: `math-${match.index}`,
      className: display ? 'pr-math pr-math-block' : 'pr-math',
      dangerouslySetInnerHTML: { __html: engine.renderMath(tex, display) },
    }))
    last = match.index + match[0].length
  }
  if (last === 0) return readableAnswer(answer)
  nodes.push(answer.slice(last))
  return nodes
}

const STYLE = `
.pr-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font,sans-serif)}
.pr-toolbar{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;flex-wrap:wrap}
.pr-title{flex:1;min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--dsw-alias-label-secondary)}
.pr-title strong{color:var(--dsw-alias-label-primary);font-weight:600}
.pr-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:4px 10px;font-size:12px;line-height:20px;cursor:pointer;white-space:nowrap}
.pr-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.pr-btn:disabled{opacity:.5;cursor:default}
.pr-group{display:flex;align-items:center;gap:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:1px}
.pr-group .pr-btn{border:0;background:transparent;padding:3px 7px;min-width:24px}
.pr-symbol{font-size:14px;line-height:18px}
.pr-zoom-value{min-width:46px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.pr-page-input{width:40px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;padding:2px 4px;text-align:center;font-variant-numeric:tabular-nums}
.pr-page-total{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}
.pr-scroll{position:relative;flex:1;min-width:0;min-height:0;overflow:auto;background:var(--dsw-alias-bg-layer-2)}
.pr-body{display:flex;flex:1;min-height:0;position:relative}
.pr-pages{display:flex;flex-direction:column;align-items:center;gap:18px;padding:20px 24px 48px;min-height:100%;box-sizing:border-box}
.pr-page{position:relative;flex:none;background:#fff;box-shadow:0 2px 18px rgba(0,0,0,.18)}
.pr-canvas{display:block;max-width:none}
.pr-text{position:absolute;inset:0;overflow:clip}
.pr-hl{position:absolute;pointer-events:none;background:rgba(255,208,46,.42);border-radius:1px;mix-blend-mode:multiply}
.pr-hl.active{background:rgba(255,170,40,.62)}
.pr-text .textLayer{position:absolute;inset:0;text-align:initial;overflow:clip;line-height:1;letter-spacing:normal;word-spacing:normal;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;caret-color:CanvasText;z-index:0;--text-scale-factor:calc(var(--total-scale-factor)*var(--min-font-size));--min-font-size-inv:calc(1/var(--min-font-size))}
.pr-text .textLayer[data-main-rotation="90"]{transform:rotate(90deg) translateY(-100%)}
.pr-text .textLayer[data-main-rotation="180"]{transform:rotate(180deg) translate(-100%,-100%)}
.pr-text .textLayer[data-main-rotation="270"]{transform:rotate(270deg) translateX(-100%)}
.pr-text :is(span,br){position:absolute;color:transparent;white-space:pre;cursor:text;transform-origin:0 0;user-select:text}
.pr-text .textLayer>:not(.markedContent),.pr-text .markedContent span:not(.markedContent){z-index:1;--font-height:0;--scale-x:1;--rotate:0deg;font-size:calc(var(--text-scale-factor)*var(--font-height));transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}
.pr-text .markedContent{display:contents}
.pr-text ::selection{background:rgba(37,119,191,.28);color:transparent}
.pr-text br::selection{background:transparent}
.pr-text .textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;z-index:0;cursor:default;user-select:none}
.pr-text .textLayer.selecting .endOfContent{top:0}
.pr-page-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);font-size:12px;background:var(--dsw-alias-bg-layer-2)}
.pr-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;text-align:center}
.pr-empty h2{margin:0;font-size:17px;font-weight:600}
.pr-empty p{margin:0;max-width:560px;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-secondary)}
.pr-drop{margin-top:8px;width:min(720px,92%);min-height:200px;padding:28px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border:1.5px dashed var(--dsw-alias-border-l2);border-radius:14px;font-size:14px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-bg-layer-1)}
.pr-drop:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.pr-drop.dragover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.pr-history-link{margin-top:6px;font-size:12px}
.pr-history{flex:none;width:min(420px,42%);display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.pr-hist-count{font-size:11px;color:var(--dsw-alias-label-secondary);margin-right:4px}
.pr-history-list{flex:1;min-height:0;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
.pr-hist-row{position:relative;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:8px;padding:8px 30px 8px 10px;cursor:pointer;display:flex;flex-direction:column;gap:4px}
.pr-hist-row:hover{border-color:var(--dsw-alias-brand-primary)}
.pr-hist-name{font-size:12.5px;line-height:1.45;word-break:break-all;color:var(--dsw-alias-label-primary)}
.pr-hist-meta{font-size:11px;color:var(--dsw-alias-label-secondary);display:flex;gap:10px;flex-wrap:wrap}
.pr-hist-del{position:absolute;top:4px;right:4px}
.pr-hist-foot{flex:none;padding:8px;border-top:1px solid var(--dsw-alias-border-l1);display:flex;justify-content:flex-end}
.pr-hint{position:sticky;top:0;z-index:3;align-self:center;margin:8px 0 -8px;padding:3px 10px;border-radius:999px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;pointer-events:none}
.pr-menu{position:fixed;z-index:60;min-width:168px;padding:4px;border-radius:8px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 8px 28px rgba(0,0,0,.28)}
.pr-menu button{display:block;width:100%;text-align:left;appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-primary);border-radius:5px;padding:6px 10px;font-size:12.5px;line-height:20px;cursor:pointer}
.pr-menu button:hover{background:var(--dsw-alias-bg-layer-2)}
.pr-menu hr{border:0;border-top:1px solid var(--dsw-alias-border-l1);margin:4px 6px}
.pr-selbar{position:fixed;z-index:55;display:flex;align-items:center;gap:2px;padding:3px;border-radius:8px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 6px 20px rgba(0,0,0,.26)}
.pr-selbar button{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-primary);border-radius:5px;padding:4px 8px;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.pr-selbar button:hover{background:var(--dsw-alias-bg-layer-2)}
.pr-selbar .pr-selbar-ask{color:var(--dsw-alias-brand-primary);font-weight:600}
.pr-selbar hr{align-self:stretch;border:0;border-left:1px solid var(--dsw-alias-border-l1);margin:2px}
.pr-ask{flex:none;width:min(420px,42%);display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);z-index:20;overflow:hidden}
.pr-ask-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.pr-ask-head strong{flex:1;font-size:12.5px;font-weight:600}
.pr-ask-body{flex:1;min-height:0;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:12px}
.pr-x{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1;cursor:pointer;padding:2px 4px;border-radius:4px}
.pr-x:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.pr-quote{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-left:2px solid var(--dsw-alias-brand-primary);border-radius:0 6px 6px 0;padding:6px 8px;max-height:120px;overflow:auto;white-space:pre-wrap}
.pr-q{margin:6px 0 0;font-size:13px;font-weight:600;line-height:1.6;white-space:pre-wrap}
.pr-a{margin:4px 0 0;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word}
.pr-math{white-space:normal}
.pr-math-block{display:block;margin:6px 0;overflow-x:auto;overflow-y:hidden}
.pr-math .katex{font-size:1.05em}
.pr-math-block .katex-display{margin:0;text-align:left}
.pr-a.error{color:var(--dsw-alias-state-error-primary)}
.pr-meta{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:4px}
.pr-empty-ask{font-size:12.5px;color:var(--dsw-alias-label-secondary);line-height:1.7}
.pr-ask-foot{flex:none;border-top:1px solid var(--dsw-alias-border-l1);padding:8px;display:flex;flex-direction:column;gap:6px}
.pr-ask-foot textarea{width:100%;box-sizing:border-box;resize:none;height:44px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12.5px;line-height:1.5;padding:6px 8px;outline:none}
.pr-ask-foot textarea:focus{border-color:var(--dsw-alias-brand-primary)}
.pr-ask-actions{display:flex;justify-content:flex-end}
`

/** Load the PDF engine chunk once per page lifetime. */
let enginePromise = null
function loadEngine() {
  enginePromise ??= require.async(PDF_CHUNK).catch((error) => {
    enginePromise = null
    throw error
  })
  return enginePromise
}

/** Cross-carrier fetch: the page shell may install its own transport. */
function pageFetch(input, init) {
  const carrier = globalThis.__DSH_TRANSPORT__?.fetch
  return carrier === undefined ? fetch(input, init) : carrier(input, init)
}

/** Mutable reader state that outlives panel switches. */
const state = {
  name: null,
  size: 0,
  lastData: null,
  session: null,
  numPages: 0,
  sizes: [],
  loading: false,
  error: '',
  zoom: 1,
  containerWidth: 0,
  pendingRestore: null,
  currentPage: 1,
  highlights: [],
  history: [],
  historyOpen: false,
  highlightMenu: null,
  selectionToolbar: null,
  menu: null,
  ask: {
    open: false,
    exchanges: [],
    streaming: false,
    controller: null,
    draft: '',
  },
}
let version = 0
const listeners = new Set()

/** Publish one state change to mounted components. */
function emit() {
  version += 1
  for (const listener of listeners) listener()
}

/** Subscribe a component to {@link emit}. */
function useVersion() {
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const listener = () => { setTick(value => value + 1) }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])
  return version
}

/** Read the whole highlight store. */
function readHighlightStore() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return value !== null && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

/** Persist the whole highlight store. */
function writeHighlightStore(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Storage may be full or disabled; highlights then live for this page only.
  }
}

/** Identity of the open document for highlight persistence. */
function docKey() {
  if (state.name === null) return ''
  return `${state.name}|${state.size}|${state.numPages}`
}

/** IndexedDB database holding the locally remembered papers. */
const HISTORY_DB = 'dsh-paper-reader-history'
const HISTORY_META = 'meta'
const HISTORY_DATA = 'data'
const HISTORY_LIMIT = 20
const HISTORY_MAX_BYTES = 60 * 1024 * 1024

/** Open (and lazily create) the history database. */
function historyDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(HISTORY_META)) db.createObjectStore(HISTORY_META, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(HISTORY_DATA)) db.createObjectStore(HISTORY_DATA, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Wrap one IndexedDB request in a promise. */
function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Run one write transaction over the named stores. */
function idbWrite(db, stores, mutate) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite')
    mutate(tx)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** Read every remembered paper metadata row, newest first. */
async function historyList() {
  const db = await historyDb()
  try {
    const tx = db.transaction(HISTORY_META, 'readonly')
    const rows = await idbRequest(tx.objectStore(HISTORY_META).getAll())
    return rows.sort((left, right) => right.lastOpened - left.lastOpened)
  } finally {
    db.close()
  }
}

/** Remember one opened paper and drop entries beyond the limit. */
async function historySave(entry, data) {
  if (data.byteLength > HISTORY_MAX_BYTES) return
  const db = await historyDb()
  try {
    await idbWrite(db, [HISTORY_META, HISTORY_DATA], (tx) => {
      tx.objectStore(HISTORY_META).put(entry)
      tx.objectStore(HISTORY_DATA).put({ id: entry.id, blob: new Blob([data], { type: 'application/pdf' }) })
    })
    const rows = await historyList()
    for (const extra of rows.slice(HISTORY_LIMIT)) await historyRemove(extra.id)
  } finally {
    db.close()
  }
}

/** Delete one remembered paper. */
async function historyRemove(id) {
  const db = await historyDb()
  try {
    await idbWrite(db, [HISTORY_META, HISTORY_DATA], (tx) => {
      tx.objectStore(HISTORY_META).delete(id)
      tx.objectStore(HISTORY_DATA).delete(id)
    })
  } finally {
    db.close()
  }
}

/** Delete every remembered paper. */
async function historyClearAll() {
  const db = await historyDb()
  try {
    await idbWrite(db, [HISTORY_META, HISTORY_DATA], (tx) => {
      tx.objectStore(HISTORY_META).clear()
      tx.objectStore(HISTORY_DATA).clear()
    })
  } finally {
    db.close()
  }
}

/** Load one remembered paper back as a File. */
async function historyLoad(id) {
  const db = await historyDb()
  try {
    const metaTx = db.transaction(HISTORY_META, 'readonly')
    const meta = await idbRequest(metaTx.objectStore(HISTORY_META).get(id))
    if (meta === undefined) return null
    const dataTx = db.transaction(HISTORY_DATA, 'readonly')
    const stored = await idbRequest(dataTx.objectStore(HISTORY_DATA).get(id))
    if (stored === undefined || stored.blob === undefined) return null
    return new File([stored.blob], meta.name, { type: 'application/pdf' })
  } finally {
    db.close()
  }
}

/** Refresh the visible history list. */
async function refreshHistory() {
  try {
    state.history = await historyList()
  } catch (error) {
    console.error('[paper-reader] history read failed', error)
  }
  emit()
}

/** Remember the currently open paper (best effort). */
function rememberPaper(data) {
  if (state.name === null) return
  const entry = {
    id: `${state.name}|${state.size}`,
    name: state.name,
    size: state.size,
    pages: state.numPages,
    savedAt: Date.now(),
    lastOpened: Date.now(),
  }
  void historySave(entry, data).then(
    () => { void refreshHistory() },
    (error) => { console.error('[paper-reader] history save failed', error) },
  )
}

/** Open one paper listed in the history panel. */
async function openHistoryEntry(entry) {
  try {
    const file = await historyLoad(entry.id)
    if (file === null) return
    state.historyOpen = false
    await openFile(file)
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
    emit()
  }
}

/** Remove one history row. */
async function removeHistoryEntry(id) {
  try {
    await historyRemove(id)
  } finally {
    await refreshHistory()
  }
}

/** Clear the whole reading history. */
async function clearReadingHistory() {
  try {
    await historyClearAll()
  } finally {
    await refreshHistory()
  }
}

/** Load this document's saved highlights. */
function loadHighlights() {
  const key = docKey()
  const saved = key === '' ? undefined : readHighlightStore()[key]
  state.highlights = Array.isArray(saved) ? saved : []
}

/** Persist this document's highlights. */
function saveHighlights() {
  const key = docKey()
  if (key === '') return
  const all = readHighlightStore()
  all[key] = state.highlights
  writeHighlightStore(all)
}

/** Displayed width of one page in CSS pixels. */
function pageWidth() {
  const fit = Math.min(Math.max(320, Math.round(state.containerWidth - 48)), 1080)
  return Math.max(120, Math.round(fit * state.zoom))
}

/** Page nearest the current scroll position; the last page wins at the bottom. */
function pickPage(node, pages) {
  const elements = pages?.children
  if (elements === undefined || elements.length === 0) return 1
  const anchor = node.scrollTop + 24
  let best = 1
  let bestDiff = Infinity
  for (let index = 0; index < elements.length; index += 1) {
    const diff = Math.abs(elements[index].offsetTop - anchor)
    if (diff < bestDiff) {
      bestDiff = diff
      best = index + 1
    }
  }
  if (node.scrollTop + node.clientHeight >= node.scrollHeight - 4) return elements.length
  return best
}

/** Open one chosen file into the reader. */
async function openFile(file) {
  if (file === null || file === undefined) return
  state.loading = true
  state.error = ''
  state.ask = { open: false, exchanges: [], streaming: false, controller: null, draft: '' }
  state.highlights = []
  state.currentPage = 1
  state.selectionToolbar = null
  state.menu = null
  state.highlightMenu = null
  emit()
  try {
    const engine = await loadEngine()
    const data = new Uint8Array(await file.arrayBuffer())
    if (state.session !== null) {
      const previous = state.session
      state.session = null
      void previous.dispose()
    }
    const session = await engine.openPdf(data)
    const sizes = []
    for (let page = 1; page <= session.numPages; page += 1) sizes.push(await engine.pageSize(session.document, page))
    state.session = session
    state.numPages = session.numPages
    state.sizes = sizes
    state.name = file.name ?? 'paper.pdf'
    state.size = file.size
    state.lastData = data
    state.loading = false
    state.historyOpen = false
    loadHighlights()
    emit()
    rememberPaper(data)
  } catch (error) {
    state.loading = false
    state.error = error instanceof Error ? error.message : String(error)
    emit()
  }
}

/** Close the current paper and release its worker. */
function closeFile() {
  const session = state.session
  state.session = null
  state.numPages = 0
  state.sizes = []
  state.name = null
  state.size = 0
  state.lastData = null
  state.error = ''
  state.highlights = []
  state.selectionToolbar = null
  state.menu = null
  state.highlightMenu = null
  state.ask = { open: false, exchanges: [], streaming: false, controller: null, draft: '' }
  emit()
  if (session !== null) void session.dispose()
}

/** Replace the window selection with nothing. */
function clearSelection() {
  const selection = window.getSelection()
  if (selection !== null) selection.removeAllRanges()
}

/** Text nodes of one span in document order. */
function textNodesOf(span) {
  const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT)
  const nodes = []
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) nodes.push(node)
  return nodes
}

/** Character offset of a selection boundary inside one span. */
function offsetInSpan(span, container, offset) {
  if (!span.contains(container)) return 0
  let total = 0
  const nodes = textNodesOf(span)
  for (const node of nodes) {
    if (node === container) return total + offset
    total += node.data.length
  }
  return total
}

/** Resolve a character offset inside one span back to a DOM boundary. */
function boundaryInSpan(span, offset) {
  const nodes = textNodesOf(span)
  if (nodes.length === 0) return null
  let remaining = Math.max(0, offset)
  for (const node of nodes) {
    if (remaining <= node.data.length) return { node, offset: remaining }
    remaining -= node.data.length
  }
  const last = nodes[nodes.length - 1]
  return { node: last, offset: last.data.length }
}

/** Text-layer span index containing one selection boundary. */
function spanIndexOf(spans, node) {
  return spans.findIndex(span => span.contains(node))
}

/**
 * Describe the current selection as durable page-relative anchor.
 * @param {Element} pageElement - the page the selection starts on.
 * @returns {{page:number,start:{span:number,offset:number},end:{span:number,offset:number},text:string}|null}
 */
function anchorOfSelection(pageElement) {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const layer = pageElement.querySelector('.textLayer')
  if (layer === null) return null
  const spans = Array.from(layer.querySelectorAll('span'))
  const startSpan = spanIndexOf(spans, range.startContainer)
  const endSpan = spanIndexOf(spans, range.endContainer)
  if (startSpan < 0 || endSpan < 0) return null
  const text = selection.toString().replace(/\s+/g, ' ').trim().slice(0, 6000)
  if (text === '') return null
  return {
    page: Number(pageElement.getAttribute('data-page')),
    start: { span: startSpan, offset: offsetInSpan(spans[startSpan], range.startContainer, range.startOffset) },
    end: { span: endSpan, offset: offsetInSpan(spans[endSpan], range.endContainer, range.endOffset) },
    text,
  }
}

/** Rebuild one highlight's client rectangles from a page's rendered text layer. */
function highlightRects(spans, anchor, pageRect) {
  const startSpan = spans[anchor.start.span]
  const endSpan = spans[anchor.end.span]
  if (startSpan === undefined || endSpan === undefined) return []
  const start = boundaryInSpan(startSpan, anchor.start.offset)
  const end = boundaryInSpan(endSpan, anchor.end.offset)
  if (start === null || end === null) return []
  const range = document.createRange()
  try {
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
  } catch {
    return []
  }
  const rects = []
  for (const rect of range.getClientRects()) {
    if (rect.width <= 0.5 || rect.height <= 0.5) continue
    rects.push({
      left: rect.left - pageRect.left,
      top: rect.top - pageRect.top,
      width: rect.width,
      height: rect.height,
    })
  }
  return rects
}

/** Add one highlight from a captured selection anchor. */
function addHighlight(anchor) {
  const highlight = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    page: anchor.page,
    start: anchor.start,
    end: anchor.end,
    text: anchor.text,
    createdAt: Date.now(),
  }
  state.highlights = [...state.highlights, highlight]
  state.selectionToolbar = null
  state.menu = null
  saveHighlights()
  clearSelection()
  emit()
}

/** Remove one highlight by id. */
function removeHighlight(id) {
  state.highlights = state.highlights.filter(highlight => highlight.id !== id)
  state.highlightMenu = null
  saveHighlights()
  emit()
}

/** Read NDJSON answer events from the Host route. */
async function streamAsk(payload, onEvent, signal) {
  const url = new URL(ASK_ROUTE, document.baseURI)
  const response = await pageFetch(url.href, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (response.body === null) throw new Error('the answer had no body')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      if (line === '') continue
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      onEvent(event)
    }
  }
}

/**
 * Ask about one passage (or the current page when nothing is selected).
 * @param {string} selection - selected passage, may be empty.
 * @param {number} page - 1-based page the selection came from.
 * @param {string} question - the user's question, may be empty.
 */
async function startAsk(selection, page, question) {
  const ask = state.ask
  ask.controller?.abort()
  const controller = new AbortController()
  ask.controller = controller
  ask.open = true
  ask.streaming = true
  ask.draft = ''
  state.selectionToolbar = null
  state.menu = null
  state.highlightMenu = null
  const history = ask.exchanges.slice(-6).map(exchange => ({ q: exchange.question, a: exchange.answer }))
  const exchange = { selection, page, question: question ?? '', answer: '', status: 'streaming' }
  ask.exchanges = [...ask.exchanges, exchange]
  emit()
  try {
    await streamAsk(
      { title: state.name ?? '', selection, page, question: question ?? '', history },
      (event) => {
        if (event.t === 'text') exchange.answer += event.text
        else if (event.t === 'error') throw new Error(String(event.message ?? 'unknown error'))
        emit()
      },
      controller.signal,
    )
    exchange.status = 'done'
  } catch (error) {
    if (!controller.signal.aborted) {
      exchange.status = 'error'
      exchange.answer = error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (ask.controller === controller) {
      ask.streaming = false
      ask.controller = null
      emit()
    }
  }
}

/** Resolve a right-clicked page's text and ask about it. */
async function askAboutPage(page) {
  let selection = ''
  if (state.session !== null) {
    try {
      const engine = await loadEngine()
      selection = (await engine.pageText(state.session.document, page)).slice(0, 6000)
    } catch {
      selection = ''
    }
  }
  void startAsk(selection, page, '')
}

/** Floating menu opened by right-clicking inside the page area. */
function ContextMenu({ menu, t, onDismiss }) {
  React.useEffect(() => {
    const close = (event) => {
      if (event.target instanceof Element && event.target.closest('.pr-menu') !== null) return
      onDismiss()
    }
    const onKey = (event) => { if (event.key === 'Escape') onDismiss() }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onDismiss])
  const item = (label, run) => h('button', { onClick: run }, label)
  return h('div', {
    className: 'pr-menu',
    style: { left: `${Math.min(menu.x, window.innerWidth - 200)}px`, top: `${Math.min(menu.y, window.innerHeight - 160)}px` },
    onMouseDown: event => event.stopPropagation(),
    onContextMenu: event => event.preventDefault(),
  },
    item(t('ask'), () => {
      onDismiss()
      if (menu.selection !== '') void startAsk(menu.selection, menu.page, '')
      else void askAboutPage(menu.page)
    }),
    menu.anchor === null ? null : item(t('highlight'), () => {
      onDismiss()
      addHighlight(menu.anchor)
    }),
    menu.selection === '' ? null : item(t('copy'), () => {
      void navigator.clipboard?.writeText(menu.selection).catch(() => undefined)
      onDismiss()
    }),
    h('hr'),
    item(t('dismiss'), onDismiss),
  )
}

/** Floating toolbar shown next to a fresh selection. */
function SelectionToolbar({ toolbar, t }) {
  const button = (label, run, className, disabled) => h('button', {
    className,
    disabled: disabled === true,
    onMouseDown: event => { event.preventDefault() },
    onClick: run,
  }, label)
  return h('div', {
    className: 'pr-selbar',
    style: { left: `${toolbar.x}px`, top: `${toolbar.y}px` },
    onMouseDown: event => { event.preventDefault() },
  },
    button(t('highlight'), () => {
      if (toolbar.anchor !== null) addHighlight(toolbar.anchor)
    }, undefined, toolbar.anchor === null),
    h('hr'),
    button(t('ask'), () => {
      void startAsk(toolbar.text, toolbar.page, '')
    }, 'pr-selbar-ask'),
    h('hr'),
    button(t('copy'), () => {
      void navigator.clipboard?.writeText(toolbar.text).catch(() => undefined)
      state.selectionToolbar = null
      clearSelection()
      emit()
    }),
  )
}

/** Popover for one existing highlight. */
function HighlightMenu({ menu, t, onDismiss }) {
  React.useEffect(() => {
    const close = (event) => {
      if (event.target instanceof Element && event.target.closest('.pr-menu') !== null) return
      onDismiss()
    }
    const onKey = (event) => { if (event.key === 'Escape') onDismiss() }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onDismiss])
  const highlight = state.highlights.find(item => item.id === menu.id)
  if (highlight === undefined) return null
  return h('div', {
    className: 'pr-menu',
    style: { left: `${Math.min(menu.x, window.innerWidth - 200)}px`, top: `${Math.min(menu.y, window.innerHeight - 120)}px` },
    onMouseDown: event => event.stopPropagation(),
    onContextMenu: event => event.preventDefault(),
  },
    h('button', { onClick: () => { void startAsk(highlight.text, highlight.page, '') } }, t('highlightAsk')),
    h('button', { onClick: () => { removeHighlight(highlight.id) } }, t('highlightRemove')),
  )
}

/** One page: canvas, selectable text layer, and its highlights. */
function PageView({ pageNumber, size, width, session, engine, highlights, t, onHighlightClick }) {
  const host = React.useRef(null)
  const canvas = React.useRef(null)
  const text = React.useRef(null)
  const spans = React.useRef([])
  const [visible, setVisible] = React.useState(pageNumber <= 2)
  const [ready, setReady] = React.useState(false)
  const [failed, setFailed] = React.useState('')
  const [rects, setRects] = React.useState([])

  React.useEffect(() => {
    const node = host.current
    if (node === null) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '150% 0px' })
    observer.observe(node)
    return () => { observer.disconnect() }
  }, [])

  React.useEffect(() => {
    if (!visible || !width || session === null || engine === null) return undefined
    let cancelled = false
    const controller = new AbortController()
    setReady(false)
    setFailed('')
    void (async () => {
      await engine.renderPage(session.document, pageNumber, canvas.current, text.current, width, controller.signal)
      if (cancelled) return
      setReady(true)
      emit()
    })().catch((error) => {
      if (cancelled || controller.signal.aborted) return
      setFailed(error instanceof Error ? error.message : String(error))
      setReady(true)
    })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [visible, width, pageNumber, session, engine])

  React.useEffect(() => {
    if (!ready) {
      setRects([])
      return
    }
    const layer = text.current?.querySelector('.textLayer')
    if (layer === null || layer === undefined) return
    const list = Array.from(layer.querySelectorAll('span'))
    spans.current = list
    const pageRect = host.current.getBoundingClientRect()
    const next = []
    for (const highlight of highlights) {
      for (const rect of highlightRects(list, highlight, pageRect)) {
        next.push({ id: highlight.id, ...rect })
      }
    }
    setRects(next)
  }, [ready, highlights, width])

  const onClick = (event) => {
    const selection = window.getSelection()
    if (selection !== null && selection.toString().trim() !== '') return
    const pageRect = host.current.getBoundingClientRect()
    const x = event.clientX - pageRect.left
    const y = event.clientY - pageRect.top
    for (const rect of rects) {
      if (x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height) {
        onHighlightClick(rect.id, event.clientX, event.clientY)
        return
      }
    }
  }

  const height = size === undefined ? undefined : Math.round((width * size.height) / size.width)
  return h('div', {
    ref: host,
    className: 'pr-page',
    'data-page': pageNumber,
    onClick,
    style: { width: `${width}px`, height: height === undefined ? undefined : `${height}px` },
  },
    h('canvas', { ref: canvas, className: 'pr-canvas', hidden: !ready, 'aria-label': `page ${pageNumber}` }),
    rects.map((rect, index) => h('div', {
      key: `${rect.id}-${index}`,
      className: 'pr-hl',
      style: { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` },
    })),
    h('div', { ref: text, className: 'pr-text' }),
    ready && failed === '' ? null : h('div', { className: 'pr-page-status' },
      failed !== '' ? format(t('pageFailed'), { message: failed }) : t('rendering')),
  )
}

/** Floating answer panel anchored to the right edge of the reading area. */
function AskPanel({ t, engine }) {
  const ask = state.ask
  const body = React.useRef(null)
  React.useEffect(() => {
    const node = body.current
    if (node !== null) node.scrollTop = node.scrollHeight
  })
  const last = ask.exchanges[ask.exchanges.length - 1]
  const sendFollowUp = () => {
    const question = ask.draft.trim()
    if (question === '' || ask.streaming) return
    const selection = last === undefined ? '' : last.selection
    const page = last === undefined ? 1 : last.page
    ask.draft = ''
    emit()
    void startAsk(selection, page, question)
  }
  return h('aside', { className: 'pr-ask', onContextMenu: event => event.preventDefault() },
    h('div', { className: 'pr-ask-head' },
      h('strong', null, t('askTitle')),
      h('button', {
        className: 'pr-x',
        title: t('dismiss'),
        onClick: () => {
          ask.controller?.abort()
          ask.open = false
          emit()
        },
      }, '×'),
    ),
    h('div', { ref: body, className: 'pr-ask-body' },
      ask.exchanges.length === 0 ? h('div', { className: 'pr-empty-ask' }, t('askEmpty')) : null,
      ask.exchanges.map((exchange, index) => {
        const answer = exchange.status === 'error'
          ? t('failed', { message: exchange.answer })
          : exchange.answer === ''
            ? (exchange.status === 'streaming' ? t('thinking') : t('noAnswer'))
            : renderAnswer(exchange.answer, engine)
        return h('div', { key: index },
          exchange.selection === '' ? null : h('div', { className: 'pr-quote' }, exchange.selection),
          h('div', { className: 'pr-meta' }, t('askPage', { page: exchange.page })),
          exchange.question === '' ? null : h('p', { className: 'pr-q' }, exchange.question),
          h('div', { className: `pr-a${exchange.status === 'error' ? ' error' : ''}` }, answer),
        )
      }),
    ),
    h('div', { className: 'pr-ask-foot' },
      h('textarea', {
        value: ask.draft,
        placeholder: t('askPlaceholder'),
        onChange: (event) => { ask.draft = event.target.value; emit() },
        onKeyDown: (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            sendFollowUp()
          }
        },
      }),
      h('div', { className: 'pr-ask-actions' },
        h('button', { className: 'pr-btn', disabled: ask.streaming || ask.draft.trim() === '', onClick: sendFollowUp }, ask.streaming ? t('thinking') : t('send')),
      ),
    ),
  )
}

/** Right column listing the papers this browser remembers. */
function HistoryPanel({ t }) {
  const list = state.history
  return h('aside', { className: 'pr-history' },
    h('div', { className: 'pr-ask-head' },
      h('strong', null, t('historyTitle')),
      h('span', { className: 'pr-hist-count' }, String(list.length)),
      h('button', {
        className: 'pr-x',
        title: t('dismiss'),
        onClick: () => { state.historyOpen = false; emit() },
      }, '×'),
    ),
    h('div', { className: 'pr-history-list' },
      list.length === 0
        ? h('div', { className: 'pr-empty-ask' }, t('historyEmpty'))
        : list.map(entry => h('div', {
            key: entry.id,
            className: 'pr-hist-row',
            role: 'button',
            tabIndex: 0,
            onClick: () => { void openHistoryEntry(entry) },
            onKeyDown: (event) => { if (event.key === 'Enter') void openHistoryEntry(entry) },
          },
            h('span', { className: 'pr-hist-name' }, entry.name),
            h('div', { className: 'pr-hist-meta' },
              h('span', null, t('historyPages', { pages: entry.pages })),
              h('span', null, new Date(entry.lastOpened).toLocaleString()),
            ),
            h('button', {
              className: 'pr-x pr-hist-del',
              title: t('historyRemove'),
              onClick: (event) => { event.stopPropagation(); void removeHistoryEntry(entry.id) },
            }, '×'),
          )),
    ),
    list.length === 0 ? null : h('div', { className: 'pr-hist-foot' },
      h('button', { className: 'pr-btn', onClick: () => { void clearReadingHistory() } }, t('historyClear')),
    ),
  )
}

/** The reading page itself. */
function PaperReaderPage(props) {
  const { t } = props
  useVersion()
  const scroll = React.useRef(null)
  const pages = React.useRef(null)
  const fileInput = React.useRef(null)
  const [engine, setEngine] = React.useState(null)
  const [dragOver, setDragOver] = React.useState(false)
  const session = state.session
  const width = pageWidth()

  React.useEffect(() => {
    let disposed = false
    void loadEngine().then((module) => {
      if (!disposed) setEngine(module)
    }).catch((error) => {
      if (!disposed) {
        state.error = error instanceof Error ? error.message : String(error)
        emit()
      }
    })
    return () => { disposed = true }
  }, [])

  React.useEffect(() => {
    if (engine === null || typeof engine.katexCss !== 'string') return undefined
    const style = document.createElement('style')
    style.dataset.dshPlugin = 'paper-reader-katex'
    style.textContent = engine.katexCss
    document.head.append(style)
    return () => { style.remove() }
  }, [engine])

  React.useEffect(() => {
    const node = scroll.current
    if (node === null) return undefined
    let frame = null
    const measure = () => {
      frame = null
      const width = Math.min(Math.round(node.clientWidth - 48), 1080)
      if (width > 0 && width !== state.containerWidth) {
        state.containerWidth = width
        emit()
      }
      const current = pickPage(node, pages.current)
      if (current !== state.currentPage) {
        state.currentPage = current
        emit()
      }
    }
    const observer = new ResizeObserver(() => { frame ??= requestAnimationFrame(measure) })
    observer.observe(node)
    measure()
    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [session])

  React.useEffect(() => {
    const target = state.pendingRestore
    if (target === null) return
    state.pendingRestore = null
    const node = scroll.current
    const element = pages.current?.children[target - 1]
    if (node === null || element === undefined) return
    node.scrollTop = Math.max(0, element.offsetTop - 12)
  }, [width])

  React.useEffect(() => {
    void refreshHistory()
  }, [])

  React.useEffect(() => () => {
    state.ask.controller?.abort()
  }, [])

  const onScroll = () => {
    const node = scroll.current
    if (node === null) return
    const current = pickPage(node, pages.current)
    if (current !== state.currentPage) {
      state.currentPage = current
      emit()
    }
  }

  const jumpTo = (page) => {
    const target = Math.min(Math.max(1, page), state.numPages)
    const node = scroll.current
    const element = pages.current?.children[target - 1]
    if (node === null || element === undefined) return
    node.scrollTop = Math.max(0, element.offsetTop - 12)
    state.currentPage = target
    emit()
  }

  const changeZoom = (next) => {
    const target = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 100) / 100
    if (target === state.zoom) return
    state.pendingRestore = state.currentPage
    state.zoom = target
    emit()
  }

  const onMouseUp = () => {
    const selection = window.getSelection()
    const text = selection === null ? '' : selection.toString().trim()
    if (text === '') {
      if (state.selectionToolbar !== null) {
        state.selectionToolbar = null
        emit()
      }
      return
    }
    const range = selection.getRangeAt(0)
    const node = range.startContainer
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
    const pageElement = element?.closest?.('.pr-page')
    if (pageElement === undefined || pageElement === null || scroll.current === null || !scroll.current.contains(pageElement)) return
    const anchor = anchorOfSelection(pageElement)
    const rect = range.getBoundingClientRect()
    state.selectionToolbar = {
      x: Math.max(8, Math.min(window.innerWidth - 260, rect.left + rect.width / 2 - 110)),
      y: Math.min(window.innerHeight - 56, rect.bottom + 8),
      text: text.slice(0, 6000),
      page: Number(pageElement.getAttribute('data-page')),
      anchor,
    }
    state.menu = null
    state.highlightMenu = null
    emit()
  }

  const onContextMenu = (event) => {
    const target = event.target
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return
    if (target.closest('.pr-ask') !== null || target.closest('.pr-menu') !== null || target.closest('.pr-selbar') !== null) return
    const selection = window.getSelection()
    let text = ''
    let anchor = null
    if (selection !== null && selection.rangeCount > 0) {
      const node = selection.getRangeAt(0).commonAncestorContainer
      if (scroll.current !== null && scroll.current.contains(node)) text = selection.toString().trim()
    }
    const pageElement = target.closest('[data-page]')
    const page = pageElement === null ? 1 : Number(pageElement.getAttribute('data-page'))
    if (text !== '' && pageElement !== null) anchor = anchorOfSelection(pageElement)
    event.preventDefault()
    state.selectionToolbar = null
    state.highlightMenu = null
    state.menu = { x: event.clientX, y: event.clientY, selection: text.slice(0, 6000), page, anchor }
    emit()
  }

  const onHighlightClick = (id, x, y) => {
    state.menu = null
    state.selectionToolbar = null
    state.highlightMenu = { id, x, y }
    emit()
  }

  const hasFiles = (event) => Array.isArray(event.dataTransfer?.types) && event.dataTransfer.types.includes('Files')
  const onRootDragOver = (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    if (!dragOver) setDragOver(true)
  }
  const onRootDragLeave = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return
    setDragOver(false)
  }
  const onRootDrop = (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer?.files?.[0]
    if (file !== undefined) void openFile(file)
  }
  const toggleHistory = () => {
    state.historyOpen = !state.historyOpen
    state.selectionToolbar = null
    state.menu = null
    state.highlightMenu = null
    emit()
  }

  const content = (() => {
    if (state.error !== '') {
      return h('div', { className: 'pr-body' },
        h('div', { className: 'pr-empty' },
          h('h2', null, t('openFailed', { message: '' })),
          h('p', null, state.error)),
        state.historyOpen ? h(HistoryPanel, { t }) : null,
      )
    }
    if (session !== null) {
      const pageHighlights = new Map()
      for (const highlight of state.highlights) {
        const list = pageHighlights.get(highlight.page) ?? []
        list.push(highlight)
        pageHighlights.set(highlight.page, list)
      }
      return h('div', { className: 'pr-body' },
        h('div', { ref: scroll, className: 'pr-scroll', onContextMenu, onMouseUp, onScroll },
          h('div', { className: 'pr-hint' }, t('hint')),
          h('div', { ref: pages, className: 'pr-pages' },
            state.sizes.map((size, index) => h(PageView, {
              key: index,
              pageNumber: index + 1,
              size,
              width,
              session,
              engine,
              highlights: pageHighlights.get(index + 1) ?? [],
              t,
              onHighlightClick,
            })),
          ),
        ),
        state.historyOpen ? h(HistoryPanel, { t }) : state.ask.open ? h(AskPanel, { t, engine }) : null,
        state.selectionToolbar === null ? null : h(SelectionToolbar, { toolbar: state.selectionToolbar, t }),
        state.menu === null ? null : h(ContextMenu, { menu: state.menu, t, onDismiss: () => { state.menu = null; emit() } }),
        state.highlightMenu === null ? null : h(HighlightMenu, { menu: state.highlightMenu, t, onDismiss: () => { state.highlightMenu = null; emit() } }),
      )
    }
    if (state.loading) {
      return h('div', { className: 'pr-body' },
        h('div', { className: 'pr-empty' }, h('p', null, t('loading'))),
        state.historyOpen ? h(HistoryPanel, { t }) : null,
      )
    }
    return h('div', { className: 'pr-body' },
      h('div', { className: 'pr-empty' },
        h('h2', null, t('emptyTitle')),
        h('p', null, t('emptyHint')),
        h('div', {
          className: `pr-drop${dragOver ? ' dragover' : ''}`,
          onClick: () => { fileInput.current?.click() },
        }, dragOver ? t('dropNow') : t('emptyDrop')),
        h('button', { className: 'pr-btn pr-history-link', onClick: toggleHistory }, t('historyCount', { count: state.history.length })),
      ),
      state.historyOpen ? h(HistoryPanel, { t }) : null,
    )
  })()

  return h('div', { className: 'pr-root', onDragOver: onRootDragOver, onDragLeave: onRootDragLeave, onDrop: onRootDrop },
    h('div', { className: 'pr-toolbar' },
      h('span', { className: 'pr-title' }, session === null ? h('strong', null, t('panel')) : state.name),
      session === null ? null : h('div', { className: 'pr-group' },
        h('button', { className: 'pr-btn pr-symbol', title: t('zoomOut'), onClick: () => { changeZoom(state.zoom - ZOOM_STEP) } }, '－'),
        h('span', { className: 'pr-zoom-value' }, t('zoomValue', { percent: Math.round(state.zoom * 100) })),
        h('button', { className: 'pr-btn pr-symbol', title: t('zoomIn'), onClick: () => { changeZoom(state.zoom + ZOOM_STEP) } }, '＋'),
        h('button', { className: 'pr-btn', title: t('zoomFit'), onClick: () => { changeZoom(1) } }, t('zoomFit')),
      ),
      session === null ? null : h('div', { className: 'pr-group' },
        h('button', { className: 'pr-btn pr-symbol', title: t('pagePrev'), onClick: () => { jumpTo(state.currentPage - 1) } }, '‹'),
        h('input', {
          key: state.currentPage,
          className: 'pr-page-input',
          defaultValue: String(state.currentPage),
          title: t('pageOf', { page: state.currentPage, total: state.numPages }),
          onKeyDown: (event) => {
            if (event.key !== 'Enter') return
            const value = Number.parseInt(event.currentTarget.value, 10)
            if (Number.isFinite(value)) jumpTo(value)
            event.currentTarget.blur()
          },
        }),
        h('span', { className: 'pr-page-total' }, `/ ${state.numPages}`),
        h('button', { className: 'pr-btn pr-symbol', title: t('pageNext'), onClick: () => { jumpTo(state.currentPage + 1) } }, '›'),
      ),
      h('button', { className: 'pr-btn', onClick: toggleHistory }, t('history')),
      h('button', { className: 'pr-btn', onClick: () => { fileInput.current?.click() } }, t('open')),
      session === null ? null : h('button', { className: 'pr-btn', onClick: closeFile }, t('close')),
      h('input', {
        ref: fileInput,
        type: 'file',
        accept: 'application/pdf,.pdf',
        style: { display: 'none' },
        onChange: (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file !== undefined) void openFile(file)
        },
      }),
    ),
    content,
  )
}

/** Sidebar panel icon: a paper sheet with a question mark. */
function PaperIcon({ size, active }) {
  const color = active ? 'var(--dsw-alias-brand-primary)' : 'currentColor'
  return h('svg', {
    width: size ?? 18,
    height: size ?? 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    style: { display: 'block' },
  },
    h('path', { d: 'M6 2.5h7.5L19 8v13.5H6z' }),
    h('path', { d: 'M13.5 2.5V8H19' }),
    h('path', { d: 'M9 12.2h4.6a2 2 0 0 1 0 4H12v.9' }),
    h('circle', { cx: 12, cy: 19.4, r: 0.5, fill: color, stroke: 'none' }),
  )
}

/** The Client half's entry: registers the panel, its sidebar entry, and styles. */
export const inject = ['slots', 'locale']

/**
 * @param {object} ctx - the browser plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en }))
  ctx.effect(() => () => {
    state.ask.controller?.abort()
    const session = state.session
    state.session = null
    if (session !== null) void session.dispose()
  })
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.dshPlugin = 'paper-reader'
    style.textContent = STYLE
    document.head.append(style)
    return () => { style.remove() }
  })
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
  }, PaperReaderPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 6,
    label: () => t('panel'),
    locale: NS,
  }, PaperIcon))
}
