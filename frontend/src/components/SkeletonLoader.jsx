import { useEffect, useState } from 'react'

// Inject keyframes once into the document head
const SHIMMER_KEYFRAMES = `
@keyframes skeletonShimmer {
  0% {
    background-position: -400px 0;
  }
  100% {
    background-position: 400px 0;
  }
}
`

let styleInjected = false
const injectShimmerStyle = () => {
  if (styleInjected) return
  const style = document.createElement('style')
  style.textContent = SHIMMER_KEYFRAMES
  document.head.appendChild(style)
  styleInjected = true
}

// Base shimmer style applied to all skeleton elements
const shimmerBase = {
  background: 'linear-gradient(90deg, var(--surface) 25%, var(--border) 50%, var(--surface) 75%)',
  backgroundSize: '800px 100%',
  animation: 'skeletonShimmer 1.5s ease-in-out infinite',
  borderRadius: '6px',
}

// ─────────────────────────────────────────────────
// SkeletonCard - mimics the ProductCard shape
// ─────────────────────────────────────────────────
const SkeletonCard = () => {
  useEffect(() => {
    injectShimmerStyle()
  }, [])

  return (
    <div style={styles.card}>
      {/* Image placeholder */}
      <div style={styles.imageWrapper}>
        <div style={{ ...shimmerBase, width: '100%', height: '100%', borderRadius: 0 }} />
      </div>

      {/* Body */}
      <div style={styles.body}>
        {/* Product name line */}
        <div style={{ ...shimmerBase, width: '75%', height: '16px', marginBottom: '10px' }} />

        {/* Box info line */}
        <div style={{ ...shimmerBase, width: '55%', height: '12px', marginBottom: '12px' }} />

        {/* Price line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{ ...shimmerBase, width: '80px', height: '20px' }} />
          <div style={{ ...shimmerBase, width: '50px', height: '14px' }} />
        </div>

        {/* Stock line */}
        <div style={{ ...shimmerBase, width: '60px', height: '12px' }} />
      </div>

      {/* Actions / button area */}
      <div style={styles.actions}>
        <div style={{ ...shimmerBase, width: '100%', height: '40px', borderRadius: 'var(--radius)' }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// SkeletonGrid - shows a grid of 8 skeleton cards
// ─────────────────────────────────────────────────
const SkeletonGrid = ({ count = 8 }) => {
  useEffect(() => {
    injectShimmerStyle()
  }, [])

  return (
    <div className="product-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────
// SkeletonOrderCard - mimics the OrderCard shape
// ─────────────────────────────────────────────────
const SkeletonOrderCard = () => {
  useEffect(() => {
    injectShimmerStyle()
  }, [])

  return (
    <div style={orderStyles.card}>
      {/* Header */}
      <div style={orderStyles.header}>
        <div style={orderStyles.headerLeft}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ ...shimmerBase, width: '20px', height: '20px', borderRadius: '4px' }} />
            <div style={{ ...shimmerBase, width: '140px', height: '16px' }} />
          </div>
          <div style={{ ...shimmerBase, width: '90px', height: '12px', marginTop: '6px', marginLeft: '28px' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ ...shimmerBase, width: '80px', height: '26px', borderRadius: '20px' }} />
          <div style={{ ...shimmerBase, width: '70px', height: '26px', borderRadius: '20px' }} />
        </div>
      </div>

      {/* Body - items summary */}
      <div style={orderStyles.body}>
        <div style={{ ...shimmerBase, width: '85%', height: '14px', marginBottom: '6px' }} />
        <div style={{ ...shimmerBase, width: '50px', height: '11px' }} />
      </div>

      {/* Progress bar */}
      <div style={orderStyles.progressSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '6px' }}>
              <div style={{ ...shimmerBase, width: '14px', height: '14px', borderRadius: '50%' }} />
              <div style={{ ...shimmerBase, width: '40px', height: '8px' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={orderStyles.footer}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <div style={{ ...shimmerBase, width: '40px', height: '14px' }} />
          <div style={{ ...shimmerBase, width: '80px', height: '22px' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ ...shimmerBase, width: '100px', height: '36px', borderRadius: '8px' }} />
          <div style={{ ...shimmerBase, width: '80px', height: '36px', borderRadius: '8px' }} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────
const styles = {
  card: {
    background: 'var(--bg)',
    border: '1px solid rgba(0, 0, 0, 0.06)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-sm)',
    display: 'flex',
    flexDirection: 'column',
  },
  imageWrapper: {
    height: '180px',
    background: 'var(--bg-light)',
    overflow: 'hidden',
    position: 'relative',
  },
  body: {
    padding: '14px 16px',
    flex: 1,
  },
  actions: {
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
  },
}

const orderStyles = {
  card: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '20px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  body: {
    padding: '0 20px 16px',
  },
  progressSection: {
    padding: '0 20px 20px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderTop: '1px solid var(--border)',
    flexWrap: 'wrap',
    gap: '12px',
  },
}

export { SkeletonCard, SkeletonGrid, SkeletonOrderCard }
export default SkeletonGrid
