import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
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
} from 'react-icons/fa'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useSettings } from '../context/SettingsContext'
import { getColors } from '../admin/themeColors'

const menuItems = [
  { path: '/admin', icon: FaTachometerAlt, label: 'Dashboard' },
  { path: '/admin/products', icon: FaBox, label: 'Products' },
  { path: '/admin/orders', icon: FaShoppingBag, label: 'Orders' },
  { path: '/admin/bills', icon: FaFileInvoice, label: 'Bills' },
  { path: '/admin/payments', icon: FaMoneyBill, label: 'Payments' },
  { path: '/admin/customers', icon: FaUsers, label: 'Customers' },
  { path: '/admin/suppliers', icon: FaTruck, label: 'Suppliers' },
  { path: '/admin/sliders', icon: FaImages, label: 'Sliders' },
  { path: '/admin/notifications', icon: FaBell, label: 'Notifications' },
  { path: '/admin/categories', icon: FaTags, label: 'Categories' },
  { path: '/admin/offline-sales', icon: FaCashRegister, label: 'Offline Sales' },
  { path: '/admin/coupons', icon: FaTags, label: 'Coupons' },
  { path: '/admin/theme', icon: FaPalette, label: 'Theme Config' },
  { path: '/admin/profile', icon: FaUserCog, label: 'Profile' },
]

const AdminSidebar = ({ isOpen, onClose, collapsed, onToggleCollapse, isMobile }) => {
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const { logout } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [showBrandLogo, setShowBrandLogo] = useState(Boolean(settings?.logo))

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

  const logoImg = (size = '36px') => (
    <div style={{
      width: size, height: size, borderRadius: '10px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {settings?.logo && showBrandLogo ? (
        <img
          src={settings.logo}
          alt=""
          style={{ width: size, height: size, objectFit: 'contain', borderRadius: '8px' }}
          onError={() => setShowBrandLogo(false)}
        />
      ) : (
        <img src="/vite.svg" alt="" style={{ width: size, height: size, objectFit: 'contain' }} />
      )}
    </div>
  )

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

        {/* ── Logo Section ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: !showLabels ? 'center' : 'space-between',
          padding: !showLabels ? '16px 0' : '18px 16px',
          borderBottom: `1px solid ${c.sidebarBorder}`,
          minHeight: '64px',
          flexShrink: 0,
        }}>
          {!showLabels ? (
            /* Desktop Collapsed: favicon only */
            logoImg('36px')
          ) : (
            /* Expanded or Mobile */
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', minWidth: 0 }}>
                {logoImg('36px')}
                <span style={{
                  color: '#38bdf8', fontSize: '18px', fontWeight: '700',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{settings?.siteName || 'Royal'} Admin</span>
              </div>
              {isMobile && (
                <button
                  onClick={onClose}
                  style={{
                    background: 'rgba(148,163,184,0.15)', border: 'none',
                    color: c.textSecondary, fontSize: '16px', cursor: 'pointer',
                    padding: '6px 8px', borderRadius: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <FaTimes />
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Navigation ── */}
        <nav style={{
          flex: 1,
          padding: !showLabels ? '8px 0' : '10px 8px',
          display: 'flex', flexDirection: 'column', gap: '2px',
          overflowY: 'auto', overflowX: 'hidden',
        }}>
          {menuItems.map(({ path, icon: Icon, label }) => (
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
                padding: !showLabels ? '12px 0' : '11px 14px',
                justifyContent: !showLabels ? 'center' : 'flex-start',
                borderRadius: !showLabels ? '0' : '10px',
                color: isActive ? '#38bdf8' : c.textSecondary,
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: isActive ? '600' : '500',
                transition: 'all 0.15s',
                background: isActive ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                borderLeft: isActive ? '3px solid #0ea5e9' : '3px solid transparent',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                position: 'relative',
              })}
            >
              <Icon style={{ fontSize: '16px', width: '20px', flexShrink: 0 }} />
              {showLabels && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* ── Bottom Section ── */}
        <div style={{
          padding: !showLabels ? '8px 0' : '10px 8px',
          borderTop: `1px solid ${c.sidebarBorder}`,
          display: 'flex', flexDirection: 'column', gap: '4px',
          flexShrink: 0,
        }}>
          {/* Collapse toggle - desktop only */}
          {!isMobile && (
            <button
              onClick={onToggleCollapse}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: collapsed ? '10px 0' : '10px 14px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: collapsed ? '0' : '10px',
                color: c.textSecondary, background: 'transparent',
                border: 'none', fontSize: '14px', fontWeight: '500',
                cursor: 'pointer', width: '100%',
                transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
              }}
            >
              {collapsed
                ? <FaChevronRight style={{ fontSize: '14px', width: '20px', flexShrink: 0 }} />
                : <FaChevronLeft style={{ fontSize: '14px', width: '20px', flexShrink: 0 }} />
              }
              {!collapsed && <span>Collapse</span>}
            </button>
          )}

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
