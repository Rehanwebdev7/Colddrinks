import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../config/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import {
  FiUser, FiMail, FiPhone, FiMapPin, FiEdit2, FiSave, FiX,
  FiPackage, FiDollarSign, FiBell, FiCheck, FiChevronRight, FiHeart,
  FiArrowLeft, FiXCircle, FiCalendar, FiClock, FiCheckCircle,
  FiArrowUpRight, FiArrowDownLeft, FiLogOut, FiCamera
} from 'react-icons/fi'
import { FaLock, FaHeadset } from 'react-icons/fa'
import { useSettings } from '../context/SettingsContext'
import { ImSpinner8 } from 'react-icons/im'
import ImageCropModal from './ImageCropModal'
import { getCartItemSummary, getCartItemUnitPriceLabel } from '../utils/purchase'

const SideDrawer = ({ isOpen, onClose, user, onLogout, unreadNotifs, outstanding }) => {
  const navigate = useNavigate()
  const { updateProfile } = useAuth()
  const { settings } = useSettings()

  const [activeView, setActiveView] = useState('menu')
  const [viewHistory, setViewHistory] = useState([])

  // Data states
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderDetailLoading, setOrderDetailLoading] = useState(false)
  const [paymentSummary, setPaymentSummary] = useState(null)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notifsLoading, setNotifsLoading] = useState(false)

  // Profile edit
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [profileData, setProfileData] = useState({ name: '', email: '', phone: '', address: '', avatar: '' })
  const [cropSrc, setCropSrc] = useState(null)
  const [showCrop, setShowCrop] = useState(false)

  // Password
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [changingPassword, setChangingPassword] = useState(false)

  // Orders filter
  const [activeFilter, setActiveFilter] = useState('all')

  // Notifications filter
  const [notifFilter, setNotifFilter] = useState('all')

  // Clearance
  const [clearAmount, setClearAmount] = useState('')
  const [requesting, setRequesting] = useState(false)

  const dataFetched = useRef({})
  const galleryInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const formatAddress = (addr) => {
    if (!addr) return ''
    if (typeof addr === 'string') return addr
    const parts = [addr.label, addr.street, addr.city, addr.state, addr.pincode].filter(Boolean)
    return parts.join(', ')
  }

  const getUserAddress = useCallback(() => {
    return formatAddress(user?.addresses?.[0]) || formatAddress(user?.address) || ''
  }, [user])

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setActiveView('menu')
        setViewHistory([])
        dataFetched.current = {}
        setIsEditing(false)
        setSelectedOrder(null)
      }, 300)
    }
  }, [isOpen])

  // Init profile data when user changes
  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: getUserAddress(),
        avatar: user.avatar || ''
      })
    }
  }, [user, getUserAddress])

  const handleAvatarSelect = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setCropSrc(reader.result)
      setShowCrop(true)
    }
    reader.readAsDataURL(file)
  }

  const handleCropDone = (croppedDataUrl) => {
    setProfileData((prev) => ({ ...prev, avatar: croppedDataUrl }))
    toast.success('Profile image selected')
  }

  const handleAvatarInputChange = (e) => {
    const file = e.target.files?.[0]
    handleAvatarSelect(file)
    e.target.value = ''
  }

  const handleAvatarRemove = () => {
    setProfileData((prev) => ({ ...prev, avatar: '' }))
    toast.success('Profile image removed')
  }

  const navigateTo = (view) => {
    setViewHistory(prev => [...prev, activeView])
    setActiveView(view)
  }

  const goBack = () => {
    if (viewHistory.length > 0) {
      const prev = viewHistory[viewHistory.length - 1]
      setViewHistory(h => h.slice(0, -1))
      setActiveView(prev)
    }
  }

  const handleClose = () => {
    onClose()
  }

  // ---- Data fetchers ----
  const fetchOrders = async () => {
    if (dataFetched.current.orders) return
    try {
      setOrdersLoading(true)
      const response = await API.get('/orders')
      let data = Array.isArray(response.data) ? response.data : response.data?.orders || []
      if (user && user.role !== 'admin') {
        data = data.filter(order => order.userId === user.id || order.userId === user._id)
      }
      setOrders(data)
      dataFetched.current.orders = true
    } catch { /* ignore */ }
    finally { setOrdersLoading(false) }
  }

  const fetchOrderDetail = async (orderId) => {
    try {
      setOrderDetailLoading(true)
      const response = await API.get(`/orders/${orderId}`)
      setSelectedOrder(response.data)
    } catch {
      toast.error('Failed to load order details')
    } finally {
      setOrderDetailLoading(false)
    }
  }

  const fetchPayments = async () => {
    if (dataFetched.current.payments) return
    try {
      setPaymentsLoading(true)
      const response = await API.get('/payments/my-summary')
      setPaymentSummary(response.data)
      dataFetched.current.payments = true
    } catch { /* ignore */ }
    finally { setPaymentsLoading(false) }
  }

  const fetchNotifications = async () => {
    if (dataFetched.current.notifications) return
    try {
      setNotifsLoading(true)
      const response = await API.get('/notifications')
      const data = Array.isArray(response.data) ? response.data : response.data?.data || []
      setNotifications(data)
      dataFetched.current.notifications = true
    } catch { /* ignore */ }
    finally { setNotifsLoading(false) }
  }

  // Trigger fetch on sub-view open
  useEffect(() => {
    if (activeView === 'orders') fetchOrders()
    if (activeView === 'payments' || activeView === 'clearance') fetchPayments()
    if (activeView === 'notifications') fetchNotifications()
  }, [activeView])

  // ---- Handlers ----
  const handleProfileSave = async () => {
    if (!profileData.name.trim()) { toast.error('Name is required'); return }
    try {
      setSaving(true)
      const result = await updateProfile(profileData)
      if (result.success) setIsEditing(false)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const handleCancelEdit = () => {
    setProfileData({ name: user.name || '', email: user.email || '', phone: user.phone || '', address: getUserAddress(), avatar: user.avatar || '' })
    setIsEditing(false)
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (!passwordData.currentPassword || !passwordData.newPassword) { toast.error('Please fill in all password fields'); return }
    if (passwordData.newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return }
    if (passwordData.newPassword !== passwordData.confirmPassword) { toast.error('New passwords do not match'); return }
    try {
      setChangingPassword(true)
      await API.put('/auth/change-password', { currentPassword: passwordData.currentPassword, newPassword: passwordData.newPassword })
      toast.success('Password changed successfully')
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      goBack()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password')
    } finally { setChangingPassword(false) }
  }

  const cancelOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return
    try {
      await API.put(`/orders/${orderId}/cancel`)
      toast.success('Order cancelled successfully')
      // Refresh
      dataFetched.current.orders = false
      fetchOrders()
      if (selectedOrder?.id === orderId) {
        fetchOrderDetail(orderId)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel order')
    }
  }

  const confirmDelivery = async (orderId) => {
    if (!window.confirm('Confirm delivery only after receiving all items in this order.')) return
    try {
      await API.post(`/orders/${orderId}/confirm-delivery`)
      toast.success('Delivery confirmed successfully')
      dataFetched.current.orders = false
      fetchOrders()
      if (selectedOrder?.id === orderId || selectedOrder?.orderNumber === orderId) {
        fetchOrderDetail(orderId)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm delivery')
    }
  }

  const markAsRead = async (notifId) => {
    try {
      await API.put(`/notifications/${notifId}/read`)
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: true } : n))
    } catch { toast.error('Failed to mark as read') }
  }

  const markAllRead = async () => {
    try {
      await API.put('/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      toast.success('All notifications marked as read')
    } catch { toast.error('Failed to mark all as read') }
  }

  const requestClearance = async () => {
    const amt = Number(clearAmount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    const bal = paymentSummary?.outstanding || outstanding || 0
    if (amt > bal) { toast.error('Amount exceeds outstanding balance'); return }
    try {
      setRequesting(true)
      await API.post('/payments/clear-request', { amount: amt })
      toast.success('Clearance request sent!')
      setClearAmount('')
      dataFetched.current.payments = false
      fetchPayments()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit request')
    } finally { setRequesting(false) }
  }

  // ---- Helpers ----
  const formatDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const formatDateTime = d => d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  const parseOrderRef = (text = '') => {
    const match = text.match(/ORD-\d+/i)
    return match ? match[0].toUpperCase() : null
  }

  const activeStatuses = ['placed', 'confirmed', 'processing', 'shipped']

  const filteredOrders = orders.filter(order => {
    if (activeFilter === 'all') return true
    const s = (order.orderStatus || '').toLowerCase()
    if (activeFilter === 'active') return activeStatuses.includes(s)
    if (activeFilter === 'delivered') return s === 'delivered' || order.customerDeliveryConfirmed
    if (activeFilter === 'cancelled') return s === 'cancelled'
    return true
  })

  const filteredNotifs = notifFilter === 'unread' ? notifications.filter(n => !n.isRead) : notifications
  const localUnreadCount = notifications.filter(n => !n.isRead).length

  const getNotifIcon = (type) => {
    switch (type) {
      case 'order': return <FiPackage />
      case 'payment': return <FiDollarSign />
      default: return <FiBell />
    }
  }

  const getNotifIconClass = (type) => {
    switch (type) {
      case 'order': return 'type-order'
      case 'payment': return 'type-payment'
      default: return ''
    }
  }

  // ---- View title ----
  const getTitle = () => {
    switch (activeView) {
      case 'menu': return 'Menu'
      case 'profile': return 'My Profile'
      case 'orders': return 'My Orders'
      case 'order-detail': return `Order #${selectedOrder?.orderNumber || selectedOrder?.id?.slice(-8) || ''}`
      case 'payments': return 'Payment History'
      case 'clearance': return 'Clearance Requests'
      case 'notifications': return 'Notifications'
      case 'password': return 'Change Password'
      case 'support': return 'Support'
      default: return ''
    }
  }

  // ---- Render views ----
  const renderMenu = () => (
    <div className="drawer-menu-view">
      <div className="drawer-user-header">
        <div className="drawer-user-avatar">
          {user?.avatar ? (
            <img src={user.avatar} alt={user?.name || 'User'} className="profile-avatar-image" />
          ) : (
            user?.name?.charAt(0)?.toUpperCase() || 'U'
          )}
        </div>
        <div className="drawer-user-info">
          <h3>{user?.name}</h3>
          <p>{user?.email}</p>
        </div>
      </div>

      <div className="drawer-menu-list">
        <button className="drawer-menu-item" onClick={() => navigateTo('profile')}>
          <FiUser className="drawer-menu-icon" />
          <span>My Profile</span>
          <FiChevronRight className="drawer-menu-chevron" />
        </button>
        <button className="drawer-menu-item" onClick={() => navigateTo('orders')}>
          <FiPackage className="drawer-menu-icon" />
          <span>My Orders</span>
          {orders.length > 0 && <span className="drawer-badge">{orders.length}</span>}
          <FiChevronRight className="drawer-menu-chevron" />
        </button>
        <button className="drawer-menu-item" onClick={() => { onClose(); window.location.href = '/wishlist' }}>
          <FiHeart className="drawer-menu-icon" />
          <span>My Wishlist</span>
          <FiChevronRight className="drawer-menu-chevron" />
        </button>
        <button className="drawer-menu-item" onClick={() => navigateTo('payments')}>
          <FiDollarSign className="drawer-menu-icon" />
          <span>Payment History</span>
          <FiChevronRight className="drawer-menu-chevron" />
        </button>
        <button className="drawer-menu-item" onClick={() => navigateTo('clearance')}>
          <FiDollarSign className="drawer-menu-icon" />
          <span>Clearance Requests</span>
          <FiChevronRight className="drawer-menu-chevron" />
        </button>
        <button className="drawer-menu-item" onClick={() => navigateTo('notifications')}>
          <FiBell className="drawer-menu-icon" />
          <span>Notifications</span>
          {unreadNotifs > 0 && <span className="drawer-badge">{unreadNotifs}</span>}
          <FiChevronRight className="drawer-menu-chevron" />
        </button>
        <button className="drawer-menu-item" onClick={() => navigateTo('password')}>
          <FaLock className="drawer-menu-icon" />
          <span>Change Password</span>
          <FiChevronRight className="drawer-menu-chevron" />
        </button>
        <button className="drawer-menu-item" onClick={() => navigateTo('support')}>
          <FaHeadset className="drawer-menu-icon" />
          <span>Support</span>
          <FiChevronRight className="drawer-menu-chevron" />
        </button>
      </div>

      <button className="drawer-logout-btn" onClick={() => { handleClose(); onLogout() }}>
        <FiLogOut /> Logout
      </button>
    </div>
  )

  const renderProfile = () => (
    <div className="drawer-profile-view">
      <div className="drawer-profile-header">
        <div className="drawer-user-avatar large">
          {profileData.avatar ? (
            <img src={profileData.avatar} alt={user?.name || 'User'} className="profile-avatar-image" />
          ) : (
            user?.name?.charAt(0)?.toUpperCase() || 'U'
          )}
        </div>
        <h3>{user?.name}</h3>
        <p className="text-muted">
          <FiCalendar style={{ marginRight: 4 }} />
          Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'N/A'}
        </p>
        {!isEditing ? (
          <button className="btn btn-outline btn-sm" onClick={() => setIsEditing(true)} style={{ marginTop: 8 }}>
            <FiEdit2 /> Edit
          </button>
        ) : (
          <>
            <div className="profile-edit-actions" style={{ marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="btn btn-outline btn-sm" type="button" onClick={() => galleryInputRef.current?.click()}>
                <FiCamera /> Upload Photo
              </button>
              <button className="btn btn-outline btn-sm" type="button" onClick={() => cameraInputRef.current?.click()}>
                <FiCamera /> Use Camera
              </button>
              {profileData.avatar && (
                <button className="btn btn-outline btn-sm" type="button" onClick={handleAvatarRemove}>
                  <FiX /> Remove Photo
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={handleProfileSave} disabled={saving}>
                {saving ? <ImSpinner8 className="spinner-sm" /> : <FiSave />} Save
              </button>
              <button className="btn btn-outline btn-sm" onClick={handleCancelEdit}>
                <FiX /> Cancel
              </button>
            </div>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarInputChange}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleAvatarInputChange}
            />
          </>
        )}
      </div>

      <div className="drawer-profile-fields">
        <div className="profile-field">
          <label className="profile-field-label"><FiUser className="inline-icon" /> Name</label>
          {isEditing ? (
            <input type="text" name="name" value={profileData.name} onChange={e => setProfileData({...profileData, name: e.target.value})} className="form-input" />
          ) : (
            <p className="profile-field-value">{user?.name}</p>
          )}
        </div>
        <div className="profile-field">
          <label className="profile-field-label"><FiMail className="inline-icon" /> Email</label>
          {isEditing ? (
            <input type="email" name="email" value={profileData.email} onChange={e => setProfileData({...profileData, email: e.target.value})} className="form-input" />
          ) : (
            <p className="profile-field-value">{user?.email}</p>
          )}
        </div>
        <div className="profile-field">
          <label className="profile-field-label"><FiPhone className="inline-icon" /> Phone</label>
          {isEditing ? (
            <input type="tel" name="phone" value={profileData.phone} onChange={e => setProfileData({...profileData, phone: e.target.value})} className="form-input" />
          ) : (
            <p className="profile-field-value">{user?.phone || 'Not provided'}</p>
          )}
        </div>
        <div className="profile-field">
          <label className="profile-field-label"><FiMapPin className="inline-icon" /> Address</label>
          {isEditing ? (
            <textarea name="address" value={profileData.address} onChange={e => setProfileData({...profileData, address: e.target.value})} className="form-textarea" rows={2} />
          ) : (
            <p className="profile-field-value">{getUserAddress() || 'Not provided'}</p>
          )}
        </div>
      </div>
    </div>
  )

  const renderOrders = () => (
    <div className="drawer-orders-view">
      <div className="filter-tabs" style={{ marginBottom: 16 }}>
        {[{ label: 'All', value: 'all' }, { label: 'Active', value: 'active' }, { label: 'Delivered', value: 'delivered' }, { label: 'Cancelled', value: 'cancelled' }].map(tab => (
          <button key={tab.value} className={`filter-tab ${activeFilter === tab.value ? 'active' : ''}`} onClick={() => setActiveFilter(tab.value)}>
            {tab.label}
          </button>
        ))}
      </div>

      {ordersLoading ? (
        <div className="drawer-loader"><ImSpinner8 className="spinner" /></div>
      ) : filteredOrders.length === 0 ? (
        <div className="drawer-empty">
          <FiPackage className="drawer-empty-icon" />
          <h4>No orders found</h4>
          <p>{activeFilter === 'all' ? "You haven't placed any orders yet." : `No ${activeFilter} orders.`}</p>
          {activeFilter === 'all' && (
            <button className="btn btn-primary btn-sm" onClick={() => { handleClose(); navigate('/') }} style={{ marginTop: 12 }}>Browse Products</button>
          )}
        </div>
      ) : (
        <div className="drawer-orders-list">
          {filteredOrders.map(order => {
            const status = (order.orderStatus || 'placed').toLowerCase()
            const payStatus = (order.paymentStatus || 'pending').toLowerCase()
            const deliveryConfirmationPending = status === 'shipped' && !!order.deliveryConfirmationRequestedAt && !order.customerDeliveryConfirmed
            return (
              <div key={order.id} className={`order-list-card status-border-${status}`} onClick={() => { fetchOrderDetail(order.id); navigateTo('order-detail') }}>
                <div className="order-list-info">
                  <span className="order-list-number">#{order.orderNumber || order.id?.slice(-8)}</span>
                  <span className="order-list-meta">{formatDate(order.orderDate)} &middot; {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}</span>
                </div>
                <div className="order-list-right">
                  <span className="order-list-total">&#8377;{(order.total || 0).toFixed(2)}</span>
                  <span className={`order-status-badge status-${deliveryConfirmationPending ? 'awaiting_confirmation' : status}`}>
                    {deliveryConfirmationPending ? 'awaiting confirmation' : status}
                  </span>
                  <span className={`payment-badge ${payStatus === 'paid' ? 'payment-paid' : payStatus === 'verification pending' ? 'payment-verification' : 'payment-pending'}`}>
                    {payStatus === 'verification pending' ? 'verifying' : payStatus}
                  </span>
                  {(status === 'placed' || status === 'confirmed') && (
                    <button className="cancel-order-btn" onClick={(e) => { e.stopPropagation(); cancelOrder(order.id) }}>
                      <FiXCircle /> Cancel
                    </button>
                  )}
                  {deliveryConfirmationPending && (
                    <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); confirmDelivery(order.id) }}>
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
  )

  const renderOrderDetail = () => {
    if (orderDetailLoading || !selectedOrder) {
      return <div className="drawer-loader"><ImSpinner8 className="spinner" /></div>
    }
    const order = selectedOrder
    const status = (order.orderStatus || 'placed').toLowerCase()
    const payStatus = (order.paymentStatus || 'pending').toLowerCase()
    const isCancellable = status === 'placed' || status === 'confirmed'
    const deliveryConfirmationPending = status === 'shipped' && !!order.deliveryConfirmationRequestedAt && !order.customerDeliveryConfirmed
    const statusLabel = deliveryConfirmationPending ? 'awaiting confirmation' : status

    return (
      <div className="drawer-order-detail">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <span className={`order-status-badge status-${deliveryConfirmationPending ? 'awaiting_confirmation' : status}`}>{statusLabel}</span>
          <span className={`payment-badge ${payStatus === 'paid' ? 'payment-paid' : payStatus === 'verification pending' ? 'payment-verification' : 'payment-pending'}`}>
            {payStatus === 'verification pending' ? 'verifying' : payStatus}
          </span>
          {isCancellable && (
            <button className="cancel-order-btn" onClick={() => cancelOrder(order.id)}>
              <FiXCircle /> Cancel
            </button>
          )}
          {deliveryConfirmationPending && (
            <button className="btn btn-primary btn-sm" onClick={() => confirmDelivery(order.id)}>
              Confirm Delivery
            </button>
          )}
        </div>

        <p className="text-muted" style={{ marginBottom: 16, fontSize: 12 }}>{formatDateTime(order.orderDate)}</p>

        {deliveryConfirmationPending && (
          <div className="tracking-card" style={{ marginBottom: 16, border: '1px solid rgba(245, 158, 11, 0.25)', background: 'rgba(245, 158, 11, 0.06)' }}>
            <h4 className="tracking-card-title">Delivery Confirmation Required</h4>
            <p className="tracking-card-text" style={{ marginBottom: 12 }}>
              Please confirm only after receiving all items in this order.
            </p>
            <button className="btn btn-primary btn-block btn-sm" onClick={() => confirmDelivery(order.id)}>
              I Have Received This Order
            </button>
          </div>
        )}

        {status === 'cancelled' && (
          <div className="cancelled-banner" style={{ marginBottom: 16 }}>This order has been cancelled</div>
        )}

        {/* Timeline */}
        {order.statusHistory && order.statusHistory.length > 0 && (
          <div className="tracking-card" style={{ marginBottom: 16 }}>
            <h4 className="tracking-card-title">Status Timeline</h4>
            <div className="status-timeline">
              {order.statusHistory.map((entry, i) => (
                <div key={i} className="timeline-item">
                  <div className={`timeline-dot ${i === order.statusHistory.length - 1 ? 'current' : 'active'}`} />
                  <div className="timeline-status">{entry.status}</div>
                  {entry.timestamp && <div className="timeline-time">{formatDateTime(entry.timestamp)}</div>}
                  {entry.note && <div className="timeline-time">{entry.note}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="tracking-card" style={{ marginBottom: 16 }}>
          <h4 className="tracking-card-title">Items ({order.items?.length || 0})</h4>
          <div className="tracking-items-list">
            {(order.items || []).map((item, i) => (
              <div key={i} className="tracking-item">
                <img src={item.image || '/images/placeholder-drink.svg'} alt={item.name} className="tracking-item-image" onError={e => { e.target.src = '/images/placeholder-drink.svg' }} />
                <div className="tracking-item-info">
                  <p className="tracking-item-name">{item.name}</p>
                  <p className="tracking-item-qty">
                    {getCartItemSummary(item)} at &#8377;{(item.price || 0).toFixed(2)} {getCartItemUnitPriceLabel(item)}
                  </p>
                </div>
                <span className="tracking-item-price">&#8377;{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Price */}
        <div className="tracking-card" style={{ marginBottom: 16 }}>
          <h4 className="tracking-card-title">Price Breakdown</h4>
          <div className="summary-row"><span>Subtotal</span><span>&#8377;{(order.subtotal || 0).toFixed(2)}</span></div>
          <div className="summary-row"><span>Tax</span><span>&#8377;{(order.tax || 0).toFixed(2)}</span></div>
          <div className="summary-divider" />
          <div className="summary-row summary-total"><span>Total</span><span>&#8377;{(order.total || 0).toFixed(2)}</span></div>
        </div>

        {/* Delivery */}
        <div className="tracking-card">
          <h4 className="tracking-card-title">Delivery Info</h4>
          <p className="tracking-card-text" style={{ marginBottom: 8 }}>
            {typeof order.deliveryAddress === 'object'
              ? [order.deliveryAddress?.street, order.deliveryAddress?.city, order.deliveryAddress?.state, order.deliveryAddress?.pincode].filter(Boolean).join(', ')
              : order.deliveryAddress || 'Not available'}
          </p>
          <p className="text-muted" style={{ fontSize: 12 }}>{order.customerName || '-'} &middot; {order.customerPhone || '-'}</p>
          {order.paymentMethod && <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Payment: {order.paymentMethod}</p>}
        </div>
      </div>
    )
  }

  const renderPayments = () => (
    <div className="drawer-payments-view">
      {paymentsLoading ? (
        <div className="drawer-loader"><ImSpinner8 className="spinner" /></div>
      ) : !paymentSummary ? (
        <div className="drawer-empty">
          <FiDollarSign className="drawer-empty-icon" />
          <h4>No payment data</h4>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="drawer-payment-summary">
            <div className="drawer-payment-stat">
              <p className="stat-label">Total Paid</p>
              <p className="stat-value" style={{ color: 'var(--success)' }}>&#8377;{(paymentSummary.totalPaid || 0).toFixed(2)}</p>
            </div>
            <div className="drawer-payment-stat">
              <p className="stat-label">Outstanding</p>
              <p className="stat-value" style={{ color: paymentSummary.outstanding > 0 ? 'var(--danger)' : 'var(--success)' }}>
                &#8377;{(paymentSummary.outstanding || 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Payment history entries */}
          {paymentSummary.paymentHistory && paymentSummary.paymentHistory.length > 0 ? (
            <div className="drawer-payment-list">
              {paymentSummary.paymentHistory.map(entry => (
                <div key={entry.id} className="drawer-payment-entry">
                  <div className="drawer-payment-entry-icon" style={{
                    background: entry.type === 'debit' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    color: entry.type === 'debit' ? '#ef4444' : '#22c55e'
                  }}>
                    {entry.type === 'debit' ? <FiArrowUpRight /> : <FiArrowDownLeft />}
                  </div>
                  <div className="drawer-payment-entry-info">
                    <p className="drawer-payment-entry-desc">{entry.description}</p>
                    <p className="drawer-payment-entry-date">{formatDateTime(entry.createdAt)}</p>
                  </div>
                  <span className="drawer-payment-entry-amount" style={{ color: entry.type === 'debit' ? '#ef4444' : '#22c55e' }}>
                    {entry.type === 'debit' ? '+' : '-'}&#8377;{entry.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="drawer-empty" style={{ paddingTop: 24 }}>
              <p>No payment history yet.</p>
            </div>
          )}
        </>
      )}
    </div>
  )

  const renderClearance = () => (
    <div className="drawer-clearance-view">
      {paymentsLoading ? (
        <div className="drawer-loader"><ImSpinner8 className="spinner" /></div>
      ) : (
        <>
          {/* Request form */}
          <div className="drawer-clearance-form">
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Request Payment Clearance</h4>
            <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Outstanding: &#8377;{(paymentSummary?.outstanding || outstanding || 0).toFixed(2)}
            </p>
            <div className="outstanding-clear-input-wrap" style={{ marginBottom: 12 }}>
              <span className="outstanding-clear-rupee">&#8377;</span>
              <input type="number" className="outstanding-clear-input" placeholder="Amount" value={clearAmount}
                onChange={e => setClearAmount(e.target.value)} onWheel={(e) => e.target.blur()} min={1} max={paymentSummary?.outstanding || outstanding} />
            </div>
            <button className="btn btn-primary btn-block btn-sm" onClick={requestClearance} disabled={requesting}>
              {requesting ? 'Sending...' : 'Send Request'}
            </button>
          </div>

          {/* Existing requests */}
          {paymentSummary?.clearanceRequests && paymentSummary.clearanceRequests.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ fontSize: 14, marginBottom: 12 }}>Previous Requests</h4>
              {paymentSummary.clearanceRequests.map(req => (
                <div key={req.id} className="drawer-clearance-item">
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>&#8377;{(req.amount || 0).toFixed(2)}</span>
                    <span className="text-muted" style={{ fontSize: 11, marginLeft: 8 }}>
                      {new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                  <span className="drawer-clearance-status" style={{
                    color: req.status === 'approved' ? '#22c55e' : req.status === 'rejected' ? '#ef4444' : '#f59e0b'
                  }}>
                    {req.status === 'pending' && <FiClock />}
                    {req.status === 'approved' && <FiCheckCircle />}
                    {req.status === 'rejected' && <FiXCircle />}
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )

  const renderNotifications = () => (
    <div className="drawer-notifications-view">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="filter-tabs" style={{ marginBottom: 0 }}>
          <button className={`filter-tab ${notifFilter === 'all' ? 'active' : ''}`} onClick={() => setNotifFilter('all')}>
            All ({notifications.length})
          </button>
          <button className={`filter-tab ${notifFilter === 'unread' ? 'active' : ''}`} onClick={() => setNotifFilter('unread')}>
            Unread ({localUnreadCount})
          </button>
        </div>
        {localUnreadCount > 0 && (
          <button className="btn btn-sm btn-outline" onClick={markAllRead} style={{ fontSize: 11, padding: '4px 8px' }}>
            <FiCheck /> All
          </button>
        )}
      </div>

      {notifsLoading ? (
        <div className="drawer-loader"><ImSpinner8 className="spinner" /></div>
      ) : filteredNotifs.length === 0 ? (
        <div className="drawer-empty">
          <FiBell className="drawer-empty-icon" />
          <h4>{notifFilter === 'unread' ? 'All caught up!' : 'No notifications'}</h4>
        </div>
      ) : (
        <div className="drawer-notif-list">
          {filteredNotifs.map(notif => (
            <div
              key={notif.id}
              className={`notification-card ${!notif.isRead ? 'unread' : ''}`}
              onClick={() => openOrderFromNotification(notif)}
              style={{ cursor: parseOrderRef(`${notif.title || ''} ${notif.message || ''}`) ? 'pointer' : 'default' }}
            >
              <div className={`notification-card-icon ${getNotifIconClass(notif.type)}`}>
                {getNotifIcon(notif.type)}
              </div>
              <div className="notification-card-body">
                <p className="notification-card-title">{notif.title}</p>
                <p className="notification-card-message">{notif.message}</p>
                <span className="notification-card-time">{timeAgo(notif.createdAt)}</span>
              </div>
              {!notif.isRead && (
                <div className="notification-card-actions">
                  <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); markAsRead(notif.id) }} title="Mark as read">
                    <FiCheck />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderPassword = () => (
    <div className="drawer-password-view">
      <form onSubmit={handleChangePassword} className="password-form">
        <div className="form-group">
          <label className="form-label">Current Password</label>
          <input type="password" name="currentPassword" value={passwordData.currentPassword}
            onChange={e => setPasswordData({...passwordData, currentPassword: e.target.value})} className="form-input" placeholder="Current password" />
        </div>
        <div className="form-group">
          <label className="form-label">New Password</label>
          <input type="password" name="newPassword" value={passwordData.newPassword}
            onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})} className="form-input" placeholder="New password" />
        </div>
        <div className="form-group">
          <label className="form-label">Confirm New Password</label>
          <input type="password" name="confirmPassword" value={passwordData.confirmPassword}
            onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})} className="form-input" placeholder="Confirm password" />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={changingPassword}>
          {changingPassword ? <><ImSpinner8 className="spinner-sm" /> Updating...</> : 'Update Password'}
        </button>
      </form>
    </div>
  )

  const renderSupport = () => {
    const contact = settings?.contact || {}
    const social = settings?.social || {}
    const siteName = settings?.siteName || 'Noor Coldrinks'
    const about = settings?.about || 'Your one-stop shop for refreshing cold drinks delivered to your doorstep.'

    const infoStyle = { display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 0', borderBottom: '1px solid var(--border)' }
    const iconStyle = { color: '#E23744', fontSize: '18px', marginTop: '2px', flexShrink: 0 }
    const labelStyle = { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }
    const valueStyle = { fontSize: '14px', color: 'var(--dark)', fontWeight: 500, lineHeight: 1.5 }

    return (
      <div style={{ padding: '0 4px' }}>
        <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
          <h3 style={{ color: 'var(--dark)', fontSize: '18px', margin: 0 }}>{siteName}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '8px 0 0', lineHeight: 1.5 }}>{about}</p>
        </div>

        <div style={infoStyle}>
          <FiMapPin style={iconStyle} />
          <div>
            <p style={labelStyle}>Address</p>
            <p style={valueStyle}>{contact.address || 'Not available'}</p>
          </div>
        </div>

        <div style={infoStyle}>
          <FiPhone style={iconStyle} />
          <div>
            <p style={labelStyle}>Phone</p>
            <p style={valueStyle}>{contact.phone || 'Not available'}</p>
          </div>
        </div>

        <div style={infoStyle}>
          <FiMail style={iconStyle} />
          <div>
            <p style={labelStyle}>Email</p>
            <p style={valueStyle}>{contact.email || 'Not available'}</p>
          </div>
        </div>

        {(social.instagram || social.facebook || social.twitter || social.youtube) && (
          <div style={{ padding: '16px 0', textAlign: 'center' }}>
            <p style={{ ...labelStyle, marginBottom: '12px' }}>Follow Us</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
              {social.instagram && <a href={social.instagram} target="_blank" rel="noreferrer" style={{ color: '#E23744', fontSize: '22px' }}>IG</a>}
              {social.facebook && <a href={social.facebook} target="_blank" rel="noreferrer" style={{ color: '#E23744', fontSize: '22px' }}>FB</a>}
              {social.twitter && <a href={social.twitter} target="_blank" rel="noreferrer" style={{ color: '#E23744', fontSize: '22px' }}>X</a>}
              {social.youtube && <a href={social.youtube} target="_blank" rel="noreferrer" style={{ color: '#E23744', fontSize: '22px' }}>YT</a>}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderActiveView = () => {
    switch (activeView) {
      case 'menu': return renderMenu()
      case 'profile': return renderProfile()
      case 'orders': return renderOrders()
      case 'order-detail': return renderOrderDetail()
      case 'payments': return renderPayments()
      case 'clearance': return renderClearance()
      case 'notifications': return renderNotifications()
      case 'password': return renderPassword()
      case 'support': return renderSupport()
      default: return renderMenu()
    }
  }

  return (
    <>
      <div className={`drawer-overlay ${isOpen ? 'open' : ''}`} onClick={handleClose} />
      <div className={`drawer-panel ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="drawer-header">
          {activeView !== 'menu' ? (
            <button className="drawer-header-btn" onClick={goBack}>
              <FiArrowLeft />
            </button>
          ) : (
            <div style={{ width: 36 }} />
          )}
          <h3 className="drawer-header-title">{getTitle()}</h3>
          <button className="drawer-header-btn" onClick={handleClose}>
            <FiX />
          </button>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {renderActiveView()}
        </div>
      </div>
      <ImageCropModal isOpen={showCrop} onClose={() => setShowCrop(false)} imageSrc={cropSrc} onCropDone={handleCropDone} aspect={1} />
    </>
  )
}

export default SideDrawer
  const openOrderFromNotification = async (notif) => {
    const orderRef = parseOrderRef(`${notif.title || ''} ${notif.message || ''}`)
    if (!orderRef) {
      if (!notif.isRead) await markAsRead(notif.id)
      return
    }
    if (!notif.isRead) await markAsRead(notif.id)
    await fetchOrderDetail(orderRef)
    navigateTo('order-detail')
  }
