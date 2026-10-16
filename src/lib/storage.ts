import type { AppData, AppSettings } from '../types'
import { EMPTY_APP_DATA, normalizeAppData } from '../types'
import { STORAGE_KEYS } from '../constants'
import { GITHUB_CONFIG, resolveGithubToken } from '../config'
import { createRoomId, readShareParamsFromHash } from './urls'

function notifyActiveRoom(roomId: string) {
  window.dispatchEvent(
    new CustomEvent('wte:active-room', { detail: { roomId } }),
  )
}

/** 兼容旧版多扫码房间列表，仅用于首次迁移。 */
function readLegacyScanRoomId() {
  const raw = localStorage.getItem(STORAGE_KEYS.scanRooms)
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as { id?: string }[]
    const id = Array.isArray(parsed) ? parsed[0]?.id?.trim() : ''
    return id || ''
  } catch {
    return ''
  }
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

export function loadSettings(): AppSettings {
  const shareToken = readShareParamsFromHash().token
  const raw = localStorage.getItem(STORAGE_KEYS.settings)
  if (!raw) {
    const memberId = createMemberId()
    const settings: AppSettings = {
      github: withFixedGithub(shareToken || undefined),
      achex: { userId: '', password: '', hub: '' },
      nickname: defaultNickname(memberId),
      memberId,
    }
    if (shareToken) saveSettings(settings)
    return settings
  }
  try {
    const parsed = JSON.parse(raw) as AppSettings
    const memberId = parsed.memberId || createMemberId()
    const nickname =
      parsed.nickname && /^guest_[a-z0-9]+$/i.test(parsed.nickname)
        ? parsed.nickname
        : defaultNickname(memberId)
    const token = shareToken || parsed.github?.token
    const settings: AppSettings = {
      github: withFixedGithub(token),
      achex: { userId: '', password: '', hub: '' },
      nickname,
      memberId,
    }
    if (shareToken) saveSettings(settings)
    return settings
  } catch {
    const memberId = createMemberId()
    const settings: AppSettings = {
      github: withFixedGithub(shareToken || undefined),
      achex: { userId: '', password: '', hub: '' },
      nickname: defaultNickname(memberId),
      memberId,
    }
    if (shareToken) saveSettings(settings)
    return settings
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
}

const CACHE_VERSION = '2'
const CACHE_VERSION_KEY = 'wte:cache-version'

/** 清除本地缓存的 app 数据（保留设置）。 */
function clearCachedData() {
  localStorage.removeItem(STORAGE_KEYS.cache)
  localStorage.removeItem(STORAGE_KEYS.cacheSha)
}

export function loadCachedData(): { data: AppData; sha: string | null } {
  // 去掉 demo 后升级版本，丢弃旧本地缓存
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

  const legacy = readLegacyScanRoomId()
  if (legacy) {
    localStorage.removeItem(STORAGE_KEYS.scanRooms)
    return saveActiveRoomId(legacy)
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
  localStorage.removeItem(STORAGE_KEYS.scanRooms)
  notifyActiveRoom(id)
  return id
}
