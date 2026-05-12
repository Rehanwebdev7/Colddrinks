import axios from 'axios'

function resolveApiBaseUrl() {
  const explicitBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/+$/, '')

  if (typeof window === 'undefined') {
    return 'http://localhost:8000/api'
  }

  if (import.meta.env.DEV) {
    return '/api'
  }

  return `${window.location.origin}/api`
}

const API_BASE_URL = resolveApiBaseUrl()
const AUTH_EVENT_NAME = 'app-auth-changed'
const CUSTOMER_TOKEN_KEY = 'token'
const CUSTOMER_REFRESH_TOKEN_KEY = 'refreshToken'
const CUSTOMER_USER_KEY = 'user'
const ADMIN_TOKEN_KEY = 'adminToken'
const ADMIN_USER_KEY = 'adminUser'

let refreshPromise = null

const API = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

export function isAdminPath() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
}

function getLoginPath(isAdmin) {
  return isAdmin ? '/admin/login' : '/login'
}

function notifyAuthChange(isAdmin, user) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AUTH_EVENT_NAME, { detail: { isAdmin, user } }))
}

function parseStoredUser(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

// Decode JWT payload
export function decodeToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

// Check if token is expired
export function isTokenExpired(token, bufferSeconds = 0) {
  const payload = decodeToken(token)
  if (!payload || !payload.exp) return true
  return payload.exp < Math.floor(Date.now() / 1000) + bufferSeconds
}

export function getStoredAuthState(isAdmin = isAdminPath()) {
  if (typeof window === 'undefined') {
    return { token: null, refreshToken: null, user: null }
  }

  if (isAdmin) {
    return {
      token: localStorage.getItem(ADMIN_TOKEN_KEY),
      refreshToken: null,
      user: parseStoredUser(localStorage.getItem(ADMIN_USER_KEY))
    }
  }

  return {
    token: localStorage.getItem(CUSTOMER_TOKEN_KEY),
    refreshToken: localStorage.getItem(CUSTOMER_REFRESH_TOKEN_KEY),
    user: parseStoredUser(localStorage.getItem(CUSTOMER_USER_KEY))
  }
}

export function persistAuthSession({ token, refreshToken, user }, isAdmin = false) {
  if (typeof window === 'undefined') return

  if (isAdmin) {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token)
    if (user) localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user))
    notifyAuthChange(true, user || null)
    return
  }

  if (token) localStorage.setItem(CUSTOMER_TOKEN_KEY, token)
  if (refreshToken) localStorage.setItem(CUSTOMER_REFRESH_TOKEN_KEY, refreshToken)
  if (user) localStorage.setItem(CUSTOMER_USER_KEY, JSON.stringify(user))
  notifyAuthChange(false, user || null)
}

export function clearStoredAuth(isAdmin = isAdminPath()) {
  if (typeof window === 'undefined') return

  if (isAdmin) {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    localStorage.removeItem(ADMIN_USER_KEY)
  } else {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY)
    localStorage.removeItem(CUSTOMER_REFRESH_TOKEN_KEY)
    localStorage.removeItem(CUSTOMER_USER_KEY)
  }

  notifyAuthChange(isAdmin, null)
}

function redirectToLogin(isAdmin = isAdminPath()) {
  if (typeof window === 'undefined') return
  const loginPath = getLoginPath(isAdmin)
  if (window.location.pathname !== loginPath) {
    window.location.href = loginPath
  }
}

function shouldLogoutForRefreshError(error) {
  const status = error?.response?.status
  return status === 401 || status === 403
}

function shouldSkipRefresh(config) {
  const url = config?.url || ''
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout') ||
    url.includes('/auth/check-phone') ||
    url.includes('/auth/forgot-password') ||
    url.includes('/auth/reset-password')
  )
}

function unwrapPayload(response) {
  return response?.data?.data ?? response?.data
}

export async function refreshCustomerSession(options = {}) {
  const { redirectOnFailure = false } = options
  const { refreshToken } = getStoredAuthState(false)

  if (!refreshToken) {
    const error = new Error('Refresh token missing')
    error.code = 'REFRESH_TOKEN_MISSING'
    throw error
  }

  if (!refreshPromise) {
    refreshPromise = axios.post(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' } }
    )
      .then((response) => {
        const payload = unwrapPayload(response)
        if (!payload?.token || !payload?.refreshToken || !payload?.user) {
          const invalidResponseError = new Error('Invalid refresh response')
          invalidResponseError.code = 'INVALID_REFRESH_RESPONSE'
          throw invalidResponseError
        }
        persistAuthSession(payload, false)
        return payload
      })
      .catch((error) => {
        if (shouldLogoutForRefreshError(error) || error?.code === 'INVALID_REFRESH_RESPONSE') {
          clearStoredAuth(false)
          if (redirectOnFailure) redirectToLogin(false)
        }
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

export function revokeCustomerSession(refreshToken) {
  if (!refreshToken) return Promise.resolve()
  return axios.post(
    `${API_BASE_URL}/auth/logout`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' } }
  ).catch(() => {})
}

// Transform backend objects to match frontend expected fields
function addCompatFields(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(addCompatFields)
  const copy = { ...obj }
  // Map id -> _id
  if (copy.id && !copy._id) copy._id = copy.id
  // Map product fields
  if (copy.pricePerBox !== undefined && copy.price === undefined) copy.price = copy.pricePerBox
  if (copy.stockQuantity !== undefined && copy.stock === undefined) copy.stock = copy.stockQuantity
  if (copy.totalReviews !== undefined && copy.numReviews === undefined) copy.numReviews = copy.totalReviews
  // Map nested arrays
  if (copy.items && Array.isArray(copy.items)) copy.items = copy.items.map(addCompatFields)
  if (copy.statusHistory && Array.isArray(copy.statusHistory)) copy.statusHistory = copy.statusHistory.map(addCompatFields)
  return copy
}

API.interceptors.request.use(
  async (config) => {
    const admin = isAdminPath()
    const authState = getStoredAuthState(admin)
    let token = authState.token

    if (admin) {
      if (token) {
        if (isTokenExpired(token)) {
          clearStoredAuth(true)
          redirectToLogin(true)
          return Promise.reject(new Error('Token expired'))
        }
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    }

    if (!token && authState.refreshToken && !shouldSkipRefresh(config)) {
      const refreshed = await refreshCustomerSession()
      token = refreshed.token
    } else if (token && isTokenExpired(token, 30) && !shouldSkipRefresh(config)) {
      const refreshed = await refreshCustomerSession()
      token = refreshed.token
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to unwrap { success, data, message } and handle auth errors
API.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success !== undefined) {
      response.data = addCompatFields(response.data.data)
    }
    return response
  },
  async (error) => {
    const { response, config } = error
    const admin = isAdminPath()

    if (response?.status === 401) {
      if (admin) {
        const isVerifyCall = config?.url?.includes('/auth/verify')
        if (!isVerifyCall) {
          clearStoredAuth(true)
          redirectToLogin(true)
        }
        return Promise.reject(error)
      }

      if (!shouldSkipRefresh(config) && !config?._retry) {
        config._retry = true
        try {
          const refreshed = await refreshCustomerSession({ redirectOnFailure: true })
          config.headers = config.headers || {}
          config.headers.Authorization = `Bearer ${refreshed.token}`
          return API(config)
        } catch (refreshError) {
          return Promise.reject(refreshError)
        }
      }

      if (shouldSkipRefresh(config)) {
        clearStoredAuth(false)
        redirectToLogin(false)
      }
    }

    return Promise.reject(error)
  }
)

export { AUTH_EVENT_NAME }
export default API
