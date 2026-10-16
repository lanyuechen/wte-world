import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { MenuScrollDir } from '../components/MenuCardShell'
import {
  ALL_CATEGORY,
  buildSectionStarts,
  MENU_SPY_OFFSET,
  type MenuCategory,
  type MenuSection,
} from '../lib/menu'

/** 左侧分类指示条 + 右侧列表滚动联动（点击跳转时不 spy，用户手势后才 spy） */
export function useMenuCategoryNav(
  sections: MenuSection[],
  categories: MenuCategory[],
) {
  const [category, setCategory] = useState(ALL_CATEGORY)
  const menuListRef = useRef<HTMLDivElement>(null)
  const menuCatsRef = useRef<HTMLElement>(null)
  const catBtnEls = useRef(new Map<string, HTMLButtonElement>())
  const allowCategorySpy = useRef(false)
  const spyRaf = useRef(0)
  const scrollDirRef = useRef<MenuScrollDir>('down')
  const lastScrollTop = useRef(0)
  const [catBar, setCatBar] = useState({ top: 0, height: 0, ready: false })

  const sectionStarts = useMemo(() => buildSectionStarts(sections), [sections])

  const activeCategory = useMemo(
    () =>
      sections.some((s) => s.tag === category) ? category : ALL_CATEGORY,
    [category, sections],
  )

  useLayoutEffect(() => {
    const btn = catBtnEls.current.get(activeCategory)
    if (!btn) {
      setCatBar((prev) => ({ ...prev, ready: false }))
      return
    }
    setCatBar({
      top: btn.offsetTop,
      height: btn.offsetHeight,
      ready: true,
    })
  }, [activeCategory, categories])

  const scrollCatIntoView = (tag: string) => {
    const btn = catBtnEls.current.get(tag)
    const nav = menuCatsRef.current
    if (!btn || !nav) return
    const navRect = nav.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    if (btnRect.top < navRect.top || btnRect.bottom > navRect.bottom) {
      btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  useEffect(() => {
    if (!allowCategorySpy.current) return
    scrollCatIntoView(activeCategory)
  }, [activeCategory])

  const bindCatBtn = (tag: string) => (el: HTMLButtonElement | null) => {
    if (el) catBtnEls.current.set(tag, el)
    else catBtnEls.current.delete(tag)
  }

  const enableCategorySpyFromUser = () => {
    allowCategorySpy.current = true
  }

  const selectCategory = (tag: string) => {
    allowCategorySpy.current = false
    setCategory(tag)
    scrollCatIntoView(tag)
    const top = sectionStarts.get(tag)
    const root = menuListRef.current
    if (top == null || !root) return
    root.scrollTo({ top, behavior: 'smooth' })
  }

  const onMenuListScroll = () => {
    if (spyRaf.current) return
    spyRaf.current = requestAnimationFrame(() => {
      spyRaf.current = 0
      const root = menuListRef.current
      if (!root) return

      const st = root.scrollTop
      if (st > lastScrollTop.current + 1) scrollDirRef.current = 'down'
      else if (st < lastScrollTop.current - 1) scrollDirRef.current = 'up'
      lastScrollTop.current = st

      if (!allowCategorySpy.current || !sections.length) return
      const marker = st + MENU_SPY_OFFSET
      let active = sections[0].tag
      for (const { tag } of sections) {
        const start = sectionStarts.get(tag)
        if (start != null && start <= marker) active = tag
      }
      setCategory((prev) => (prev === active ? prev : active))
    })
  }

  return {
    activeCategory,
    catBar,
    menuListRef: menuListRef as RefObject<HTMLDivElement | null>,
    menuCatsRef: menuCatsRef as RefObject<HTMLElement | null>,
    scrollDirRef,
    bindCatBtn,
    selectCategory,
    onMenuListScroll,
    enableCategorySpyFromUser,
  }
}
