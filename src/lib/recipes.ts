import type { FilterMode, IngredientStatus, Recipe } from '../types'

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
  const names = new Set<string>()
  for (const id of recipeIds) {
    const recipe = recipes.find((r) => r.id === id)
    recipe?.ingredients.forEach((ing) => names.add(ing))
  }
  const next: Record<string, IngredientStatus> = {}
  for (const name of names) {
    next[name] = prev[name] ?? (availableSet.has(name) ? 'have' : 'need')
  }
  return next
}
