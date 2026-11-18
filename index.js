/**
 * Host half of the paper reader: one authenticated exact route on the shared
 * `/api` channel. It receives the passage the user right-clicked in the reading
 * page and streams one model answer back as NDJSON, without touching any
 * Session log. The model route is the profile's default selection, so the
 * reader answers with the same model the user chats with.
 */

/** Exact Fetch route below `/api`. */
const ROUTE = '/api/paper-reader/ask'

/** Answering instructions for one question about a paper passage. */
const SYSTEM_PROMPT = [
  '你是一名严谨的论文阅读助手。用户在阅读论文时选中了一段看不懂的内容来问你。',
  '用中文直接回答（除非用户用英文提问），目标是让对方真正理解：先说明这段在讲什么，再解释关键概念、符号、公式或缩写，必要时给一个简短例子。',
  '只依据给出的原文和你的通用知识回答，不要编造论文里没有的实验、数字或结论；不确定时明确说明。',
  '回答控制在 500 字以内，除非用户要求展开。用纯文本和换行表达，不要使用 Markdown 标题或表格。',
  '公式请用 LaTeX，以便前端排版成真正的数学公式：行内公式放在 $...$ 之间，例如 $e_{ij}=a(\\mathbf{W}h_i,\\mathbf{W}h_j)$；'
    + '单独成行的公式放在 $$...$$ 之间，例如 $$\\alpha_{ij}=\\frac{\\exp(e_{ij})}{\\sum_{k\\in N(i)}\\exp(e_{ik})}$$。'
    + '不要使用 \\(...\\) 或 \\[...\\] 这两个分隔符。公式外的解释文字保持普通中文句子。',
].join('\n')

/** One question may take a while on a reasoning model. */
const TIMEOUT_MS = 180_000
const MAX_SELECTION_CHARS = 12_000
const MAX_QUESTION_CHARS = 2_000
const MAX_HISTORY_ENTRIES = 6
const MAX_HISTORY_ANSWER_CHARS = 1_500

export const inject = ['llm', 'agentDefaultModel', 'connection']

/**
 * @param {object} ctx - host plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: request => answer(ctx, request),
  }))
}

/** Truncate one string to a character budget. */
function clip(value, limit) {
  if (typeof value !== 'string') return ''
  return value.length <= limit ? value : value.slice(0, limit)
}

/** Compose the single user message of this auxiliary request. */
function userPrompt(body) {
  const lines = []
  const title = clip(body.title, 200)
  const page = Number.isFinite(body.page) ? Math.max(1, Math.trunc(body.page)) : 1
  lines.push(title === '' ? `正在阅读一篇论文（第 ${page} 页）。` : `正在阅读论文《${title}》（第 ${page} 页）。`)
  const selection = clip(body.selection, MAX_SELECTION_CHARS).trim()
  if (selection !== '') {
    lines.push('', '【选中的原文】', selection)
  } else {
    lines.push('', '（用户没有选中具体文字，下面是这一页的正文，请结合它回答。）')
  }
  if (Array.isArray(body.history)) {
    const history = body.history.slice(-MAX_HISTORY_ENTRIES)
    const entries = []
    for (const item of history) {
      if (item === null || typeof item !== 'object') continue
      const question = clip(item.q, MAX_QUESTION_CHARS).trim()
      const answer = clip(item.a, MAX_HISTORY_ANSWER_CHARS).trim()
      if (question === '') continue
      entries.push(`Q: ${question}`)
      if (answer !== '') entries.push(`A: ${answer}`)
    }
    if (entries.length > 0) lines.push('', '【此前的问答】', ...entries)
  }
  const question = clip(body.question, MAX_QUESTION_CHARS).trim()
  lines.push('', '【我的问题】', question === '' ? '请解释上面这段内容，指出其中的关键概念和难点。' : question)
  return lines.join('\n')
}

/** One NDJSON answer response: text deltas, then done or error. */
function answerResponse(ctx, body) {
  const encoder = new TextEncoder()
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, TIMEOUT_MS)
  let closed = false
  const stream = new ReadableStream({
    start(sink) {
      const send = (event) => {
        if (closed) return
        sink.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }
      const finish = () => {
        if (closed) return
        closed = true
        clearTimeout(timer)
        try {
          sink.close()
        } catch {
          // The carrier already closed the body.
        }
      }
      void run(ctx, body, send, controller.signal).then(
        () => {
          send({ t: 'done' })
          finish()
        },
        (error) => {
          send({ t: 'error', message: error instanceof Error ? error.message : String(error) })
          finish()
        },
      )
    },
    cancel() {
      controller.abort()
      clearTimeout(timer)
    },
  })
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-content-type-options': 'nosniff',
    },
  })
}

/** Stream the model's text for one prepared request. */
async function run(ctx, body, send, signal) {
  const route = ctx.agentDefaultModel.currentSelection()
  const call = await ctx.llm.prepareCall({
    provider: route.provider,
    model: route.model,
    maxTokens: 2048,
  }, signal)
  signal.throwIfAborted()
  const options = {
    ...call.config,
    messages: [{ role: 'user', content: [{ type: 'text', text: userPrompt(body) }] }],
    system: SYSTEM_PROMPT,
    signal,
  }
  for await (const chunk of call.stream(options)) {
    if (chunk.type === 'text-delta') send({ t: 'text', text: chunk.text })
    else if (chunk.type === 'finish') {
      if (chunk.reason.kind === 'error') throw new Error(chunk.reason.failure.message)
      if (chunk.reason.kind === 'aborted') throw new Error('the model request was aborted')
    }
  }
}

/** Validate one request body and answer it. */
async function answer(ctx, request) {
  let body
  try {
    body = await request.json()
  } catch {
    return new Response('the request body is not JSON', { status: 400 })
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return new Response('the request body is not an object', { status: 400 })
  }
  if (clip(body.selection, 1) === '' && clip(body.question, 1) === '') {
    return new Response('a passage or a question is required', { status: 400 })
  }
  return answerResponse(ctx, body)
}
