import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import {
  FaSearch, FaEye, FaBan, FaCheckCircle, FaBell, FaUser,
  FaPhone, FaEnvelope, FaShoppingCart, FaRupeeSign, FaFilter
} from 'react-icons/fa'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'

const Customers = () => {
  const { user } = useAuth()
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const styles = getStyles(c)

  const [customers, setCustomers] = useState([])
  const [filteredCustomers, setFilteredCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerOrders, setCustomerOrders] = useState([])
  const [spendingData, setSpendingData] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const customersPerPage = 15

  useEffect(() => {
    fetchCustomers()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [customers, searchQuery, statusFilter])

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      // Try fetching users filtered by customer role
      let response
      try {
        response = await API.get('/users?role=customer')
      } catch {
        response = await API.get('/users')
      }
      const data = response.data.users || response.data || []
      const customerData = data.filter(u => u.role !== 'admin')
      customerData.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      setCustomers(customerData)
    } catch (error) {
      console.error('Failed to fetch customers:', error)
      toast.error('Failed to load customers')
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...customers]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      )
    }

    if (statusFilter !== 'All') {
      filtered = filtered.filter(c => {
        const isBlocked = c.isBlocked || c.status === 'blocked'
        return statusFilter === 'active' ? !isBlocked : isBlocked
      })
    }

    setFilteredCustomers(filtered)
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(filteredCustomers.length / customersPerPage)
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * customersPerPage,
    currentPage * customersPerPage
  )

  const viewDetails = async (customer) => {
    setSelectedCustomer(customer)
    setShowDetailModal(true)

    try {
      const response = await API.get(`/orders?customerId=${customer._id}`)
      const orders = response.data.orders || response.data || []
      setCustomerOrders(orders)

      // Build spending chart data (last 6 months)
      const monthlySpending = {}
      const now = new Date()
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        monthlySpending[key] = 0
      }

      orders.forEach(order => {
        const d = new Date(order.createdAt)
        const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        if (monthlySpending.hasOwnProperty(key)) {
          monthlySpending[key] += (order.totalAmount || order.total || 0)
        }
      })

      setSpendingData(Object.entries(monthlySpending).map(([month, amount]) => ({ month, amount })))
    } catch {
      setCustomerOrders([])
      setSpendingData([])
    }
  }

  const toggleBlock = async (customer) => {
    const isBlocked = customer.isBlocked || customer.status === 'blocked'
    const action = isBlocked ? 'unblock' : 'block'

    try {
      await API.put(`/users/${customer._id}/${action}`)
      toast.success(`Customer ${action}ed successfully`)
      fetchCustomers()
      if (selectedCustomer?._id === customer._id) {
        setSelectedCustomer(prev => ({
          ...prev,
          isBlocked: !isBlocked,
          status: isBlocked ? 'active' : 'blocked'
        }))
      }
    } catch (error) {
      toast.error(`Failed to ${action} customer`)
    }
  }

  const sendNotification = async (customer) => {
    try {
      await API.post('/notifications/send', {
        type: 'general',
        targetUserId: customer._id,
        title: 'Notification from Cool Drinks Shop',
        message: 'Thank you for being our valued customer!'
      })
      toast.success('Notification sent')
    } catch (error) {
      toast.error('Failed to send notification')
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0)
  }

  if (loading) {
    return (
      <AdminLayout>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading customers...</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div style={styles.page}>
        <h1 style={styles.title}>Customers</h1>

        {/* Filters */}
        <div style={styles.filterBar}>
          <div style={styles.searchWrapper}>
            <FaSearch style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="All">All Status</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        {/* Customers Table */}
        <div style={styles.tableCard}>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Phone</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Orders</th>
                  <th style={styles.th}>Total Spent</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={styles.emptyCell}>No customers found</td>
                  </tr>
                ) : (
                  paginatedCustomers.map((customer) => {
                    const isBlocked = customer.isBlocked || customer.status === 'blocked'
                    return (
                      <tr key={customer._id} style={styles.tr}>
                        <td style={{ ...styles.td, fontWeight: '500', color: c.text }}>
                          <div style={styles.nameCell}>
                            <div style={styles.avatar}>
                              {customer.name?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                            {customer.name || 'N/A'}
                          </div>
                        </td>
                        <td style={styles.td}>{customer.phone || 'N/A'}</td>
                        <td style={styles.td}>{customer.email || 'N/A'}</td>
                        <td style={styles.td}>{customer.ordersCount || customer.totalOrders || 0}</td>
                        <td style={styles.td}>{formatCurrency(customer.totalSpent || 0)}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusBadge,
                            background: isBlocked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                            color: isBlocked ? '#ef4444' : '#22c55e'
                          }}>
                            {isBlocked ? 'Blocked' : 'Active'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.actionButtons}>
                            <button style={styles.viewBtn} onClick={() => viewDetails(customer)} title="View Details">
                              <FaEye />
                            </button>
                            <button
                              style={isBlocked ? styles.unblockBtn : styles.blockBtn}
                              onClick={() => toggleBlock(customer)}
                              title={isBlocked ? 'Unblock' : 'Block'}
                            >
                              {isBlocked ? <FaCheckCircle /> : <FaBan />}
                            </button>
                            <button style={styles.notifyBtn} onClick={() => sendNotification(customer)} title="Send Notification">
                              <FaBell />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: c.textSecondary }}>
                Showing {(currentPage - 1) * customersPerPage + 1}-{Math.min(currentPage * customersPerPage, filteredCustomers.length)} of {filteredCustomers.length}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: `1px solid ${c.border}`, background: c.surface, color: c.text, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1, fontSize: '13px' }}
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let page
                  if (totalPages <= 5) { page = i + 1 }
                  else if (currentPage <= 3) { page = i + 1 }
                  else if (currentPage >= totalPages - 2) { page = totalPages - 4 + i }
                  else { page = currentPage - 2 + i }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${currentPage === page ? c.primary || '#3b82f6' : c.border}`, background: currentPage === page ? (c.primary || '#3b82f6') : c.surface, color: currentPage === page ? '#fff' : c.text, cursor: 'pointer', fontSize: '13px', fontWeight: currentPage === page ? '600' : '400' }}
                    >
                      {page}
                    </button>
                  )
                })}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: `1px solid ${c.border}`, background: c.surface, color: c.text, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1, fontSize: '13px' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Customer Detail Modal */}
        {showDetailModal && selectedCustomer && (
          <Modal onClose={() => setShowDetailModal(false)}>
            <div style={styles.modalContent}>
              <div style={styles.profileHeader}>
                <div style={styles.profileAvatar}>
                  {selectedCustomer.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div>
                  <h2 style={styles.profileName}>{selectedCustomer.name}</h2>
                  <span style={{
                    ...styles.statusBadge,
                    background: (selectedCustomer.isBlocked || selectedCustomer.status === 'blocked')
                      ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                    color: (selectedCustomer.isBlocked || selectedCustomer.status === 'blocked')
                      ? '#ef4444' : '#22c55e'
                  }}>
                    {(selectedCustomer.isBlocked || selectedCustomer.status === 'blocked') ? 'Blocked' : 'Active'}
                  </span>
                </div>
              </div>

              {/* Contact Info */}
              <div style={styles.infoGrid}>
                <div style={styles.infoItem}>
                  <FaPhone style={{ color: c.textSecondary }} />
                  <span>{selectedCustomer.phone || 'N/A'}</span>
                </div>
                <div style={styles.infoItem}>
                  <FaEnvelope style={{ color: c.textSecondary }} />
                  <span>{selectedCustomer.email || 'N/A'}</span>
                </div>
                <div style={styles.infoItem}>
                  <FaShoppingCart style={{ color: c.textSecondary }} />
                  <span>{customerOrders.length} Orders</span>
                </div>
                <div style={styles.infoItem}>
                  <FaRupeeSign style={{ color: c.textSecondary }} />
                  <span>{formatCurrency(
                    customerOrders.reduce((sum, o) => sum + (o.totalAmount || o.total || 0), 0)
                  )} Total Spent</span>
                </div>
              </div>

              {/* Spending Chart */}
              {spendingData.length > 0 && (
                <div style={styles.chartSection}>
                  <h4 style={styles.chartTitle}>Spending History (Last 6 Months)</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={spendingData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.border} />
                      <XAxis dataKey="month" stroke={c.textSecondary} fontSize={12} />
                      <YAxis stroke={c.textSecondary} fontSize={12} />
                      <Tooltip
                        contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: '8px', color: c.text }}
                        formatter={(value) => formatCurrency(value)}
                      />
                      <Line type="monotone" dataKey="amount" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#0ea5e9', r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Order History */}
              <div style={styles.orderSection}>
                <h4 style={styles.chartTitle}>Order History</h4>
                <div style={styles.orderList}>
                  {customerOrders.length === 0 ? (
                    <p style={styles.emptyHistory}>No orders found</p>
                  ) : (
                    customerOrders.slice(0, 10).map((order) => (
                      <div key={order._id} style={styles.orderItem}>
                        <div>
                          <span style={styles.orderNum}>#{order.orderNumber || order._id?.slice(-6)}</span>
                          <span style={styles.orderDate}>
                            {new Date(order.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                        <div style={styles.orderRight}>
                          <span style={styles.orderAmount}>{formatCurrency(order.totalAmount || order.total)}</span>
                          <span style={{
                            ...styles.statusBadge,
                            background: order.orderStatus === 'delivered' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: order.orderStatus === 'delivered' ? '#22c55e' : '#f59e0b',
                            fontSize: '11px'
                          }}>
                            {order.orderStatus}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button style={styles.cancelBtn} onClick={() => setShowDetailModal(false)}>Close</button>
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
  filterBar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  searchWrapper: {
    position: 'relative',
    flex: 1,
    minWidth: '250px'
  },
  searchIcon: {
    position: 'absolute',
    left: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: c.textSecondary,
    fontSize: '14px'
  },
  searchInput: {
    width: '100%',
    padding: '10px 16px 10px 40px',
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
    background: c.surface,
    color: c.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  filterSelect: {
    padding: '10px 14px',
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
    background: c.surface,
    color: c.text,
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '150px'
  },
  tableCard: {
    background: c.surface,
    borderRadius: '12px',
    border: `1px solid ${c.border}`,
    overflow: 'hidden'
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
    padding: '14px 16px',
    color: c.textSecondary,
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: `1px solid ${c.border}`,
    background: c.tableHeaderBg
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
  nameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: '700',
    fontSize: '14px',
    flexShrink: 0
  },
  statusBadge: {
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'capitalize'
  },
  actionButtons: {
    display: 'flex',
    gap: '6px'
  },
  viewBtn: {
    background: 'rgba(14, 165, 233, 0.1)',
    border: '1px solid rgba(14, 165, 233, 0.3)',
    borderRadius: '6px',
    padding: '8px',
    color: '#0ea5e9',
    cursor: 'pointer',
    fontSize: '14px'
  },
  blockBtn: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    padding: '8px',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '14px'
  },
  unblockBtn: {
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '6px',
    padding: '8px',
    color: '#22c55e',
    cursor: 'pointer',
    fontSize: '14px'
  },
  notifyBtn: {
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '6px',
    padding: '8px',
    color: '#f59e0b',
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
    maxWidth: '700px',
    width: '100%',
    maxHeight: '85vh',
    overflowY: 'auto'
  },
  profileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '20px'
  },
  profileAvatar: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: '700',
    fontSize: '24px',
    flexShrink: 0
  },
  profileName: {
    color: c.text,
    fontSize: '20px',
    fontWeight: '700',
    margin: '0 0 6px 0'
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginBottom: '20px'
  },
  infoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    background: c.bg,
    borderRadius: '8px',
    border: `1px solid ${c.border}`,
    color: c.text,
    fontSize: '14px'
  },
  chartSection: {
    marginBottom: '20px',
    padding: '16px',
    background: c.bg,
    borderRadius: '8px',
    border: `1px solid ${c.border}`
  },
  chartTitle: {
    color: c.text,
    fontSize: '14px',
    fontWeight: '600',
    margin: '0 0 12px 0'
  },
  orderSection: {
    marginBottom: '16px'
  },
  orderList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '300px',
    overflowY: 'auto'
  },
  emptyHistory: {
    textAlign: 'center',
    color: c.textSecondary,
    fontSize: '14px',
    padding: '20px'
  },
  orderItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: c.bg,
    borderRadius: '8px',
    border: `1px solid ${c.border}`
  },
  orderNum: {
    color: '#0ea5e9',
    fontWeight: '600',
    fontSize: '14px',
    marginRight: '12px'
  },
  orderDate: {
    color: c.textSecondary,
    fontSize: '12px'
  },
  orderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  orderAmount: {
    color: c.text,
    fontWeight: '600',
    fontSize: '14px'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '16px',
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
  }
})

export default Customers
