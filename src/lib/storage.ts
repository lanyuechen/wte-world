import type { AppData, AppSettings, FilterMode } from '../types'
import { EMPTY_APP_DATA, normalizeAppData } from '../types'
import { STORAGE_KEYS } from '../constants'
import { GITHUB_CONFIG, resolveGithubToken } from '../config'
import { createRoomId, readShareParamsFromHash } from './urls'

const LEGACY_SCAN_ROOMS_KEY = 'wte:scan-rooms'

function notifyActiveRoom(roomId: string) {
  window.dispatchEvent(
    new CustomEvent('wte:active-room', { detail: { roomId } }),
  )
}

function createMemberId() {
  return crypto.randomUUID()
}

function withFixedGithub(token?: string): AppSettings['github'] {
  return {
    owner: GITHUB_CONFIG.owner,
    repo: GITHUB_CONFIG.repo,
    branch: GITHUB_CONFIG.branch,
    token: resolveGithubToken(token),
  }
}

/** 协同昵称用 ASCII，避免部分信令环境对中文不稳定 */
function defaultNickname(memberId: string) {
  return `guest_${memberId.replace(/-/g, '').slice(0, 8)}`
}

function buildSettings(token?: string, memberId = createMemberId()): AppSettings {
  return {
    github: withFixedGithub(token),
    nickname: defaultNickname(memberId),
    memberId,
  }
}

export function loadSettings(): AppSettings {
  const shareToken = readShareParamsFromHash().token
  const raw = localStorage.getItem(STORAGE_KEYS.settings)
  if (!raw) {
    const settings = buildSettings(shareToken || undefined)
    if (shareToken) saveSettings(settings)
    return settings
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const memberId = parsed.memberId || createMemberId()
    const nickname =
      parsed.nickname && /^guest_[a-z0-9]+$/i.test(parsed.nickname)
        ? parsed.nickname
        : defaultNickname(memberId)
    const settings: AppSettings = {
      github: withFixedGithub(shareToken || parsed.github?.token),
      nickname,
      memberId,
    }
    if (shareToken) saveSettings(settings)
    return settings
  } catch {
    const settings = buildSettings(shareToken || undefined)
    if (shareToken) saveSettings(settings)
    return settings
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
}

const CACHE_VERSION = '3'
const CACHE_VERSION_KEY = 'wte:cache-version'

function clearCachedData() {
  localStorage.removeItem(STORAGE_KEYS.cache)
  localStorage.removeItem(STORAGE_KEYS.cacheSha)
}

export function loadCachedData(): { data: AppData; sha: string | null } {
  if (localStorage.getItem(CACHE_VERSION_KEY) !== CACHE_VERSION) {
    clearCachedData()
    localStorage.setItem(CACHE_VERSION_KEY, CACHE_VERSION)
  }

  const raw = localStorage.getItem(STORAGE_KEYS.cache)
  const sha = localStorage.getItem(STORAGE_KEYS.cacheSha)
  if (!raw) return { data: { ...EMPTY_APP_DATA }, sha: null }
  try {
    return {
      data: normalizeAppData({ ...EMPTY_APP_DATA, ...JSON.parse(raw) }),
      sha,
    }
  } catch {
    clearCachedData()
    return { data: { ...EMPTY_APP_DATA }, sha: null }
  }
}

export function saveCachedData(data: AppData, sha: string | null) {
  localStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(normalizeAppData(data)))
  if (sha) localStorage.setItem(STORAGE_KEYS.cacheSha, sha)
  else localStorage.removeItem(STORAGE_KEYS.cacheSha)
}

/** 读取本机协同房间；链接/扫码中的 room 优先，否则用已存值，首次进入则自动生成。 */
export function loadActiveRoomId() {
  const fromShare = readShareParamsFromHash().room.trim()
  if (fromShare) return saveActiveRoomId(fromShare)

  const stored = localStorage.getItem(STORAGE_KEYS.activeRoom)?.trim()
  if (stored) return stored

  // 兼容极旧版多房间列表：取第一项后清掉
  const legacyRaw = localStorage.getItem(LEGACY_SCAN_ROOMS_KEY)
  if (legacyRaw) {
    localStorage.removeItem(LEGACY_SCAN_ROOMS_KEY)
    try {
      const parsed = JSON.parse(legacyRaw) as { id?: string }[]
      const id = Array.isArray(parsed) ? parsed[0]?.id?.trim() : ''
      if (id) return saveActiveRoomId(id)
    } catch {
      // ignore
    }
  }

  return saveActiveRoomId(createRoomId())
}

export function saveActiveRoomId(roomId: string) {
  const id = roomId.trim() || createRoomId()
  localStorage.setItem(STORAGE_KEYS.activeRoom, id)
  return id
}

/** 重新生成协同房间号（扫码页「更新」），并通知协同层重连。 */
export function regenerateActiveRoomId() {
  const id = saveActiveRoomId(createRoomId())
  localStorage.removeItem(LEGACY_SCAN_ROOMS_KEY)
  notifyActiveRoom(id)
  return id
}

export type OrderFilterState = {
  availableIngredients: string[]
  filterMode: FilterMode
}

const DEFAULT_ORDER_FILTER: OrderFilterState = {
  availableIngredients: [],
  filterMode: 'any',
}

/** 点单筛选项（已有食材 + 匹配模式）本机持久化。 */
export function loadOrderFilter(): OrderFilterState {
  const raw = localStorage.getItem(STORAGE_KEYS.orderFilter)
  if (!raw) return { ...DEFAULT_ORDER_FILTER, availableIngredients: [] }
  try {
    const parsed = JSON.parse(raw) as Partial<OrderFilterState>
    const ingredients = Array.isArray(parsed.availableIngredients)
      ? parsed.availableIngredients
          .map((i) => (typeof i === 'string' ? i.trim() : ''))
          .filter(Boolean)
      : []
    const filterMode: FilterMode =
      parsed.filterMode === 'all' || parsed.filterMode === 'any'
        ? parsed.filterMode
        : 'any'
    return { availableIngredients: ingredients, filterMode }
  } catch {
    return { ...DEFAULT_ORDER_FILTER, availableIngredients: [] }
  }
}

export function saveOrderFilter(state: OrderFilterState) {
  const availableIngredients = [
    ...new Set(
      state.availableIngredients
        .map((i) => i.trim())
        .filter(Boolean),
    ),
  ]
  const filterMode: FilterMode =
    state.filterMode === 'all' || state.filterMode === 'any'
      ? state.filterMode
      : 'any'
  localStorage.setItem(
    STORAGE_KEYS.orderFilter,
    JSON.stringify({ availableIngredients, filterMode }),
  )
}
