import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useApp } from '../context/AppContext'
import {
  createScanRoom,
  loadScanRooms,
  saveScanRooms,
  type ScanRoom,
} from '../lib/storage'
import { buildScanShareUrl } from '../lib/urls'

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SettingsPage() {
  const { settings } = useApp()
  const token = settings.github.token.trim()
  const [rooms, setRooms] = useState<ScanRoom[]>(() => loadScanRooms())
  const [qrMap, setQrMap] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        rooms.map(async (room) => {
          const dataUrl = await QRCode.toDataURL(
            buildScanShareUrl(room.id, token),
            {
              width: 320,
              margin: 1,
              errorCorrectionLevel: 'M',
              color: { dark: '#12261d', light: '#fffdf8' },
            },
          )
          return [room.id, dataUrl] as const
        }),
      )
      if (!cancelled) {
        setQrMap(Object.fromEntries(entries))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [rooms, token])

  const newRoom = () => {
    createScanRoom(`房间 ${rooms.length + 1}`)
    setRooms(loadScanRooms())
  }

  const removeRoom = (roomId: string) => {
    const next = rooms.filter((r) => r.id !== roomId)
    saveScanRooms(next)
    setRooms(next)
  }

  return (
    <section className="scan-poster scan-rooms">
      <p className="scan-kicker">家庭共享点餐</p>
      <h1 className="scan-brand">吃什么</h1>
      <p className="scan-lead">扫一下，一起勾选今天的菜</p>

      <div className="scan-qr-grid">
        {rooms.map((room) => (
          <div key={room.id} className="scan-qr-card">
            <div className="scan-qr-frame">
              {qrMap[room.id] ? (
                <img
                  className="qr poster"
                  src={qrMap[room.id]}
                  alt={`${room.label}二维码`}
                />
              ) : (
                <div className="thumb-placeholder large">生成中…</div>
              )}
              <button
                type="button"
                className="scan-qr-delete"
                aria-label={`删除${room.label}`}
                onClick={() => removeRoom(room.id)}
              >
                <CloseIcon />
              </button>
            </div>
            <p className="scan-qr-label">{room.label}</p>
          </div>
        ))}

        <button
          type="button"
          className="scan-qr-create"
          onClick={newRoom}
          aria-label="新建房间"
        >
          <span className="scan-qr-create-plus">+</span>
          <span>新建房间</span>
        </button>
      </div>

      <p className="scan-hint">打开手机摄像头或浏览器扫码即可进点单</p>
    </section>
  )
}
