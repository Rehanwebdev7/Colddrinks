import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaCashRegister,
  FaReceipt,
  FaMagnifyingGlass,
  FaPrint,
  FaArrowTrendDown,
  FaIndianRupeeSign,
} from 'react-icons/fa6'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'

const ITEMS_PER_PAGE = 20

const PAYMENT_COLORS = {
  cash: { bg: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: 'rgba(34, 197, 94, 0.25)' },
  upi: { bg: 'rgba(14, 165, 233, 0.12)', color: '#0ea5e9', border: 'rgba(14, 165, 233, 0.25)' },
  card: { bg: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', border: 'rgba(139, 92, 246, 0.25)' },
  udhar: { bg: 'rgba(249, 115, 22, 0.12)', color: '#f97316', border: 'rgba(249, 115, 22, 0.25)' },
}

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0)

const formatDateTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const PaymentBadge = ({ method }) => {
  const key = String(method || '').toLowerCase()
  const colors = PAYMENT_COLORS[key] || PAYMENT_COLORS.cash
  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '600',
      background: colors.bg,
      color: colors.color,
      border: `1px solid ${colors.border}`,
    }}>
      {method}
    </span>
  )
}

const printBill = (sale) => {
  const itemsHTML = (sale.items || []).map(item => {
    const mode = item.purchaseMode === 'piece' ? 'Pieces' : item.purchaseMode === 'half_box' ? 'Half Boxes' : 'Boxes'
    const amount = (Number(item.price) || 0) * (Number(item.quantity) || 0)
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${item.name || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity} ${mode}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">Rs. ${(Number(item.price) || 0).toFixed(2)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">Rs. ${amount.toFixed(2)}</td>
    </tr>`
  }).join('')

  const date = new Date(sale.saleDate || sale.createdAt || Date.now()).toLocaleString('en-IN')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${sale.saleNumber}</title></head>
  <body style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px">
    <div style="text-align:center;border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:16px">
      <h1 style="color:#E23744;margin:0">Invoice</h1>
      <p style="color:#666;margin:4px 0">Offline Counter Sale</p>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:16px">
      <div><strong>Bill To:</strong><br>${sale.customerName || 'Walk-in Customer'}<br>${sale.customerPhone || ''}<br>${sale.customerAddress || ''}</div>
      <div style="text-align:right"><strong>Invoice #:</strong> ${sale.saleNumber}<br><strong>Date:</strong> ${date}<br><strong>Payment:</strong> ${sale.paymentMethod}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead><tr style="background:#f3f4f6"><th style="padding:10px;text-align:left">Item</th><th style="padding:10px;text-align:center">Qty</th><th style="padding:10px;text-align:right">Rate</th><th style="padding:10px;text-align:right">Amount</th></tr></thead>
      <tbody>${itemsHTML}</tbody>
    </table>
    <div style="text-align:right">
      <div>Subtotal: Rs. ${(Number(sale.subtotal) || 0).toFixed(2)}</div>
      ${sale.discount > 0 ? `<div>Discount: -Rs. ${(Number(sale.discount) || 0).toFixed(2)}</div>` : ''}
      <div style="font-size:20px;font-weight:700;color:#E23744;margin-top:8px">Total: Rs. ${(Number(sale.total) || 0).toFixed(2)}</div>
      <div style="margin-top:8px;color:#666;font-size:12px">Status: ${sale.paymentStatus}</div>
    </div>
    <p style="text-align:center;margin-top:24px;color:#666;font-size:12px">Thank you for your business!</p>
  </body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()
  iframe.contentWindow.focus()
  setTimeout(() => {
    iframe.contentWindow.print()
    setTimeout(() => document.body.removeChild(iframe), 1000)
  }, 300)
}

const OfflineSalesHistory = () => {
  const navigate = useNavigate()
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const s = getStyles(c)

  const [loading, setLoading] = useState(true)
  const [sales, setSales] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('All')
  const [dateFilter, setDateFilter] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    fetchSales()
  }, [])

  const fetchSales = async () => {
    try {
      setLoading(true)
      const res = await API.get('/offline-sales')
      setSales(Array.isArray(res.data) ? res.data : [])
    } catch (error) {
      console.error('Failed to load offline sales:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredSales = useMemo(() => {
    let result = [...sales]

    // Payment filter
    if (paymentFilter !== 'All') {
      result = result.filter(
        (sale) => String(sale.paymentMethod || '').toLowerCase() === paymentFilter.toLowerCase()
      )
    }

    // Date filter
    if (dateFilter !== 'All') {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      result = result.filter((sale) => {
        const saleDate = new Date(sale.saleDate || sale.createdAt)
        if (Number.isNaN(saleDate.getTime())) return false

        switch (dateFilter) {
          case 'Today':
            return saleDate >= today
          case 'Yesterday':
            return saleDate >= yesterday && saleDate < today
          case 'Last 7 Days': {
            const weekAgo = new Date(today)
            weekAgo.setDate(weekAgo.getDate() - 7)
            return saleDate >= weekAgo
          }
          case 'Last 30 Days': {
            const monthAgo = new Date(today)
            monthAgo.setDate(monthAgo.getDate() - 30)
            return saleDate >= monthAgo
          }
          case 'This Month':
            return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear()
          default:
            return true
        }
      })
    }

    // Search filter
    const query = searchQuery.trim().toLowerCase()
    if (query) {
      result = result.filter((sale) =>
        [sale.saleNumber, sale.customerName, sale.customerPhone]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(query))
      )
    }

    return result
  }, [sales, paymentFilter, dateFilter, searchQuery])

  // Stats from filtered sales
  const totalRevenue = filteredSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const totalUdhar = filteredSales
    .filter((sale) => String(sale.paymentMethod || '').toLowerCase() === 'udhar')
    .reduce((sum, sale) => sum + Number(sale.total || 0), 0)

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / ITEMS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedSales = filteredSales.slice(
    (safeCurrentPage - 1) * ITEMS_PER_PAGE,
    safeCurrentPage * ITEMS_PER_PAGE
  )

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, paymentFilter, dateFilter])

  const goToPaymentsForCustomer = (customerId) => {
    navigate(`/admin/payments?customerId=${customerId}&action=collect`)
  }

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${c.border}`, borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <h1 style={s.title}>
              <FaReceipt style={{ marginRight: '10px', color: '#f97316' }} />
              Offline Sales History
            </h1>
            <p style={s.subtitle}>
              {sales.length} total sales &middot; {filteredSales.length} showing
            </p>
          </div>
          <button
            onClick={() => navigate('/admin/offline-sales')}
            style={s.newSaleBtn}
          >
            <FaCashRegister style={{ fontSize: 14 }} />
            New Sale
          </button>
        </div>

        {/* Stats Row */}
        <div style={s.statsRow}>
          <div style={s.statCard}>
            <span style={{ fontSize: 20, color: '#3b82f6' }}><FaReceipt /></span>
            <div>
              <div style={s.statValue}>{filteredSales.length}</div>
              <div style={s.statLabel}>Total Sales</div>
            </div>
          </div>
          <div style={s.statCard}>
            <span style={{ fontSize: 20, color: '#22c55e' }}><FaIndianRupeeSign /></span>
            <div>
              <div style={s.statValue}>{formatCurrency(totalRevenue)}</div>
              <div style={s.statLabel}>Total Revenue</div>
            </div>
          </div>
          <div style={s.statCard}>
            <span style={{ fontSize: 20, color: '#f97316' }}><FaArrowTrendDown /></span>
            <div>
              <div style={s.statValue}>{formatCurrency(totalUdhar)}</div>
              <div style={s.statLabel}>Udhar Amount</div>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={s.filterBar}>
          <div style={s.searchWrap}>
            <FaMagnifyingGlass style={s.searchIcon} />
            <input
              type="text"
              placeholder="Search sale #, customer name, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={s.searchInput}
            />
          </div>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            style={s.filterSelect}
          >
            <option value="All">All Payments</option>
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Card">Card</option>
            <option value="Udhar">Udhar</option>
          </select>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={s.filterSelect}
          >
            <option value="All">All Time</option>
            <option value="Today">Today</option>
            <option value="Yesterday">Yesterday</option>
            <option value="Last 7 Days">Last 7 Days</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="This Month">This Month</option>
          </select>
        </div>

        {/* Table */}
        {filteredSales.length === 0 ? (
          <div style={s.emptyState}>
            <FaReceipt style={{ fontSize: 48, color: c.border, marginBottom: 16 }} />
            <p style={{ color: c.textSecondary, fontSize: 16, margin: 0 }}>No sales found</p>
            <p style={{ color: c.textSecondary, fontSize: 13, marginTop: 4 }}>Try adjusting your filters</p>
          </div>
        ) : (
          <div style={s.tableCard}>
            <div style={s.tableScroll}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th className="admin-actions-col" style={s.th}>Actions</th>
                    <th style={s.th}>Sale #</th>
                    <th style={s.th}>Customer</th>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Items</th>
                    <th style={s.th}>Payment</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSales.map((sale) => {
                    const isUdhar = String(sale.paymentMethod || '').toLowerCase() === 'udhar'
                    return (
                      <tr
                        key={sale.id}
                        style={{
                          ...s.tr,
                          background: isUdhar ? 'rgba(249, 115, 22, 0.04)' : 'transparent',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = isUdhar ? 'rgba(249, 115, 22, 0.08)' : 'rgba(14, 165, 233, 0.04)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = isUdhar ? 'rgba(249, 115, 22, 0.04)' : 'transparent'}
                      >
                        <td className="admin-actions-col" style={s.td}>
                          <div className="admin-actions" style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => printBill(sale)}
                              style={s.actionBtn}
                              title="Print Bill"
                            >
                              <FaPrint size={13} />
                            </button>
                            {isUdhar && sale.customerId && (
                              <button
                                onClick={() => goToPaymentsForCustomer(sale.customerId)}
                                style={s.udharBtn}
                                title="Manage Udhar"
                              >
                                Udhar
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ ...s.td, fontWeight: 700, color: '#f97316' }}>
                          {sale.saleNumber}
                        </td>
                        <td style={s.td}>
                          <div>
                            <div style={{ color: c.text, fontWeight: 500, fontSize: 14 }}>
                              {sale.customerName || 'Walk-in Customer'}
                            </div>
                            {sale.customerPhone && (
                              <div style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
                                {sale.customerPhone}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ ...s.td, color: c.textSecondary, fontSize: 13, whiteSpace: 'nowrap' }}>
                          {formatDateTime(sale.saleDate || sale.createdAt)}
                        </td>
                        <td style={{ ...s.td, fontSize: 13 }}>
                          {sale.items?.length || 0} items
                        </td>
                        <td style={s.td}>
                          <PaymentBadge method={sale.paymentMethod} />
                          {isUdhar && sale.customer?.outstanding != null && (
                            <div style={{ fontSize: 11, color: '#f97316', marginTop: 4 }}>
                              Outstanding: {formatCurrency(sale.customer.outstanding)}
                            </div>
                          )}
                        </td>
                        <td style={{ ...s.td, fontWeight: 700, fontSize: 14, textAlign: 'right' }}>
                          {formatCurrency(sale.total)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={s.pagination}>
                <span style={{ fontSize: 13, color: c.textSecondary }}>
                  Showing {(safeCurrentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safeCurrentPage * ITEMS_PER_PAGE, filteredSales.length)} of {filteredSales.length}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage === 1}
                    style={{
                      ...s.pageBtn,
                      opacity: safeCurrentPage === 1 ? 0.5 : 1,
                      cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page
                    if (totalPages <= 5) page = i + 1
                    else if (safeCurrentPage <= 3) page = i + 1
                    else if (safeCurrentPage >= totalPages - 2) page = totalPages - 4 + i
                    else page = safeCurrentPage - 2 + i
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        style={{
                          ...s.pageBtn,
                          background: safeCurrentPage === page ? '#3b82f6' : c.surface,
                          color: safeCurrentPage === page ? '#fff' : c.text,
                          borderColor: safeCurrentPage === page ? '#3b82f6' : c.border,
                          fontWeight: safeCurrentPage === page ? 600 : 400,
                        }}
                      >
                        {page}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage === totalPages}
                    style={{
                      ...s.pageBtn,
                      opacity: safeCurrentPage === totalPages ? 0.5 : 1,
                      cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

const getStyles = (c) => ({
  container: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: '26px',
    fontWeight: '800',
    color: c.text,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    color: c.textSecondary,
    fontSize: 13,
    marginTop: 6,
  },
  newSaleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #f97316, #ea580c)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '18px 20px',
    borderRadius: 12,
    border: `1px solid ${c.border}`,
    background: c.surface,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 700,
    color: c.text,
  },
  statLabel: {
    fontSize: 12,
    color: c.textSecondary,
    marginTop: 2,
  },
  filterBar: {
    display: 'flex',
    gap: 10,
    marginBottom: 16,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  searchWrap: {
    position: 'relative',
    flex: 1,
    minWidth: 240,
  },
  searchIcon: {
    position: 'absolute',
    left: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    color: c.textSecondary,
    fontSize: 14,
  },
  searchInput: {
    width: '100%',
    padding: '10px 16px 10px 40px',
    border: `1px solid ${c.border}`,
    borderRadius: 10,
    background: c.surface,
    color: c.text,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  filterSelect: {
    padding: '10px 14px',
    border: `1px solid ${c.border}`,
    borderRadius: 10,
    background: c.surface,
    color: c.text,
    fontSize: 14,
    outline: 'none',
    cursor: 'pointer',
    minWidth: 140,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    background: c.surface,
    borderRadius: 12,
    border: `1px solid ${c.border}`,
  },
  tableCard: {
    background: c.surface,
    borderRadius: 12,
    border: `1px solid ${c.border}`,
    overflow: 'hidden',
  },
  tableScroll: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '12px 14px',
    color: c.textSecondary,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    borderBottom: `1px solid ${c.border}`,
    background: c.tableHeaderBg,
    whiteSpace: 'nowrap',
  },
  tr: {
    transition: 'background 0.15s ease',
    cursor: 'default',
  },
  td: {
    padding: '12px 14px',
    color: c.text,
    fontSize: 14,
    borderBottom: `1px solid ${c.border}`,
    verticalAlign: 'middle',
  },
  actionBtn: {
    background: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: 8,
    padding: '8px 10px',
    color: '#3b82f6',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  udharBtn: {
    background: 'rgba(249, 115, 22, 0.1)',
    border: '1px solid rgba(249, 115, 22, 0.25)',
    borderRadius: 8,
    padding: '6px 12px',
    color: '#f97316',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    transition: 'all 0.2s',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderTop: `1px solid ${c.border}`,
    flexWrap: 'wrap',
    gap: 12,
  },
  pageBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.text,
    fontSize: 13,
    cursor: 'pointer',
  },
})

export default OfflineSalesHistory
