import { useEffect, useMemo } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useSettings } from '../context/SettingsContext'
import { getColors } from './themeColors'

/**
 * Bridges the dark-mode toggle, the brand settings (primary/accent/font),
 * and the global admin.css design tokens — pushing CSS variables to :root
 * so every styled element (inline or CSS-class) resolves the same values.
 *
 * Returns the same shape `getColors(darkMode)` returned, plus `darkMode`
 * and `toggleTheme` so call-sites can drop in `useAdminTheme()` instead of
 * combining `useTheme + getColors` manually.
 */
export const useAdminTheme = () => {
  const { darkMode, toggleTheme } = useTheme()
  const { settings } = useSettings()

  const brand = useMemo(() => ({
    primary: settings?.colors?.primary,
    primaryDark: settings?.colors?.primaryDark,
    primaryLight: settings?.colors?.primaryLight,
    accent: settings?.colors?.accent,
    font: settings?.font,
  }), [
    settings?.colors?.primary,
    settings?.colors?.primaryDark,
    settings?.colors?.primaryLight,
    settings?.colors?.accent,
    settings?.font,
  ])

  const colors = useMemo(() => getColors(darkMode, brand), [darkMode, brand])

  // Push design tokens onto the document root so admin.css can read them.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--admin-accent', colors.accent)
    root.style.setProperty('--admin-accent-glow', colors.accentGlow)
    root.style.setProperty('--admin-accent-soft', colors.accentSoft)
    root.style.setProperty('--admin-primary', colors.primary)
    root.style.setProperty('--admin-primary-light', colors.primaryLight)
    root.style.setProperty('--admin-primary-glow', colors.primaryGlow)
    root.style.setProperty('--admin-border-strong', colors.border)
    root.style.setProperty('--admin-hover', colors.hover)
    if (colors.fontFamily) {
      const fontStack = `'${colors.fontFamily}', 'Inter', 'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
      root.style.setProperty('--admin-font', fontStack)
    }
  }, [colors])

  return { ...colors, darkMode, toggleTheme }
}

export default useAdminTheme
