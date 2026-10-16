import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

export type MenuScrollDir = 'down' | 'up'

/** 固定空壳占位；进入可视区才渲染内容并播放进场，划出卸载 */
export function MenuCardShell({
  rootRef,
  scrollDirRef,
  children,
}: {
  rootRef: RefObject<HTMLElement | null>
  scrollDirRef: RefObject<MenuScrollDir>
  children: ReactNode
}) {
  const shellRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const [enterDir, setEnterDir] = useState<MenuScrollDir>('down')
  const [enterKey, setEnterKey] = useState(0)

  useEffect(() => {
    const el = shellRef.current
    const root = rootRef.current
    if (!el || !root) return

    const io = new IntersectionObserver(
      ([entry]) => {
        const on = Boolean(entry?.isIntersecting)
        if (on) {
          setEnterDir(scrollDirRef.current)
          setEnterKey((k) => k + 1)
        }
        setActive(on)
      },
      {
        root,
        // 进入列表可视区再播，避免屏外播完
        rootMargin: '0px',
        threshold: 0.12,
      },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootRef, scrollDirRef])

  return (
    <div ref={shellRef} className="menu-card-shell">
      {active ? (
        <div
          key={enterKey}
          className={`menu-card-enter is-${enterDir}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
