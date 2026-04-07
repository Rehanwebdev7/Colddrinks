import { Link, useNavigate } from 'react-router-dom'
import { FaTruck, FaEye, FaTimes, FaRedo, FaBox } from 'react-icons/fa'
import StatusBadge from './StatusBadge'

const ORDER_STEPS = ['Placed', 'Accepted', 'Preparing', 'Out for Delivery', 'Delivered']

const OrderCard = ({ order, onCancel, onReorder }) => {
  const navigate = useNavigate()

  const {
    _id,
    orderNumber,
    createdAt,
    items = [],
    totalAmount,
    status = 'Placed',
    paymentStatus = 'Pending',
  } = order

  const formattedDate = new Date(createdAt).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const currentStepIndex = ORDER_STEPS.indexOf(status)
  const isCancelled = status === 'Cancelled'
  const isDelivered = status === 'Delivered'
  const canCancel = !isCancelled && !isDelivered && currentStepIndex <= 1

  const itemsSummary = items.length > 2
    ? `${items.slice(0, 2).map(i => i.name).join(', ')} +${items.length - 2} more`
    : items.map(i => i.name).join(', ')

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.orderNumber}>
            <FaBox style={{ color: '#0ea5e9', fontSize: '16px' }} />
            <span style={styles.orderLabel}>Order #{orderNumber || _id?.slice(-8)}</span>
          </div>
          <span style={styles.date}>{formattedDate}</span>
        </div>
        <div style={styles.headerRight}>
          <StatusBadge status={status} type="order" />
          <StatusBadge status={paymentStatus} type="payment" />
        </div>
      </div>

      {/* Items Summary */}
      <div style={styles.body}>
        <p style={styles.itemsSummary}>{itemsSummary}</p>
        <p style={styles.itemCount}>{items.length} item{items.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Progress Bar */}
      {!isCancelled && (
        <div style={styles.progressSection}>
          <div style={styles.progressBar}>
            {ORDER_STEPS.map((step, index) => {
              const isActive = index <= currentStepIndex
              const isCurrentStep = index === currentStepIndex
              return (
                <div key={step} style={styles.stepContainer}>
                  <div style={{
                    ...styles.stepDot,
                    background: isActive ? '#0ea5e9' : '#334155',
                    boxShadow: isCurrentStep ? '0 0 0 4px rgba(14, 165, 233, 0.3)' : 'none',
                    transform: isCurrentStep ? 'scale(1.2)' : 'scale(1)',
                  }} />
                  <span style={{
                    ...styles.stepLabel,
                    color: isActive ? '#e2e8f0' : '#64748b',
                    fontWeight: isCurrentStep ? '600' : '400',
                  }}>
                    {step}
                  </span>
                  {index < ORDER_STEPS.length - 1 && (
                    <div style={{
                      ...styles.stepLine,
                      background: index < currentStepIndex ? '#0ea5e9' : '#334155',
                    }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cancelled Banner */}
      {isCancelled && (
        <div style={styles.cancelledBanner}>
          This order has been cancelled
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.totalSection}>
          <span style={styles.totalLabel}>Total:</span>
          <span style={styles.totalAmount}>&#8377;{totalAmount?.toFixed(2)}</span>
        </div>

        <div style={styles.actions}>
          <button
            onClick={() => navigate(`/orders/${_id}`)}
            style={styles.actionBtn}
          >
            <FaEye /> View Details
          </button>

          {!isCancelled && !isDelivered && (
            <button
              onClick={() => navigate(`/orders/${_id}/track`)}
              style={{ ...styles.actionBtn, ...styles.trackBtn }}
            >
              <FaTruck /> Track
            </button>
          )}

          {canCancel && onCancel && (
            <button
              onClick={() => onCancel(_id)}
              style={{ ...styles.actionBtn, ...styles.cancelBtn }}
            >
              <FaTimes /> Cancel
            </button>
          )}

          {(isDelivered || isCancelled) && onReorder && (
            <button
              onClick={() => onReorder(order)}
              style={{ ...styles.actionBtn, ...styles.reorderBtn }}
            >
              <FaRedo /> Reorder
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  card: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '16px',
    overflow: 'hidden',
    transition: 'box-shadow 0.2s',
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
  orderNumber: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  orderLabel: {
    color: '#f1f5f9',
    fontSize: '16px',
    fontWeight: '700',
  },
  date: {
    color: '#64748b',
    fontSize: '13px',
    marginLeft: '24px',
  },
  headerRight: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  body: {
    padding: '0 20px 16px',
  },
  itemsSummary: {
    color: '#cbd5e1',
    fontSize: '14px',
    margin: '0 0 4px',
  },
  itemCount: {
    color: '#64748b',
    fontSize: '12px',
    margin: 0,
  },
  progressSection: {
    padding: '0 20px 20px',
  },
  progressBar: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    position: 'relative',
  },
  stepContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    flex: 1,
  },
  stepDot: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    transition: 'all 0.3s',
    zIndex: 1,
  },
  stepLabel: {
    fontSize: '10px',
    marginTop: '6px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  stepLine: {
    position: 'absolute',
    top: '7px',
    left: '57%',
    width: '86%',
    height: '2px',
    zIndex: 0,
  },
  cancelledBanner: {
    background: 'rgba(239, 68, 68, 0.1)',
    borderTop: '1px solid rgba(239, 68, 68, 0.2)',
    borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    textAlign: 'center',
    padding: '10px',
    fontSize: '13px',
    fontWeight: '600',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderTop: '1px solid #334155',
    flexWrap: 'wrap',
    gap: '12px',
  },
  totalSection: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
  },
  totalLabel: {
    color: '#94a3b8',
    fontSize: '14px',
  },
  totalAmount: {
    color: '#22c55e',
    fontSize: '20px',
    fontWeight: '700',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #334155',
    background: 'transparent',
    color: '#cbd5e1',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  trackBtn: {
    borderColor: 'rgba(14, 165, 233, 0.4)',
    color: '#38bdf8',
  },
  cancelBtn: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    color: '#ef4444',
  },
  reorderBtn: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
    color: '#22c55e',
  },
}

export default OrderCard
