import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import API, {
  AUTH_EVENT_NAME,
  clearStoredAuth,
  getStoredAuthState,
  isAdminPath,
  isTokenExpired,
  persistAuthSession,
  refreshCustomerSession,
  revokeCustomerSession
} from '../config/api'
import toast from 'react-hot-toast'
import { initializeFCM, cleanupFCM } from '../services/fcmService'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const fcmInitialized = useRef(false)

  const clearAuthState = useCallback((isAdmin) => {
    clearStoredAuth(isAdmin)
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  useEffect(() => {
    const handleAuthChange = (event) => {
      const detail = event.detail || {}
      if (detail.isAdmin !== isAdminPath()) return
      setUser(detail.user || null)
      setIsAuthenticated(Boolean(detail.user))
      setLoading(false)
    }

    window.addEventListener(AUTH_EVENT_NAME, handleAuthChange)
    return () => window.removeEventListener(AUTH_EVENT_NAME, handleAuthChange)
  }, [])

  useEffect(() => {
    let cancelled = false

    const restoreAdminSession = async () => {
      const { token, user: storedUser } = getStoredAuthState(true)

      if (!token || !storedUser) {
        if (!cancelled) setLoading(false)
        return
      }

      if (storedUser.role !== 'admin' || isTokenExpired(token, 30)) {
        clearAuthState(true)
        if (!cancelled) setLoading(false)
        return
      }

      if (cancelled) return
      setUser(storedUser)
      setIsAuthenticated(true)
      setLoading(false)

      try {
        const response = await API.get('/auth/verify')
        if (response.data?.user?.role === 'admin' && !cancelled) {
          persistAuthSession({ token, user: response.data.user }, true)
          setUser(response.data.user)
          setIsAuthenticated(true)
        }
      } catch (error) {
        if (!cancelled && error.response?.status === 401) {
          clearAuthState(true)
        }
      }
    }

    const restoreCustomerSession = async () => {
      const { token, refreshToken, user: storedUser } = getStoredAuthState(false)

      if (storedUser?.role === 'admin') {
        clearAuthState(false)
        if (!cancelled) setLoading(false)
        return
      }

      if (!token && !refreshToken && !storedUser) {
        if (!cancelled) setLoading(false)
        return
      }

      if (storedUser) {
        setUser(storedUser)
        setIsAuthenticated(true)
      }

      if (token && storedUser && !isTokenExpired(token, 30)) {
        if (!cancelled) setLoading(false)

        try {
          const response = await API.get('/auth/verify')
          if (response.data?.user && !cancelled) {
            const verifiedUser = response.data.user
            if (verifiedUser.role === 'admin') {
              clearAuthState(false)
              return
            }
            persistAuthSession({ token, refreshToken, user: verifiedUser }, false)
            setUser(verifiedUser)
            setIsAuthenticated(true)
          }
        } catch (error) {
          if (!cancelled && error.response?.status === 401) {
            clearAuthState(false)
          }
        }
        return
      }

      if (refreshToken) {
        try {
          const refreshed = await refreshCustomerSession()
          if (cancelled) return
          setUser(refreshed.user)
          setIsAuthenticated(true)
        } catch (error) {
          if (cancelled) return

          if (error.response?.status === 401 || error.response?.status === 403 || error.code === 'REFRESH_TOKEN_MISSING') {
            clearAuthState(false)
          } else if (storedUser) {
            setUser(storedUser)
            setIsAuthenticated(true)
          } else {
            clearAuthState(false)
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
        return
      }

      clearAuthState(false)
      if (!cancelled) setLoading(false)
    }

    if (isAdminPath()) restoreAdminSession()
    else restoreCustomerSession()

    return () => {
      cancelled = true
    }
  }, [clearAuthState])

  // Initialize FCM when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user && !fcmInitialized.current) {
      fcmInitialized.current = true
      initializeFCM().catch(err => console.warn('FCM init failed:', err))
    }
    if (!isAuthenticated) {
      fcmInitialized.current = false
    }
  }, [isAuthenticated, user])

  // Periodic token refresh / expiry check
  useEffect(() => {
    const interval = setInterval(() => {
      const admin = isAdminPath()
      const authState = getStoredAuthState(admin)

      if (admin) {
        if (authState.token && isTokenExpired(authState.token, 30)) {
          clearAuthState(true)
          toast.error('Session expired. Please login again.')
          if (window.location.pathname !== '/admin/login') {
            window.location.href = '/admin/login'
          }
        }
        return
      }

      const shouldRefresh = (!authState.token && authState.refreshToken) || (authState.token && isTokenExpired(authState.token, 30))
      if (shouldRefresh) {
        refreshCustomerSession({ redirectOnFailure: true }).catch(() => {})
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [clearAuthState])

  const checkPhone = async (phone) => {
    try {
      const response = await API.post('/auth/check-phone', { phone })
      return { success: true, exists: response.data.exists }
    } catch {
      return { success: false, exists: false }
    }
  }

  const login = async (identifier, password, isAdmin = false) => {
    try {
      const cleaned = identifier.replace(/[\s\-]/g, '')
      const isPhone = /^\+?\d{10,}$/.test(cleaned)
      const loginPayload = isPhone
        ? { phone: cleaned, password }
        : { email: identifier, password }
      const response = await API.post('/auth/login', loginPayload)
      const { token, refreshToken, user: userData } = response.data

      if (!isAdmin && userData.role === 'admin') {
        toast.error('Admin accounts cannot login on customer site. Use Admin Panel login.')
        return { success: false, message: 'Admin accounts cannot login here' }
      }

      if (isAdmin && userData.role !== 'admin') {
        toast.error('You are not authorized as admin')
        return { success: false, message: 'Not authorized' }
      }

      if (isAdmin) {
        persistAuthSession({ token, user: userData }, true)
      } else {
        persistAuthSession({ token, refreshToken, user: userData }, false)
      }

      setUser(userData)
      setIsAuthenticated(true)

      toast.success('Login successful!')
      return { success: true, user: userData }
    } catch (error) {
      const message = error.response?.data?.message || 'Login failed'
      toast.error(message)
      return { success: false, message }
    }
  }

  const register = async (userData) => {
    try {
      const response = await API.post('/auth/register', userData)
      const { token, refreshToken, user: newUser } = response.data

      persistAuthSession({ token, refreshToken, user: newUser }, false)
      setUser(newUser)
      setIsAuthenticated(true)

      toast.success('Registration successful!')
      return { success: true, user: newUser }
    } catch (error) {
      const message = error.response?.data?.message || 'Registration failed'
      toast.error(message)
      return { success: false, message }
    }
  }

  const logout = async () => {
    const admin = isAdminPath()
    const { refreshToken } = getStoredAuthState(false)

    try {
      await cleanupFCM(admin)
    } catch {}

    if (!admin) {
      revokeCustomerSession(refreshToken)
    }

    clearAuthState(admin)
    toast.success('Logged out successfully')
  }

  const updateProfile = async (profileData) => {
    try {
      const response = await API.put('/auth/profile', profileData)
      const updatedUser = response.data.user
      const authState = getStoredAuthState(isAdminPath())
      persistAuthSession({
        token: authState.token,
        refreshToken: authState.refreshToken,
        user: updatedUser
      }, isAdminPath())
      setUser(updatedUser)
      toast.success('Profile updated successfully')
      return { success: true, user: updatedUser }
    } catch (error) {
      const message = error.response?.data?.message || 'Profile update failed'
      toast.error(message)
      return { success: false, message }
    }
  }

  const value = {
    user,
    loading,
    isAuthenticated,
    checkPhone,
    login,
    register,
    logout,
    updateProfile
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext
