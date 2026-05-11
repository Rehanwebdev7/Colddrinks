import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

// Module-level cache: survives AdminSidebar unmounts (each admin page wraps
// itself in <AdminLayout>, so the sidebar remounts on every route change).
let sidebarScrollTopCache = 0
import {
  FaTachometerAlt,
  FaBox,
  FaShoppingBag,
  FaFileInvoice,
  FaMoneyBill,
  FaUsers,
  FaTruck,
  FaBell,
  FaSignOutAlt,
  FaTimes,
  FaImages,
  FaUserCog,
  FaPalette,
  FaTags,
  FaCashRegister,
  FaChevronLeft,
  FaChevronRight,
  FaHistory,
  FaCreditCard,
  FaHandHoldingUsd,
  FaExchangeAlt,
  FaTicketAlt,
} from 'react-icons/fa'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useAdminTheme } from '../admin/useAdminTheme'

const menuItems = [
  { type: 'group', label: 'Operations' },
  { path: '/admin', icon: FaTachometerAlt, label: 'Dashboard' },
  { path: '/admin/offline-sales', icon: FaCashRegister, label: 'Offline Sales' },
  { path: '/admin/orders', icon: FaShoppingBag, label: 'Orders' },
  { path: '/admin/bills', icon: FaFileInvoice, label: 'Bills' },

  { type: 'group', label: 'Finance' },
  { path: '/admin/outstanding', icon: FaHandHoldingUsd, label: 'Outstanding (Udhaar)' },
  { path: '/admin/online-payments', icon: FaCreditCard, label: 'Online Payments' },
  { path: '/admin/offline-sales-history', icon: FaHistory, label: 'Offline Sales History' },
  { path: '/admin/transactions', icon: FaExchangeAlt, label: 'All Transactions' },

  { type: 'group', label: 'People' },
  { path: '/admin/customers', icon: FaUsers, label: 'Customers' },
  { path: '/admin/suppliers', icon: FaTruck, label: 'Suppliers' },

  { type: 'group', label: 'Catalog' },
  { path: '/admin/notifications', icon: FaBell, label: 'Notifications' },
  { path: '/admin/categories', icon: FaTags, label: 'Categories' },
  { path: '/admin/products', icon: FaBox, label: 'Products' },
  { path: '/admin/sliders', icon: FaImages, label: 'Sliders' },
  { path: '/admin/coupons', icon: FaTicketAlt, label: 'Coupons' },

  { type: 'group', label: 'System' },
  { path: '/admin/theme', icon: FaPalette, label: 'Theme Config' },
  { path: '/admin/profile', icon: FaUserCog, label: 'Profile' },
]

const AdminSidebar = ({ isOpen, onClose, collapsed, onToggleCollapse, isMobile }) => {
  const c = useAdminTheme()
  const { logout } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [showBrandLogo, setShowBrandLogo] = useState(Boolean(settings?.logo))
  const navRef = useRef(null)

  // Restore cached scroll position synchronously before paint so user
  // doesn't see the sidebar jump to top on route change.
  useLayoutEffect(() => {
    if (navRef.current) navRef.current.scrollTop = sidebarScrollTopCache
  }, [])

  // Persist scroll continuously + on unmount
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const onScroll = () => { sidebarScrollTopCache = el.scrollTop }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      sidebarScrollTopCache = el.scrollTop
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  useEffect(() => {
    setShowBrandLogo(Boolean(settings?.logo))
  }, [settings?.logo])

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
  }

  const handleNavClick = () => {
    if (isMobile) onClose()
  }

  // Desktop: 72px collapsed, 260px expanded
  // Mobile: 280px but off-screen via transform
  const sidebarWidth = isMobile ? '280px' : (collapsed ? '72px' : '260px')

  // Logo container — transparent, no chrome. Image sits naturally on the sidebar bg.
  // When collapsed prefer favicon (small mark); when expanded prefer full logo.
  const logoImg = (boxW = '100%', boxH = '44px', preferFavicon = false) => {
    const src = preferFavicon && settings?.favicon
      ? settings.favicon
      : (settings?.logo && showBrandLogo ? settings.logo : (settings?.favicon || '/vite.svg'))
    return (
      <div style={{
        width: boxW, height: boxH,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', flexShrink: 0,
      }}>
        <img
          src={src}
          alt=""
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          onError={() => setShowBrandLogo(false)}
        />
      </div>
    )
  }

  // Whether to show labels (expanded desktop or mobile)
  const showLabels = isMobile || !collapsed

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {isMobile && isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1098,
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        position: 'fixed',
        left: 0, top: 0, bottom: 0,
        width: sidebarWidth,
        background: c.sidebar,
        borderRight: isMobile && !isOpen ? 'none' : `1px solid ${c.sidebarBorder}`,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1099,
        // Mobile: slide in/out; Desktop: width transition
        transition: isMobile
          ? 'transform 0.3s cubic-bezier(0.4,0,0.2,1)'
          : 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
        transform: isMobile
          ? (isOpen ? 'translateX(0)' : 'translateX(-100%)')
          : 'translateX(0)',
        overflow: 'hidden',
        boxShadow: isMobile && isOpen ? '4px 0 24px rgba(0,0,0,0.4)' : 'none',
        // On mobile when closed, also set visibility to prevent ghost rendering
        visibility: isMobile && !isOpen ? 'hidden' : 'visible',
      }}>

        {/* ── Logo Section ── matches topbar height (64px) ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: !showLabels ? 'center' : 'space-between',
          padding: !showLabels ? '0 8px' : '0 14px',
          borderBottom: `1px solid ${c.sidebarBorder}`,
          height: '64px',
          boxSizing: 'border-box',
          flexShrink: 0,
        }}>
          {!showLabels ? (
            /* Desktop Collapsed: favicon-style mark */
            logoImg('40px', '40px', true)
          ) : (
            /* Expanded or Mobile — wide logo only, no text */
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minWidth: 0 }}>
                {logoImg('100%', '44px')}
              </div>
              {isMobile && (
                <button
                  onClick={onClose}
                  style={{
                    background: 'rgba(148,163,184,0.15)', border: 'none',
                    color: c.textSecondary, fontSize: '16px', cursor: 'pointer',
                    padding: '6px 8px', borderRadius: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginLeft: '8px',
                  }}
                >
                  <FaTimes />
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Navigation ── */}
        <nav ref={navRef} className="admin-sidebar-nav" style={{
          flex: 1,
          minHeight: 0,
          padding: !showLabels ? '10px 0' : '12px 10px',
          display: 'flex', flexDirection: 'column', gap: '4px',
          overflowY: 'auto', overflowX: 'hidden',
        }}>
          {menuItems.map((item, idx) => {
            // Group separator: shows as label when expanded, as a thin divider when collapsed
            if (item.type === 'group') {
              const isFirst = idx === 0
              if (!showLabels) {
                // Collapsed: skip the very first divider (top of nav looks cleaner)
                if (isFirst) return null
                return (
                  <div
                    key={`grp-${idx}`}
                    style={{
                      height: '1px',
                      background: c.sidebarBorder,
                      margin: '8px 12px',
                      flexShrink: 0,
                    }}
                  />
                )
              }
              return (
                <div
                  key={`grp-${idx}`}
                  style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    color: c.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                    padding: isFirst ? '4px 14px 4px' : '12px 14px 4px',
                    opacity: 0.6,
                    flexShrink: 0,
                  }}
                >
                  {item.label}
                </div>
              )
            }

            const { path, icon: Icon, label } = item
            return (
              <NavLink
                key={path}
                to={path}
                end={path === '/admin'}
                onClick={handleNavClick}
                title={!showLabels ? label : undefined}
                className="admin-sidebar-link"
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: !showLabels ? '12px 0' : '12px 14px',
                  justifyContent: !showLabels ? 'center' : 'flex-start',
                  borderRadius: !showLabels ? '0' : '10px',
                  color: isActive ? c.accent : c.textSecondary,
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: isActive ? '600' : '500',
                  transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease',
                  background: isActive ? c.navActive : 'transparent',
                  borderLeft: isActive ? `3px solid ${c.accent}` : '3px solid transparent',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  position: 'relative',
                })}
              >
                <Icon style={{ fontSize: '16px', width: '20px', flexShrink: 0 }} />
                {showLabels && <span>{label}</span>}
              </NavLink>
            )
          })}
        </nav>

        {/* ── Bottom Section ── */}
        <div style={{
          padding: !showLabels ? '8px 0' : '10px 8px',
          borderTop: `1px solid ${c.sidebarBorder}`,
          display: 'flex', flexDirection: 'column', gap: '4px',
          flexShrink: 0,
        }}>
          {/* Logout */}
          <button
            onClick={handleLogout}
            title={!showLabels ? 'Logout' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: !showLabels ? '10px 0' : '11px 14px',
              justifyContent: !showLabels ? 'center' : 'flex-start',
              borderRadius: !showLabels ? '0' : '10px',
              color: '#ef4444',
              background: 'rgba(239, 68, 68, 0.1)',
              border: !showLabels ? 'none' : '1px solid rgba(239, 68, 68, 0.2)',
              fontSize: '14px', fontWeight: '500',
              cursor: 'pointer', width: '100%',
              transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
            }}
          >
            <FaSignOutAlt style={{ fontSize: '16px', width: '20px', flexShrink: 0 }} />
            {showLabels && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Sidebar nav scrollbar styling */}
      <style>{`
        .admin-sidebar-nav::-webkit-scrollbar { width: 6px; }
        .admin-sidebar-nav::-webkit-scrollbar-track { background: transparent; }
        .admin-sidebar-nav::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.2);
          border-radius: 3px;
        }
        .admin-sidebar-nav:hover::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.4);
        }
        .admin-sidebar-nav { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.25) transparent; }
      `}</style>

      {/* Tooltip CSS for desktop collapsed state */}
      {collapsed && !isMobile && (
        <style>{`
          .admin-sidebar-link[title]:hover::after {
            content: attr(title);
            position: absolute;
            left: 72px;
            top: 50%;
            transform: translateY(-50%);
            background: #1e293b;
            color: #f1f5f9;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            z-index: 9999;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          }
          .admin-sidebar-link[title]:hover::before {
            content: '';
            position: absolute;
            left: 66px;
            top: 50%;
            transform: translateY(-50%);
            border: 5px solid transparent;
            border-right-color: #1e293b;
            z-index: 9999;
            pointer-events: none;
          }
        `}</style>
      )}
    </>
  )
}

export default AdminSidebar
