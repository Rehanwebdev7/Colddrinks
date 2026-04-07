import axios from 'axios'

const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
const BASE_URL = isLocal ? `http://localhost:8000/api` : `https://colddrinks-backend.onrender.com/api`

const API = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Decode JWT payload
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
  return payload.exp < Math.floor(Date.now() / 1000)
}

// Request interceptor to attach JWT token (admin vs customer separated)
API.interceptors.request.use(
  (config) => {
    const isAdmin = window.location.pathname.startsWith('/admin')
    const tokenKey = isAdmin ? 'adminToken' : 'token'
    const token = localStorage.getItem(tokenKey)

    if (token) {
      // Check expiry before sending request
      if (isTokenExpired(token)) {
        const userKey = isAdmin ? 'adminUser' : 'user'
        localStorage.removeItem(tokenKey)
        localStorage.removeItem(userKey)
        const loginPath = isAdmin ? '/admin/login' : '/login'
        if (window.location.pathname !== loginPath) {
          window.location.href = loginPath
        }
        return Promise.reject(new Error('Token expired'))
      }
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

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

// Response interceptor to unwrap { success, data, message } and handle auth errors
API.interceptors.response.use(
  (response) => {
    // Unwrap the nested data so components get response.data directly
    if (response.data && response.data.success !== undefined) {
      response.data = addCompatFields(response.data.data)
    }
    return response
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      const isVerifyCall = error.config?.url?.includes('/auth/verify')
      if (!isVerifyCall) {
        const isAdmin = window.location.pathname.startsWith('/admin')
        localStorage.removeItem(isAdmin ? 'adminToken' : 'token')
        localStorage.removeItem(isAdmin ? 'adminUser' : 'user')
        const loginPath = isAdmin ? '/admin/login' : '/login'
        if (window.location.pathname !== loginPath) {
          window.location.href = loginPath
        }
      }
    }
    return Promise.reject(error)
  }
)

export default API
