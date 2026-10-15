import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { saveActiveRoomId } from '../lib/storage'
import {
  readShareParamsFromHash,
  stripShareParamsFromHashUrl,
} from '../lib/urls'

/**
 * 从地址栏读取 `?token=` / `?room=`：
 * - token 写入本机设置（localStorage）
 * - room 设为当前协同房间
 * 然后从 URL 去掉这些参数。
 */
export function ShareBootstrap() {
  const location = useLocation()
  const navigate = useNavigate()
  const { applyGithubToken } = useApp()
  const handled = useRef('')

  useEffect(() => {
    const { token, room } = readShareParamsFromHash()
    const key = `${token}|${room}|${location.search}`
    if (!token && !room) return
    if (handled.current === key) return
    handled.current = key

    if (token) {
      void applyGithubToken(token)
    }
    if (room) {
      saveActiveRoomId(room)
      window.dispatchEvent(
        new CustomEvent('wte:active-room', { detail: { roomId: room } }),
      )
    }

    stripShareParamsFromHashUrl()
    navigate({ pathname: location.pathname || '/', search: '' }, { replace: true })
  }, [applyGithubToken, location.pathname, location.search, navigate])

  return null
}
