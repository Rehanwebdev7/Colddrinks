import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaBars, FaBell, FaSignOutAlt, FaUserCircle, FaSun, FaMoon, FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import AdminSidebar from './AdminSidebar'
import { useAuth } from '../context/AuthContext'
import { useAdminTheme } from '../admin/useAdminTheme'
import '../admin/admin.css'

const MOBILE_BP = 768

const AdminLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('adminSidebarCollapsed') === 'true'
  })
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BP)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { darkMode, toggleTheme, ...c } = useAdminTheme()

  const handleResize = useCallback(() => {
    const mobile = window.innerWidth <= MOBILE_BP
    setIsMobile(mobile)
    if (mobile) setSidebarOpen(false)
  }, [])

  useEffect(() => {
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [handleResize])

  useEffect(() => {
    localStorage.setItem('adminSidebarCollapsed', collapsed)
  }, [collapsed])

  useEffect(() => {
    document.body.style.overflow = (isMobile && sidebarOpen) ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isMobile, sidebarOpen])

  // Global wheel-scroll guard for ALL number inputs across admin pages.
  // Fixes the bug where scrolling over a focused <input type="number">
  // accidentally changes its value (Offline Sales Discount + every other field).
  useEffect(() => {
    const handler = (e) => {
      const el = document.activeElement
      if (el && el.tagName === 'INPUT' && el.type === 'number' && e.target === el) {
        e.preventDefault()
      }
    }
    document.addEventListener('wheel', handler, { passive: false })
    return () => document.removeEventListener('wheel', handler)
  }, [])

  // Apply admin font family to <body> so context menus, toasts, etc. inherit it.
  useEffect(() => {
    if (c.fontFamily) {
      document.body.style.fontFamily = `'${c.fontFamily}', 'Inter', 'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
    }
  }, [c.fontFamily])

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
  }

  const mainML = isMobile ? 0 : (collapsed ? 72 : 260)

  return (
    <div className="admin-root" style={{ display: 'flex', minHeight: '100vh', background: c.bg }}>
      <AdminSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={isMobile ? false : collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        isMobile={isMobile}
      />

      <div
        className="admin-main"
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          minHeight: '100vh', minWidth: 0,
          marginLeft: mainML,
          transition: isMobile ? 'none' : 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* ── Top Bar (fixed so it never scrolls away) ── */}
        <header className="admin-topbar" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: isMobile ? '0 12px' : '0 24px',
          height: '64px',
          background: c.topBar, borderBottom: `1px solid ${c.border}`,
          position: 'fixed',
          top: 0,
          left: mainML,
          right: 0,
          zIndex: 100,
          gap: '8px',
          boxSizing: 'border-box',
          transition: isMobile ? 'none' : 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, gap: '8px' }}>
            {isMobile ? (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Open menu"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(51,65,85,0.5)', border: `1px solid ${c.border}`,
                  borderRadius: '8px', color: c.textSecondary,
                  fontSize: '16px', cursor: 'pointer', padding: '8px 10px',
                }}
              >
                <FaBars />
              </button>
            ) : (
              <button
                onClick={() => setCollapsed(!collapsed)}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: 'none',
                  color: c.textSecondary,
                  fontSize: '16px', cursor: 'pointer', padding: '8px',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = c.accent }}
                onMouseLeave={(e) => { e.currentTarget.style.color = c.textSecondary }}
              >
                {collapsed ? <FaChevronRight /> : <FaChevronLeft />}
              </button>
            )}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center',
            gap: isMobile ? '6px' : '16px', marginLeft: 'auto',
          }}>
            <button
              style={{
                position: 'relative', background: 'transparent',
                border: 'none',
                color: c.textSecondary, fontSize: isMobile ? '16px' : '18px',
                cursor: 'pointer', padding: isMobile ? '6px' : '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.15s',
              }}
              onClick={toggleTheme}
              title={darkMode ? 'Light Mode' : 'Dark Mode'}
              onMouseEnter={(e) => { e.currentTarget.style.color = darkMode ? '#f59e0b' : '#6366f1' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = c.textSecondary }}
            >
              {darkMode ? <FaSun style={{ color: '#f59e0b' }} /> : <FaMoon style={{ color: '#6366f1' }} />}
            </button>

            <button
              style={{
                position: 'relative', background: 'transparent',
                border: 'none',
                color: c.textSecondary, fontSize: isMobile ? '16px' : '18px',
                cursor: 'pointer', padding: isMobile ? '6px' : '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.15s',
              }}
              onClick={() => navigate('/admin/notifications')}
              onMouseEnter={(e) => { e.currentTarget.style.color = c.accent }}
              onMouseLeave={(e) => { e.currentTarget.style.color = c.textSecondary }}
            >
              <FaBell />
              <span style={{
                position: 'absolute', top: '2px', right: '2px',
                width: '7px', height: '7px', borderRadius: '50%',
                background: '#ef4444',
              }} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaUserCircle style={{ fontSize: isMobile ? '20px' : '24px', color: c.accent, flexShrink: 0 }} />
              {!isMobile && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: c.text, fontSize: '14px', fontWeight: '600' }}>{user?.name || 'Admin'}</span>
                  <span style={{ color: c.textSecondary, fontSize: '11px' }}>Administrator</span>
                </div>
              )}
            </div>

            <button
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: isMobile ? '8px' : '10px',
                color: '#ef4444', fontSize: isMobile ? '14px' : '16px',
                cursor: 'pointer', padding: isMobile ? '7px' : '10px',
                display: 'flex', alignItems: 'center',
              }}
              onClick={handleLogout}
            >
              <FaSignOutAlt />
            </button>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="admin-content" style={{
          flex: 1,
          padding: isMobile ? '78px 12px 14px' : '88px 24px 24px',
          overflowX: 'hidden',
        }}>
          {children}
        </main>
      </div>

      {/* ── Global Admin Mobile Responsive CSS ── */}
      <style>{`
        @media (max-width: ${MOBILE_BP}px) {
          /* Remove extra page padding from individual admin pages */
          .admin-content > div {
            padding-left: 0 !important;
            padding-right: 0 !important;
            padding-top: 0 !important;
          }

          /* Titles */
          .admin-content h1 { font-size: 20px !important; }
          .admin-content h2 { font-size: 17px !important; }
          .admin-content h3 { font-size: 14px !important; }

          /* Tables: compact, scrollable */
          .admin-root table { font-size: 12px !important; }
          .admin-root table th,
          .admin-root table td {
            padding: 8px 5px !important;
            font-size: 11px !important;
            white-space: nowrap;
          }
          .admin-root table th {
            font-size: 9px !important;
            letter-spacing: 0.3px !important;
          }

          /* Recharts */
          .admin-root .recharts-wrapper { font-size: 10px; }
          .admin-root .recharts-legend-wrapper { font-size: 11px !important; }
          .admin-root .recharts-pie-label-text { font-size: 9px !important; }

          /* Action buttons */
          .admin-root button[style*="padding: '8px'"] {
            padding: 6px !important;
          }
        }
      `}</style>
    </div>
  )
}

export default AdminLayout
