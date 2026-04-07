import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import toast from 'react-hot-toast'
import {
  FaShoppingCart, FaRupeeSign, FaClock, FaExclamationTriangle,
  FaCalendarDay, FaMoneyBillWave, FaBoxOpen, FaCheck, FaTruck,
  FaCog, FaParachuteBox, FaChartLine
} from 'react-icons/fa'
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'

const COLORS = ['#e23744', '#fc8019', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']

const ORDER_STATUS_COLORS = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  processing: '#8b5cf6',
  shipped: '#0ea5e9',
  delivered: '#22c55e',
  cancelled: '#ef4444'
}

const Dashboard = () => {
  const { user } = useAuth()
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const styles = getStyles(c)

  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    lowStockCount: 0,
    todayOrders: 0,
    todayRevenue: 0,
    totalProfit: 0,
    todayProfit: 0,
    offlineTotal: 0,
    offlinePending: 0,
    offlineToday: 0,
    offlineCount: 0
  })
  const [chartData, setChartData] = useState({
    weeklyOrders: [],
    revenueByCategory: [],
    orderStatusDistribution: []
  })
  const [recentOrders, setRecentOrders] = useState([])
  const [lowStockProducts, setLowStockProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const [statsRes, chartsRes, ordersRes, productsRes, supRes, offlineRes] = await Promise.all([
        API.get('/dashboard/stats'),
        API.get('/dashboard/charts'),
        API.get('/orders'),
        API.get('/products'),
        API.get('/suppliers/summary').catch(() => ({ data: { totalPending: 0 } })),
        API.get('/offline-sales').catch(() => ({ data: [] }))
      ])

      // Calculate offline sales stats
      const offlineSales = Array.isArray(offlineRes.data) ? offlineRes.data : []
      const todayStr = new Date().toISOString().split('T')[0]
      const offlineTotal = offlineSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0)
      const offlinePending = offlineSales.filter(s => s.paymentStatus === 'Pending').reduce((sum, s) => sum + (Number(s.total) || 0), 0)
      const offlineToday = offlineSales.filter(s => (s.saleDate || s.createdAt || '').startsWith(todayStr)).reduce((sum, s) => sum + (Number(s.total) || 0), 0)
      const offlineCount = offlineSales.length

      setStats({
        ...statsRes.data,
        supplierPending: supRes.data?.totalPending || 0,
        offlineTotal, offlinePending, offlineToday, offlineCount
      })
      setChartData(chartsRes.data)

      // Recent orders - sort by date descending, take latest 5
      const orders = Array.isArray(ordersRes.data) ? ordersRes.data : []
      setRecentOrders(orders.sort((a, b) => new Date(b.orderDate || b.createdAt || 0) - new Date(a.orderDate || a.createdAt || 0)).slice(0, 5))

      // Low stock products - filter those with low stock
      const products = Array.isArray(productsRes.data) ? productsRes.data : []
      const lowStock = products.filter(p => p.stock !== undefined && p.stock <= (p.lowStockThreshold || 10))
      setLowStockProducts(lowStock)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAction = async (orderId, status) => {
    try {
      await API.put(`/orders/${orderId}/status`, { status })
      toast.success(`Order updated to ${status}`)
      fetchDashboardData()
    } catch (error) {
      toast.error('Failed to update order status')
    }
  }

  const handleRestock = async (productId) => {
    try {
      await API.put(`/products/${productId}/restock`)
      toast.success('Product restocked successfully')
      fetchDashboardData()
    } catch (error) {
      toast.error('Failed to restock product')
    }
  }

  const formatCurrency = (amount) => {
    return `₹${Number(amount || 0).toLocaleString('en-IN')}`
  }

  const getNextActions = (currentStatus) => {
    switch (currentStatus) {
      case 'pending': return [{ label: 'Confirm', value: 'confirmed', color: '#3b82f6', icon: <FaCheck /> }]
      case 'confirmed': return [{ label: 'Process', value: 'processing', color: '#8b5cf6', icon: <FaCog /> }]
      case 'processing': return [{ label: 'Ship', value: 'shipped', color: '#0ea5e9', icon: <FaTruck /> }]
      case 'shipped': return [{ label: 'Deliver', value: 'delivered', color: '#22c55e', icon: <FaParachuteBox /> }]
      default: return []
    }
  }

  const kpiCards = [
    {
      label: 'Total Orders',
      value: stats.totalOrders,
      icon: <FaShoppingCart />,
      color: '#e23744',
      bg: 'rgba(226, 55, 68, 0.1)'
    },
    {
      label: 'Total Revenue',
      value: formatCurrency(stats.totalRevenue),
      icon: <FaRupeeSign />,
      color: '#22c55e',
      bg: 'rgba(34, 197, 94, 0.1)'
    },
    {
      label: 'Pending Payments',
      value: stats.pendingPayments,
      icon: <FaClock />,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.1)'
    },
    {
      label: 'Low Stock',
      value: stats.lowStockCount,
      icon: <FaExclamationTriangle />,
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.1)'
    },
    {
      label: "Today's Orders",
      value: stats.todayOrders,
      icon: <FaCalendarDay />,
      color: '#0ea5e9',
      bg: 'rgba(14, 165, 233, 0.1)'
    },
    {
      label: "Today's Revenue",
      value: formatCurrency(stats.todayRevenue),
      icon: <FaMoneyBillWave />,
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.1)'
    },
    {
      label: 'Total Profit',
      value: formatCurrency(stats.totalProfit),
      icon: <FaChartLine />,
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.1)'
    },
    {
      label: "Today's Profit",
      value: formatCurrency(stats.todayProfit),
      icon: <FaChartLine />,
      color: '#059669',
      bg: 'rgba(5, 150, 105, 0.1)'
    },
    {
      label: 'Supplier Pending',
      value: formatCurrency(stats.supplierPending || 0),
      icon: <FaTruck />,
      color: '#f97316',
      bg: 'rgba(249, 115, 22, 0.1)'
    },
    {
      label: 'Offline Sales (Total)',
      value: formatCurrency(stats.offlineTotal || 0),
      icon: <FaBoxOpen />,
      color: '#fc8019',
      bg: 'rgba(252, 128, 25, 0.1)'
    },
    {
      label: 'Offline Pending (Udhar)',
      value: formatCurrency(stats.offlinePending || 0),
      icon: <FaMoneyBillWave />,
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.1)'
    },
    {
      label: "Today's Offline",
      value: formatCurrency(stats.offlineToday || 0),
      icon: <FaCalendarDay />,
      color: '#06b6d4',
      bg: 'rgba(6, 182, 212, 0.1)'
    }
  ]

  if (loading) {
    return (
      <AdminLayout>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading dashboard...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div style={styles.page}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Dashboard</h1>
            <p style={styles.subtitle}>Welcome back, {user?.name || 'Admin'}!</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="admin-stats-grid" style={styles.statsGrid}>
          {kpiCards.map((card, index) => (
            <div key={index} style={styles.statCard}>
              <div style={styles.statTop}>
                <div style={{ ...styles.statIcon, background: card.bg, color: card.color }}>
                  {card.icon}
                </div>
              </div>
              <div style={styles.statValue}>{card.value}</div>
              <div style={styles.statLabel}>{card.label}</div>
              <div style={{ ...styles.statAccent, background: card.color }} />
            </div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="admin-charts-row" style={styles.chartsRow}>
          {/* Weekly Orders Bar Chart */}
          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Weekly Orders</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.weeklyOrders}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.border} />
                <XAxis dataKey="day" stroke={c.textSecondary} fontSize={12} />
                <YAxis stroke={c.textSecondary} fontSize={12} />
                <Tooltip
                  contentStyle={styles.tooltipStyle}
                  cursor={{ fill: 'rgba(226, 55, 68, 0.08)' }}
                />
                <Bar dataKey="orders" fill="#e23744" radius={[6, 6, 0, 0]} barSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue by Category Pie Chart */}
          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Revenue by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData.revenueByCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={105}
                  paddingAngle={4}
                  dataKey="revenue"
                  nameKey="category"
                  label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                >
                  {(chartData.revenueByCategory || []).map((entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={styles.tooltipStyle}
                  formatter={(value) => formatCurrency(value)}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Status Distribution */}
        <div style={styles.chartCardFull}>
          <h3 style={styles.chartTitle}>Order Status Distribution</h3>
          <div style={styles.statusGrid}>
            {(chartData.orderStatusDistribution || []).map((item, index) => (
              <div key={index} style={styles.statusItem}>
                <div style={{
                  ...styles.statusDot,
                  background: ORDER_STATUS_COLORS[item.status] || c.textSecondary
                }} />
                <div style={styles.statusInfo}>
                  <span style={styles.statusName}>{item.status}</span>
                  <span style={styles.statusCount}>{item.count}</span>
                </div>
                <div style={{
                  ...styles.statusBar,
                  background: ORDER_STATUS_COLORS[item.status] || c.textSecondary,
                  width: `${Math.min(
                    (item.count / Math.max(...(chartData.orderStatusDistribution || []).map(s => s.count), 1)) * 100,
                    100
                  )}%`
                }} />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Orders Table */}
        <div style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Recent Orders</h3>
            <Link to="/admin/orders" style={styles.viewAllLink}>View All Orders</Link>
          </div>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Order #</th>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={styles.emptyCell}>No recent orders</td>
                  </tr>
                ) : (
                  recentOrders.map((order) => (
                    <tr key={order.id} style={styles.tr}>
                      <td style={styles.td}>
                        <span style={styles.orderNumber}>#{order.orderNumber}</span>
                      </td>
                      <td style={styles.td}>{order.customerName || 'N/A'}</td>
                      <td style={{ ...styles.td, fontWeight: '600' }}>{formatCurrency(order.total)}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusBadge,
                          background: (ORDER_STATUS_COLORS[order.orderStatus] || c.textSecondary) + '20',
                          color: ORDER_STATUS_COLORS[order.orderStatus] || c.textSecondary
                        }}>
                          {order.orderStatus}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionBtns}>
                          {getNextActions(order.orderStatus).map((action) => (
                            <button
                              key={action.value}
                              style={{ ...styles.actionBtn, background: action.color }}
                              onClick={() => handleQuickAction(order.id, action.value)}
                              title={action.label}
                            >
                              {action.icon}
                              <span>{action.label}</span>
                            </button>
                          ))}
                          {getNextActions(order.orderStatus).length === 0 && (
                            <span style={styles.noAction}>--</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Products Table */}
        <div style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>
              <FaExclamationTriangle style={{ color: '#f59e0b', marginRight: '8px' }} />
              Low Stock Products
            </h3>
            <Link to="/admin/products" style={styles.viewAllLink}>Manage Products</Link>
          </div>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Current Stock</th>
                  <th style={styles.th}>Price</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={styles.emptyCell}>All products are well stocked</td>
                  </tr>
                ) : (
                  lowStockProducts.map((product) => (
                    <tr key={product.id} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={styles.productCell}>
                          <FaBoxOpen style={{ color: c.textSecondary, flexShrink: 0 }} />
                          <span>{product.name}</span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.stockBadge,
                          background: product.stock === 0 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                          color: product.stock === 0 ? '#ef4444' : '#f59e0b'
                        }}>
                          {product.stock} units
                        </span>
                      </td>
                      <td style={styles.td}>{formatCurrency(product.price)}</td>
                      <td style={styles.td}>
                        <button
                          style={styles.restockBtn}
                          onClick={() => handleRestock(product.id)}
                        >
                          Restock
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AdminLayout>
  )
}

const getStyles = (c) => ({
  page: {
    maxWidth: '1400px',
    margin: '0 auto'
  },
  header: {
    marginBottom: '28px'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: c.text,
    margin: 0
  },
  subtitle: {
    color: c.textSecondary,
    fontSize: '14px',
    marginTop: '6px'
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
    width: '44px',
    height: '44px',
    border: `4px solid ${c.spinnerBorder}`,
    borderTop: '4px solid #e23744',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  loadingText: {
    color: c.textSecondary,
    fontSize: '15px'
  },

  /* Stats Cards */
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '12px',
    marginBottom: '24px'
  },
  statCard: {
    background: c.surface,
    borderRadius: '14px',
    padding: '16px',
    border: `1px solid ${c.border}`,
    position: 'relative',
    overflow: 'hidden'
  },
  statTop: {
    marginBottom: '14px'
  },
  statIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px'
  },
  statValue: {
    fontSize: '22px',
    fontWeight: '700',
    color: c.text,
    marginBottom: '4px',
    wordBreak: 'break-word',
    lineHeight: 1.2,
  },
  statLabel: {
    color: c.textSecondary,
    fontSize: '13px',
    fontWeight: '500'
  },
  statAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '3px'
  },

  /* Charts */
  chartsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))',
    gap: '16px',
    marginBottom: '20px'
  },
  chartCard: {
    background: c.surface,
    borderRadius: '14px',
    padding: '20px',
    border: `1px solid ${c.border}`
  },
  chartCardFull: {
    background: c.surface,
    borderRadius: '14px',
    padding: '20px',
    border: `1px solid ${c.border}`,
    marginBottom: '20px'
  },
  chartTitle: {
    color: c.text,
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 16px 0'
  },
  tooltipStyle: {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
    color: c.text
  },

  /* Order Status Distribution */
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px'
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    background: c.bg,
    borderRadius: '10px',
    position: 'relative',
    overflow: 'hidden'
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0
  },
  statusInfo: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1
  },
  statusName: {
    color: c.text,
    fontSize: '13px',
    fontWeight: '500',
    textTransform: 'capitalize'
  },
  statusCount: {
    color: c.text,
    fontSize: '18px',
    fontWeight: '700'
  },
  statusBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: '3px',
    borderRadius: '0 3px 0 0',
    transition: 'width 0.3s ease'
  },

  /* Section Cards */
  sectionCard: {
    background: c.surface,
    borderRadius: '14px',
    padding: '20px',
    border: `1px solid ${c.border}`,
    marginBottom: '20px'
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  sectionTitle: {
    color: c.text,
    fontSize: '16px',
    fontWeight: '600',
    margin: 0,
    display: 'flex',
    alignItems: 'center'
  },
  viewAllLink: {
    color: '#e23744',
    fontSize: '13px',
    textDecoration: 'none',
    fontWeight: '600',
    padding: '6px 14px',
    borderRadius: '8px',
    background: 'rgba(226, 55, 68, 0.1)',
    transition: 'background 0.2s'
  },

  /* Tables */
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
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    borderBottom: `1px solid ${c.border}`
  },
  tr: {
    transition: 'background 0.15s'
  },
  td: {
    padding: '14px 16px',
    color: c.text,
    fontSize: '14px',
    borderBottom: `1px solid ${c.border}`
  },
  emptyCell: {
    padding: '32px',
    textAlign: 'center',
    color: c.textSecondary,
    fontSize: '14px'
  },

  /* Order specific */
  orderNumber: {
    color: '#0ea5e9',
    fontWeight: '600',
    fontSize: '13px'
  },
  statusBadge: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'capitalize',
    display: 'inline-block'
  },
  actionBtns: {
    display: 'flex',
    gap: '6px'
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  noAction: {
    color: c.textSecondary,
    fontSize: '13px'
  },

  /* Product specific */
  productCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  stockBadge: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block'
  },
  restockBtn: {
    background: 'linear-gradient(135deg, #e23744, #c81e2b)',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 18px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.15s'
  }
})

export default Dashboard
