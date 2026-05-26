import { useEffect, useLayoutEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { ThemeProvider } from './context/ThemeContext'
import { SettingsProvider } from './context/SettingsContext'
import { AuthModalProvider, useAuthModal } from './context/AuthModalContext'
import AuthModal from './components/AuthModal'

// Page imports
import Home from './pages/Home'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import MyOrders from './pages/MyOrders'
import OrderTracking from './pages/OrderTracking'
import Profile from './pages/Profile'
import UserNotifications from './pages/UserNotifications'
import Wishlist from './pages/Wishlist'
import AdminLogin from './pages/AdminLogin'
import ResetPassword from './pages/ResetPassword'
import BottomNav from './components/BottomNav'

// Admin page imports
import AdminDashboard from './admin/Dashboard'
import AdminProducts from './admin/Products'
import LowStockReport from './admin/LowStockReport'
import AdminOrders from './admin/Orders'
import AdminBills from './admin/Bills'
import AdminPayments from './admin/Payments'
import AdminOnlinePayments from './admin/OnlinePayments'
import AdminOutstanding from './admin/Outstanding'
import AdminAllTransactions from './admin/AllTransactions'
import AdminCustomers from './admin/Customers'
import AdminSuppliers from './admin/Suppliers'
import AdminNotifications from './admin/Notifications'
import AdminSliders from './admin/Sliders'
import AdminProfile from './admin/AdminProfile'
import AdminCategories from './admin/Categories'
import AdminThemeConfig from './admin/ThemeConfig'
import AdminCoupons from './admin/Coupons'
import AdminOfflineSales from './admin/OfflineSales'
import AdminOfflineSalesHistory from './admin/OfflineSalesHistory'

// Scroll to top on route change (browser default scroll restoration is broken
// inside SPAs — without this, navigating to a new page keeps the previous
// page's scroll offset)
const ScrollToTop = () => {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    } catch {
      window.scrollTo(0, 0)
    }
  }, [pathname])
  return null
}

// Protected Route wrapper — opens auth modal instead of redirecting
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth()
  const { openAuth } = useAuthModal()

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      openAuth('phone')
    }
  }, [loading, isAuthenticated, openAuth])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-required-screen">
        <div className="auth-required-card">
          <div className="auth-required-icon">🔒</div>
          <h2>Login required</h2>
          <p>Sign in to access this page</p>
          <button className="cart-primary-cta" onClick={() => openAuth('phone')}>
            Login / Sign up
          </button>
        </div>
      </div>
    )
  }

  return children
}

// Legacy /login route — opens modal and redirects home
const LoginRedirect = () => {
  const navigate = useNavigate()
  const { openAuth } = useAuthModal()
  const { isAuthenticated, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (isAuthenticated) {
      navigate('/', { replace: true })
    } else {
      openAuth('phone')
      navigate('/', { replace: true })
    }
  }, [loading, isAuthenticated, navigate, openAuth])

  return null
}

// Admin Route wrapper
const AdminRoute = ({ children }) => {
  const { user, isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/admin/login" replace />
  }

  return children
}

const AppRoutes = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Home />} />
      <Route path="/products" element={<Home />} />
      <Route path="/product/:id" element={<ProductDetail />} />
      <Route path="/login" element={<LoginRedirect />} />
      <Route path="/register" element={<LoginRedirect />} />
      <Route path="/forgot-password" element={<LoginRedirect />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected Routes */}
      <Route
        path="/cart"
        element={
          <ProtectedRoute>
            <Cart />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <MyOrders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/order/:id"
        element={
          <ProtectedRoute>
            <OrderTracking />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <UserNotifications />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wishlist"
        element={
          <ProtectedRoute>
            <Wishlist />
          </ProtectedRoute>
        }
      />

      {/* Admin Login */}
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/products"
        element={
          <AdminRoute>
            <AdminProducts />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/inventory/low-stock"
        element={
          <AdminRoute>
            <LowStockReport />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/orders"
        element={
          <AdminRoute>
            <AdminOrders />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/bills"
        element={
          <AdminRoute>
            <AdminBills />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/payments"
        element={
          <AdminRoute>
            <AdminPayments />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/online-payments"
        element={
          <AdminRoute>
            <AdminOnlinePayments />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/outstanding"
        element={
          <AdminRoute>
            <AdminOutstanding />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/transactions"
        element={
          <AdminRoute>
            <AdminAllTransactions />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/customers"
        element={
          <AdminRoute>
            <AdminCustomers />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/suppliers"
        element={
          <AdminRoute>
            <AdminSuppliers />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/sliders"
        element={
          <AdminRoute>
            <AdminSliders />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/notifications"
        element={
          <AdminRoute>
            <AdminNotifications />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/profile"
        element={
          <AdminRoute>
            <AdminProfile />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/categories"
        element={
          <AdminRoute>
            <AdminCategories />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/theme"
        element={
          <AdminRoute>
            <AdminThemeConfig />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/offline-sales"
        element={
          <AdminRoute>
            <AdminOfflineSales />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/offline-sales-history"
        element={
          <AdminRoute>
            <AdminOfflineSalesHistory />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/coupons"
        element={
          <AdminRoute>
            <AdminCoupons />
          </AdminRoute>
        }
      />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

const App = () => {
  return (
    <Router>
      <ThemeProvider>
        <SettingsProvider>
          <AuthProvider>
            <CartProvider>
              <AuthModalProvider>
              <Toaster
                position="top-center"
                gutter={10}
                toastOptions={{
                  duration: 3000,
                  className: 'fizz-toast',
                  style: {
                    background: 'rgba(15, 18, 48, 0.85)',
                    color: '#FFFFFF',
                    borderRadius: '999px',
                    padding: '12px 20px',
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)'
                  },
                  success: {
                    iconTheme: {
                      primary: '#00E07A',
                      secondary: '#0F1230'
                    }
                  },
                  error: {
                    iconTheme: {
                      primary: '#FF4D7A',
                      secondary: '#0F1230'
                    }
                  }
                }}
              />
              <ScrollToTop />
              <div className="app-shell">
                <div className="bg-fizz" aria-hidden="true">
                  <span style={{ top: '9%', left: '5%', '--d': '19s', '--mx': '34px', '--my': '-46px', animationDelay: '0s' }}>🥤</span>
                  <span style={{ top: '15%', left: '83%', '--d': '23s', '--mx': '-40px', '--my': '38px', animationDelay: '-4s' }}>🧊</span>
                  <span style={{ top: '34%', left: '47%', '--d': '27s', '--mx': '26px', '--my': '-30px', animationDelay: '-9s' }}>🫧</span>
                  <span style={{ top: '46%', left: '9%', '--d': '21s', '--mx': '38px', '--my': '32px', animationDelay: '-6s' }}>🍾</span>
                  <span style={{ top: '56%', left: '87%', '--d': '25s', '--mx': '-32px', '--my': '-40px', animationDelay: '-12s' }}>🍹</span>
                  <span style={{ top: '79%', left: '13%', '--d': '24s', '--mx': '30px', '--my': '-36px', animationDelay: '-3s' }}>🧊</span>
                  <span style={{ top: '84%', left: '78%', '--d': '20s', '--mx': '-36px', '--my': '30px', animationDelay: '-15s' }}>🥤</span>
                </div>
                <div className="app-content">
                  <AppRoutes />
                </div>
                <BottomNav />
                <AuthModal />
              </div>
              </AuthModalProvider>
            </CartProvider>
          </AuthProvider>
        </SettingsProvider>
      </ThemeProvider>
    </Router>
  )
}

export default App
