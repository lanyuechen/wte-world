import { useMemo, useState, type CSSProperties } from 'react'

export type DanmakuProps = {
  /** 弹幕文案池 */
  phrases: readonly string[]
  /** 同时滚动条数，默认 30 */
  count?: number
  /** 随机种子，同种子布局稳定；不传则每次挂载随机 */
  seed?: number
  className?: string
}

type Bullet = {
  id: string
  text: string
  top: number
  size: number
  duration: number
  delay: number
  opacity: number
  z: number
  zIndex: number
}

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

function buildBullets(
  phrases: readonly string[],
  count: number,
  seed: number,
): Bullet[] {
  if (!phrases.length) return []
  const rand = mulberry32(seed || 1)
  // 一轨一条，避免同轨纵向叠字
  const n = Math.max(1, count)
  const topMin = 5
  const topMax = 88
  const laneStep = n <= 1 ? 0 : (topMax - topMin) / (n - 1)
  // 字号上限随轨距收敛，减少邻轨视觉重叠
  const sizeMin = 0.5
  const sizeMax = Math.min(1.5, Math.max(0.85, laneStep * 0.42))

  const lanes = shuffle(
    Array.from({ length: n }, (_, i) => i),
    rand,
  )
  // 邻轨时间相位尽量拉开（黄金分割打散）
  const delayCycle = 56
  const phi = 0.6180339887

  return lanes.map((lane, i) => {
    const jitter =
      n > 1 ? (rand() - 0.5) * Math.min(0.9, laneStep * 0.18) : 0
    const top = topMin + lane * laneStep + jitter

    const depth = rand()
    const z = -220 + depth * 260
    const size = sizeMin + depth * (sizeMax - sizeMin)
    const opacity = 0.04 + depth * 0.16
    const duration = 54 - depth * 32 + (rand() - 0.5) * 4
    const delay =
      -(((lane * phi) % 1) * delayCycle) - rand() * 0.8

    return {
      id: `dm-${i}`,
      text: phrases[Math.floor(rand() * phrases.length)],
      top: Math.min(topMax, Math.max(topMin, top)),
      size,
      duration: Math.max(22, duration),
      delay,
      opacity,
      z,
      zIndex: Math.round(depth * 40),
    }
  })
}

/** 背景弹幕：CSS 3D 景深，淡化展示，不拦截点击。 */
export function Danmaku({
  phrases,
  count = 30,
  seed,
  className = '',
}: DanmakuProps) {
  const [mountSeed] = useState(() => {
    const n = seed ?? Math.floor(Math.random() * 0xffffffff)
    return n || 1
  })
  const activeSeed = seed ?? mountSeed

  const bullets = useMemo(
    () => buildBullets(phrases, count, activeSeed),
    [phrases, count, activeSeed],
  )

  if (!bullets.length) return null

  return (
    <div className={`danmaku ${className}`.trim()} aria-hidden>
      <div className="danmaku-space">
        {bullets.map((b) => (
          <span
            key={b.id}
            className="danmaku-item"
            style={
              {
                top: `${b.top}%`,
                zIndex: b.zIndex,
                fontSize: `${b.size}rem`,
                opacity: b.opacity,
                animationDuration: `${b.duration}s`,
                animationDelay: `${b.delay}s`,
                '--dm-z': `${b.z.toFixed(1)}px`,
              } as CSSProperties
            }
          >
            {b.text}
          </span>
        ))}
      </div>
    </div>
  )
}
