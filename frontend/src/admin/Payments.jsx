import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import {
  FaRupeeSign, FaClock, FaCalendarAlt, FaMoneyBillWave, FaBell,
  FaHistory, FaSearch, FaPlus, FaCheckCircle, FaTimesCircle, FaHourglassHalf
} from 'react-icons/fa'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'

const Payments = () => {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const styles = getStyles(c)

  const [loading, setLoading] = useState(true)
  const [todayCollection, setTodayCollection] = useState(0)
  const [pendingCollection, setPendingCollection] = useState(0)
  const [monthlyTotal, setMonthlyTotal] = useState(0)
  const [outstandingBalances, setOutstandingBalances] = useState([])
  const [filteredBalances, setFilteredBalances] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentHistory, setPaymentHistory] = useState([])
  const [recording, setRecording] = useState(false)
  const [activeTab, setActiveTab] = useState('outstanding')
  const [clearanceRequests, setClearanceRequests] = useState([])
  const [processingRequest, setProcessingRequest] = useState(null)
  const [onlinePaymentOrders, setOnlinePaymentOrders] = useState([])
  const [verifyingOrder, setVerifyingOrder] = useState(null)
  const [onlinePaymentHistory, setOnlinePaymentHistory] = useState([])
  const [onlineHistoryFilter, setOnlineHistoryFilter] = useState('all')
  const [allHistory, setAllHistory] = useState([])
  const [allHistoryFilter, setAllHistoryFilter] = useState('all')
  const [offlineSales, setOfflineSales] = useState([])
  const [offlinePending, setOfflinePending] = useState(0)

  useEffect(() => {
    fetchPaymentData()
    fetchClearanceRequests()
    fetchOnlinePaymentOrders()
    fetchOnlinePaymentHistory()
    fetchAllHistory()
    fetchOfflineSales()
  }, [])

  const fetchOfflineSales = async () => {
    try {
      const res = await API.get('/offline-sales')
      const sales = Array.isArray(res.data) ? res.data : (res.data?.data || [])
      setOfflineSales(sales)
      const pending = sales.filter(s => s.paymentStatus === 'Pending').reduce((sum, s) => sum + (Number(s.total) || 0), 0)
      setOfflinePending(pending)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      setFilteredBalances(outstandingBalances.filter(c =>
        c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
      ))
    } else {
      setFilteredBalances(outstandingBalances)
    }
  }, [outstandingBalances, searchQuery])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const customerId = params.get('customerId')
    const action = params.get('action')
    const tab = params.get('tab')

    if (tab) {
      setActiveTab(tab)
    }

    if (!customerId || outstandingBalances.length === 0) return

    const match = outstandingBalances.find((customer) => customer._id === customerId)
    if (!match) return

    setActiveTab('outstanding')
    setSearchQuery(match.phone || match.name || '')

    if (action === 'collect') {
      openPaymentModal(match)
      navigate('/admin/payments', { replace: true })
    }
  }, [location.search, outstandingBalances])

  const fetchPaymentData = async () => {
    try {
      setLoading(true)

      // Try dedicated payment endpoint first, fallback to aggregating from orders
      try {
        const response = await API.get('/payments/stats')
        const stats = response.data?.data || response.data || {}
        setTodayCollection(stats.todayCollection || 0)
        setPendingCollection(stats.pendingCollection || 0)
        setMonthlyTotal(stats.monthlyTotal || 0)
        setOutstandingBalances(stats.outstandingBalances || [])
      } catch {
        // Fallback: aggregate from orders
        const ordersRes = await API.get('/orders')
        const orders = ordersRes.data.orders || ordersRes.data || []

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

        let todayTotal = 0
        let pending = 0
        let monthly = 0
        const customerMap = {}

        orders.forEach(order => {
          const orderDate = new Date(order.createdAt)
          const amount = order.totalAmount || order.total || 0
          const paid = order.paidAmount || (order.paymentStatus === 'paid' ? amount : 0)
          const orderPending = amount - paid

          if (orderDate >= today && order.paymentStatus === 'paid') {
            todayTotal += amount
          }
          if (order.paymentStatus !== 'paid') {
            pending += orderPending
          }
          if (orderDate >= monthStart && order.paymentStatus === 'paid') {
            monthly += paid
          }

          const customerId = order.customer?._id || order.customerId || 'unknown'
          const customerName = order.customer?.name || order.customerName || 'Unknown'
          const customerPhone = order.customer?.phone || order.customerPhone || ''

          if (!customerMap[customerId]) {
            customerMap[customerId] = {
              _id: customerId,
              name: customerName,
              phone: customerPhone,
              totalOrders: 0,
              totalAmount: 0,
              paid: 0,
              pending: 0
            }
          }
          customerMap[customerId].totalOrders += 1
          customerMap[customerId].totalAmount += amount
          customerMap[customerId].paid += paid
          customerMap[customerId].pending += orderPending
        })

        setTodayCollection(todayTotal)
        setPendingCollection(pending)
        setMonthlyTotal(monthly)
        setOutstandingBalances(
          Object.values(customerMap).filter(c => c.pending > 0)
        )
      }
    } catch (error) {
      console.error('Failed to fetch payment data:', error)
      toast.error('Failed to load payment data')
    } finally {
      setLoading(false)
    }
  }

  const fetchClearanceRequests = async () => {
    try {
      const response = await API.get('/payments/clear-requests')
      setClearanceRequests(response.data?.data || response.data || [])
    } catch {
      // ignore
    }
  }

  const fetchOnlinePaymentOrders = async () => {
    try {
      const response = await API.get('/orders')
      const orders = response.data?.orders || response.data || []
      setOnlinePaymentOrders(orders.filter(o => o.paymentStatus === 'Verification Pending'))
    } catch {
      // ignore
    }
  }

  const fetchOnlinePaymentHistory = async () => {
    try {
      const response = await API.get('/payments/online-history')
      setOnlinePaymentHistory(response.data?.onlinePayments || [])
    } catch {
      setOnlinePaymentHistory([])
    }
  }

  const fetchAllHistory = async () => {
    try {
      const response = await API.get('/payments/all-history')
      setAllHistory(Array.isArray(response.data) ? response.data : [])
    } catch {
      setAllHistory([])
    }
  }

  const verifyOnlinePayment = async (orderId) => {
    try {
      setVerifyingOrder(orderId)
      await API.put(`/orders/${orderId}/status`, { paymentStatus: 'Paid' })
      toast.success('Payment verified!')
      fetchOnlinePaymentOrders()
      fetchOnlinePaymentHistory()
      fetchPaymentData()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to verify payment')
    } finally {
      setVerifyingOrder(null)
    }
  }

  const rejectOnlinePayment = async (orderId) => {
    try {
      setVerifyingOrder(orderId)
      await API.put(`/orders/${orderId}/status`, { paymentStatus: 'Rejected' })
      toast.success('Payment rejected')
      fetchOnlinePaymentOrders()
      fetchOnlinePaymentHistory()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reject payment')
    } finally {
      setVerifyingOrder(null)
    }
  }

  const handleClearanceAction = async (requestId, action) => {
    try {
      setProcessingRequest(requestId)
      await API.put(`/payments/clear-request/${requestId}`, { action })
      toast.success(`Request ${action}d`)
      fetchClearanceRequests()
      fetchPaymentData()
    } catch (error) {
      toast.error(`Failed to ${action} request`)
    } finally {
      setProcessingRequest(null)
    }
  }

  const openPaymentModal = (customer) => {
    setSelectedCustomer(customer)
    setPaymentAmount('')
    setPaymentMethod('cash')
    setShowPaymentModal(true)
  }

  const recordPayment = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    try {
      setRecording(true)
      await API.post('/payments/record', {
        customerId: selectedCustomer._id,
        amount: Number(paymentAmount),
        method: paymentMethod
      })
      toast.success('Payment recorded successfully')
      setShowPaymentModal(false)
      fetchPaymentData()
      fetchAllHistory()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to record payment')
    } finally {
      setRecording(false)
    }
  }

  const sendReminder = async (customer) => {
    try {
      await API.post('/notifications/send', {
        type: 'payment',
        targetUserId: customer._id,
        title: 'Payment Reminder',
        message: `You have an outstanding balance of ${formatCurrency(customer.pending)}. Please make the payment at the earliest.`
      })
      toast.success('Reminder sent successfully')
    } catch (error) {
      toast.error('Failed to send reminder')
    }
  }

  const viewHistory = async (customer) => {
    setSelectedCustomer(customer)
    try {
      const response = await API.get(`/payments/history/${customer._id}`)
      setPaymentHistory(response.data.payments || response.data || [])
    } catch {
      setPaymentHistory([])
    }
    setShowHistoryModal(true)
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0)
  }

  const statCards = [
    {
      label: "Today's Collections",
      value: formatCurrency(todayCollection),
      icon: <FaRupeeSign />,
      color: '#22c55e',
      bg: 'rgba(34, 197, 94, 0.1)'
    },
    {
      label: 'Pending Collections',
      value: formatCurrency(pendingCollection),
      icon: <FaClock />,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.1)'
    },
    {
      label: 'Offline Pending (Udhar)',
      value: formatCurrency(offlinePending),
      icon: <FaMoneyBillWave />,
      color: '#fc8019',
      bg: 'rgba(252, 128, 25, 0.1)'
    },
    {
      label: 'Monthly Total',
      value: formatCurrency(monthlyTotal),
      icon: <FaCalendarAlt />,
      color: '#0ea5e9',
      bg: 'rgba(14, 165, 233, 0.1)'
    }
  ]

  if (loading) {
    return (
      <AdminLayout>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading payments...</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div style={styles.page}>
        <h1 style={styles.title}>Payments</h1>

        {/* Stat Cards */}
        <div style={styles.statsGrid}>
          {statCards.map((card, index) => (
            <div key={index} style={{ ...styles.statCard, borderLeft: `4px solid ${card.color}` }}>
              <div style={{ ...styles.statIcon, background: card.bg, color: card.color }}>
                {card.icon}
              </div>
              <div>
                <div style={styles.statValue}>{card.value}</div>
                <div style={styles.statLabel}>{card.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === 'outstanding' ? styles.tabBtnActive : {}) }}
            onClick={() => setActiveTab('outstanding')}
          >
            Outstanding Balances
          </button>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === 'online' ? styles.tabBtnActive : {}) }}
            onClick={() => setActiveTab('online')}
          >
            Online Payments {onlinePaymentOrders.length > 0 && `(${onlinePaymentOrders.length})`}
          </button>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === 'clearance' ? styles.tabBtnActive : {}) }}
            onClick={() => setActiveTab('clearance')}
          >
            Clearance Requests {clearanceRequests.filter(r => r.status === 'pending').length > 0 && `(${clearanceRequests.filter(r => r.status === 'pending').length})`}
          </button>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === 'onlineHistory' ? styles.tabBtnActive : {}) }}
            onClick={() => setActiveTab('onlineHistory')}
          >
            Online History {onlinePaymentHistory.length > 0 && `(${onlinePaymentHistory.length})`}
          </button>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === 'allHistory' ? styles.tabBtnActive : {}) }}
            onClick={() => setActiveTab('allHistory')}
          >
            All History {allHistory.length > 0 && `(${allHistory.length})`}
          </button>
        </div>

        {/* Clearance Requests */}
        {activeTab === 'clearance' && (
          <div style={styles.sectionCard}>
            <h3 style={{ ...styles.sectionTitle, marginBottom: '16px' }}>Payment Clearance Requests</h3>
            {clearanceRequests.length === 0 ? (
              <p style={{ color: c.textSecondary, fontSize: '14px', textAlign: 'center', padding: '20px' }}>No clearance requests</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {clearanceRequests.map(req => (
                  <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: c.bg, borderRadius: '8px', border: `1px solid ${c.border}` }}>
                    <div>
                      <div style={{ color: c.text, fontWeight: '500', fontSize: '14px' }}>{req.userName}</div>
                      <div style={{ color: c.textSecondary, fontSize: '12px' }}>{req.userPhone} &middot; {formatCurrency(req.amount)}</div>
                      <div style={{ color: c.textSecondary, fontSize: '11px' }}>{new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {req.status === 'pending' ? (
                        <>
                          <button
                            style={{ ...styles.recordBtn, opacity: processingRequest === req.id ? 0.5 : 1 }}
                            onClick={() => handleClearanceAction(req.id, 'approve')}
                            disabled={processingRequest === req.id}
                          >
                            Approve
                          </button>
                          <button
                            style={{ ...styles.reminderBtn, opacity: processingRequest === req.id ? 0.5 : 1 }}
                            onClick={() => handleClearanceAction(req.id, 'reject')}
                            disabled={processingRequest === req.id}
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span style={{ color: req.status === 'approved' ? '#22c55e' : '#ef4444', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>
                          {req.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Online Payment Verification */}
        {activeTab === 'online' && (
          <div style={styles.sectionCard}>
            <h3 style={{ ...styles.sectionTitle, marginBottom: '16px' }}>Online Payment Verification</h3>
            {onlinePaymentOrders.length === 0 ? (
              <p style={{ color: c.textSecondary, fontSize: '14px', textAlign: 'center', padding: '20px' }}>No pending online payment requests</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {onlinePaymentOrders.map(order => (
                  <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: c.bg, borderRadius: '10px', border: `1px solid ${c.border}`, flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ color: c.text, fontWeight: '600', fontSize: '15px' }}>
                        {order.orderNumber || order.id}
                      </div>
                      <div style={{ color: c.textSecondary, fontSize: '13px', marginTop: '2px' }}>
                        {order.userName || order.customerName || 'Customer'} &middot; {order.userPhone || order.customerPhone || ''}
                      </div>
                      <div style={{ color: c.textSecondary, fontSize: '12px', marginTop: '2px' }}>
                        {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '12px', color: c.textSecondary }}>
                        Items: {(order.items || []).map(i => `${i.name || i.productName} x${i.quantity}`).join(', ')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '120px' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: '#0ea5e9' }}>
                        {formatCurrency(order.total || order.totalAmount || 0)}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                        <button
                          style={{ ...styles.recordBtn, padding: '8px 16px', fontSize: '13px', fontWeight: '600', opacity: verifyingOrder === order.id ? 0.5 : 1 }}
                          onClick={() => verifyOnlinePayment(order.id)}
                          disabled={verifyingOrder === order.id}
                        >
                          Accept
                        </button>
                        <button
                          style={{ ...styles.reminderBtn, padding: '8px 16px', fontSize: '13px', fontWeight: '600', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', opacity: verifyingOrder === order.id ? 0.5 : 1 }}
                          onClick={() => rejectOnlinePayment(order.id)}
                          disabled={verifyingOrder === order.id}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Online Payment History */}
        {activeTab === 'onlineHistory' && (
          <div style={styles.sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ ...styles.sectionTitle }}>Online Payment History</h3>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['all', 'Paid', 'Rejected', 'Verification Pending'].map(f => (
                  <button
                    key={f}
                    style={{
                      padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', border: '1px solid',
                      ...(onlineHistoryFilter === f
                        ? { background: '#0ea5e9', color: '#fff', borderColor: '#0ea5e9' }
                        : { background: c.bg, color: c.textSecondary, borderColor: c.border })
                    }}
                    onClick={() => setOnlineHistoryFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'Verification Pending' ? 'Pending' : f}
                  </button>
                ))}
              </div>
            </div>
            {(() => {
              const filtered = onlineHistoryFilter === 'all'
                ? onlinePaymentHistory
                : onlinePaymentHistory.filter(o => o.paymentStatus === onlineHistoryFilter)
              return filtered.length === 0 ? (
                <p style={{ color: c.textSecondary, fontSize: '14px', textAlign: 'center', padding: '20px' }}>No online payment records found</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filtered.map(order => (
                    <div key={order.id} style={{
                      padding: '16px', background: c.bg, borderRadius: '10px', border: `1px solid ${c.border}`,
                      borderLeft: `4px solid ${order.paymentStatus === 'Paid' ? '#22c55e' : order.paymentStatus === 'Rejected' ? '#ef4444' : '#f59e0b'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ color: c.text, fontWeight: '600', fontSize: '15px' }}>
                              {order.orderNumber || order.id}
                            </span>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                              ...(order.paymentStatus === 'Paid'
                                ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }
                                : order.paymentStatus === 'Rejected'
                                ? { background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }
                                : { background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' })
                            }}>
                              {order.paymentStatus === 'Paid' ? <FaCheckCircle /> : order.paymentStatus === 'Rejected' ? <FaTimesCircle /> : <FaHourglassHalf />}
                              {order.paymentStatus === 'Verification Pending' ? 'Pending' : order.paymentStatus}
                            </span>
                          </div>
                          <div style={{ color: c.textSecondary, fontSize: '13px' }}>
                            {order.userName} &middot; {order.userPhone}
                          </div>
                          <div style={{ color: c.textSecondary, fontSize: '12px', marginTop: '4px' }}>
                            Items: {(order.items || []).map(i => `${i.name || i.productName} x${i.quantity}`).join(', ')}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: '150px' }}>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#0ea5e9' }}>
                            {formatCurrency(order.total)}
                          </div>
                        </div>
                      </div>
                      {/* Timestamps */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${c.border}` }}>
                        <div style={{ fontSize: '12px', color: c.textSecondary }}>
                          <span style={{ fontWeight: '600' }}>Order Date:</span>{' '}
                          {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {order.paymentVerifiedAt && (
                          <div style={{ fontSize: '12px', color: '#22c55e' }}>
                            <span style={{ fontWeight: '600' }}>Accepted:</span>{' '}
                            {new Date(order.paymentVerifiedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        {order.paymentRejectedAt && (
                          <div style={{ fontSize: '12px', color: '#ef4444' }}>
                            <span style={{ fontWeight: '600' }}>Rejected:</span>{' '}
                            {new Date(order.paymentRejectedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}

        {/* All Payment History */}
        {activeTab === 'allHistory' && (
          <div style={styles.sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={styles.sectionTitle}>All Payment History</h3>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['all', 'credit', 'debit', 'rejected'].map(f => (
                  <button key={f} onClick={() => setAllHistoryFilter(f)}
                    style={{ ...styles.filterBtn, ...(allHistoryFilter === f ? styles.filterBtnActive : {}) }}>
                    {f === 'all' ? 'All' : f === 'credit' ? 'Paid' : f === 'debit' ? 'Outstanding Added' : 'Rejected'}
                  </button>
                ))}
              </div>
            </div>
            {allHistory.filter(h => allHistoryFilter === 'all' || h.type === allHistoryFilter).length === 0 ? (
              <p style={styles.emptyText}>No payment records found</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>DATE</th>
                      <th style={styles.th}>CUSTOMER</th>
                      <th style={styles.th}>TYPE</th>
                      <th style={styles.th}>METHOD</th>
                      <th style={styles.th}>AMOUNT</th>
                      <th style={styles.th}>DESCRIPTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allHistory.filter(h => allHistoryFilter === 'all' || h.type === allHistoryFilter).map((h) => (
                      <tr key={h.id} style={styles.tr}>
                        <td style={styles.td}>{new Date(h.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 600 }}>{h.customerName}</div>
                          <div style={{ fontSize: '12px', color: c.textMuted }}>{h.customerPhone}</div>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                            background: h.type === 'credit' ? 'rgba(34,197,94,0.15)' : h.type === 'debit' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
                            color: h.type === 'credit' ? '#22c55e' : h.type === 'debit' ? '#ef4444' : '#eab308'
                          }}>
                            {h.type === 'credit' ? 'Paid' : h.type === 'debit' ? 'Outstanding' : 'Rejected'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{ textTransform: 'capitalize' }}>{h.method || '-'}</span>
                        </td>
                        <td style={{ ...styles.td, fontWeight: 700, color: h.type === 'credit' ? '#22c55e' : '#ef4444' }}>
                          {h.type === 'credit' ? '+' : '-'}{formatCurrency(h.amount)}
                        </td>
                        <td style={{ ...styles.td, fontSize: '12px', color: c.textMuted, maxWidth: '250px' }}>
                          {h.description}
                          {h.orderNumber && <span style={{ marginLeft: '4px', color: c.primary }}>({h.orderNumber})</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Outstanding Balances */}
        {activeTab === 'outstanding' && (
        <div style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Outstanding Balances</h3>
            <div style={styles.searchWrapper}>
              <FaSearch style={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>Phone</th>
                  <th style={styles.th}>Orders</th>
                  <th style={styles.th}>Total Amount</th>
                  <th style={styles.th}>Paid</th>
                  <th style={styles.th}>Pending</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBalances.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={styles.emptyCell}>No outstanding balances</td>
                  </tr>
                ) : (
                  filteredBalances.map((customer) => (
                    <tr key={customer._id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight: '500', color: c.text }}>
                        {customer.name}
                      </td>
                      <td style={styles.td}>{customer.phone || 'N/A'}</td>
                      <td style={styles.td}>{customer.totalOrders}</td>
                      <td style={styles.td}>{formatCurrency(customer.totalAmount)}</td>
                      <td style={{ ...styles.td, color: '#22c55e' }}>
                        {formatCurrency(customer.paid)}
                      </td>
                      <td style={{ ...styles.td, color: '#ef4444', fontWeight: '600' }}>
                        {formatCurrency(customer.pending)}
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionButtons}>
                          <button
                            style={styles.recordBtn}
                            onClick={() => openPaymentModal(customer)}
                            title="Record Payment"
                          >
                            <FaMoneyBillWave />
                          </button>
                          <button
                            style={styles.reminderBtn}
                            onClick={() => sendReminder(customer)}
                            title="Send Reminder"
                          >
                            <FaBell />
                          </button>
                          <button
                            style={styles.historyBtn}
                            onClick={() => viewHistory(customer)}
                            title="View History"
                          >
                            <FaHistory />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        )}

        {/* Record Payment Modal */}
        {showPaymentModal && selectedCustomer && (
          <Modal onClose={() => setShowPaymentModal(false)}>
            <div style={styles.modalContent}>
              <h2 style={styles.modalTitle}>Record Payment</h2>
              <p style={styles.modalSubtext}>
                Customer: <strong>{selectedCustomer.name}</strong>
              </p>
              <p style={styles.modalSubtext}>
                Outstanding: <strong style={{ color: '#ef4444' }}>{formatCurrency(selectedCustomer.pending)}</strong>
              </p>
              <p style={{ fontSize: 11, color: c.textSecondary, margin: '4px 0 12px' }}>
                Note: Ye amount customer ke total outstanding (online + offline udhar) se kat jayega.
              </p>

              <div style={styles.formGroup}>
                <label style={styles.label}>Amount</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  onWheel={(e) => e.target.blur()}
                  style={styles.input}
                  placeholder="Enter amount"
                  max={selectedCustomer.pending}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={styles.input}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="card">Card</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div style={styles.modalFooter}>
                <button style={styles.cancelBtn} onClick={() => setShowPaymentModal(false)}>Cancel</button>
                <button style={styles.saveBtn} onClick={recordPayment} disabled={recording}>
                  {recording ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Payment History Modal */}
        {showHistoryModal && selectedCustomer && (
          <Modal onClose={() => setShowHistoryModal(false)}>
            <div style={styles.modalContent}>
              <h2 style={styles.modalTitle}>Payment History</h2>
              <p style={styles.modalSubtext}>Customer: <strong>{selectedCustomer.name}</strong></p>

              <div style={styles.historyList}>
                {paymentHistory.length === 0 ? (
                  <p style={styles.emptyHistory}>No payment history found</p>
                ) : (
                  paymentHistory.map((payment, idx) => {
                    // Detect source: offline (SALE-prefix or description) vs online (ORD-prefix)
                    const ref = payment.orderId || payment.saleId || payment.description || ''
                    const isOffline = /SALE-|offline/i.test(ref) || payment.source === 'offline'
                    const isCredit = payment.type === 'credit' || payment.method !== 'Udhar'
                    return (
                      <div key={idx} style={styles.historyItem}>
                        <div style={styles.historyLeft}>
                          <FaMoneyBillWave style={{ color: isCredit ? '#22c55e' : '#ef4444' }} />
                          <div>
                            <div style={styles.historyAmount}>{formatCurrency(payment.amount)}</div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                              <span style={styles.historyMethod}>{payment.method || 'cash'}</span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                background: isOffline ? 'rgba(252,128,25,0.15)' : 'rgba(59,130,246,0.15)',
                                color: isOffline ? '#fc8019' : '#3b82f6'
                              }}>{isOffline ? 'OFFLINE' : 'ONLINE'}</span>
                            </div>
                          </div>
                        </div>
                        <div style={styles.historyDate}>
                          {new Date(payment.date || payment.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div style={styles.modalFooter}>
                <button style={styles.cancelBtn} onClick={() => setShowHistoryModal(false)}>Close</button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AdminLayout>
  )
}

const getStyles = (c) => ({
  page: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: c.text,
    margin: '0 0 24px 0'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
    marginBottom: '24px'
  },
  statCard: {
    background: c.surface,
    borderRadius: '12px',
    padding: '20px',
    border: `1px solid ${c.border}`,
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  statIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
    flexShrink: 0
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: c.text
  },
  statLabel: {
    fontSize: '13px',
    color: c.textSecondary,
    marginTop: '2px'
  },
  sectionCard: {
    background: c.surface,
    borderRadius: '12px',
    padding: '20px',
    border: `1px solid ${c.border}`
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '12px'
  },
  sectionTitle: {
    color: c.text,
    fontSize: '16px',
    fontWeight: '600',
    margin: 0
  },
  searchWrapper: {
    position: 'relative',
    minWidth: '220px'
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: c.textSecondary,
    fontSize: '13px'
  },
  searchInput: {
    width: '100%',
    padding: '8px 14px 8px 34px',
    border: `1px solid ${c.border}`,
    borderRadius: '6px',
    background: c.bg,
    color: c.text,
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  tableWrapper: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    color: c.textSecondary,
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: `1px solid ${c.border}`
  },
  tr: {
    transition: 'background 0.15s'
  },
  td: {
    padding: '12px 16px',
    color: c.text,
    fontSize: '14px',
    borderBottom: `1px solid ${c.border}`
  },
  emptyCell: {
    padding: '40px',
    textAlign: 'center',
    color: c.textSecondary,
    fontSize: '14px'
  },
  actionButtons: {
    display: 'flex',
    gap: '6px'
  },
  recordBtn: {
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '6px',
    padding: '8px',
    color: '#22c55e',
    cursor: 'pointer',
    fontSize: '14px'
  },
  reminderBtn: {
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '6px',
    padding: '8px',
    color: '#f59e0b',
    cursor: 'pointer',
    fontSize: '14px'
  },
  historyBtn: {
    background: 'rgba(14, 165, 233, 0.1)',
    border: '1px solid rgba(14, 165, 233, 0.3)',
    borderRadius: '6px',
    padding: '8px',
    color: '#0ea5e9',
    cursor: 'pointer',
    fontSize: '14px'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: '16px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: `3px solid ${c.spinnerBorder}`,
    borderTop: `3px solid ${c.accent}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  loadingText: {
    color: c.textSecondary,
    fontSize: '14px'
  },
  modalContent: {
    padding: '24px',
    maxWidth: '500px',
    width: '100%'
  },
  modalTitle: {
    color: c.text,
    fontSize: '20px',
    fontWeight: '700',
    margin: '0 0 8px 0'
  },
  modalSubtext: {
    color: c.textSecondary,
    fontSize: '14px',
    margin: '4px 0 16px 0'
  },
  formGroup: {
    marginBottom: '16px'
  },
  label: {
    display: 'block',
    color: c.textSecondary,
    fontSize: '13px',
    fontWeight: '500',
    marginBottom: '6px'
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
    background: c.bg,
    color: c.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: `1px solid ${c.border}`
  },
  cancelBtn: {
    background: c.border,
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    color: c.text,
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  saveBtn: {
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '400px',
    overflowY: 'auto'
  },
  emptyHistory: {
    textAlign: 'center',
    color: c.textSecondary,
    fontSize: '14px',
    padding: '20px'
  },
  filterBtn: {
    padding: '5px 14px',
    borderRadius: '16px',
    border: `1px solid ${c.border}`,
    background: 'transparent',
    color: c.textSecondary,
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  filterBtnActive: {
    background: c.primary,
    color: '#fff',
    borderColor: c.primary,
  },
  emptyText: {
    textAlign: 'center',
    color: c.textSecondary,
    fontSize: '14px',
    padding: '40px 20px'
  },
  historyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: c.bg,
    borderRadius: '8px',
    border: `1px solid ${c.border}`
  },
  historyLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  historyAmount: {
    color: '#22c55e',
    fontWeight: '600',
    fontSize: '15px'
  },
  historyMethod: {
    color: c.textSecondary,
    fontSize: '12px',
    textTransform: 'capitalize'
  },
  historyDate: {
    color: c.textSecondary,
    fontSize: '13px'
  },
  tabBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textSecondary,
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  tabBtnActive: {
    background: '#0ea5e9',
    color: '#fff',
    borderColor: '#0ea5e9'
  }
})

export default Payments
