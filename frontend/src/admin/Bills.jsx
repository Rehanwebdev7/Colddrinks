import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useSettings } from '../context/SettingsContext'
import { getColors } from './themeColors'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import toast from 'react-hot-toast'
import {
  FaEye, FaDownload, FaPrint, FaFileInvoiceDollar, FaSearch, FaFilter, FaWhatsapp
} from 'react-icons/fa'
import { getCartItemSummary, getCartItemUnitPriceLabel } from '../utils/purchase'

const Bills = () => {
  const { user } = useAuth()
  const { darkMode } = useTheme()
  const { settings } = useSettings()
  const c = getColors(darkMode)
  const [bills, setBills] = useState([])
  const [filteredBills, setFilteredBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('All')
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [selectedBill, setSelectedBill] = useState(null)
  const [pendingOrders, setPendingOrders] = useState([])

  useEffect(() => {
    fetchBills()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [bills, searchQuery, paymentFilter])

  const fetchBills = async () => {
    try {
      setLoading(true)
      const [billsRes, ordersRes] = await Promise.all([
        API.get('/bills').catch(() => ({ data: { bills: [] } })),
        API.get('/orders').catch(() => ({ data: { orders: [] } }))
      ])

      const billsData = billsRes.data.bills || billsRes.data || []
      const ordersData = ordersRes.data.orders || ordersRes.data || []
      setBills(billsData)

      const billedOrderIds = new Set(billsData.map(b => b.orderId || b.order?._id || b.order?.id))
      const pending = ordersData.filter(o => {
        const id = o._id || o.id
        const status = (o.orderStatus || '').toLowerCase()
        return !billedOrderIds.has(id) && (status === 'delivered' || status === 'confirmed')
      })
      // Sort descending by date (newest first)
      pending.sort((a, b) => new Date(b.orderDate || b.createdAt || 0) - new Date(a.orderDate || a.createdAt || 0))
      setPendingOrders(pending)
    } catch (error) {
      console.error('Failed to fetch bills:', error)
      toast.error('Failed to load bills')
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...bills]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(b =>
        (b.billNumber || b._id || '').toLowerCase().includes(q) ||
        (b.orderNumber || '').toLowerCase().includes(q) ||
        (b.customer?.name || b.customerName || '').toLowerCase().includes(q)
      )
    }

    if (paymentFilter !== 'All') {
      filtered = filtered.filter(b => b.paymentStatus === paymentFilter)
    }

    // Sort descending by date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))

    setFilteredBills(filtered)
  }

  const formatDate = (bill) => {
    const raw = bill.createdAt || bill.billDate || bill.orderDate
    if (!raw) return 'N/A'
    const d = new Date(raw)
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-IN')
  }

  const formatDateLong = (bill) => {
    const raw = bill.createdAt || bill.billDate || bill.orderDate
    if (!raw) return 'N/A'
    const d = new Date(raw)
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  const viewInvoice = (bill) => {
    setSelectedBill(bill)
    setShowInvoiceModal(true)
  }

  const generateBill = async (orderId) => {
    try {
      await API.post(`/bills/generate/${orderId}`)
      toast.success('Bill generated successfully')
      fetchBills()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to generate bill')
    }
  }

  const handlePrint = (bill) => {
    const printBill = bill || selectedBill
    if (!printBill) return
    const invoiceHTML = generateInvoiceHTML(printBill)
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

  const handleDownload = (bill) => {
    const invoiceContent = generateInvoiceHTML(bill)
    const blob = new Blob([invoiceContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoice-${bill.billNumber || bill._id?.slice(-6)}.html`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Invoice downloaded')
  }

  const handleWhatsAppShare = async (bill) => {
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

  const generateInvoiceHTML = (bill) => {
    const items = bill.items || []
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * (item.price || 0)), 0)
    const taxAmount = bill.tax || 0
    const cgst = taxAmount / 2
    const sgst = taxAmount / 2
    const discount = bill.discount || 0
    const deliveryCharge = bill.deliveryCharge || 0
    const grandTotal = bill.totalAmount || bill.total || (subtotal + taxAmount + deliveryCharge - discount)
    const fmtCurrency = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n || 0)

    return `<!DOCTYPE html><html><head><title>Invoice ${bill.billNumber || bill._id?.slice(-6)}</title>
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
      <p>#${bill.billNumber || bill._id?.slice(-6)}<br>${formatDateLong(bill)}</p>
    </div>
  </div>
  <div class="details-row">
    <div class="details-box">
      <h4>Bill To</h4>
      <p><strong>${bill.customer?.name || bill.customerName || 'N/A'}</strong><br>${bill.customer?.phone || bill.customerPhone || ''}<br>${bill.customer?.address || bill.customerAddress || ''}</p>
    </div>
    <div class="details-box" style="text-align:right">
      <h4>Order Details</h4>
      <p>Order #: ${bill.orderNumber || bill.order?.orderNumber || bill.orderId || 'N/A'}<br>Payment: ${bill.paymentMethod || 'COD'}<br>Status: ${bill.paymentStatus || 'unpaid'}</p>
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
        <li>Interest at 18% p.a. will be charged on overdue payments.</li>
        <li>Subject to Bangalore jurisdiction only.</li>
      </ol>
    </div>
    <div class="signature"><p>Authorized Signatory</p></div>
  </div>
</div>
</body></html>`
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0)
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

  const styles = getStyles(c)

  if (loading) {
    return (
      <AdminLayout>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading bills...</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div style={styles.page}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Billing System</h1>
        </div>

        {/* Filters */}
        <div style={styles.filterBar}>
          <div style={styles.searchWrapper}>
            <FaSearch style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search bills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="All">All Payment Status</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
          </select>
        </div>

        {/* Pending Orders (Generate Bill) */}
        {pendingOrders.length > 0 && (
          <div style={styles.pendingCard}>
            <h3 style={styles.pendingTitle}>
              <FaFileInvoiceDollar style={{ color: '#f59e0b' }} />
              Orders Awaiting Bill Generation ({pendingOrders.length})
            </h3>
            <div style={styles.pendingList}>
              {pendingOrders.map(order => (
                <div key={order._id || order.id} style={styles.pendingItem}>
                  <span style={styles.pendingOrderNum}>#{order.orderNumber || order._id?.slice(-6) || order.id?.slice(-6)}</span>
                  <span style={styles.pendingCustomer}>{order.customer?.name || order.customerName || 'N/A'}</span>
                  <span>{formatCurrency(order.totalAmount || order.total)}</span>
                  <button style={styles.generateBtn} onClick={() => generateBill(order._id || order.id)}>
                    Generate Bill
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bills Table */}
        <div style={styles.tableCard}>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Bill #</th>
                  <th style={styles.th}>Order #</th>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Payment</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={styles.emptyCell}>No bills found</td>
                  </tr>
                ) : (
                  filteredBills.map((bill) => (
                    <tr key={bill._id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight: '600', color: '#0ea5e9' }}>
                        {bill.billNumber || bill._id?.slice(-6)}
                      </td>
                      <td style={styles.td}>#{bill.orderNumber || bill.order?.orderNumber || bill.orderId || 'N/A'}</td>
                      <td style={styles.td}>{bill.customer?.name || bill.customerName || 'N/A'}</td>
                      <td style={styles.td}>
                        {formatDate(bill)}
                      </td>
                      <td style={{ ...styles.td, fontWeight: '600' }}>
                        {formatCurrency(bill.totalAmount || bill.total)}
                      </td>
                      <td style={styles.td}>
                        <StatusBadge status={bill.paymentStatus || 'unpaid'} />
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionButtons}>
                          <button style={styles.viewBtn} onClick={() => viewInvoice(bill)} title="View">
                            <FaEye />
                          </button>
                          <button style={styles.downloadBtn} onClick={() => handleDownload(bill)} title="Download">
                            <FaDownload />
                          </button>
                          <button style={styles.printBtnSmall} onClick={() => handlePrint(bill)} title="Print">
                            <FaPrint />
                          </button>
                          <button style={{...styles.downloadBtn, background: '#25D366', color: '#fff'}} onClick={() => handleWhatsAppShare(bill)} title="WhatsApp">
                            <FaWhatsapp />
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

        {/* Invoice Preview Modal */}
        {showInvoiceModal && selectedBill && (
          <Modal onClose={() => setShowInvoiceModal(false)}>
            <div style={styles.invoiceModal} id="invoice-print">
              {/* Shop Header */}
              <div style={styles.invoiceHeader}>
                <h2 style={styles.shopName}>{settings.siteName || 'Shop'}</h2>
                <p style={styles.shopAddress}>{settings.contact?.address || ''}</p>
              </div>

              <div style={styles.invoiceDivider} />

              {/* Invoice Details */}
              <div style={styles.invoiceDetailsRow}>
                <div>
                  <h4 style={styles.invoiceSubtitle}>Bill To:</h4>
                  <p style={styles.invoiceText}>{selectedBill.customer?.name || selectedBill.customerName || 'N/A'}</p>
                  <p style={styles.invoiceText}>{selectedBill.customer?.phone || selectedBill.customerPhone || ''}</p>
                  <p style={styles.invoiceText}>{selectedBill.customer?.address || selectedBill.customerAddress || ''}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={styles.invoiceText}><strong>Invoice #:</strong> {selectedBill.billNumber || selectedBill._id?.slice(-6)}</p>
                  <p style={styles.invoiceText}><strong>Date:</strong> {formatDate(selectedBill)}</p>
                  <p style={styles.invoiceText}><strong>Order #:</strong> {selectedBill.orderNumber || selectedBill.order?.orderNumber || selectedBill.orderId || 'N/A'}</p>
                </div>
              </div>

              {/* Items Table */}
              <table style={styles.invoiceTable}>
                <thead>
                  <tr>
                    <th style={styles.invoiceTh}>S.No</th>
                    <th style={styles.invoiceTh}>Item</th>
                    <th style={styles.invoiceTh}>Qty</th>
                    <th style={styles.invoiceTh}>Rate</th>
                    <th style={styles.invoiceTh}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedBill.items || []).map((item, idx) => (
                    <tr key={idx}>
                      <td style={styles.invoiceTd}>{idx + 1}</td>
                      <td style={styles.invoiceTd}>{item.name || item.product?.name || 'N/A'}</td>
                      <td style={styles.invoiceTd}>{getCartItemSummary(item)}</td>
                      <td style={styles.invoiceTd}>{formatCurrency(item.price)} {getCartItemUnitPriceLabel(item)}</td>
                      <td style={styles.invoiceTd}>{formatCurrency(item.quantity * item.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              {(() => {
                const items = selectedBill.items || []
                const subtotal = items.reduce((sum, item) => sum + (item.quantity * (item.price || 0)), 0)
                const discount = selectedBill.discount || 0
                const deliveryCharge = selectedBill.deliveryCharge || 0
                const grandTotal = selectedBill.totalAmount || selectedBill.total || (subtotal + deliveryCharge - discount)

                return (
                  <div style={styles.invoiceTotals}>
                    <div style={styles.totalRow}>
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    {deliveryCharge > 0 && (
                      <div style={styles.totalRow}>
                        <span>Delivery</span>
                        <span>{formatCurrency(deliveryCharge)}</span>
                      </div>
                    )}
                    {discount > 0 && (
                      <div style={styles.totalRow}>
                        <span>Discount</span>
                        <span>-{formatCurrency(discount)}</span>
                      </div>
                    )}
                    <div style={{ ...styles.totalRow, ...styles.grandTotalRow }}>
                      <span>Grand Total</span>
                      <span>{formatCurrency(grandTotal)}</span>
                    </div>
                    <p style={styles.amountInWords}>
                      <strong>Amount in words:</strong> {numberToWords(Math.round(grandTotal))}
                    </p>
                  </div>
                )
              })()}

              {/* Payment Status */}
              <div style={styles.invoicePaymentStatus}>
                <span style={styles.invoiceText}>Payment Status: </span>
                <StatusBadge status={selectedBill.paymentStatus || 'unpaid'} />
              </div>

              {/* Terms */}
              <div style={styles.invoiceTerms}>
                <h4 style={styles.termsTitle}>Terms & Conditions</h4>
                <ol style={styles.termsList}>
                  <li>Payment is due within 15 days from the date of invoice.</li>
                  <li>Goods once sold will not be taken back or exchanged.</li>
                  <li>Interest at 18% p.a. will be charged on overdue payments.</li>
                  <li>Subject to Bangalore jurisdiction only.</li>
                </ol>
              </div>

              {/* Actions */}
              <div style={styles.invoiceActions}>
                <button style={styles.printActionBtn} onClick={() => handlePrint(selectedBill)}>
                  <FaPrint /> Print
                </button>
                <button style={styles.downloadActionBtn} onClick={() => handleDownload(selectedBill)}>
                  <FaDownload /> Download
                </button>
                <button style={{...styles.downloadActionBtn, background: '#25D366'}} onClick={() => handleWhatsAppShare(selectedBill)}>
                  <FaWhatsapp /> WhatsApp
                </button>
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
  header: {
    marginBottom: '24px'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: c.text,
    margin: 0
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
    minWidth: '180px'
  },
  pendingCard: {
    background: 'rgba(245, 158, 11, 0.05)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '20px'
  },
  pendingTitle: {
    color: '#f59e0b',
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 12px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  pendingList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  pendingItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '10px 14px',
    background: c.surface,
    borderRadius: '8px',
    border: `1px solid ${c.border}`
  },
  pendingOrderNum: {
    color: '#0ea5e9',
    fontWeight: '600',
    fontSize: '14px',
    minWidth: '80px'
  },
  pendingCustomer: {
    color: c.text,
    fontSize: '14px',
    flex: 1
  },
  generateBtn: {
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 14px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
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
    background: c.bg
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
  viewBtn: {
    background: 'rgba(14, 165, 233, 0.1)',
    border: '1px solid rgba(14, 165, 233, 0.3)',
    borderRadius: '6px',
    padding: '8px',
    color: '#0ea5e9',
    cursor: 'pointer',
    fontSize: '13px'
  },
  downloadBtn: {
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '6px',
    padding: '8px',
    color: '#22c55e',
    cursor: 'pointer',
    fontSize: '13px'
  },
  printBtnSmall: {
    background: 'rgba(139, 92, 246, 0.1)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    borderRadius: '6px',
    padding: '8px',
    color: '#8b5cf6',
    cursor: 'pointer',
    fontSize: '13px'
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
    border: `3px solid ${c.border}`,
    borderTop: '3px solid #0ea5e9',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  loadingText: {
    color: c.textSecondary,
    fontSize: '14px'
  },
  invoiceModal: {
    padding: '32px',
    maxWidth: '800px',
    width: '100%',
    maxHeight: '85vh',
    overflowY: 'auto',
    background: '#fff',
    color: '#1a1a1a'
  },
  invoiceHeader: {
    textAlign: 'center',
    marginBottom: '16px'
  },
  shopName: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0 0 4px 0'
  },
  shopAddress: {
    fontSize: '13px',
    color: '#555',
    margin: '2px 0'
  },
  shopGstin: {
    fontSize: '13px',
    color: '#555',
    margin: '2px 0',
    fontWeight: '600'
  },
  invoiceDivider: {
    height: '2px',
    background: '#1a1a1a',
    margin: '16px 0'
  },
  invoiceDetailsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '20px',
    gap: '20px'
  },
  invoiceSubtitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0 0 4px 0'
  },
  invoiceText: {
    fontSize: '13px',
    color: '#333',
    margin: '2px 0'
  },
  invoiceTable: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '16px'
  },
  invoiceTh: {
    textAlign: 'left',
    padding: '10px 8px',
    fontSize: '12px',
    fontWeight: '600',
    borderBottom: '2px solid #1a1a1a',
    borderTop: '2px solid #1a1a1a',
    color: '#1a1a1a',
    textTransform: 'uppercase'
  },
  invoiceTd: {
    padding: '8px',
    fontSize: '13px',
    borderBottom: '1px solid #ddd',
    color: '#333'
  },
  invoiceTotals: {
    marginLeft: 'auto',
    maxWidth: '300px',
    marginBottom: '16px'
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '14px',
    color: '#333'
  },
  grandTotalRow: {
    borderTop: '2px solid #1a1a1a',
    paddingTop: '8px',
    fontWeight: '700',
    fontSize: '16px',
    color: '#1a1a1a'
  },
  amountInWords: {
    fontSize: '13px',
    color: '#555',
    marginTop: '8px',
    fontStyle: 'italic'
  },
  invoicePaymentStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
    padding: '10px',
    background: '#f5f5f5',
    borderRadius: '6px'
  },
  invoiceTerms: {
    marginBottom: '20px',
    padding: '12px',
    background: '#f9f9f9',
    borderRadius: '6px'
  },
  termsTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0 0 8px 0'
  },
  termsList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '12px',
    color: '#555',
    lineHeight: '1.6'
  },
  invoiceActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end'
  },
  printActionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: '#1a1a1a',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  downloadActionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: '#0ea5e9',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  }
})

export default Bills
