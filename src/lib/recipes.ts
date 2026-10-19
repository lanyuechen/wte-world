import type { FilterMode, IngredientStatus, Order, Recipe } from '../types'

const zhSort = (a: string, b: string) => a.localeCompare(b, 'zh')

/** 收集菜谱中的去重字段（trim 后非空），按中文排序 */
function collectSortedFields(
  recipes: Recipe[],
  pick: (recipe: Recipe) => readonly string[],
  seed: Iterable<string> = [],
) {
  const set = new Set<string>()
  for (const item of seed) {
    const v = item.trim()
    if (v) set.add(v)
  }
  for (const recipe of recipes) {
    for (const raw of pick(recipe)) {
      const v = raw.trim()
      if (v) set.add(v)
    }
  }
  return [...set].sort(zhSort)
}

export function collectRecipeIngredients(
  recipes: Recipe[],
  seed: Iterable<string> = [],
) {
  return collectSortedFields(recipes, (r) => r.ingredients, seed)
}

export function collectRecipeTags(recipes: Recipe[]) {
  return collectSortedFields(recipes, (r) => r.tags)
}

/** 按订单列表统计每道菜被点过的次数（每个订单计 1 次） */
export function countRecipeOrders(orders: Order[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const order of orders) {
    const seen = new Set<string>()
    for (const id of order.recipeIds) {
      if (seen.has(id)) continue
      seen.add(id)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return counts
}

export function filterRecipes(
  recipes: Recipe[],
  available: string[],
  mode: FilterMode,
  query: string,
  tags: string[],
): Recipe[] {
  const availableSet = new Set(available)
  const q = query.trim().toLowerCase()
  return recipes.filter((recipe) => {
    if (q && !recipe.name.toLowerCase().includes(q)) return false
    if (tags.length && !tags.every((t) => recipe.tags.includes(t))) return false
    if (available.length === 0) return true
    if (mode === 'all') {
      return recipe.ingredients.every((ing) => availableSet.has(ing))
    }
    return recipe.ingredients.some((ing) => availableSet.has(ing))
  })
}

export function buildIngredientStatus(
  recipes: Recipe[],
  recipeIds: string[],
  available: string[],
  prev: Record<string, IngredientStatus> = {},
): Record<string, IngredientStatus> {
  const availableSet = new Set(available)
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const names = new Set<string>()
  for (const id of recipeIds) {
    const recipe = byId.get(id)
    recipe?.ingredients.forEach((ing) => names.add(ing))
  }
  const next: Record<string, IngredientStatus> = {}
  for (const name of names) {
    next[name] = prev[name] ?? (availableSet.has(name) ? 'have' : 'need')
  }
  return next
}
