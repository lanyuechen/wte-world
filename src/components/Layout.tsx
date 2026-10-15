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
  const onlineCount = Math.max(
    session.members.length,
    mode === 'idle' ? 0 : 1,
  )
  const selectedCount = session.selectedRecipeIds.length

  return (
    <div className={`app-shell ${onOrderPage ? 'is-order' : ''}`}>
      <div className="ambient" aria-hidden />
      <SyncBanner />
      <header className="topbar">
        <p className="brand">吃什么</p>
        {onOrderPage && (
          <span
            className={`topbar-online ${mode === 'idle' ? 'is-idle' : 'is-live'}`}
          >
            <i className="live-dot" aria-hidden />
            {onlineCount} 人在线
          </span>
        )}
      </header>

      <main className={`page ${onOrderPage ? 'page-order' : ''}`}>
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
