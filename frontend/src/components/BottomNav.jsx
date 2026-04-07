import { useLocation, useNavigate } from 'react-router-dom'
import { FiHome, FiShoppingCart, FiPackage, FiUser, FiHeart } from 'react-icons/fi'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { label: 'Home', icon: FiHome, path: '/' },
  { label: 'Wishlist', icon: FiHeart, path: '/wishlist', authRequired: true },
  { label: 'Cart', icon: FiShoppingCart, path: '/cart' },
  { label: 'Orders', icon: FiPackage, path: '/orders', authRequired: true },
  { label: 'Profile', icon: FiUser, path: '/profile', authRequired: true },
]

const BottomNav = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { getItemCount } = useCart()
  const { isAuthenticated } = useAuth()

  const itemCount = getItemCount()

  // Hide on admin, login, register pages
  if (location.pathname.startsWith('/admin')) return null
  if (location.pathname === '/login' || location.pathname === '/register') return null

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/' || location.pathname === '/products'
    return location.pathname.startsWith(path)
  }

  const handleNavigate = (item) => {
    if (item.authRequired && !isAuthenticated) {
      navigate('/login')
    } else {
      navigate(item.path)
    }
  }

  return (
    <nav className="bottom-nav-mobile">
      {navItems.map((item) => {
        const active = isActive(item.path)
        const Icon = item.icon
        return (
          <button
            key={item.label}
            onClick={() => handleNavigate(item)}
            className={`bnav-item${active ? ' active' : ''}`}
            aria-label={item.label}
          >
            <span className="bnav-icon-wrap">
              <Icon size={22} className="bnav-icon" />
              {item.label === 'Cart' && itemCount > 0 && (
                <span className="bnav-badge">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </span>
            <span className="bnav-label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default BottomNav
