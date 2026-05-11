import { createContext, useContext, useState, useEffect } from 'react'
import API from '../config/api'

const SettingsContext = createContext(null)

// Shade a hex color by a percentage. Positive percent lightens, negative darkens.
// e.g. shade('#E23744', -25) → darker variant; shade('#E23744', 30) → lighter variant.
const shade = (hex, percent) => {
  if (!hex || typeof hex !== 'string') return hex
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return hex
  const factor = percent / 100
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))
  const adjust = (c) => percent < 0 ? clamp(c * (1 + factor)) : clamp(c + (255 - c) * factor)
  const toHex = (n) => n.toString(16).padStart(2, '0')
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`
}

const normalizeBrandName = (value) => {
  const siteName = String(value || '').replace(/\s+/g, ' ').trim()
  if (!siteName) return ''

  const words = siteName.split(' ')
  if (words.length % 2 === 0) {
    const midpoint = words.length / 2
    const firstHalf = words.slice(0, midpoint).join(' ')
    const secondHalf = words.slice(midpoint).join(' ')
    if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
      return firstHalf
    }
  }

  return siteName
}

const defaultSettings = {
  siteName: 'Royal',
  siteTagline: 'Your one-stop shop for refreshing cold drinks',
  colors: { primary: '#E23744', primaryDark: '#c62828', primaryLight: '#ff5a65', accent: '#0ea5e9' },
  font: 'Inter',
  contact: { address: '123 Cool Street, Beverage City', phone: '+91 98765 43210', email: 'support@royal.com' },
  about: 'Your one-stop shop for refreshing cold drinks.',
  policies: { privacy: '', terms: '' },
  social: { facebook: '', instagram: '', twitter: '', youtube: '' },
  socialEnabled: { facebook: true, instagram: true, twitter: true, youtube: true },
  logo: '',
  favicon: '',
  paymentQr: '',
  upiId: '7028732945@ybl',
  upiPayeeName: 'NOOR COLDINKS'
}

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(defaultSettings)

  const applySettings = (s) => {
    const root = document.documentElement
    if (s.colors) {
      // Single source of truth: only `primary` is honored from settings.
      // Dark / Light variants are always derived from primary so the
      // gradient stays visually coherent no matter what the admin picks.
      const primary = s.colors.primary || '#E23744'
      const primaryDark = shade(primary, -22)
      const primaryLight = shade(primary, 18)
      root.style.setProperty('--primary', primary)
      root.style.setProperty('--primary-dark', primaryDark)
      root.style.setProperty('--primary-light', primaryLight)
      if (s.colors.accent) root.style.setProperty('--accent', s.colors.accent)
      // 3-stop gradient: light → primary → dark for smooth premium look
      root.style.setProperty(
        '--primary-gradient',
        `linear-gradient(135deg, ${primaryLight} 0%, ${primary} 50%, ${primaryDark} 100%)`
      )
      root.style.setProperty('--primary-glow', `0 6px 22px ${primary}59`)
    }
    // Font — load Google Fonts + set both font-family AND --font-display var
    if (s.font) {
      if (s.font !== 'Inter') {
        const existing = document.getElementById('dynamic-font-link')
        if (existing) existing.remove()
        const link = document.createElement('link')
        link.id = 'dynamic-font-link'
        link.rel = 'stylesheet'
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(s.font)}:wght@300;400;500;600;700&display=swap`
        document.head.appendChild(link)
        root.style.setProperty('font-family', `'${s.font}', sans-serif`)
      }
      root.style.setProperty('--font-display', `'${s.font}', sans-serif`)
    }
    // Dynamic browser tab title: "<siteName> - <tagline>"
    const namePart = String(s.siteName || '').trim()
    const taglinePart = String(s.siteTagline || '').trim()
    if (namePart || taglinePart) {
      document.title = [namePart, taglinePart].filter(Boolean).join(' - ')
    }
    // Dynamic favicon — replace existing icon link(s).
    // Cache-bust with a version param so the browser re-fetches when admin
    // uploads a new favicon (browsers aggressively cache favicons).
    if (s.favicon) {
      const existingIcons = document.querySelectorAll("link[rel*='icon']")
      existingIcons.forEach((el) => el.parentNode && el.parentNode.removeChild(el))
      const guessType = (url) => {
        const u = String(url).toLowerCase()
        if (u.endsWith('.svg')) return 'image/svg+xml'
        if (u.endsWith('.ico')) return 'image/x-icon'
        if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg'
        return 'image/png'
      }
      // Append a stable hash from URL so identical favicons stay cached
      // but new uploads (different URL) force a fresh fetch.
      const bust = (() => {
        let hash = 0
        for (let i = 0; i < s.favicon.length; i++) hash = ((hash << 5) - hash + s.favicon.charCodeAt(i)) | 0
        return `v=${Math.abs(hash)}`
      })()
      const hrefWithBust = s.favicon + (s.favicon.includes('?') ? '&' : '?') + bust
      const link = document.createElement('link')
      link.rel = 'icon'
      link.type = guessType(s.favicon)
      link.href = hrefWithBust
      document.head.appendChild(link)
      // Shortcut icon (legacy IE/Edge)
      const shortcut = document.createElement('link')
      shortcut.rel = 'shortcut icon'
      shortcut.type = guessType(s.favicon)
      shortcut.href = hrefWithBust
      document.head.appendChild(shortcut)
      // Apple touch icon for iOS bookmarks
      const apple = document.createElement('link')
      apple.rel = 'apple-touch-icon'
      apple.href = hrefWithBust
      document.head.appendChild(apple)
    }
  }

  const fetchSettings = async () => {
    try {
      // Bypass HTTP cache so freshly-saved settings always reach the customer
      const response = await API.get('/settings', { params: { _t: Date.now() } })
      const data = { ...defaultSettings, ...(response.data || {}) }
      data.siteName = normalizeBrandName(data.siteName || defaultSettings.siteName)
      setSettings(data)
      applySettings(data)
      // Broadcast for any other tabs of the same browser
      try { localStorage.setItem('settings:lastUpdated', String(Date.now())) } catch {}
    } catch {
      // Use defaults
    }
  }

  const refreshSettings = () => fetchSettings()

  useEffect(() => {
    fetchSettings()
  }, [])

  // Re-apply CSS variables whenever settings change
  useEffect(() => {
    applySettings(settings)
  }, [settings])

  // Cross-tab + focus sync — keeps customer site theme in lockstep with admin
  // changes even when they're in different tabs of the same browser.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'settings:lastUpdated') fetchSettings()
    }
    const onFocus = () => fetchSettings()
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchSettings() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

export { normalizeBrandName }

export default SettingsContext
