import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useCollab } from '../context/CollabContext'
import { SyncBanner } from './SyncBanner'
import { IconOrder, IconOrders, IconScan } from './TabIcons'

const links = [
  { to: '/', label: '点单', end: true, Icon: IconOrder, badgeKey: 'order' as const },
  { to: '/orders', label: '订单', Icon: IconOrders },
  { to: '/settings', label: '扫码', Icon: IconScan },
]

export function Layout() {
  const location = useLocation()
  const { session, mode } = useCollab()
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
    mode === 'webrtc' ? 'P2P' : mode === 'mqtt' ? '信令' : '未连接'
  const selectedCount = session.selectedRecipeIds.length

  return (
    <div
      className={`app-shell ${onOrderPage ? 'is-order' : ''} ${
        onRecipeForm ? 'is-form' : ''
      } ${onOrderDetail ? 'is-order-detail' : ''}`}
    >
      <div className="ambient" aria-hidden />
      <SyncBanner />
      <header className="topbar">
        <p className="brand">
          <span className="brand-mark">
            吃什么
            <span className="brand-version" aria-label={`版本 ${__APP_VERSION__}`}>
              v{__APP_VERSION__}
            </span>
          </span>
        </p>
        {onOrderPage && (
          <span
            className={`topbar-online ${
              mode === 'idle' ? 'is-idle' : mode === 'webrtc' ? 'is-p2p' : 'is-live'
            }`}
            title={
              mode === 'webrtc'
                ? 'WebRTC 已连通，点单可实时同步'
                : mode === 'mqtt'
                  ? '已连信令，等待 WebRTC'
                  : '未连接'
            }
          >
            <i className="live-dot" aria-hidden />
            {onlineCount} 人在线
            <span className="topbar-link-mode" aria-label={`连接 ${linkLabel}`}>
              · {linkLabel}
            </span>
          </span>
        )}
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
    </div>
  )
}
