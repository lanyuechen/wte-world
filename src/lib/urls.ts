import { SCAN_SHARE_BASE } from '../config'

/** 生成本地 hash 链接；可选附带房间号。 */
export function buildAppUrl(path: string, room?: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const base = `${window.location.origin}${window.location.pathname}#${cleanPath}`
  if (!room) return base
  const sep = cleanPath.includes('?') ? '&' : '?'
  return `${base}${sep}room=${encodeURIComponent(room)}`
}

/** 扫码页对外分享链接（仅带 room，Token 由程序内置）。 */
export function buildScanShareUrl(roomId: string) {
  const base = SCAN_SHARE_BASE.replace(/\/$/, '')
  const hash = `#/?room=${encodeURIComponent(roomId)}`
  // jsDelivr 入口是 index.html，hash 直接接在文件后
  if (/\.html$/i.test(base)) return `${base}${hash}`
  return `${base}/${hash}`
}

export function createRoomId() {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `wte-${id}`
}

/** 从 hash 去掉 room，避免残留在地址栏。 */
export function stripShareParamsFromHashUrl() {
  const hash = window.location.hash
  if (!hash.includes('room=')) return false
  const [pathPart, queryPart = ''] = hash.slice(1).split('?')
  const params = new URLSearchParams(queryPart)
  if (!params.has('room')) return false
  params.delete('room')
  // 兼容旧链接里残留的 token
  params.delete('token')
  const nextQuery = params.toString()
  const nextHash = nextQuery ? `#${pathPart}?${nextQuery}` : `#${pathPart}`
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${nextHash}`,
  )
  return true
}
