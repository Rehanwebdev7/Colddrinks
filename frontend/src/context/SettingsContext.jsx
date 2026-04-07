import { createContext, useContext, useState, useEffect } from 'react'
import API from '../config/api'

const SettingsContext = createContext(null)

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
  logo: '',
  paymentQr: '',
  upiId: '7028732945@ybl',
  upiPayeeName: 'NOOR COLDINKS'
}

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(defaultSettings)

  const applySettings = (s) => {
    const root = document.documentElement
    if (s.colors) {
      if (s.colors.primary) root.style.setProperty('--primary', s.colors.primary)
      if (s.colors.primaryDark) root.style.setProperty('--primary-dark', s.colors.primaryDark)
      if (s.colors.primaryLight) root.style.setProperty('--primary-light', s.colors.primaryLight)
      if (s.colors.accent) root.style.setProperty('--accent', s.colors.accent)
    }
    if (s.font && s.font !== 'Inter') {
      const existing = document.getElementById('dynamic-font-link')
      if (existing) existing.remove()
      const link = document.createElement('link')
      link.id = 'dynamic-font-link'
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(s.font)}:wght@300;400;500;600;700&display=swap`
      document.head.appendChild(link)
      root.style.setProperty('font-family', `'${s.font}', sans-serif`)
    }
  }

  const fetchSettings = async () => {
    try {
      const response = await API.get('/settings')
      const data = { ...defaultSettings, ...(response.data || {}) }
      data.siteName = normalizeBrandName(data.siteName || defaultSettings.siteName)
      setSettings(data)
      applySettings(data)
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
