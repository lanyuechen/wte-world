import { useEffect, useRef, useState } from 'react'
import cloud from 'd3-cloud'

type CloudWord = {
  text: string
  size: number
  color: string
  x?: number
  y?: number
  rotate?: number
}

type LayoutCache = {
  phrasesKey: string
  width: number
  height: number
  words: CloudWord[]
}

/** 柔和低饱和彩色 */
const WORD_COLORS = [
  '#7a9e8a', // 雾绿
  '#8aa4b5', // 灰蓝
  '#b59a86', // 浅陶
  '#a08fad', // 灰紫
  '#c4a07a', // 沙杏
  '#8fafa3', // 青灰
  '#b8959a', // 豆沙
  '#9aab7e', // 苔绿
  '#7e9bb0', // 雾青
  '#c2b08a', // 亚麻
  '#9b8f9e', // 藕灰
  '#86a899', // 薄荷绿灰
]

/** 画布相对可视区域放大，边缘裁切形成向外延伸感 */
const OVERSCAN = 1.22
const CLOUD_FONT = '"Figtree", "PingFang SC", "Noto Sans SC", sans-serif'

/** 跨路由复用，避免每次进扫码页重算 */
let sharedSeed = Math.floor(Math.random() * 0xffffffff) || 1
let layoutCache: LayoutCache | null = null

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function pickColor(rand: () => number) {
  return WORD_COLORS[Math.floor(rand() * WORD_COLORS.length)]!
}

function phrasesKeyOf(phrases: readonly string[]) {
  return `split-comma-overscan-${OVERSCAN}:${phrases.join('\u0001')}`
}

function sizeMatch(a: number, b: number) {
  return Math.abs(a - b) <= 2
}

/** 按中英文逗号分词后再布局 */
function tokenizePhrases(phrases: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of phrases) {
    for (const part of raw.split(/[,，]/u)) {
      const t = part.trim()
      if (t) out.push(t)
    }
  }
  return out
}

function makeWord(
  text: string,
  size: number,
  rand: () => number,
): CloudWord {
  return {
    text,
    size: Math.max(8, Math.round(size)),
    color: pickColor(rand),
  }
}

/** 大词少、小词多，便于 d3-cloud 填满矩形缝隙 */
function buildWordList(
  pool: readonly string[],
  width: number,
  height: number,
  seed: number,
): CloudWord[] {
  if (!pool.length) return []
  const rand = mulberry32(seed)
  const unit = Math.min(width, height)
  const list: CloudWord[] = []
  const pick = () => pool[Math.floor(rand() * pool.length)]!

  for (let i = 0; i < Math.min(8, pool.length); i++) {
    list.push(makeWord(pick(), unit * (0.07 + rand() * 0.06), rand))
  }
  for (let i = 0; i < pool.length * 2; i++) {
    list.push(makeWord(pool[i % pool.length]!, unit * (0.032 + rand() * 0.028), rand))
  }
  for (let i = 0; i < pool.length * 5; i++) {
    list.push(makeWord(pool[i % pool.length]!, unit * (0.016 + rand() * 0.018), rand))
  }
  for (let i = 0; i < pool.length * 3; i++) {
    list.push(makeWord(pick(), unit * (0.012 + rand() * 0.01), rand))
  }

  return shuffle(list, rand)
}

function runCloudLayout(
  width: number,
  height: number,
  words: CloudWord[],
  seed: number,
): Promise<CloudWord[]> {
  const rand = mulberry32(seed ^ 0x9e3779b9)
  return new Promise((resolve) => {
    cloud<CloudWord>()
      .size([width, height])
      .words(words.map((w) => ({ ...w })))
      .padding(1.5)
      .rotate(() => (rand() < 0.5 ? 0 : 90))
      .font(CLOUD_FONT)
      .fontWeight(600)
      .fontSize((d) => d.size ?? 12)
      .spiral('archimedean')
      .on('end', (placed) => resolve(placed as CloudWord[]))
      .start()
  })
}

function paintCloud(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  words: CloudWord[],
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.max(1, Math.floor(width * dpr))
  canvas.height = Math.max(1, Math.floor(height * dpr))
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  // 与 d3-cloud 量字精灵一致（默认 alphabetic），避免 middle 导致中文整体偏下叠字
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.translate(width / 2, height / 2)

  const unit = Math.min(width, height)
  for (const w of words) {
    if (w.x == null || w.y == null) continue
    const size = w.size ?? 12
    const alpha = Math.min(0.42, 0.16 + (size / unit) * 1.8)
    ctx.save()
    ctx.translate(w.x, w.y)
    ctx.rotate(((w.rotate ?? 0) * Math.PI) / 180)
    ctx.font = `600 ${size}px ${CLOUD_FONT}`
    ctx.fillStyle = w.color
    ctx.globalAlpha = alpha
    ctx.fillText(w.text, 0, 0)
    ctx.restore()
  }
}

async function buildLayout(
  phrases: readonly string[],
  width: number,
  height: number,
): Promise<CloudWord[]> {
  const tokens = tokenizePhrases(phrases)
  const words = buildWordList(tokens, width, height, sharedSeed)
  const placed = await runCloudLayout(width, height, words, sharedSeed)
  if (!tokens.length || placed.length >= words.length * 0.45) return placed

  const rand = mulberry32(sharedSeed + 7)
  const unit = Math.min(width, height)
  const extras: CloudWord[] = placed.map((w) => ({
    text: w.text,
    size: w.size ?? 12,
    color: w.color,
  }))
  for (let i = 0; i < tokens.length * 4; i++) {
    extras.push(
      makeWord(
        tokens[Math.floor(rand() * tokens.length)]!,
        unit * (0.011 + rand() * 0.012),
        rand,
      ),
    )
  }
  return runCloudLayout(
    width,
    height,
    shuffle(extras, rand),
    sharedSeed + 13,
  )
}

export function WordCloudBg({
  phrases,
  className = '',
}: {
  phrases: readonly string[]
  className?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    let cancelled = false
    let timer = 0
    const key = phrasesKeyOf(phrases)

    const reveal = () => {
      // 先确保模糊帧画上，再过渡到清晰
      requestAnimationFrame(() => {
        if (!cancelled) setReady(true)
      })
    }

    const render = async () => {
      setReady(false)
      const rect = wrap.getBoundingClientRect()
      const viewW = Math.max(1, Math.floor(rect.width))
      const viewH = Math.max(1, Math.floor(rect.height))
      if (viewW < 40 || viewH < 40) return

      // 布局尺寸略大于可视窗口，四周溢出被裁切
      const width = Math.max(1, Math.floor(viewW * OVERSCAN))
      const height = Math.max(1, Math.floor(viewH * OVERSCAN))

      if (typeof document !== 'undefined' && document.fonts?.ready) {
        try {
          await document.fonts.ready
        } catch {
          // ignore
        }
      }
      if (cancelled) return

      if (
        layoutCache &&
        layoutCache.phrasesKey === key &&
        sizeMatch(layoutCache.width, width) &&
        sizeMatch(layoutCache.height, height)
      ) {
        paintCloud(canvas, width, height, layoutCache.words)
        if (!cancelled) reveal()
        return
      }

      const words = await buildLayout(phrases, width, height)
      if (cancelled) return
      layoutCache = { phrasesKey: key, width, height, words }
      paintCloud(canvas, width, height, words)
      reveal()
    }

    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void render()
      }, 80)
    }

    const ro = new ResizeObserver(schedule)
    ro.observe(wrap)
    schedule()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      ro.disconnect()
    }
  }, [phrases])

  return (
    <div
      ref={wrapRef}
      className={`wordcloud-bg ${className}`.trim()}
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        className={`wordcloud-bg-canvas ${ready ? 'is-ready' : ''}`}
      />
    </div>
  )
}
