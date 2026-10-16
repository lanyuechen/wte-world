import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useApp } from '../context/AppContext'
import { useCollab } from '../context/CollabContext'
import { regenerateActiveRoomId } from '../lib/storage'
import { buildScanShareUrl } from '../lib/urls'

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}

export function SettingsPage() {
  const { settings } = useApp()
  const { roomId } = useCollab()
  const token = settings.github.token.trim()
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const shareUrl = buildScanShareUrl(roomId, token)

  useEffect(() => {
    let cancelled = false
    setQrDataUrl('')
    void (async () => {
      const dataUrl = await QRCode.toDataURL(shareUrl, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#12261d', light: '#fffdf8' },
      })
      if (!cancelled) setQrDataUrl(dataUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [shareUrl])

  const copyLink = async () => {
    const ok = await copyText(shareUrl)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const updateRoom = () => {
    setCopied(false)
    regenerateActiveRoomId()
  }

  return (
    <section className="scan-poster scan-rooms">
      <p className="scan-kicker">家庭共享点餐</p>
      <h1 className="scan-brand">吃什么</h1>
      <p className="scan-lead">扫一下，一起勾选今天的菜</p>

      <div className="scan-qr-card">
        <div className="scan-qr-frame">
          {qrDataUrl ? (
            <img className="qr poster" src={qrDataUrl} alt="共享点单二维码" />
          ) : (
            <div className="thumb-placeholder large">生成中…</div>
          )}
        </div>
        <div className="scan-qr-actions">
          <button
            type="button"
            className={`scan-qr-copy ${copied ? 'is-copied' : ''}`}
            onClick={() => void copyLink()}
          >
            {copied ? '已复制' : '复制链接'}
          </button>
          <button type="button" className="scan-qr-update" onClick={updateRoom}>
            更新
          </button>
        </div>
      </div>

      <p className="scan-hint">打开手机摄像头或浏览器扫码即可进点单</p>
    </section>
  )
}
