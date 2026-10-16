import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Danmaku } from '../components/Danmaku'
import { useApp } from '../context/AppContext'
import { useCollab } from '../context/CollabContext'
import { SCAN_DANMAKU_PHRASES } from '../lib/scanPhrases'
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

function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 12a8 8 0 1 1-2.3-5.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 4v5h-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
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
      <Danmaku phrases={SCAN_DANMAKU_PHRASES} />
      <div className="scan-poster-content">
        <p className="scan-kicker">家庭共享点餐</p>
        <h1 className="scan-brand">吃什么</h1>

        <div className="scan-qr-card">
          <div className={`scan-qr-frame ${copied ? 'is-copied' : ''}`}>
            <button
              type="button"
              className="scan-qr-hit"
              onClick={() => void copyLink()}
              aria-label={copied ? '链接已复制' : '点击复制点单链接'}
            >
              {qrDataUrl ? (
                <img className="qr poster" src={qrDataUrl} alt="" />
              ) : (
                <div className="thumb-placeholder large">生成中…</div>
              )}
              {copied && <span className="scan-qr-copied">已复制</span>}
            </button>
            <button
              type="button"
              className="scan-qr-refresh"
              aria-label="更新二维码"
              onClick={updateRoom}
            >
              <IconRefresh />
            </button>
          </div>
        </div>

        <p className="scan-hint">
          吾日三省吾身，早饭吃什么，午饭吃什么，晚饭吃什么
        </p>
      </div>
    </section>
  )
}
