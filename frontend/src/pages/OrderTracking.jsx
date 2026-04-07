import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import API from '../config/api'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import BackToTop from '../components/BackToTop'
import { FiArrowLeft, FiXCircle, FiStar } from 'react-icons/fi'
import { ImSpinner8 } from 'react-icons/im'
import toast from 'react-hot-toast'
import { getCartItemSummary, getCartItemUnitPriceLabel } from '../utils/purchase'

const OrderTracking = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Rating state
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/login')
  }, [authLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (isAuthenticated) fetchOrder()
  }, [isAuthenticated, id])

  const fetchOrder = async () => {
    try {
      setLoading(true)
      const response = await API.get(`/orders/${id}`)
      setOrder(response.data)
      if (response.data?.rating) {
        setRating(response.data.rating)
        setRatingComment(response.data.ratingComment || '')
      }
    } catch (err) {
      console.error('Failed to fetch order:', err)
      setError('Order not found or failed to load.')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = d => d ? new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : ''

  const submitRating = async () => {
    if (rating === 0) {
      toast.error('Please select a rating')
      return
    }
    try {
      setSubmittingRating(true)
      await API.post(`/orders/${id}/rate`, { rating, comment: ratingComment })
      toast.success('Thank you for your rating!')
      fetchOrder()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit rating')
    } finally {
      setSubmittingRating(false)
    }
  }

  // Skeleton loading
  if (loading || authLoading) {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div className="container section-padding" style={{ maxWidth: 900, margin: '0 auto' }}>
          <div className="skeleton skeleton-line w-30" style={{ height: 16, marginBottom: 20 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
            <div>
              <div className="skeleton skeleton-line w-75" style={{ height: 28, width: 250, marginBottom: 8 }} />
              <div className="skeleton skeleton-line" style={{ height: 14, width: 150 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="skeleton" style={{ width: 80, height: 28, borderRadius: 50 }} />
              <div className="skeleton" style={{ width: 70, height: 28, borderRadius: 50 }} />
            </div>
          </div>
          <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-lg)', marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 160, borderRadius: 'var(--radius-lg)', marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)' }} />
        </div>
        <Footer />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div className="error-container page-min-height">
          <svg className="empty-state-illustration" viewBox="0 0 140 140" fill="none">
            <circle cx="70" cy="70" r="65" fill="#FEE2E2" />
            <path d="M50 55l40 30M90 55l-40 30" stroke="#E23744" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <p className="error-text">{error || 'Order not found'}</p>
          <button className="btn btn-primary" onClick={() => navigate('/orders')}>Back to Orders</button>
        </div>
        <Footer />
      </div>
    )
  }

  const cancelOrder = async () => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return
    try {
      await API.put(`/orders/${id}/cancel`)
      toast.success('Order cancelled successfully')
      fetchOrder()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel order')
    }
  }

  const confirmDelivery = async () => {
    if (!window.confirm('Confirm delivery only after receiving all items in this order.')) return
    try {
      await API.post(`/orders/${id}/confirm-delivery`)
      toast.success('Delivery confirmed successfully')
      fetchOrder()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm delivery')
    }
  }

  const status = (order.orderStatus || 'placed').toLowerCase()
  const payStatus = (order.paymentStatus || 'pending').toLowerCase()
  const isCancelled = status === 'cancelled'
  const isCancellable = status === 'placed' || status === 'confirmed'
  const isDelivered = status === 'delivered'
  const deliveryConfirmationPending = status === 'shipped' && !!order.deliveryConfirmationRequestedAt && !order.customerDeliveryConfirmed
  const statusLabel = deliveryConfirmationPending ? 'awaiting confirmation' : status

  return (
    <div className="page-wrapper">
      <Navbar />
      <div className="container section-padding order-tracking-page">

        {/* Back button */}
        <button className="back-link" onClick={() => navigate('/orders')}>
          <FiArrowLeft /> Back to Orders
        </button>

        {/* Header */}
        <div className="order-tracking-header">
          <div>
            <h1 className="page-title">Order #{order.orderNumber || order.id?.slice(-8)}</h1>
            <p className="text-muted">{formatDate(order.orderDate)}</p>
          </div>
          <div className="order-tracking-badges">
            <span className={`order-status-badge status-${deliveryConfirmationPending ? 'awaiting_confirmation' : status}`}>{statusLabel}</span>
            <span className={`payment-badge ${payStatus === 'paid' ? 'payment-paid' : payStatus === 'verification pending' ? 'payment-verification' : 'payment-pending'}`}>{payStatus === 'verification pending' ? 'verifying' : payStatus}</span>
            {isCancellable && (
              <button className="cancel-order-btn" onClick={cancelOrder}>
                <FiXCircle /> Cancel Order
              </button>
            )}
            {deliveryConfirmationPending && (
              <button className="btn btn-primary" onClick={confirmDelivery}>
                Confirm Delivery
              </button>
            )}
          </div>
        </div>

        {deliveryConfirmationPending && (
          <div className="tracking-card" style={{ border: '1px solid rgba(245, 158, 11, 0.25)', background: 'rgba(245, 158, 11, 0.06)' }}>
            <h3 className="tracking-card-title">Action Required</h3>
            <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              Admin has requested delivery confirmation. Confirm only after receiving all items in this order.
            </p>
            <button className="btn btn-primary" onClick={confirmDelivery}>
              I Have Received This Order
            </button>
          </div>
        )}

        {/* Status Timeline */}
        {order.statusHistory && order.statusHistory.length > 0 && (
          <div className="tracking-card">
            <h3 className="tracking-card-title">Status Timeline</h3>
            <div className="status-timeline">
              {[...order.statusHistory].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map((entry, i) => {
                const isLast = i === order.statusHistory.length - 1
                return (
                  <div key={i} className="timeline-item">
                    <div className={`timeline-dot ${isLast ? 'current' : 'active'}`} />
                    <div className="timeline-status">{entry.status}</div>
                    {entry.timestamp && <div className="timeline-time">{formatDate(entry.timestamp)}</div>}
                    {entry.note && <div className="timeline-time">{entry.note}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {isCancelled && (
          <div className="cancelled-banner">
            This order has been cancelled
          </div>
        )}

        {/* Items */}
        <div className="tracking-card">
          <h3 className="tracking-card-title">Items ({order.items?.length || 0})</h3>
          <div className="tracking-items-list">
            {(order.items || []).map((item, i) => (
              <div key={i} className="tracking-item">
                <img
                  src={item.image || '/images/placeholder-drink.svg'}
                  alt={item.name}
                  className="tracking-item-image"
                  onError={e => { e.target.src = '/images/placeholder-drink.svg' }}
                />
                <div className="tracking-item-info">
                  <p className="tracking-item-name">{item.name}</p>
                  <p className="tracking-item-qty">
                    {getCartItemSummary(item)} at &#8377;{(item.price || 0).toFixed(2)} {getCartItemUnitPriceLabel(item)}
                  </p>
                </div>
                <span className="tracking-item-price">
                  &#8377;{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="tracking-card">
          <h3 className="tracking-card-title">Price Breakdown</h3>
          <div className="summary-row">
            <span>Subtotal</span><span>&#8377;{(order.subtotal || 0).toFixed(2)}</span>
          </div>
          <div className="summary-row">
            <span>Tax</span><span>&#8377;{(order.tax || 0).toFixed(2)}</span>
          </div>
          {order.couponDiscount > 0 && (
            <div className="summary-row" style={{ color: 'var(--success)' }}>
              <span>Coupon Discount</span><span>-&#8377;{order.couponDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="summary-divider" />
          <div className="summary-row summary-total">
            <span>Total</span><span>&#8377;{(order.total || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Order Rating - Only for delivered orders */}
        {isDelivered && (
          <div className="rating-section">
            <h3 className="tracking-card-title">
              {order.rating ? 'Your Rating' : 'Rate Your Order'}
            </h3>

            {order.rating ? (
              <div className="rating-display">
                <div className="stars">
                  {[1, 2, 3, 4, 5].map(star => (
                    <FiStar
                      key={star}
                      style={{
                        fill: star <= order.rating ? '#ffa500' : 'none',
                        color: '#ffa500'
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontWeight: 600 }}>{order.rating}/5</span>
                {order.ratingComment && (
                  <span style={{ color: 'var(--text-light)', fontSize: 13 }}>— "{order.ratingComment}"</span>
                )}
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                  How was your order experience?
                </p>
                <div className="rating-stars">
                  {[1, 2, 3, 4, 5].map(star => (
                    <span
                      key={star}
                      className={`rating-star ${star <= (hoverRating || rating) ? 'active' : ''}`}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                    >
                      <FiStar style={{ fill: star <= (hoverRating || rating) ? '#ffa500' : 'none' }} />
                    </span>
                  ))}
                </div>
                <textarea
                  className="rating-comment"
                  placeholder="Write a comment (optional)..."
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  rows={3}
                />
                <button
                  className="btn btn-primary mt-md"
                  onClick={submitRating}
                  disabled={submittingRating || rating === 0}
                  style={{ marginTop: 12 }}
                >
                  {submittingRating ? 'Submitting...' : 'Submit Rating'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Delivery & Customer Info */}
        <div className="tracking-info-grid">
          <div className="tracking-card">
            <h3 className="tracking-card-title">Delivery Address</h3>
            <p className="tracking-card-text">
              {typeof order.deliveryAddress === 'object'
                ? [order.deliveryAddress?.street, order.deliveryAddress?.city, order.deliveryAddress?.state, order.deliveryAddress?.pincode].filter(Boolean).join(', ')
                : order.deliveryAddress || 'Not available'}
            </p>
          </div>
          <div className="tracking-card">
            <h3 className="tracking-card-title">Customer</h3>
            <p className="tracking-card-text">{order.customerName || '-'}</p>
            <p className="text-muted" style={{ fontSize: '12px' }}>{order.customerPhone || '-'}</p>
            {order.paymentMethod && (
              <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>Payment: {order.paymentMethod}</p>
            )}
          </div>
        </div>

      </div>
      <Footer />
      <BackToTop />
    </div>
  )
}

export default OrderTracking
