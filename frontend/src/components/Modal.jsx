import { useEffect } from 'react'
import { FaTimes } from 'react-icons/fa'
import { useTheme } from '../context/ThemeContext'
import { getColors } from '../admin/themeColors'

const Modal = ({ isOpen = true, onClose, title, children, footer, maxWidth = '520px' }) => {
  const { darkMode } = useTheme()
  const c = getColors(darkMode)

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleEscape)
    }
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const styles = getStyles(c, maxWidth)

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>{title}</h2>
          <button onClick={onClose} style={styles.closeButton}>
            <FaTimes />
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {children}
        </div>

        {/* Footer (sticky, only renders when footer prop is provided) */}
        {footer && (
          <div style={styles.footer}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

const getStyles = (c, maxWidth = '520px') => ({
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: window.innerWidth <= 768 ? '90px 8px 20px' : '100px 20px 30px',
    animation: 'fadeIn 0.2s ease',
    overflowY: 'auto',
  },
  modal: {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    width: '100%',
    maxWidth: maxWidth,
    maxHeight: window.innerWidth <= 768 ? 'calc(100vh - 110px)' : 'calc(100vh - 130px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    animation: 'slideUp 0.25s ease',
    margin: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: window.innerWidth <= 768 ? '14px 16px' : '20px 24px',
    borderBottom: `1px solid ${c.border}`,
  },
  title: {
    color: c.text,
    fontSize: '18px',
    fontWeight: '700',
    margin: 0,
  },
  closeButton: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    color: '#ef4444',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
  },
  body: {
    padding: window.innerWidth <= 768 ? '14px' : '24px',
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
  },
  footer: {
    padding: window.innerWidth <= 768 ? '12px 16px' : '16px 24px',
    borderTop: `1px solid ${c.border}`,
    background: c.surface,
    flexShrink: 0,
  },
})

export default Modal
