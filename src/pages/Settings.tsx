import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { OlDialog } from '../components/OlDialog'
import { WordCloudBg } from '../components/WordCloudBg'
import { useApp } from '../context/AppContext'
import { useCollab } from '../context/CollabContext'
import { SCAN_CLOUD_PHRASES } from '../lib/scanPhrases'
import { regenerateActiveRoomId } from '../lib/storage'
import { buildScanShareUrl } from '../lib/urls'

const LONG_PRESS_MS = 3000

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
  const [refreshOpen, setRefreshOpen] = useState(false)

  const longPressTimer = useRef(0)
  const suppressClick = useRef(false)

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

  useEffect(() => {
    return () => {
      window.clearTimeout(longPressTimer.current)
    }
  }, [])

  const clearLongPress = () => {
    window.clearTimeout(longPressTimer.current)
    longPressTimer.current = 0
  }

  const startLongPress = () => {
    clearLongPress()
    suppressClick.current = false
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = 0
      suppressClick.current = true
      setCopied(false)
      setRefreshOpen(true)
    }, LONG_PRESS_MS)
  }

  const copyLink = async () => {
    const ok = await copyText(shareUrl)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const confirmRefresh = () => {
    setRefreshOpen(false)
    setCopied(false)
    regenerateActiveRoomId()
  }

  return (
    <section className="scan-poster scan-rooms">
      <WordCloudBg phrases={SCAN_CLOUD_PHRASES} />
      <div className="scan-poster-content">
        <div className="scan-qr-card">
          <div className={`scan-qr-frame ${copied ? 'is-copied' : ''}`}>
            <button
              type="button"
              className="scan-qr-hit"
              aria-label={copied ? '链接已复制' : '点击复制点单链接，长按可刷新二维码'}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                startLongPress()
              }}
              onPointerUp={clearLongPress}
              onPointerLeave={clearLongPress}
              onPointerCancel={clearLongPress}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false
                  return
                }
                void copyLink()
              }}
            >
              {qrDataUrl ? (
                <img className="qr poster" src={qrDataUrl} alt="共享点单二维码" />
              ) : (
                <div className="thumb-placeholder large">生成中…</div>
              )}
              {copied && <span className="scan-qr-copied">已复制</span>}
            </button>
          </div>
        </div>
      </div>

      {refreshOpen && (
        <OlDialog
          titleId="scan-refresh-qr-title"
          title="刷新二维码"
          onClose={() => setRefreshOpen(false)}
          actions={
            <>
              <button
                type="button"
                className="ol-btn ghost"
                onClick={() => setRefreshOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="ol-btn primary"
                onClick={confirmRefresh}
              >
                确定
              </button>
            </>
          }
        >
          <p>刷新后将生成新的协同房间，原二维码/链接将失效。是否继续？</p>
        </OlDialog>
      )}
    </section>
  )
}
