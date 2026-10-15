export type IngredientStatus = 'have' | 'need'
export type FilterMode = 'all' | 'any'

export type Recipe = {
  id: string
  name: string
  ingredients: string[]
  thumbnail: string
  tags: string[]
  description: string
  createdAt: string
  updatedAt: string
}

export type Order = {
  id: string
  title: string
  recipeIds: string[]
  ingredientStatus: Record<string, IngredientStatus>
  createdAt: string
  updatedAt: string
}

export type AppData = {
  recipes: Recipe[]
  orders: Order[]
  availableIngredients: string[]
  collabRoomId: string
}

type CollabMember = {
  id: string
  name: string
}

export type CollabSession = {
  roomId: string
  selectedRecipeIds: string[]
  availableIngredients: string[]
  filterMode: FilterMode
  ingredientStatus: Record<string, IngredientStatus>
  members: CollabMember[]
  revisedAt: number
}

export type GithubSettings = {
  owner: string
  repo: string
  branch: string
  token: string
}

type AchexSettings = {
  userId: string
  password: string
  hub: string
}

export type AppSettings = {
  github: GithubSettings
  achex: AchexSettings
  nickname: string
  memberId: string
}

export const EMPTY_APP_DATA: AppData = {
  recipes: [],
  orders: [],
  availableIngredients: [],
  collabRoomId: 'wte-home',
}

/** 规范化远程/缓存数据，去掉已废弃字段（如 customTags）。 */
export function normalizeAppData(data: Partial<AppData> | null | undefined): AppData {
  return {
    recipes: data?.recipes ?? [],
    orders: data?.orders ?? [],
    availableIngredients: data?.availableIngredients ?? [],
    collabRoomId: data?.collabRoomId || 'wte-home',
  }
}
