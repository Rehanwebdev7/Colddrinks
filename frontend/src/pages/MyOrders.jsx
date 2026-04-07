import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../config/api'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import BackToTop from '../components/BackToTop'
import { FiXCircle } from 'react-icons/fi'
import toast from 'react-hot-toast'

const filterTabs = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Cancelled', value: 'cancelled' }
]

// Skeleton Order Card
const SkeletonOrder = () => (
  <div className="skeleton-order">
    <div className="skeleton-left">
      <div className="skeleton skeleton-line" style={{ width: 120, height: 16 }} />
      <div className="skeleton skeleton-line" style={{ width: 180, height: 12 }} />
    </div>
    <div className="skeleton-right">
      <div className="skeleton skeleton-line" style={{ width: 70, height: 18 }} />
      <div className="skeleton skeleton-line" style={{ width: 80, height: 24, borderRadius: 50 }} />
    </div>
  </div>
)

const MyOrders = () => {
  const navigate = useNavigate()
  const { isAuthenticated, user, loading: authLoading } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/login')
  }, [authLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (isAuthenticated) fetchOrders()
  }, [isAuthenticated])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const response = await API.get('/orders')
      let data = Array.isArray(response.data) ? response.data : response.data?.orders || []
      if (user && user.role !== 'admin') {
        data = data.filter(order => order.userId === user.id || order.userId === user._id)
      }
      data.sort((a, b) => new Date(b.orderDate || b.createdAt) - new Date(a.orderDate || a.createdAt))
      setOrders(data)
    } catch (err) {
      console.error('Failed to fetch orders:', err)
      setError('Failed to load orders.')
    } finally {
      setLoading(false)
    }
  }

  const cancelOrder = async (orderId, e) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to cancel this order?')) return
    try {
      await API.put(`/orders/${orderId}/cancel`)
      toast.success('Order cancelled successfully')
      fetchOrders()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel order')
    }
  }

  const confirmDelivery = async (orderId, e) => {
    e.stopPropagation()
    if (!window.confirm('Confirm delivery only after receiving all items in this order.')) return
    try {
      await API.post(`/orders/${orderId}/confirm-delivery`)
      toast.success('Delivery confirmed successfully')
      fetchOrders()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm delivery')
    }
  }

  const activeStatuses = ['placed', 'confirmed', 'processing', 'shipped']

  const filteredOrders = orders.filter(order => {
    if (activeFilter === 'all') return true
    const s = (order.orderStatus || '').toLowerCase()
    const deliveryConfirmationPending = s === 'shipped' && !!order.deliveryConfirmationRequestedAt && !order.customerDeliveryConfirmed
    if (activeFilter === 'active') return activeStatuses.includes(s)
    if (activeFilter === 'delivered') return s === 'delivered' || order.customerDeliveryConfirmed
    if (activeFilter === 'cancelled') return s === 'cancelled'
    if (deliveryConfirmationPending) return activeFilter === 'active'
    return true
  })

  const formatDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  if (authLoading) {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div className="container section-padding">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonOrder key={i} />)}
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      <Navbar />
      <div className="container section-padding">
        <h1 className="page-title">My Orders</h1>

        <div className="filter-tabs">
          {filterTabs.map(tab => (
            <button
              key={tab.value}
              className={`filter-tab ${activeFilter === tab.value ? 'active' : ''}`}
              onClick={() => setActiveFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => <SkeletonOrder key={i} />)}
          </div>
        ) : error ? (
          <div className="error-container">
            <p className="error-text">{error}</p>
            <button className="btn btn-primary" onClick={fetchOrders}>Try Again</button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state-illustration" viewBox="0 0 140 140" fill="none">
              <circle cx="70" cy="70" r="65" fill="#FEE2E2" />
              <rect x="40" y="30" width="60" height="75" rx="6" fill="#FECACA" stroke="#E23744" strokeWidth="2"/>
              <path d="M52 50h36M52 62h36M52 74h24" stroke="#FCA5A5" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="95" cy="100" r="18" fill="#FEE2E2" stroke="#E23744" strokeWidth="2"/>
              <path d="M89 100h12M95 94v12" stroke="#E23744" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <h3 className="empty-state-title">No orders found</h3>
            <p className="empty-state-text">{activeFilter === 'all' ? "You haven't placed any orders yet." : `No ${activeFilter} orders.`}</p>
            {activeFilter === 'all' && (
              <button className="btn btn-primary" onClick={() => navigate('/')}>Browse Products</button>
            )}
          </div>
        ) : (
          <div className="orders-list">
            {filteredOrders.map(order => {
              const status = (order.orderStatus || 'placed').toLowerCase()
              const payStatus = (order.paymentStatus || 'pending').toLowerCase()
              const deliveryConfirmationPending = status === 'shipped' && !!order.deliveryConfirmationRequestedAt && !order.customerDeliveryConfirmed
              return (
                <div
                  key={order.id}
                  className={`order-list-card status-border-${status}`}
                  onClick={() => navigate(`/order/${order.id}`)}
                >
                  <div className="order-list-info">
                    <span className="order-list-number">
                      #{order.orderNumber || order.id?.slice(-8)}
                    </span>
                    <span className="order-list-meta">
                      {formatDate(order.orderDate)} &middot; {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="order-list-right">
                    <span className="order-list-total">
                      &#8377;{(order.total || 0).toFixed(2)}
                    </span>
                    <span className={`order-status-badge status-${deliveryConfirmationPending ? 'awaiting_confirmation' : status}`}>
                      {deliveryConfirmationPending ? 'awaiting confirmation' : status}
                    </span>
                    <span className={`payment-badge ${payStatus === 'paid' ? 'payment-paid' : payStatus === 'verification pending' ? 'payment-verification' : 'payment-pending'}`}>
                      {payStatus === 'verification pending' ? 'verifying' : payStatus}
                    </span>
                    {(status === 'placed' || status === 'confirmed') && (
                      <button
                        className="cancel-order-btn"
                        onClick={(e) => cancelOrder(order.id, e)}
                      >
                        <FiXCircle /> Cancel
                      </button>
                    )}
                    {deliveryConfirmationPending && (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '8px 12px', fontSize: '12px' }}
                        onClick={(e) => confirmDelivery(order.id, e)}
                      >
                        Confirm Delivery
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <Footer />
      <BackToTop />
    </div>
  )
}

export default MyOrders
