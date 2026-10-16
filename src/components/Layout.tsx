import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useCollab } from '../context/CollabContext'
import { IconOrder, IconOrders, IconScan } from './TabIcons'
import { OlDialog } from './OlDialog'

const links = [
  { to: '/', label: '点单', end: true, Icon: IconOrder, badgeKey: 'order' as const },
  { to: '/orders', label: '订单', Icon: IconOrders },
  { to: '/settings', label: '扫码', Icon: IconScan },
]

function IconGhSync() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
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

function IconGhOk() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6.5 9.5 17 4 11.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconGhFail() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7.5v6M12 16.5h.01"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Layout() {
  const location = useLocation()
  const { status, retryPersist, dismissPersistError, syncFromRemote } = useApp()
  const { session, mode } = useCollab()
  const [ghErrorOpen, setGhErrorOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const membersWrapRef = useRef<HTMLDivElement>(null)
  const onOrderPage = location.pathname === '/'
  const onOrdersSurface =
    location.pathname === '/orders' ||
    /^\/orders\/[^/]+$/.test(location.pathname)
  const onScanPage = location.pathname === '/settings'
  const onRecipeForm =
    location.pathname === '/recipes/new' ||
    /^\/recipes\/[^/]+\/edit$/.test(location.pathname)
  const onlineCount = Math.max(
    session.members.length,
    mode === 'idle' ? 0 : 1,
  )
  const linkLabel = mode === 'webrtc' ? 'P2P' : 'MQTT'
  const mqttConnecting = mode === 'idle'
  const ghState = status.syncing ? 'busy' : status.error ? 'error' : 'ok'
  const selectedCount = session.selectedRecipeIds.length

  useEffect(() => {
    if (!status.error) setGhErrorOpen(false)
  }, [status.error])

  useEffect(() => {
    if (!membersOpen) return
    const onDoc = (ev: MouseEvent) => {
      if (!membersWrapRef.current?.contains(ev.target as Node)) {
        setMembersOpen(false)
      }
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMembersOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [membersOpen])

  const onRetryGithub = () => {
    if (status.retry === 'sync') void syncFromRemote()
    else if (status.retry === 'persist') retryPersist()
  }

  return (
    <div
      className={`app-shell ${onOrderPage ? 'is-order' : ''} ${
        onRecipeForm ? 'is-form' : ''
      } ${onOrdersSurface ? 'is-order-detail' : ''} ${
        onScanPage ? 'is-scan' : ''
      }`}
    >
      <header className="topbar">
        <p className="brand">
          <span className="brand-mark">
            吃什么
            <span className="brand-version" aria-label={`版本 ${__APP_VERSION__}`}>
              v{__APP_VERSION__}
            </span>
          </span>
        </p>
        <div
          className={`topbar-status ${
            mode === 'idle' ? 'is-idle' : mode === 'webrtc' ? 'is-p2p' : 'is-live'
          }`}
        >
          <i className="live-dot" aria-hidden />
          <div className="topbar-members-wrap" ref={membersWrapRef}>
            <button
              type="button"
              className="topbar-online"
              aria-expanded={membersOpen}
              aria-haspopup="listbox"
              title="查看在线成员"
              onClick={() => setMembersOpen((v) => !v)}
            >
              {onlineCount} 人
              <span
                className={`topbar-link-mode ${mqttConnecting ? 'is-breathing' : ''}`}
                aria-label={
                  mqttConnecting ? '正在连接 MQTT' : `连接 ${linkLabel}`
                }
              >
                · {linkLabel}
              </span>
            </button>
            {membersOpen && (
              <div className="topbar-members-pop" role="listbox" aria-label="在线成员">
                {session.members.length ? (
                  <ul>
                    {session.members.map((m) => (
                      <li key={m.id}>{m.name || m.id}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="topbar-members-empty">暂无成员</p>
                )}
              </div>
            )}
          </div>
          <span className="topbar-link-mode" aria-hidden>
            ·
          </span>
          {ghState === 'busy' ? (
            <span
              className="topbar-gh is-busy"
              title="正在同步 GitHub"
              aria-label="GitHub 更新中"
            >
              <IconGhSync />
            </span>
          ) : ghState === 'error' ? (
            <button
              type="button"
              className="topbar-gh is-error"
              title="GitHub 同步失败，点击查看"
              aria-label="GitHub 同步失败"
              onClick={() => setGhErrorOpen(true)}
            >
              <IconGhFail />
            </button>
          ) : (
            <span
              className="topbar-gh is-ok"
              title="GitHub 已同步"
              aria-label="GitHub 已同步"
            >
              <IconGhOk />
            </span>
          )}
        </div>
      </header>

      <main
        className={`page ${onOrderPage ? 'page-order' : ''} ${
          onRecipeForm ? 'page-form' : ''
        }`}
      >
        <div key={location.pathname} className="page-transition">
          <Outlet />
        </div>
      </main>

      <nav className="tabbar tabbar-3" aria-label="主导航">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
          >
            {({ isActive }) => (
              <>
                <span className="tab-icon-wrap">
                  <link.Icon active={isActive} />
                  {link.badgeKey === 'order' && selectedCount > 0 && (
                    <span
                      key={selectedCount}
                      className="tab-badge"
                      aria-label={`已选 ${selectedCount}`}
                    >
                      {selectedCount > 99 ? '99+' : selectedCount}
                    </span>
                  )}
                </span>
                <span>{link.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {ghErrorOpen && status.error && (
        <OlDialog
          titleId="gh-sync-error-title"
          title="GitHub 同步失败"
          onClose={() => setGhErrorOpen(false)}
          actions={
            <>
              <button
                type="button"
                className="ol-btn ghost"
                onClick={() => {
                  dismissPersistError()
                  setGhErrorOpen(false)
                }}
              >
                关闭
              </button>
              {status.retry && (
                <button
                  type="button"
                  className="ol-btn"
                  disabled={status.syncing}
                  onClick={onRetryGithub}
                >
                  {status.syncing ? '重试中…' : '重试'}
                </button>
              )}
            </>
          }
        >
          <p className="topbar-gh-error-msg">{status.error}</p>
        </OlDialog>
      )}
    </div>
  )
}
