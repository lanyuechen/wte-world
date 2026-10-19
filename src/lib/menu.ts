import { filterRecipes } from './recipes'
import type { FilterMode, Recipe } from '../types'

export const ALL_CATEGORY = '全部'
export const OTHER_CATEGORY = '其他'

/** 与 CSS --menu-head-h / --menu-card-h 保持一致 */
export const MENU_HEAD_H = 40
export const MENU_CARD_H = 97
/** 滚动联动：距列表顶多少 px 内算当前分类 */
export const MENU_SPY_OFFSET = 48

export type MenuSection = { tag: string; recipes: Recipe[] }
export type MenuCategory = { tag: string; count: number }

export function recipeTags(recipe: Recipe) {
  return recipe.tags.map((t) => t.trim()).filter(Boolean)
}

export function buildMenuCategories(recipes: Recipe[]): MenuCategory[] {
  const counts = new Map<string, number>()
  let otherCount = 0
  for (const recipe of recipes) {
    const tags = recipeTags(recipe)
    if (!tags.length) {
      otherCount += 1
      continue
    }
    for (const t of tags) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  const list = [...counts.keys()]
    .sort((a, b) => a.localeCompare(b, 'zh'))
    .map((tag) => ({ tag, count: counts.get(tag) ?? 0 }))
  if (otherCount > 0) {
    list.push({ tag: OTHER_CATEGORY, count: otherCount })
  }
  return list
}

/** 搜索/食材过滤后：先「全部」，再按标签多处分发（多标签可重复） */
export function buildMenuSections(
  recipes: Recipe[],
  categories: MenuCategory[],
  available: string[],
  filterMode: FilterMode,
  query: string,
): MenuSection[] {
  const matched = filterRecipes(recipes, available, filterMode, query, [])
  if (!matched.length) return []

  const byTag = new Map<string, Recipe[]>()
  for (const { tag } of categories) byTag.set(tag, [])
  for (const recipe of matched) {
    const tags = recipeTags(recipe)
    if (!tags.length) {
      byTag.get(OTHER_CATEGORY)?.push(recipe)
      continue
    }
    for (const tag of tags) {
      byTag.get(tag)?.push(recipe)
    }
  }
  const tagSections = categories
    .map(({ tag }) => ({ tag, recipes: byTag.get(tag) ?? [] }))
    .filter((s) => s.recipes.length > 0)

  return [{ tag: ALL_CATEGORY, recipes: matched }, ...tagSections]
}

/** 左侧分类：随筛选结果变化，去掉「全部」 */
export function navCategoriesFromSections(
  sections: MenuSection[],
): MenuCategory[] {
  return sections
    .filter((s) => s.tag !== ALL_CATEGORY)
    .map((s) => ({ tag: s.tag, count: s.recipes.length }))
}

export function buildSectionStarts(sections: MenuSection[]) {
  const map = new Map<string, number>()
  let y = 0
  for (const { tag, recipes } of sections) {
    map.set(tag, y)
    y += MENU_HEAD_H + recipes.length * MENU_CARD_H
  }
  return map
}

export function buildOrderTitle(roomId: string) {
  const now = new Date()
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 4)
      : Math.random().toString(36).slice(2, 6)
  return `${(roomId || 'wte').toUpperCase()}-${stamp}-${rand.toUpperCase()}`
}
