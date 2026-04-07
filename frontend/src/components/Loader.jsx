const Loader = ({ fullPage = false, size = 40, color = '#0ea5e9' }) => {
  const spinner = (
    <div style={{
      width: `${size}px`,
      height: `${size}px`,
      border: `3px solid rgba(255,255,255,0.1)`,
      borderTop: `3px solid ${color}`,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  )

  if (fullPage) {
    return (
      <div style={styles.fullPageOverlay}>
        <div style={styles.loaderContent}>
          {spinner}
          <p style={styles.loadingText}>Loading...</p>
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={styles.inlineWrapper}>
      {spinner}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  fullPageOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3000,
  },
  loaderContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: '14px',
    fontWeight: '500',
    margin: 0,
  },
  inlineWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '40px',
  },
}

export default Loader
