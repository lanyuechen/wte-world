import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useCollab } from '../context/CollabContext'
import { IconOrder, IconOrders, IconScan } from './TabIcons'

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
  const onOrderPage = location.pathname === '/'
  const onOrderDetail = /^\/orders\/[^/]+$/.test(location.pathname)
  const onRecipeForm =
    location.pathname === '/recipes/new' ||
    /^\/recipes\/[^/]+\/edit$/.test(location.pathname)
  const onlineCount = Math.max(
    session.members.length,
    mode === 'idle' ? 0 : 1,
  )
  const linkLabel =
    mode === 'webrtc' ? 'P2P' : mode === 'mqtt' ? 'MQTT' : '未连接'
  const ghState = status.syncing ? 'busy' : status.error ? 'error' : 'ok'
  const selectedCount = session.selectedRecipeIds.length

  useEffect(() => {
    if (!status.error) setGhErrorOpen(false)
  }, [status.error])

  const onRetryGithub = () => {
    if (status.retry === 'sync') void syncFromRemote()
    else if (status.retry === 'persist') retryPersist()
  }

  return (
    <div
      className={`app-shell ${onOrderPage ? 'is-order' : ''} ${
        onRecipeForm ? 'is-form' : ''
      } ${onOrderDetail ? 'is-order-detail' : ''}`}
    >
      <div className="ambient" aria-hidden />
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
          <span className="topbar-online">
            {onlineCount} 人
            <span className="topbar-link-mode" aria-label={`连接 ${linkLabel}`}>
              · {linkLabel}
            </span>
          </span>
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
        <Outlet />
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
                    <span className="tab-badge" aria-label={`已选 ${selectedCount}`}>
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
        <div
          className="ol-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gh-sync-error-title"
        >
          <button
            type="button"
            className="ol-dialog-mask"
            aria-label="关闭"
            onClick={() => setGhErrorOpen(false)}
          />
          <div className="ol-dialog-panel">
            <h2 id="gh-sync-error-title">GitHub 同步失败</h2>
            <p className="topbar-gh-error-msg">{status.error}</p>
            <div className="ol-dialog-actions">
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
