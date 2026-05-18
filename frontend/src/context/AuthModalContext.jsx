import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const AuthModalContext = createContext(null)

export const AuthModalProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState('phone') // 'phone' | 'login' | 'register' | 'forgot'

  const openAuth = useCallback((nextView = 'phone') => {
    setView(nextView)
    setIsOpen(true)
  }, [])

  const closeAuth = useCallback(() => {
    setIsOpen(false)
  }, [])

  const switchView = useCallback((nextView) => {
    setView(nextView)
  }, [])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') closeAuth() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, closeAuth])

  return (
    <AuthModalContext.Provider value={{ isOpen, view, openAuth, closeAuth, switchView }}>
      {children}
    </AuthModalContext.Provider>
  )
}

export const useAuthModal = () => {
  const ctx = useContext(AuthModalContext)
  if (!ctx) throw new Error('useAuthModal must be used within AuthModalProvider')
  return ctx
}
