# dsh-pdf-paper-reader

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that gives PDF papers a real reading page inside DSH: **zoom, page navigation, text highlights, reading history**, and **right-click Q&A with DeepSeek** in a docked right column — answers are typeset with KaTeX, so formulas look like the paper's own math.

PDF.js and KaTeX are bundled into the plugin (no CDN, no network access when reading), and the paper never leaves your machine — only the passage you select is sent to the model you configured in DSH.

## Features

- **A dedicated reading page** (sidebar → 论文阅读 / Paper reader), not a side panel.
- **Zoom & navigation** — zoom in / out / fit width, page input, previous/next page, estimated page indicator.
- **Select → act** — selecting text shows a small floating toolbar: Highlight / Ask DeepSeek / Copy. Right-click offers the same actions.
- **Highlights** — saved per document in the browser, restored after zoom, page changes, and reopening the paper. Click a highlight to ask about it or delete it.
- **Reading history** — every PDF you open is remembered locally (IndexedDB); open the **History** column from the toolbar or the empty page and click to reopen.
- **Ask panel** — docked on the right, streams the answer, supports follow-up questions. LaTeX formulas are rendered with KaTeX (`$…$` inline, `$$…$$` display).
- **Whole-page drop target** — drag a PDF anywhere on the page to open it.
- **No session pollution** — questions do not write to any session chat log.

## Requirements

- DeepSeek Harness `>= 0.2.2-rc.3` (Desktop or Web).
- A model configured in DSH (sign in to DeepSeek or configure a provider). The reader uses DSH's **default model selection**.

## Install

### From npm (recommended)

In DSH: **Plugins → Add plugin**, paste the package name, then **Install**:

```
dsh-pdf-paper-reader
```

### From GitHub

In DSH: **Plugins → Add plugin**, paste the repository spec:

```
github:2025-pyh/dsh-pdf-paper-reader
```

The repository ships the built bundles, so no build runs during installation.

### From a local checkout (development)

```sh
git clone https://github.com/2025-pyh/dsh-pdf-paper-reader.git
cd dsh-pdf-paper-reader
pnpm install --ignore-scripts
pnpm run build
```

Then **Plugins → Add plugin** and paste the **absolute path** of that directory.

## Use

1. Click **论文阅读** in the left sidebar.
2. Click **打开 PDF** or drag a PDF anywhere onto the page.
3. Zoom with `－ / ＋ / 适合宽度`; jump with the page box or `‹ / ›`.
4. Select a sentence: use the floating toolbar, or right-click, to **高亮**, **问 DeepSeek**, or copy.
5. The answer appears in the right column. Ask follow-ups at the bottom; formulas are typeset, not raw LaTeX.
6. Open **历史阅读** from the toolbar (or the empty page) to reopen a paper you read before.

## How it works

- The client half renders PDF pages with PDF.js (own worker, fonts/CMaps/wasm bundled) and builds a real selectable text layer.
- Highlights are stored as page + text-span + character offsets, so they survive re-rendering at any zoom level.
- Asking posts the selected passage, page number, and question to the plugin's own authenticated Host route (`/api/paper-reader/ask`). The Host asks DSH's default model with a bounded prompt and streams the answer back as NDJSON.
- History keeps a local copy of the PDF in the browser's IndexedDB (max 20 papers, 60 MB each).
- No session records are written; the model request is auxiliary and not part of any chat.

## Privacy

- PDFs, highlights, and history stay in your browser profile.
- Only the selected passage (or the current page's text when nothing is selected), the page number, and the last few Q&A turns are sent to the model provider you configured in DSH.

## Development

```
src/client/index.js   UI: panel, viewer chrome, highlights, history, ask column
src/pdf/index.js      lazily loaded chunk: PDF.js engine + KaTeX renderer
build.mjs             bundles both artifacts (generates fonts/CMaps/wasm + KaTeX CSS inline)
index.js              Host half: /api/paper-reader/ask streaming route
client.js             built entry artifact (committed)
client.pdfjs.js       built lazily loaded chunk (committed)
```

After changing `src/`, run `pnpm run build` and refresh the DSH page. A locally linked install can be reloaded through the Plugins page.

## License

MIT — see [LICENSE](LICENSE).

Bundled third-party code:

- [PDF.js](https://github.com/mozilla/pdf.js) — Apache-2.0, see [LICENSE-pdfjs.txt](LICENSE-pdfjs.txt).
- [KaTeX](https://github.com/KaTeX/KaTeX) — MIT, see [LICENSE-katex.txt](LICENSE-katex.txt).
