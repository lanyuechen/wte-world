import type { AppData, AppSettings } from '../types'
import { EMPTY_APP_DATA, normalizeAppData } from '../types'
import { STORAGE_KEYS } from '../constants'
import {
  DEFAULT_COLLAB_ROOM_ID,
  GITHUB_CONFIG,
  resolveGithubToken,
} from '../config'
import { createRoomId } from './urls'

export type ScanRoom = {
  id: string
  label: string
  createdAt: string
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

/** Achex 用户名用 ASCII，避免部分环境对中文鉴权不稳定 */
function defaultNickname(memberId: string) {
  return `guest_${memberId.replace(/-/g, '').slice(0, 8)}`
}

export function loadSettings(): AppSettings {
  const raw = localStorage.getItem(STORAGE_KEYS.settings)
  if (!raw) {
    const memberId = createMemberId()
    return {
      github: withFixedGithub(),
      achex: { userId: '', password: '', hub: '' },
      nickname: defaultNickname(memberId),
      memberId,
    }
  }
  try {
    const parsed = JSON.parse(raw) as AppSettings
    const memberId = parsed.memberId || createMemberId()
    const nickname =
      parsed.nickname && /^guest_[a-z0-9]+$/i.test(parsed.nickname)
        ? parsed.nickname
        : defaultNickname(memberId)
    return {
      github: withFixedGithub(parsed.github?.token),
      achex: { userId: '', password: '', hub: '' },
      nickname,
      memberId,
    }
  } catch {
    const memberId = createMemberId()
    return {
      github: withFixedGithub(),
      achex: { userId: '', password: '', hub: '' },
      nickname: defaultNickname(memberId),
      memberId,
    }
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
}

const CACHE_VERSION = '2'
const CACHE_VERSION_KEY = 'wte:cache-version'

/** 清除本地缓存的 app 数据（保留设置）。 */
export function clearCachedData() {
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

export function loadActiveRoomId() {
  return (
    localStorage.getItem(STORAGE_KEYS.activeRoom)?.trim() ||
    DEFAULT_COLLAB_ROOM_ID
  )
}

export function saveActiveRoomId(roomId: string) {
  const id = roomId.trim() || DEFAULT_COLLAB_ROOM_ID
  localStorage.setItem(STORAGE_KEYS.activeRoom, id)
  return id
}

export function loadScanRooms(): ScanRoom[] {
  const raw = localStorage.getItem(STORAGE_KEYS.scanRooms)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as ScanRoom[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveScanRooms(rooms: ScanRoom[]) {
  localStorage.setItem(STORAGE_KEYS.scanRooms, JSON.stringify(rooms))
}

/** 新建一个扫码房间并记入本机列表。 */
export function createScanRoom(label?: string): ScanRoom {
  const rooms = loadScanRooms()
  const room: ScanRoom = {
    id: createRoomId(),
    label: label?.trim() || `房间 ${rooms.length + 1}`,
    createdAt: new Date().toISOString(),
  }
  const next = [room, ...rooms].slice(0, 20)
  saveScanRooms(next)
  return room
}
