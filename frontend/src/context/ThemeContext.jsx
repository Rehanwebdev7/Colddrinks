import { createContext, useContext, useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const ThemeContext = createContext(null)

export const ThemeProvider = ({ children }) => {
  const { pathname } = useLocation()
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('adminTheme')
    return stored !== null ? stored === 'dark' : true
  })

  useEffect(() => {
    const isAdminRoute = pathname.startsWith('/admin')

    if (isAdminRoute) {
      localStorage.setItem('adminTheme', darkMode ? 'dark' : 'light')
      document.body.classList.toggle('dark-mode', darkMode)
      document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
      return
    }

    document.body.classList.add('dark-mode')
    document.documentElement.setAttribute('data-theme', 'dark')
  }, [darkMode, pathname])

  const toggleTheme = () => setDarkMode(prev => !prev)

  return (
    <ThemeContext.Provider value={{ darkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export default ThemeContext
