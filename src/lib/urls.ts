import { SCAN_SHARE_BASE } from '../config'

/** 从当前 hash 读取分享参数（不修改地址栏）。 */
export function readShareParamsFromHash() {
  const hash = window.location.hash
  if (!hash.includes('?')) return { token: '', room: '' }
  const queryPart = hash.slice(1).split('?')[1] ?? ''
  const params = new URLSearchParams(queryPart)
  return {
    token: params.get('token')?.trim() ?? '',
    room: params.get('room')?.trim() ?? '',
  }
}

/** 扫码页对外分享链接（带 token + room）。 */
export function buildScanShareUrl(roomId: string, token: string) {
  const base = SCAN_SHARE_BASE.replace(/\/$/, '')
  const params = new URLSearchParams()
  const t = token.trim()
  if (t) params.set('token', t)
  params.set('room', roomId)
  const hash = `#/?${params.toString()}`
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

/** 从 hash 去掉 token / room，避免残留在地址栏。 */
export function stripShareParamsFromHashUrl() {
  const hash = window.location.hash
  if (!hash.includes('token=') && !hash.includes('room=')) return false
  const [pathPart, queryPart = ''] = hash.slice(1).split('?')
  const params = new URLSearchParams(queryPart)
  if (!params.has('token') && !params.has('room')) return false
  params.delete('token')
  params.delete('room')
  const nextQuery = params.toString()
  const nextHash = nextQuery ? `#${pathPart}?${nextQuery}` : `#${pathPart}`
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${nextHash}`,
  )
  return true
}
