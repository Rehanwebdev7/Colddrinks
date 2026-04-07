import { useState, useEffect, useMemo } from 'react'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import {
  FaSearch, FaEye, FaCheck, FaTimes, FaFileInvoice,
  FaTruck, FaBox, FaCog, FaClipboardCheck, FaShoppingBag,
  FaDownload, FaPrint, FaWhatsapp
} from 'react-icons/fa'
import { useTheme } from '../context/ThemeContext'
import { useSettings } from '../context/SettingsContext'
import { getColors } from './themeColors'
import { getCartItemSummary, getCartItemUnitPriceLabel } from '../utils/purchase'

const STATUS_FLOW = {
  Placed: { next: 'confirmed', reject: 'cancelled', label: 'Confirm', rejectLabel: 'Reject', icon: FaCheck, rejectIcon: FaTimes },
  confirmed: { next: 'processing', bill: true, label: 'Start Processing', billLabel: 'Generate Bill', icon: FaCog, billIcon: FaFileInvoice },
  processing: { next: 'shipped', label: 'Ship Order', icon: FaTruck },
  shipped: { requestConfirmation: true, label: 'Request Confirmation', icon: FaClipboardCheck },
  delivered: { bill: true, label: 'Generate Bill', icon: FaFileInvoice },
}

const STATUS_COLORS = {
  Placed: { bg: 'rgba(249, 115, 22, 0.12)', color: '#f97316', border: 'rgba(249, 115, 22, 0.3)' },
  confirmed: { bg: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
  processing: { bg: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' },
  shipped: { bg: 'rgba(6, 182, 212, 0.12)', color: '#06b6d4', border: 'rgba(6, 182, 212, 0.3)' },
  awaiting_confirmation: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
  delivered: { bg: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
  cancelled: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
  rejected: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
}

const PAYMENT_COLORS = {
  Paid: { bg: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
  Pending: { bg: 'rgba(249, 115, 22, 0.12)', color: '#f97316', border: 'rgba(249, 115, 22, 0.3)' },
  'Verification Pending': { bg: 'rgba(14, 165, 233, 0.12)', color: '#0ea5e9', border: 'rgba(14, 165, 233, 0.3)' },
}

const STATUS_OPTIONS = ['All', 'Placed', 'confirmed', 'processing', 'shipped', 'awaiting_confirmation', 'delivered', 'cancelled']
const PAYMENT_OPTIONS = ['All', 'Paid', 'Pending', 'Verification Pending']
const formatStatusLabel = (status) => status === 'awaiting_confirmation'
  ? 'Awaiting Confirmation'
  : status.charAt(0).toUpperCase() + status.slice(1)

const getOrderItemsSummary = (order) => {
  const items = Array.isArray(order?.items) ? order.items : []
  if (items.length === 0) return 'No items'
  if (items.length === 1) return getCartItemSummary(items[0])
  const primary = getCartItemSummary(items[0])
  return `${primary} +${items.length - 1} more`
}

const StatusBadge = ({ status }) => {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.Placed
  const label = status === 'awaiting_confirmation' ? 'awaiting confirmation' : status
  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '600',
      textTransform: 'capitalize',
      background: colors.bg,
      color: colors.color,
      border: `1px solid ${colors.border}`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

const PaymentBadge = ({ status }) => {
  const colors = PAYMENT_COLORS[status] || PAYMENT_COLORS.Pending
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
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

const Orders = () => {
  const { darkMode } = useTheme()
  const { settings } = useSettings()
  const c = getColors(darkMode)
  const s = getStyles(c)

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [paymentFilter, setPaymentFilter] = useState('All')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showBillModal, setShowBillModal] = useState(false)
  const [generatedBill, setGeneratedBill] = useState(null)
  const ordersPerPage = 20

  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const response = await API.get('/orders')
      const data = response.data
      setOrders(Array.isArray(data) ? data : data?.orders || [])
    } catch (error) {
      console.error('Failed to fetch orders:', error)
      toast.error('Failed to load orders')
    } finally {
      setLoading(false)
    }
  }

  const filteredOrders = useMemo(() => {
    let result = [...orders]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(o =>
        (o.orderNumber || '').toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'All') {
      result = result.filter(o => {
        const effectiveStatus = o.customerDeliveryConfirmed
          ? 'delivered'
          : (o.deliveryConfirmationRequestedAt && (o.orderStatus || '').toLowerCase() === 'shipped')
            ? 'awaiting_confirmation'
            : o.orderStatus
        return effectiveStatus === statusFilter
      })
    }
    if (paymentFilter !== 'All') {
      result = result.filter(o => o.paymentStatus === paymentFilter)
    }
    // Sort descending by date (newest first)
    result.sort((a, b) => new Date(b.orderDate || b.createdAt || 0) - new Date(a.orderDate || a.createdAt || 0))
    return result
  }, [orders, searchQuery, statusFilter, paymentFilter])

  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage)
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ordersPerPage,
    currentPage * ordersPerPage
  )

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter, paymentFilter])

  const statusCounts = useMemo(() => {
    const counts = { Placed: 0, confirmed: 0, processing: 0, shipped: 0, awaiting_confirmation: 0, delivered: 0, cancelled: 0 }
    orders.forEach(o => {
      const s = o.customerDeliveryConfirmed
        ? 'delivered'
        : (o.deliveryConfirmationRequestedAt && (o.orderStatus || '').toLowerCase() === 'shipped')
          ? 'awaiting_confirmation'
          : o.orderStatus
      if (counts[s] !== undefined) counts[s]++
    })
    return counts
  }, [orders])

  const requestDeliveryConfirmation = async (order) => {
    const orderId = order.id || order.orderNumber
    if (actionLoading) return
    setActionLoading(orderId)
    try {
      const resp = await API.post(`/orders/${orderId}/request-delivery-confirmation`)
      const updated = resp.data
      toast.success(`Customer confirmation requested for #${order.orderNumber}`, { icon: '📨', duration: 3000 })
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, ...updated } : o)))
      if (selectedOrder && selectedOrder.id === order.id) {
        setSelectedOrder(prev => ({ ...prev, ...updated }))
      }
    } catch (error) {
      console.error('Request confirmation failed:', error)
      toast.error(error.response?.data?.message || 'Failed to request customer confirmation')
    } finally {
      setActionLoading(null)
    }
  }

  const updateOrderStatus = async (order, newStatus) => {
    const orderId = order.id || order.orderNumber
    if (actionLoading) return
    setActionLoading(orderId)
    try {
      const resp = await API.put(`/orders/${orderId}/status`, { status: newStatus })
      const updated = resp.data
      toast.success(
        `Order #${order.orderNumber} ${newStatus === 'cancelled' ? 'rejected' : 'updated to ' + newStatus}`,
        { icon: newStatus === 'cancelled' ? '❌' : '✅', duration: 3000 }
      )
      setOrders(prev => prev.map(o =>
        (o.id === order.id) ? { ...o, ...updated, orderStatus: newStatus } : o
      ))
      if (selectedOrder && selectedOrder.id === order.id) {
        setSelectedOrder(prev => ({ ...prev, ...updated, orderStatus: newStatus }))
      }
    } catch (error) {
      console.error('Status update failed:', error)
      const msg = error.response?.data?.message || 'Failed to update order status'
      toast.error(msg)
    } finally {
      setActionLoading(null)
    }
  }

  const verifyOnlinePayment = async (order) => {
    const orderId = order.id || order.orderNumber
    if (!window.confirm(`Verify online payment of ₹${(order.total || 0).toFixed(2)} for order #${order.orderNumber}?`)) return
    if (actionLoading) return
    setActionLoading(orderId)
    try {
      const resp = await API.put(`/orders/${orderId}/status`, { paymentStatus: 'Paid' })
      const updated = resp.data
      toast.success(`Payment verified for #${order.orderNumber}`, { icon: '✅', duration: 3000 })
      setOrders(prev => prev.map(o =>
        (o.id === order.id) ? { ...o, ...updated, paymentStatus: 'Paid' } : o
      ))
      if (selectedOrder && selectedOrder.id === order.id) {
        setSelectedOrder(prev => ({ ...prev, ...updated, paymentStatus: 'Paid' }))
      }
    } catch (error) {
      console.error('Payment verification failed:', error)
      const msg = error.response?.data?.message || 'Failed to verify payment'
      toast.error(msg)
    } finally {
      setActionLoading(null)
    }
  }

  const handleGenerateBill = async (order) => {
    const orderId = order.id || order.orderNumber
    setActionLoading(orderId)
    try {
      const res = await API.post(`/bills/generate/${orderId}`)
      const bill = res.data
      toast.success(`Bill ${bill?.billNumber || ''} generated!`, { duration: 2000 })
      setGeneratedBill(bill)
      setShowBillModal(true)
    } catch (error) {
      console.error('Bill generation failed:', error)
      toast.error(error.response?.data?.message || 'Failed to generate bill')
    } finally {
      setActionLoading(null)
    }
  }

  // ─── Bill Invoice Functions ─────────────────────────────────────────
  const formatBillDate = (bill) => {
    const raw = bill.createdAt || bill.billDate || bill.orderDate
    if (!raw) return 'N/A'
    const d = new Date(raw)
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-IN')
  }

  const formatBillDateLong = (bill) => {
    const raw = bill.createdAt || bill.billDate || bill.orderDate
    if (!raw) return 'N/A'
    const d = new Date(raw)
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  const numberToWords = (num) => {
    if (num === 0) return 'Zero'
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    const convert = (n) => {
      if (n < 20) return ones[n]
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convert(n % 100) : '')
      if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '')
      if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '')
      return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '')
    }
    const wholePart = Math.floor(num)
    const decimalPart = Math.round((num - wholePart) * 100)
    let result = convert(wholePart) + ' Rupees'
    if (decimalPart > 0) result += ' and ' + convert(decimalPart) + ' Paise'
    return result + ' Only'
  }

  const generateInvoiceHTML = (bill) => {
    const items = bill.items || []
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * (item.price || 0)), 0)
    const taxAmount = bill.tax || bill.gst || 0
    const discount = bill.discount || 0
    const deliveryCharge = bill.deliveryCharge || 0
    const grandTotal = bill.totalAmount || bill.total || (subtotal + taxAmount + deliveryCharge - discount)
    const fmtCurrency = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n || 0)

    return `<!DOCTYPE html><html><head><title>Invoice ${bill.billNumber || ''}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; padding: 40px; max-width: 800px; margin: auto; }
  .invoice-box { border: 2px solid #1a1a2e; padding: 30px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 3px double #1a1a2e; }
  .shop-info h1 { font-size: 26px; color: #0e4166; margin-bottom: 4px; }
  .shop-info p { font-size: 12px; color: #555; line-height: 1.6; }
  .invoice-title { text-align: right; }
  .invoice-title h2 { font-size: 28px; color: #0e4166; letter-spacing: 2px; text-transform: uppercase; }
  .invoice-title p { font-size: 12px; color: #555; margin-top: 4px; }
  .details-row { display: flex; justify-content: space-between; margin: 20px 0; }
  .details-box h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
  .details-box p { font-size: 13px; color: #333; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  thead th { background: #0e4166; color: #fff; padding: 10px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
  tbody td { padding: 10px 8px; font-size: 13px; border-bottom: 1px solid #e5e7eb; }
  tbody tr:nth-child(even) { background: #f8f9fa; }
  .totals { margin-left: auto; width: 280px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #555; }
  .total-row.grand { border-top: 2px solid #1a1a2e; padding-top: 10px; margin-top: 6px; font-size: 16px; font-weight: 700; color: #1a1a2e; }
  .amount-words { font-size: 12px; color: #555; font-style: italic; margin: 16px 0; padding: 10px; background: #f0f4f8; border-radius: 4px; }
  .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; }
  .terms h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
  .terms ol { font-size: 11px; color: #666; padding-left: 16px; line-height: 1.8; }
  .signature { text-align: center; }
  .signature p { font-size: 12px; color: #555; margin-top: 40px; border-top: 1px solid #333; padding-top: 6px; }
  @media print { body { padding: 20px; } .invoice-box { border: none; padding: 0; } }
</style></head>
<body>
<div class="invoice-box">
  <div class="header">
    <div class="shop-info">
      <h1>${settings.siteName || 'Shop'}</h1>
      <p>${settings.contact?.address || ''}<br>Phone: ${settings.contact?.phone || ''} | Email: ${settings.contact?.email || ''}</p>
    </div>
    <div class="invoice-title">
      <h2>Invoice</h2>
      <p>#${bill.billNumber || ''}<br>${formatBillDateLong(bill)}</p>
    </div>
  </div>
  <div class="details-row">
    <div class="details-box">
      <h4>Bill To</h4>
      <p><strong>${bill.customer?.name || bill.customerName || 'N/A'}</strong><br>${bill.customer?.phone || bill.customerPhone || ''}<br>${bill.customer?.address || bill.customerAddress || ''}</p>
    </div>
    <div class="details-box" style="text-align:right">
      <h4>Order Details</h4>
      <p>Order #: ${bill.orderNumber || bill.orderId || 'N/A'}<br>Payment: ${bill.paymentMethod || 'COD'}<br>Status: ${bill.paymentStatus || 'unpaid'}</p>
    </div>
  </div>
  <table>
    <thead><tr><th>S.No</th><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${items.map((item, i) => {
      const qtyLabel = item.unitLabel || (item.purchaseMode === 'piece' ? (item.quantity === 1 ? 'Piece' : 'Pieces') : item.purchaseMode === 'half_box' ? (item.quantity === 1 ? 'Half Box' : 'Half Boxes') : (item.quantity === 1 ? 'Box' : 'Boxes'))
      return `<tr><td>${i + 1}</td><td>${item.name || item.product?.name || 'N/A'}</td><td style="text-align:center">${item.quantity} ${qtyLabel}</td><td style="text-align:right">${fmtCurrency(item.price)} ${item.purchaseMode === 'piece' ? '/pc' : item.purchaseMode === 'half_box' ? '/half' : '/box'}</td><td style="text-align:right">${fmtCurrency(item.quantity * item.price)}</td></tr>`
    }).join('')}</tbody>
  </table>
  <div class="totals">
    <div class="total-row"><span>Subtotal</span><span>${fmtCurrency(subtotal)}</span></div>
    ${deliveryCharge > 0 ? `<div class="total-row"><span>Delivery</span><span>${fmtCurrency(deliveryCharge)}</span></div>` : ''}
    ${discount > 0 ? `<div class="total-row"><span>Discount</span><span>-${fmtCurrency(discount)}</span></div>` : ''}
    <div class="total-row grand"><span>Grand Total</span><span>${fmtCurrency(grandTotal)}</span></div>
  </div>
  <div class="amount-words"><strong>Amount in words:</strong> ${numberToWords(Math.round(grandTotal))}</div>
  <div class="footer">
    <div class="terms">
      <h4>Terms & Conditions</h4>
      <ol>
        <li>Payment is due within 15 days from the date of invoice.</li>
        <li>Goods once sold will not be taken back or exchanged.</li>
      </ol>
    </div>
    <div class="signature"><p>Authorized Signatory</p></div>
  </div>
</div>
</body></html>`
  }

  const handleBillDownload = (bill) => {
    const invoiceContent = generateInvoiceHTML(bill)
    const blob = new Blob([invoiceContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoice-${bill.billNumber || 'bill'}.html`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Invoice downloaded')
  }

  const handleBillPrint = (bill) => {
    if (!bill) return
    const invoiceHTML = generateInvoiceHTML(bill)
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
    doc.write(invoiceHTML)
    doc.close()
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    setTimeout(() => document.body.removeChild(iframe), 1000)
  }

  const handleBillWhatsApp = async (bill) => {
    toast.loading('Bill image bana raha hai...', { id: 'wp-share' })

    try {
      const html2canvas = (await import('html2canvas')).default

      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;z-index:-1;'
      const fullHTML = generateInvoiceHTML(bill)
      const bodyMatch = fullHTML.match(/<body[^>]*>([\s\S]*)<\/body>/i)
      const styleMatch = fullHTML.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
      if (styleMatch) {
        const s = document.createElement('style')
        s.textContent = styleMatch[1]
        container.appendChild(s)
      }
      const content = document.createElement('div')
      content.innerHTML = bodyMatch ? bodyMatch[1] : fullHTML
      content.style.cssText = "font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;padding:40px;max-width:800px;"
      container.appendChild(content)
      document.body.appendChild(container)

      await new Promise(r => setTimeout(r, 300))
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
      document.body.removeChild(container)

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Image nahi ban paya')

      const fileName = `Bill-${bill.billNumber || 'invoice'}.png`
      const file = new File([blob], fileName, { type: 'image/png' })

      toast.dismiss('wp-share')

      // Try native share (works on mobile — image goes directly to WhatsApp)
      if (navigator.share) {
        try {
          await navigator.share({ files: [file], title: `Bill ${bill.billNumber}` })
          toast.success('Bill shared!')
          return
        } catch (shareErr) {
          // User cancelled or share failed — fall through to download
          if (shareErr.name === 'AbortError') return
        }
      }

      // Fallback: Download image + open WhatsApp chat
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)

      let phone = (bill.customerPhone || bill.customer?.phone || '').replace(/[^0-9]/g, '')
      if (phone.length === 10) phone = '91' + phone
      const waUrl = phone ? `https://wa.me/${phone}` : `https://wa.me/`
      window.location.href = waUrl

      toast.success('Bill download ho gayi! WhatsApp me 📎 se attach karo', { duration: 5000 })
    } catch (err) {
      console.error('Bill image failed:', err)
      toast.dismiss('wp-share')
      toast.error('Bill image nahi ban paya. Download button use karo.')
    }
  }

  const openDetail = (order) => {
    setSelectedOrder(order)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setSelectedOrder(null)
  }

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0)

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const formatDateTime = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const renderActionButtons = (order, compact = false) => {
    const flow = STATUS_FLOW[order.orderStatus]
    if (!flow) return null

    const isLoading = actionLoading === (order.id || order.orderNumber)
    const awaitingConfirmation = !!order.deliveryConfirmationRequestedAt && !order.customerDeliveryConfirmed && (order.orderStatus || '').toLowerCase() === 'shipped'
    const btnBase = {
      display: 'flex', alignItems: 'center', gap: '6px',
      border: 'none', borderRadius: '8px',
      padding: compact ? '6px 12px' : '8px 16px',
      fontSize: compact ? '12px' : '13px',
      fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer',
      opacity: isLoading ? 0.6 : 1,
      transition: 'all 0.2s ease',
      whiteSpace: 'nowrap',
    }

    const buttons = []

    if (flow.bill) {
      const BillIcon = flow.billIcon || flow.icon
      buttons.push(
        <button
          key="bill"
          style={{ ...btnBase, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: '#fff' }}
          onClick={(e) => { e.stopPropagation(); handleGenerateBill(order) }}
          disabled={isLoading}
        >
          <BillIcon size={compact ? 12 : 14} /> {flow.billLabel || flow.label}
        </button>
      )
    }

    if (!flow.bill || flow.next) {
      if (flow.requestConfirmation) {
        const Icon = flow.icon
        if (!awaitingConfirmation) {
          buttons.push(
            <button
              key="request-confirmation"
              style={{ ...btnBase, background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff' }}
              onClick={(e) => { e.stopPropagation(); requestDeliveryConfirmation(order) }}
              disabled={isLoading}
            >
              <Icon size={compact ? 12 : 14} /> {flow.label}
            </button>
          )
        } else {
          buttons.push(
            <button
              key="force-delivered"
              style={{ ...btnBase, background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff' }}
              onClick={(e) => { e.stopPropagation(); updateOrderStatus(order, 'delivered') }}
              disabled={isLoading}
            >
              <Icon size={compact ? 12 : 14} /> Force Delivered
            </button>
          )
        }
      } else if (flow.next) {
        const Icon = flow.icon
        buttons.push(
          <button
            key="next"
            style={{ ...btnBase, background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff' }}
            onClick={(e) => { e.stopPropagation(); updateOrderStatus(order, flow.next) }}
            disabled={isLoading}
          >
            <Icon size={compact ? 12 : 14} /> {flow.label}
          </button>
        )
      }
      if (flow.reject) {
        const RejectIcon = flow.rejectIcon
        buttons.push(
          <button
            key="reject"
            style={{ ...btnBase, background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff' }}
            onClick={(e) => { e.stopPropagation(); updateOrderStatus(order, flow.reject) }}
            disabled={isLoading}
          >
            <RejectIcon size={compact ? 12 : 14} /> {flow.rejectLabel}
          </button>
        )
      }
    }

    // Add verify payment button for 'Verification Pending' orders
    if (order.paymentStatus === 'Verification Pending') {
      buttons.push(
        <button
          key="verify"
          style={{ ...btnBase, background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff' }}
          onClick={(e) => { e.stopPropagation(); verifyOnlinePayment(order) }}
          disabled={isLoading}
        >
          <FaCheck size={compact ? 12 : 14} /> Verify Payment
        </button>
      )
    }

    return buttons.length > 0 ? (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{buttons}</div>
    ) : null
  }

  if (loading) {
    return (
      <AdminLayout>
        <div style={s.loadingWrap}>
          <div style={s.spinner} />
          <p style={{ color: c.textSecondary, fontSize: '14px', marginTop: '12px' }}>Loading orders...</p>
        </div>
        <style>{spinnerKeyframes}</style>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div style={s.page}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <h1 style={s.title}>
              <FaShoppingBag style={{ marginRight: '10px', color: '#0ea5e9' }} />
              Order Management
            </h1>
            <p style={s.subtitle}>{orders.length} total orders &middot; {filteredOrders.length} showing</p>
          </div>
        </div>

        {/* Quick Stats */}
        <div style={s.statsRow}>
          {Object.entries(statusCounts).map(([status, count]) => {
            const colors = STATUS_COLORS[status]
            const isActive = statusFilter === status
            return (
              <div
                key={status}
                onClick={() => setStatusFilter(statusFilter === status ? 'All' : status)}
                style={{
                  ...s.statCard,
                  background: isActive ? colors.bg : c.surface,
                  borderColor: isActive ? colors.color : c.border,
                  cursor: 'pointer',
                  transform: isActive ? 'scale(1.02)' : 'scale(1)',
                  transition: 'all 0.2s ease',
                }}
              >
                <span style={{ fontSize: '24px', fontWeight: '700', color: colors.color }}>{count}</span>
                <span style={{ fontSize: '11px', color: c.textSecondary, textTransform: 'capitalize', fontWeight: '500' }}>{status}</span>
              </div>
            )
          })}
        </div>

        {/* Filters */}
        <div style={s.filterBar}>
          <div style={s.searchWrap}>
            <FaSearch style={s.searchIcon} />
            <input
              type="text"
              placeholder="Search order # or customer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={s.searchInput}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={s.filterSelect}
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt === 'All' ? 'All Status' : formatStatusLabel(opt)}
              </option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            style={s.filterSelect}
          >
            {PAYMENT_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt === 'All' ? 'All Payments' : opt}</option>
            ))}
          </select>
        </div>

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <div style={s.emptyState}>
            <FaBox style={{ fontSize: '48px', color: c.border, marginBottom: '16px' }} />
            <p style={{ color: c.textSecondary, fontSize: '16px', margin: 0 }}>No orders found</p>
            <p style={{ color: c.textSecondary, fontSize: '13px', marginTop: '4px' }}>Try adjusting your filters</p>
          </div>
        ) : (
          <div style={s.tableCard}>
            <div style={s.tableScroll}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Order #</th>
                    <th style={s.th}>Customer</th>
                    <th style={s.th}>Items</th>
                    <th style={s.th}>Total</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Payment</th>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Actions</th>
                    <th style={{ ...s.th, width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map(order => (
                    <tr
                      key={order.id || order.orderNumber}
                      style={s.tr}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(14, 165, 233, 0.04)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ ...s.td, fontWeight: '700', color: '#38bdf8' }}>
                        #{order.orderNumber}
                      </td>
                      <td style={s.td}>
                        <div>
                          <div style={{ color: c.text, fontWeight: '500', fontSize: '14px' }}>
                            {order.customerName || 'Unknown'}
                          </div>
                          {order.customerPhone && (
                            <div style={{ color: c.textSecondary, fontSize: '12px', marginTop: '2px' }}>
                              {order.customerPhone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={s.td}>
                        <div style={{ color: c.text, fontSize: '13px', fontWeight: '600' }}>
                          {getOrderItemsSummary(order)}
                        </div>
                        {order.items?.length > 1 && (
                          <div style={{ color: c.textSecondary, fontSize: '11px', marginTop: '2px' }}>
                            {order.items.length} line items
                          </div>
                        )}
                      </td>
                      <td style={{ ...s.td, fontWeight: '700', color: c.text, fontSize: '14px' }}>
                        {formatCurrency(order.total)}
                      </td>
                      <td style={s.td}>
                        <StatusBadge status={order.customerDeliveryConfirmed ? 'delivered' : (order.deliveryConfirmationRequestedAt && (order.orderStatus || '').toLowerCase() === 'shipped' ? 'awaiting_confirmation' : order.orderStatus)} />
                      </td>
                      <td style={s.td}>
                        <PaymentBadge status={order.paymentStatus} />
                      </td>
                      <td style={{ ...s.td, color: c.textSecondary, fontSize: '13px', whiteSpace: 'nowrap' }}>
                        {formatDate(order.orderDate)}
                      </td>
                      <td style={s.td}>
                        {renderActionButtons(order, true)}
                      </td>
                      <td style={s.td}>
                        <button
                          onClick={() => openDetail(order)}
                          style={s.viewBtn}
                          title="View Details"
                        >
                          <FaEye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap', gap: '12px' }}>
                <span style={{ fontSize: '13px', color: c.textSecondary }}>
                  Showing {(currentPage - 1) * ordersPerPage + 1}-{Math.min(currentPage * ordersPerPage, filteredOrders.length)} of {filteredOrders.length}
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
        )}

        {/* Detail Modal */}
        <Modal isOpen={showModal} onClose={closeModal} title={`Order #${selectedOrder?.orderNumber || ''}`}>
          {selectedOrder && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Status + Payment Row */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusBadge status={selectedOrder.customerDeliveryConfirmed ? 'delivered' : (selectedOrder.deliveryConfirmationRequestedAt && (selectedOrder.orderStatus || '').toLowerCase() === 'shipped' ? 'awaiting_confirmation' : selectedOrder.orderStatus)} />
                <PaymentBadge status={selectedOrder.paymentStatus} />
                {selectedOrder.paymentMethod && (
                  <span style={{ color: c.textSecondary, fontSize: '12px' }}>via {selectedOrder.paymentMethod}</span>
                )}
              </div>

              {/* Customer Info */}
              <div style={s.section}>
                <h4 style={s.sectionTitle}>Customer</h4>
                <div style={s.infoGrid}>
                  <div>
                    <span style={s.label}>Name</span>
                    <span style={s.value}>{selectedOrder.customerName || 'N/A'}</span>
                  </div>
                  <div>
                    <span style={s.label}>Phone</span>
                    <span style={s.value}>{selectedOrder.customerPhone || 'N/A'}</span>
                  </div>
                </div>
                {selectedOrder.deliveryAddress && (
                  <div style={{ marginTop: '8px' }}>
                    <span style={s.label}>Delivery Address</span>
                    <span style={s.value}>{selectedOrder.deliveryAddress}</span>
                  </div>
                )}
              </div>

              {/* Items */}
              <div style={s.section}>
                <h4 style={s.sectionTitle}>Items ({selectedOrder.items?.length || 0})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(selectedOrder.items || []).map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', background: c.bg, borderRadius: '8px',
                      border: `1px solid ${c.border}`,
                    }}>
                      <div>
                        <div style={{ color: c.text, fontSize: '14px', fontWeight: '500' }}>
                          {item.product?.name || item.name || 'Item'}
                        </div>
                        <div style={{ color: c.textSecondary, fontSize: '12px', marginTop: '2px' }}>
                          {getCartItemSummary(item)} x {formatCurrency(item.price)} {getCartItemUnitPriceLabel(item)}
                        </div>
                      </div>
                      <span style={{ color: c.text, fontWeight: '600', fontSize: '14px' }}>
                        {formatCurrency((item.quantity || 0) * (item.price || 0))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div style={s.section}>
                <h4 style={s.sectionTitle}>Order Summary</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={s.summaryRow}>
                    <span>Subtotal</span>
                    <span>{formatCurrency(selectedOrder.subtotal)}</span>
                  </div>
                  <div style={s.summaryRow}>
                    <span>Tax</span>
                    <span>{formatCurrency(selectedOrder.tax)}</span>
                  </div>
                  <div style={{
                    ...s.summaryRow,
                    paddingTop: '8px',
                    borderTop: `1px solid ${c.border}`,
                    color: c.text,
                    fontWeight: '700',
                    fontSize: '16px',
                  }}>
                    <span>Total</span>
                    <span>{formatCurrency(selectedOrder.total)}</span>
                  </div>
                </div>
              </div>

              {/* Status Timeline */}
              {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 && (
                <div style={s.section}>
                  <h4 style={s.sectionTitle}>Timeline</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {selectedOrder.statusHistory.map((entry, idx) => {
                      const entryColors = STATUS_COLORS[entry.status] || STATUS_COLORS.Placed
                      return (
                        <div key={idx} style={{
                          display: 'flex', gap: '12px', padding: '10px 0',
                          borderLeft: `2px solid ${idx === selectedOrder.statusHistory.length - 1 ? entryColors.color : c.border}`,
                          marginLeft: '6px', paddingLeft: '16px', position: 'relative',
                        }}>
                          <div style={{
                            position: 'absolute', left: '-6px', top: '12px',
                            width: '10px', height: '10px', borderRadius: '50%',
                            background: entryColors.color,
                            border: `2px solid ${c.surface}`,
                          }} />
                          <div>
                            <div style={{ color: entryColors.color, fontSize: '13px', fontWeight: '600', textTransform: 'capitalize' }}>
                              {entry.status}
                            </div>
                            <div style={{ color: c.textSecondary, fontSize: '11px', marginTop: '2px' }}>
                              {formatDateTime(entry.timestamp || entry.date || entry.updatedAt)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons in Modal */}
              <div style={{ paddingTop: '8px', borderTop: `1px solid ${c.border}` }}>
                {renderActionButtons(selectedOrder, false) || (
                  <p style={{ color: c.textSecondary, fontSize: '13px', margin: '4px 0', textAlign: 'center' }}>
                    No actions available for this status
                  </p>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* Bill Preview Modal */}
        {showBillModal && generatedBill && (
          <Modal isOpen={showBillModal} onClose={() => { setShowBillModal(false); setGeneratedBill(null) }} title={`Invoice ${generatedBill.billNumber || ''}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Shop Header */}
              <div style={{ textAlign: 'center', padding: '16px 0', borderBottom: `2px solid ${c.border}` }}>
                <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#0e4166', margin: 0 }}>{settings.siteName || 'Shop'}</h2>
                <p style={{ fontSize: '13px', color: c.textSecondary, margin: '4px 0 0' }}>{settings.contact?.address || ''}</p>
                <p style={{ fontSize: '12px', color: c.textSecondary, margin: '2px 0 0' }}>Phone: {settings.contact?.phone || ''}</p>
              </div>

              {/* Invoice Details */}
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: c.textSecondary, marginBottom: '4px' }}>Bill To:</h4>
                  <p style={{ fontSize: '14px', color: c.text, fontWeight: '600', margin: 0 }}>{generatedBill.customerName || 'N/A'}</p>
                  <p style={{ fontSize: '12px', color: c.textSecondary, margin: '2px 0' }}>{generatedBill.customerPhone || ''}</p>
                  <p style={{ fontSize: '12px', color: c.textSecondary, margin: 0 }}>{generatedBill.customerAddress || ''}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '13px', color: c.text, margin: '2px 0' }}><strong>Invoice #:</strong> {generatedBill.billNumber}</p>
                  <p style={{ fontSize: '13px', color: c.text, margin: '2px 0' }}><strong>Date:</strong> {formatBillDate(generatedBill)}</p>
                  <p style={{ fontSize: '13px', color: c.text, margin: '2px 0' }}><strong>Order #:</strong> {generatedBill.orderNumber || generatedBill.orderId || 'N/A'}</p>
                </div>
              </div>

              {/* Items Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ background: '#0e4166', color: '#fff', padding: '8px', fontSize: '11px', textAlign: 'left' }}>S.No</th>
                      <th style={{ background: '#0e4166', color: '#fff', padding: '8px', fontSize: '11px', textAlign: 'left' }}>Item</th>
                      <th style={{ background: '#0e4166', color: '#fff', padding: '8px', fontSize: '11px', textAlign: 'center' }}>Qty</th>
                      <th style={{ background: '#0e4166', color: '#fff', padding: '8px', fontSize: '11px', textAlign: 'right' }}>Rate</th>
                      <th style={{ background: '#0e4166', color: '#fff', padding: '8px', fontSize: '11px', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(generatedBill.items || []).map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${c.border}` }}>
                        <td style={{ padding: '8px', fontSize: '13px' }}>{idx + 1}</td>
                        <td style={{ padding: '8px', fontSize: '13px' }}>{item.name || 'N/A'}</td>
                        <td style={{ padding: '8px', fontSize: '13px', textAlign: 'center' }}>{getCartItemSummary(item)}</td>
                        <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right' }}>{formatCurrency(item.price)} {getCartItemUnitPriceLabel(item)}</td>
                        <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right' }}>{formatCurrency(item.quantity * item.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              {(() => {
                const items = generatedBill.items || []
                const subtotal = items.reduce((sum, item) => sum + (item.quantity * (item.price || 0)), 0)
                const grandTotal = generatedBill.totalAmount || generatedBill.total || subtotal
                return (
                  <div style={{ marginLeft: 'auto', width: '220px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', color: c.textSecondary }}>
                      <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '16px', fontWeight: '700', color: c.text, borderTop: `2px solid ${c.text}`, marginTop: '4px' }}>
                      <span>Grand Total</span><span>{formatCurrency(grandTotal)}</span>
                    </div>
                    <p style={{ fontSize: '11px', color: c.textSecondary, fontStyle: 'italic', margin: '8px 0 0', padding: '8px', background: 'rgba(0,0,0,0.03)', borderRadius: '4px' }}>
                      <strong>Amount in words:</strong> {numberToWords(Math.round(grandTotal))}
                    </p>
                  </div>
                )
              })()}

              {/* Action Buttons — Download, Print, WhatsApp */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', paddingTop: '12px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleBillDownload(generatedBill)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#0ea5e9', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  <FaDownload /> Download
                </button>
                <button
                  onClick={() => handleBillPrint(generatedBill)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  <FaPrint /> Print
                </button>
                <button
                  onClick={() => handleBillWhatsApp(generatedBill)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#25D366', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  <FaWhatsapp /> WhatsApp
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>

      <style>{spinnerKeyframes}</style>
    </AdminLayout>
  )
}

const spinnerKeyframes = `
  @keyframes spin { to { transform: rotate(360deg); } }
`

const getStyles = (c) => ({
  page: {
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '20px',
  },
  title: {
    fontSize: '26px',
    fontWeight: '700',
    color: c.text,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    color: c.textSecondary,
    fontSize: '13px',
    marginTop: '6px',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
    gap: '10px',
    marginBottom: '20px',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '14px 10px',
    borderRadius: '12px',
    border: `1px solid ${c.border}`,
    background: c.surface,
  },
  filterBar: {
    display: 'flex',
    gap: '10px',
    marginBottom: '16px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  searchWrap: {
    position: 'relative',
    flex: 1,
    minWidth: '240px',
  },
  searchIcon: {
    position: 'absolute',
    left: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: c.textSecondary,
    fontSize: '14px',
  },
  searchInput: {
    width: '100%',
    padding: '10px 16px 10px 40px',
    border: `1px solid ${c.border}`,
    borderRadius: '10px',
    background: c.surface,
    color: c.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  filterSelect: {
    padding: '10px 14px',
    border: `1px solid ${c.border}`,
    borderRadius: '10px',
    background: c.surface,
    color: c.text,
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '140px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    background: c.surface,
    borderRadius: '12px',
    border: `1px solid ${c.border}`,
  },
  tableCard: {
    background: c.surface,
    borderRadius: '12px',
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
    fontSize: '11px',
    fontWeight: '700',
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
    fontSize: '14px',
    borderBottom: `1px solid ${c.border}`,
    verticalAlign: 'middle',
  },
  viewBtn: {
    background: 'rgba(14, 165, 233, 0.1)',
    border: '1px solid rgba(14, 165, 233, 0.25)',
    borderRadius: '8px',
    padding: '8px 10px',
    color: '#38bdf8',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  section: {
    padding: '14px',
    background: c.bg,
    borderRadius: '10px',
    border: `1px solid ${c.border}`,
  },
  sectionTitle: {
    color: c.textSecondary,
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    margin: '0 0 10px 0',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  label: {
    display: 'block',
    color: c.textSecondary,
    fontSize: '11px',
    fontWeight: '600',
    marginBottom: '2px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  value: {
    display: 'block',
    color: c.text,
    fontSize: '14px',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    color: c.textSecondary,
    fontSize: '14px',
  },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: `3px solid ${c.spinnerBorder}`,
    borderTop: `3px solid ${c.accent}`,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
})

export default Orders
