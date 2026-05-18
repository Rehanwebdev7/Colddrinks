import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { FaShoppingCart, FaSearch, FaBars, FaTimes, FaBell, FaRupeeSign, FaHome } from 'react-icons/fa'
import { FiSun, FiMoon, FiArrowLeft } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useSettings } from '../context/SettingsContext'
import { useAuthModal } from '../context/AuthModalContext'
import API from '../config/api'
import toast from 'react-hot-toast'
import SideDrawer from './SideDrawer'

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth()
  const { items } = useCart()
  const { settings } = useSettings()
  const { openAuth } = useAuthModal()
  const navigate = useNavigate()
  const location = useLocation()

  const [searchQuery, setSearchQuery] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerInitialView, setDrawerInitialView] = useState('menu')
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [outstanding, setOutstanding] = useState(0)
  const [showLogoModal, setShowLogoModal] = useState(false)
  const [showClearDrop, setShowClearDrop] = useState(false)
  const [clearAmount, setClearAmount] = useState('')
  const [requesting, setRequesting] = useState(false)
  const clearDropRef = useRef(null)

  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('customerDarkMode') === 'true'
  })

  // Search autocomplete
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [allProducts, setAllProducts] = useState([])
  const searchRef = useRef(null)
  const [showBrandLogo, setShowBrandLogo] = useState(Boolean(settings?.logo))

  const cartCount = items?.reduce((total, item) => total + item.quantity, 0) || 0
  const brandName = settings?.siteName || 'Royal'

  useEffect(() => {
    setShowBrandLogo(Boolean(settings?.logo))
  }, [settings?.logo])

  // Dark mode toggle
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode')
    } else {
      document.body.classList.remove('dark-mode')
    }
    localStorage.setItem('customerDarkMode', darkMode)
  }, [darkMode])

  // Body scroll lock when drawer is open (CSS class, not inline style)
  useEffect(() => {
    const scrollY = window.scrollY
    if (drawerOpen) {
      document.body.classList.add('drawer-open')
      document.body.style.top = `-${scrollY}px`
    } else {
      document.body.classList.remove('drawer-open')
      const top = document.body.style.top
      document.body.style.top = ''
      if (top) window.scrollTo(0, parseInt(top || '0') * -1)
    }
    return () => {
      document.body.classList.remove('drawer-open')
      document.body.style.top = ''
    }
  }, [drawerOpen])

  // Close drawer and mobile menu on route change
  useEffect(() => {
    setDrawerOpen(false)
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Auto-close mobile menu when user logs in
  useEffect(() => {
    if (isAuthenticated) setMobileMenuOpen(false)
  }, [isAuthenticated])

  // Fetch products for autocomplete
  useEffect(() => {
    API.get('/products')
      .then(res => {
        const data = res.data.products || res.data || []
        setAllProducts(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
  }, [])

  // Fetch notification count + outstanding
  useEffect(() => {
    if (isAuthenticated && user?.role !== 'admin') {
      const fetchNotifCount = async () => {
        try {
          const response = await API.get('/notifications')
          const data = Array.isArray(response.data) ? response.data : response.data?.data || []
          setUnreadNotifs(data.filter(n => !n.isRead).length)
        } catch {}
      }
      const fetchOutstanding = async () => {
        try {
          const res = await API.get('/payments/my-summary')
          setOutstanding(res.data?.outstanding || 0)
        } catch {}
      }
      fetchNotifCount()
      fetchOutstanding()
      const interval = setInterval(() => { fetchNotifCount(); fetchOutstanding() }, 30000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated, user])

  // Close clearance dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (clearDropRef.current && !clearDropRef.current.contains(e.target)) {
        setShowClearDrop(false)
      }
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search autocomplete logic
  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchQuery(value)

    if (value.trim().length >= 2) {
      const query = value.toLowerCase()
      const matches = allProducts
        .filter(p =>
          p.name?.toLowerCase().includes(query) ||
          p.category?.toLowerCase().includes(query)
        )
        .slice(0, 6)
      setSuggestions(matches)
      setShowSuggestions(matches.length > 0)
    } else {
      // Show recent searches
      const recent = JSON.parse(localStorage.getItem('recentSearches') || '[]')
      if (recent.length > 0 && value.trim().length === 0) {
        setSuggestions(recent.map(r => ({ _type: 'recent', name: r })))
        setShowSuggestions(true)
      } else {
        setShowSuggestions(false)
      }
    }
  }

  const handleSuggestionClick = (item) => {
    if (item._type === 'recent') {
      setSearchQuery(item.name)
      navigate(`/products?search=${encodeURIComponent(item.name)}`)
    } else {
      navigate(`/product/${item._id || item.id}`)
    }
    setShowSuggestions(false)
    setSearchQuery('')
    // Save to recent searches
    saveRecentSearch(item.name)
  }

  const saveRecentSearch = (term) => {
    const recent = JSON.parse(localStorage.getItem('recentSearches') || '[]')
    const updated = [term, ...recent.filter(r => r !== term)].slice(0, 5)
    localStorage.setItem('recentSearches', JSON.stringify(updated))
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      saveRecentSearch(searchQuery.trim())
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
      setMobileMenuOpen(false)
      setShowSuggestions(false)
    }
  }

  const requestClearance = async () => {
    const amt = Number(clearAmount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (amt > outstanding) { toast.error('Amount exceeds outstanding balance'); return }
    try {
      setRequesting(true)
      await API.post('/payments/clear-request', { amount: amt })
      toast.success('Clearance request sent!')
      setClearAmount('')
      setShowClearDrop(false)
      const res = await API.get('/payments/my-summary')
      setOutstanding(res.data?.outstanding || 0)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit request')
    } finally {
      setRequesting(false)
    }
  }

  const handleLogout = () => {
    logout()
    setDrawerOpen(false)
    setMobileMenuOpen(false)
    navigate('/')
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Back Button + Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {location.pathname !== '/' && location.pathname !== '/products' && (
          <button
            onClick={() => navigate(-1)}
            className="nav-back-btn"
            aria-label="Go back"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '8px',
              color: 'inherit',
              fontSize: '20px',
              transition: 'background 0.2s',
            }}
          >
            <FiArrowLeft />
          </button>
        )}
        <Link to="/" className={`navbar-brand${settings?.logo && showBrandLogo ? ' has-logo' : ''}`}>
          {settings?.logo && showBrandLogo ? (
            <>
              <img
                className="navbar-brand-logo-full"
                src={settings.logo}
                alt={brandName}
                referrerPolicy="no-referrer"
                onError={() => setShowBrandLogo(false)}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowLogoModal(true) }}
                style={{ cursor: 'zoom-in' }}
              />
              <img
                className="navbar-brand-logo-icon"
                src={settings.favicon || settings.logo}
                alt={brandName}
                referrerPolicy="no-referrer"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowLogoModal(true) }}
                style={{ cursor: 'zoom-in' }}
              />
            </>
          ) : (
            <span>{brandName}</span>
          )}
        </Link>
        </div>

        {/* Search Bar - Desktop with Autocomplete */}
        <form onSubmit={handleSearch} className="navbar-search" ref={searchRef}>
          <div className="search-autocomplete-wrapper">
            <div className="search-bar">
              <span className="search-icon">
                <FaSearch />
              </span>
              <input
                type="text"
                placeholder="Search for cold drinks, juices, shakes..."
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => {
                  if (searchQuery.trim().length === 0) {
                    const recent = JSON.parse(localStorage.getItem('recentSearches') || '[]')
                    if (recent.length > 0) {
                      setSuggestions(recent.map(r => ({ _type: 'recent', name: r })))
                      setShowSuggestions(true)
                    }
                  }
                }}
                className="search-input"
              />
            </div>

            {/* Autocomplete Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="search-suggestions">
                {suggestions[0]?._type === 'recent' && (
                  <div className="search-recent-header">Recent Searches</div>
                )}
                {suggestions.map((item, i) => (
                  <div
                    key={i}
                    className="search-suggestion-item"
                    onClick={() => handleSuggestionClick(item)}
                  >
                    {item._type === 'recent' ? (
                      <>
                        <FaSearch style={{ fontSize: 14, color: 'var(--text-muted)' }} />
                        <div className="search-suggestion-info">
                          <div className="search-suggestion-name">{item.name}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <img
                          src={item.image || '/images/placeholder-drink.svg'}
                          alt={item.name}
                          className="search-suggestion-image"
                        />
                        <div className="search-suggestion-info">
                          <div className="search-suggestion-name">{item.name}</div>
                          <div className="search-suggestion-category">{item.category}</div>
                        </div>
                        <span className="search-suggestion-price">
                          &#8377;{item.pricePerBox || item.price}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        {/* Right Section */}
        <div className="navbar-actions">
          {/* Home Icon — shown on non-home/non-products pages, quick return to Home */}
          {location.pathname !== '/' && location.pathname !== '/products' && (
            <Link
              to="/"
              className="nav-home-btn"
              aria-label="Go home"
              title="Home"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36, height: 36,
                borderRadius: '8px',
                color: 'inherit',
                fontSize: '18px',
                transition: 'background 0.2s',
                textDecoration: 'none',
              }}
            >
              <FaHome />
            </Link>
          )}

          {/* Dark Mode Toggle - only on Home page */}
          {(location.pathname === '/' || location.pathname === '/products') && (
            <button
              className="dark-mode-toggle"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <FiSun /> : <FiMoon />}
            </button>
          )}

          {/* Notifications Bell — opens drawer with notifications view */}
          {isAuthenticated && user?.role !== 'admin' && (
            <button
              type="button"
              className="notification-icon"
              onClick={() => { setDrawerInitialView('notifications'); setDrawerOpen(true) }}
              aria-label="Open notifications"
            >
              <FaBell />
              {unreadNotifs > 0 && (
                <span className="notification-badge">{unreadNotifs > 99 ? '99+' : unreadNotifs}</span>
              )}
            </button>
          )}

          {/* Cart */}
          <Link to="/cart" className="cart-icon">
            <FaShoppingCart />
            {cartCount > 0 && (
              <span className="cart-badge">{cartCount}</span>
            )}
          </Link>

          {/* User Section */}
          {isAuthenticated ? (
            <button className="drawer-toggle-btn" onClick={() => { setDrawerInitialView('menu'); setDrawerOpen(true) }}>
              <FaBars />
            </button>
          ) : (
            <div className="navbar-auth-links">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => openAuth('phone')}>Login</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openAuth('phone')}>Sign Up</button>
            </div>
          )}

          {/* Mobile Hamburger (for non-authenticated) */}
          {!isAuthenticated && (
            <button
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <FaTimes /> : <FaBars />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu — only when NOT authenticated */}
      {mobileMenuOpen && !isAuthenticated && (
        <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}
      {mobileMenuOpen && !isAuthenticated && (
        <div className="navbar-nav open">
          <button
            type="button"
            className="navbar-nav-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <FaTimes />
          </button>
          <form onSubmit={handleSearch} className="navbar-mobile-search">
            <div className="search-bar">
              <span className="search-icon">
                <FaSearch />
              </span>
              <input
                type="text"
                placeholder="Search for cold drinks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </form>

          <Link to="/" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Home</Link>
          <Link to="/products" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Products</Link>
          <Link to="/cart" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
            Cart {cartCount > 0 && `(${cartCount})`}
          </Link>

          {!isAuthenticated && (
            <>
              <button
                type="button"
                className="nav-link"
                onClick={() => { setMobileMenuOpen(false); openAuth('phone') }}
              >Login</button>
              <button
                type="button"
                className="nav-link"
                onClick={() => { setMobileMenuOpen(false); openAuth('phone') }}
              >Sign Up</button>
            </>
          )}
        </div>
      )}

      {/* Outstanding Balance Bar */}
      {isAuthenticated && user?.role !== 'admin' && outstanding > 0 && (
        <div className="outstanding-strip">
          <div className="outstanding-strip-inner">
            <div className="outstanding-strip-left">
              <FaRupeeSign className="outstanding-strip-icon" />
              <span className="outstanding-strip-text">Outstanding Balance:</span>
              <span className="outstanding-strip-amount">&#8377;{outstanding.toFixed(2)}</span>
            </div>
            <div className="outstanding-strip-right" ref={clearDropRef}>
              <button
                className="outstanding-strip-btn"
                onClick={() => { setShowClearDrop(!showClearDrop); setClearAmount(String(outstanding)) }}
              >
                Pay Now
              </button>
              {showClearDrop && (
                <div className="outstanding-strip-dropdown">
                  <p className="outstanding-strip-drop-title">Request Payment Clearance</p>
                  <p className="outstanding-strip-drop-bal">Balance: &#8377;{outstanding.toFixed(2)}</p>
                  <div className="outstanding-strip-drop-form">
                    <div className="outstanding-clear-input-wrap">
                      <span className="outstanding-clear-rupee">&#8377;</span>
                      <input
                        type="number"
                        className="outstanding-clear-input"
                        placeholder="Amount"
                        value={clearAmount}
                        onChange={(e) => setClearAmount(e.target.value)}
                        onWheel={(e) => e.target.blur()}
                        max={outstanding}
                        min={1}
                      />
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={requestClearance}
                      disabled={requesting}
                    >
                      {requesting ? 'Sending...' : 'Send Request'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Side Drawer */}
      {isAuthenticated && (
        <SideDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          initialView={drawerInitialView}
          user={user}
          onLogout={handleLogout}
          unreadNotifs={unreadNotifs}
          outstanding={outstanding}
        />
      )}
      {/* Logo Lightbox Modal — portal to body to avoid being clipped by
          ancestor overflow/transform contexts */}
      {showLogoModal && settings?.logo && createPortal(
        <div
          onClick={() => setShowLogoModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100000,
            background: 'rgba(0,0,0,0.88)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out', overflow: 'hidden',
            padding: '40px',
          }}
        >
          <img
            src={settings.logo}
            alt={brandName}
            referrerPolicy="no-referrer"
            style={{
              maxWidth: '90vw', maxHeight: '90vh',
              borderRadius: '16px',
              background: 'rgba(255,255,255,0.06)',
              padding: '20px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              objectFit: 'contain',
              cursor: 'default',
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setShowLogoModal(false)}
            aria-label="Close"
            style={{
              position: 'absolute', top: '24px', right: '24px',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: '#fff', borderRadius: '50%',
              width: 40, height: 40, fontSize: 22,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>,
        document.body
      )}
    </nav>
  )
}

export default Navbar
