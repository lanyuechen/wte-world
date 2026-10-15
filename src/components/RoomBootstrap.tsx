import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { saveActiveRoomId } from '../lib/storage'
import { stripShareParamsFromHashUrl } from '../lib/urls'

/** 从地址栏读取 `?room=`，写入本机当前协同房间后从 URL 去掉。 */
export function RoomBootstrap() {
  const location = useLocation()
  const navigate = useNavigate()
  const handled = useRef('')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const room = params.get('room')?.trim()
    if (!room) return
    if (handled.current === room) return
    handled.current = room

    saveActiveRoomId(room)
    window.dispatchEvent(
      new CustomEvent('wte:active-room', { detail: { roomId: room } }),
    )

    stripShareParamsFromHashUrl()
    navigate({ pathname: '/', search: '' }, { replace: true })
  }, [location.pathname, location.search, navigate])

  return null
}
