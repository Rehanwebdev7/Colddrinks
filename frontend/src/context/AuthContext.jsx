import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import API from '../config/api'
import toast from 'react-hot-toast'
import { initializeFCM, cleanupFCM } from '../services/fcmService'

const AuthContext = createContext(null)

const isAdminPath = () => window.location.pathname.startsWith('/admin')

// Decode JWT payload without library
function decodeToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

// Check if token is expired
function isTokenExpired(token) {
  const payload = decodeToken(token)
  if (!payload || !payload.exp) return true
  // Add 30 second buffer
  return payload.exp < Math.floor(Date.now() / 1000) + 30
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const fcmInitialized = useRef(false)

  // Clear auth for a specific context
  const clearAuth = useCallback((isAdmin) => {
    const tokenKey = isAdmin ? 'adminToken' : 'token'
    const userKey = isAdmin ? 'adminUser' : 'user'
    localStorage.removeItem(tokenKey)
    localStorage.removeItem(userKey)
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  // On mount, restore auth from correct localStorage keys based on page
  useEffect(() => {
    const verifyToken = async () => {
      const isAdmin = isAdminPath()
      const tokenKey = isAdmin ? 'adminToken' : 'token'
      const userKey = isAdmin ? 'adminUser' : 'user'
      const token = localStorage.getItem(tokenKey)
      const storedUser = localStorage.getItem(userKey)

      if (token && storedUser) {
        // Check token expiry on frontend first
        if (isTokenExpired(token)) {
          console.log('Token expired, clearing auth')
          clearAuth(isAdmin)
          setLoading(false)
          return
        }

        const parsedUser = JSON.parse(storedUser)

        // On admin pages, verify user has admin role
        if (isAdmin && parsedUser.role !== 'admin') {
          clearAuth(isAdmin)
          setLoading(false)
          return
        }

        // On customer pages, admin should NOT be authenticated as customer
        if (!isAdmin && parsedUser.role === 'admin') {
          clearAuth(false)
          setLoading(false)
          return
        }

        setUser(parsedUser)
        setIsAuthenticated(true)
        setLoading(false)

        // Verify token with backend in background
        try {
          const response = await API.get('/auth/verify')
          if (response.data?.user) {
            const verifiedUser = response.data.user
            // Re-check role after verification
            if (isAdmin && verifiedUser.role !== 'admin') {
              clearAuth(isAdmin)
              return
            }
            if (!isAdmin && verifiedUser.role === 'admin') {
              clearAuth(false)
              return
            }
            setUser(verifiedUser)
            localStorage.setItem(userKey, JSON.stringify(verifiedUser))
          }
        } catch (error) {
          console.error('Token verification failed:', error)
          clearAuth(isAdmin)
        }
      } else {
        setLoading(false)
      }
    }

    verifyToken()
  }, [clearAuth])

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

  // Periodic token expiry check (every 60 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const isAdmin = isAdminPath()
      const tokenKey = isAdmin ? 'adminToken' : 'token'
      const token = localStorage.getItem(tokenKey)
      if (token && isTokenExpired(token)) {
        clearAuth(isAdmin)
        toast.error('Session expired. Please login again.')
        const loginPath = isAdmin ? '/admin/login' : '/login'
        if (window.location.pathname !== loginPath) {
          window.location.href = loginPath
        }
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [clearAuth])

  const login = async (identifier, password, isAdmin = false) => {
    try {
      // Detect phone vs email: if all digits (with optional +) and 10+ chars, treat as phone
      const cleaned = identifier.replace(/[\s\-]/g, '')
      const isPhone = /^\+?\d{10,}$/.test(cleaned)
      const loginPayload = isPhone
        ? { phone: cleaned, password }
        : { email: identifier, password }
      const response = await API.post('/auth/login', loginPayload)
      const { token, user: userData } = response.data

      // Prevent admin from logging into customer site
      if (!isAdmin && userData.role === 'admin') {
        toast.error('Admin accounts cannot login on customer site. Use Admin Panel login.')
        return { success: false, message: 'Admin accounts cannot login here' }
      }

      // Prevent customer from logging into admin panel
      if (isAdmin && userData.role !== 'admin') {
        toast.error('You are not authorized as admin')
        return { success: false, message: 'Not authorized' }
      }

      const tokenKey = isAdmin ? 'adminToken' : 'token'
      const userKey = isAdmin ? 'adminUser' : 'user'
      localStorage.setItem(tokenKey, token)
      localStorage.setItem(userKey, JSON.stringify(userData))
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
      const { token, user: newUser } = response.data

      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(newUser))
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

  const logout = () => {
    const isAdmin = isAdminPath()
    // Cleanup FCM — admin keeps token (receives push after logout), customer clears token
    cleanupFCM(isAdmin).catch(() => {})
    // Clear both tokens on logout to prevent stale sessions
    if (isAdmin) {
      localStorage.removeItem('adminToken')
      localStorage.removeItem('adminUser')
    } else {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
    setUser(null)
    setIsAuthenticated(false)
    toast.success('Logged out successfully')
  }

  const updateProfile = async (profileData) => {
    try {
      const response = await API.put('/auth/profile', profileData)
      const updatedUser = response.data.user
      const userKey = isAdminPath() ? 'adminUser' : 'user'
      localStorage.setItem(userKey, JSON.stringify(updatedUser))
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
