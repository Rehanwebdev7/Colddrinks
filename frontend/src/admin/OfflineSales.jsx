import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  FaArrowTrendDown,
  FaBolt,
  FaCashRegister,
  FaLayerGroup,
  FaPlus,
  FaReceipt,
  FaTrash,
  FaUser,
  FaPrint,
} from 'react-icons/fa6'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'
import {
  getAllowedPurchaseModes,
  getCartItemSummary,
  getCartItemUnitPriceLabel,
  getDefaultPurchaseMode,
  getModeShortLabel,
  getUnitBoxEquivalent,
  getUnitPrice,
  getMaxPurchaseQuantity,
} from '../utils/purchase'

const PAYMENT_OPTIONS = [
  { value: 'Cash', label: 'Cash', tone: '#22c55e', help: 'Counter payment, instant close.' },
  { value: 'UPI', label: 'UPI', tone: '#0ea5e9', help: 'Online receive, stock still minus instantly.' },
  { value: 'Card', label: 'Card', tone: '#8b5cf6', help: 'Swipe/card received at shop.' },
  { value: 'Udhar', label: 'Udhar', tone: '#f97316', help: 'Customer account me outstanding add hoga.' },
]

const emptyDraft = {
  productId: '',
  quantity: 1,
  purchaseMode: 'full_box',
}

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
}).format(amount || 0)

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

const formatAddress = (address) => {
  if (!address) return ''
  if (typeof address === 'string') return address
  return [address.label, address.street, address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(', ')
}

const OfflineSales = () => {
  const navigate = useNavigate()
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const styles = getStyles(c)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [sales, setSales] = useState([])
  const [catalogQuery, setCatalogQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [draft, setDraft] = useState(emptyDraft)
  const [saleItems, setSaleItems] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [walkInAddress, setWalkInAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [discount, setDiscount] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [productsRes, usersRes, salesRes] = await Promise.all([
        API.get('/products'),
        API.get('/users?role=customer'),
        API.get('/offline-sales'),
      ])

      const productList = Array.isArray(productsRes.data) ? productsRes.data : []
      const customerList = Array.isArray(usersRes.data) ? usersRes.data : []
      const offlineSales = Array.isArray(salesRes.data) ? salesRes.data : []

      setProducts(productList.filter((item) => Number(item.stock ?? item.stockQuantity ?? 0) > 0))
      setCustomers(customerList.filter((user) => user.role === 'customer'))
      setSales(offlineSales)
    } catch (error) {
      console.error('Failed to load offline sales data:', error)
      toast.error('Offline sales screen load nahi ho payi')
    } finally {
      setLoading(false)
    }
  }

  const selectedProduct = useMemo(
    () => products.find((item) => item.id === draft.productId),
    [products, draft.productId]
  )

  const availableModes = useMemo(
    () => (selectedProduct ? getAllowedPurchaseModes(selectedProduct) : ['full_box']),
    [selectedProduct]
  )

  const maxDraftQuantity = selectedProduct
    ? getMaxPurchaseQuantity(selectedProduct, draft.purchaseMode)
    : 0

  const filteredProducts = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase()
    let nextProducts = [...products]

    if (categoryFilter !== 'all') {
      nextProducts = nextProducts.filter(
        (product) => String(product.category || '').toLowerCase() === categoryFilter.toLowerCase()
      )
    }

    if (!query) return nextProducts.slice(0, 18)

    return nextProducts.filter((product) =>
      [product.name, product.category, product.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    ).slice(0, 18)
  }, [products, catalogQuery, categoryFilter])

  const categoryOptions = useMemo(() => {
    const categories = Array.from(new Set(
      products
        .map((product) => String(product.category || '').trim())
        .filter(Boolean)
    ))
    return categories.sort((a, b) => a.localeCompare(b))
  }, [products])

  const linkedCustomer = selectedCustomerId
    ? customers.find((customer) => customer.id === selectedCustomerId)
    : null

  const subtotal = saleItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0)
  const discountValue = Math.max(0, Number(discount || 0))
  const grandTotal = Math.max(0, subtotal - discountValue)
  const totalUnits = saleItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const totalBoxEquivalent = saleItems.reduce((sum, item) => sum + Number(item.boxEquivalent || 0), 0)
  const todaySales = sales.filter((sale) => {
    const today = new Date().toISOString().split('T')[0]
    return String(sale.saleDate || sale.createdAt || '').startsWith(today)
  })
  const todayRevenue = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const todayUdhar = todaySales
    .filter((sale) => String(sale.paymentMethod || '').toLowerCase() === 'udhar')
    .reduce((sum, sale) => sum + Number(sale.total || 0), 0)

  const goToPaymentsForCustomer = (customerId) => {
    navigate(`/admin/payments?customerId=${customerId}&action=collect`)
  }

  const resetForm = () => {
    setDraft(emptyDraft)
    setSaleItems([])
    setSelectedCustomerId('')
    setWalkInName('')
    setWalkInPhone('')
    setWalkInAddress('')
    setPaymentMethod('Cash')
    setDiscount('')
    setNote('')
  }

  const addDraftItem = () => {
    if (!selectedProduct) {
      toast.error('Product select karo')
      return
    }

    const quantity = draft.purchaseMode === 'half_box' ? 1 : Number(draft.quantity)
    if (!quantity || quantity <= 0) {
      toast.error('Valid quantity enter karo')
      return
    }

    const maxQuantity = getMaxPurchaseQuantity(selectedProduct, draft.purchaseMode)
    if (quantity > maxQuantity) {
      toast.error(`Max ${maxQuantity} ${getCartItemSummary({ quantity: maxQuantity, purchaseMode: draft.purchaseMode })}`)
      return
    }

    const existingIndex = saleItems.findIndex(
      (item) => item.productId === selectedProduct.id && item.purchaseMode === draft.purchaseMode
    )

    const nextItem = {
      productId: selectedProduct.id,
      name: selectedProduct.name,
      image: selectedProduct.image || '',
      quantity,
      purchaseMode: draft.purchaseMode,
      price: getUnitPrice(selectedProduct, draft.purchaseMode),
      boxQuantity: Number(selectedProduct.boxQuantity || selectedProduct.bottlesPerBox || selectedProduct.unitsPerBox || 24),
      boxEquivalent: Number((getUnitBoxEquivalent(selectedProduct, draft.purchaseMode) * quantity).toFixed(2)),
      stock: Number(selectedProduct.stock ?? selectedProduct.stockQuantity ?? 0),
      maxQuantity,
    }

    const nextItems = [...saleItems]
    if (existingIndex >= 0) {
      const mergedQuantity = draft.purchaseMode === 'half_box'
        ? 1
        : nextItems[existingIndex].quantity + quantity
      if (mergedQuantity > maxQuantity) {
        toast.error('Is mode me itna stock available nahi hai')
        return
      }
      nextItems[existingIndex] = {
        ...nextItems[existingIndex],
        quantity: mergedQuantity,
        boxEquivalent: Number((getUnitBoxEquivalent(selectedProduct, draft.purchaseMode) * mergedQuantity).toFixed(2)),
      }
    } else {
      nextItems.push(nextItem)
    }

    setSaleItems(nextItems)
    setDraft({
      productId: '',
      quantity: 1,
      purchaseMode: 'full_box',
    })
  }

  const updateItemQuantity = (index, nextQuantity) => {
    const target = saleItems[index]
    if (!target) return
    if (target.purchaseMode === 'half_box') return

    const safeQuantity = Math.max(1, Number(nextQuantity || 1))
    if (safeQuantity > target.maxQuantity) {
      toast.error(`Max available ${target.maxQuantity}`)
      return
    }

    setSaleItems((prev) => prev.map((item, itemIndex) => (
      itemIndex === index
        ? {
            ...item,
            quantity: safeQuantity,
            boxEquivalent: Number((safeQuantity * getUnitBoxEquivalent(item, item.purchaseMode)).toFixed(2)),
          }
        : item
    )))
  }

  const removeItem = (index) => {
    setSaleItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
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

  const submitSale = async () => {
    if (saleItems.length === 0) {
      toast.error('Sale me kam se kam 1 item hona chahiye')
      return
    }

    if (paymentMethod === 'Udhar' && !selectedCustomerId) {
      toast.error('Udhar sale ke liye customer account select karo')
      return
    }

    try {
      setSaving(true)
      const payload = {
        customerId: selectedCustomerId || null,
        customerName: linkedCustomer ? linkedCustomer.name : walkInName,
        customerPhone: linkedCustomer ? linkedCustomer.phone : walkInPhone,
        customerAddress: linkedCustomer
          ? formatAddress(linkedCustomer.address) || formatAddress(linkedCustomer.addresses?.[0]) || ''
          : walkInAddress,
        paymentMethod,
        discount: discountValue,
        note,
        items: saleItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          purchaseMode: item.purchaseMode,
        })),
      }

      const response = await API.post('/offline-sales', payload)
      const createdSale = response.data
      toast.success(`Sale ${createdSale.saleNumber || ''} saved — bill ready!`)
      // Auto-print bill after save
      if (createdSale && createdSale.saleNumber) {
        setTimeout(() => printBill(createdSale), 300)
      }
      resetForm()
      await fetchData()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Offline sale save nahi hui')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div style={styles.loadingWrap}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Offline sales workspace load ho raha hai...</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div style={styles.page}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @media (max-width: 1100px) {
            .offline-sales-grid { grid-template-columns: 1fr !important; }
            .offline-sales-hero { grid-template-columns: 1fr !important; }
          }
          @media (max-width: 720px) {
            .offline-sales-form-grid,
            .offline-sales-payment-grid,
            .offline-sales-compact-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
        <section className="offline-sales-hero" style={styles.hero}>
          <div style={styles.heroCopy}>
            <span style={styles.heroBadge}>Shared stock. Fast counter billing.</span>
            <h1 style={styles.heroTitle}>Offline Sales Counter</h1>
            <p style={styles.heroText}>
              Direct sale, direct stock minus, direct udhar recovery. Screen ko counter use ke hisaab se compact rakha gaya hai.
            </p>
          </div>
          <div style={styles.heroStats}>
            <div style={styles.statCard}>
              <span style={styles.statIcon}><FaReceipt /></span>
              <div>
                <div style={styles.statValue}>{todaySales.length}</div>
                <div style={styles.statLabel}>Aaj ki offline sales</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statIcon}><FaCashRegister /></span>
              <div>
                <div style={styles.statValue}>{formatCurrency(todayRevenue)}</div>
                <div style={styles.statLabel}>Aaj counter revenue</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statIcon}><FaArrowTrendDown /></span>
              <div>
                <div style={styles.statValue}>{formatCurrency(todayUdhar)}</div>
                <div style={styles.statLabel}>Aaj ka udhar</div>
              </div>
            </div>
          </div>
        </section>

        <div className="offline-sales-grid" style={styles.grid}>
          <section style={styles.panel}>
            <div style={styles.panelHeader}>
              <div>
                <h2 style={styles.panelTitle}>Create Counter Sale</h2>
                <p style={styles.panelSubtext}>Product add karo, customer choose karo, payment select karo, then bill-ready sale save karo.</p>
              </div>
              <div style={styles.modeChip}>
                <FaBolt />
                Shared Inventory Active
              </div>
            </div>

            <div style={styles.sectionBlock}>
              <div style={styles.sectionTitleRow}>
                <h3 style={styles.sectionTitle}>1. Product picker</h3>
                <span style={styles.sectionHint}>Stock waale products hi dikh rahe hain</span>
              </div>

              <div className="offline-sales-form-grid" style={styles.formGrid}>
                <div style={styles.field}>
                  <label style={styles.label}>Quick search</label>
                  <input
                    value={catalogQuery}
                    onChange={(e) => setCatalogQuery(e.target.value)}
                    placeholder="Name, category ya product id"
                    style={styles.input}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Category list</label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={styles.input}
                  >
                    <option value="all">All categories</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="offline-sales-form-grid" style={styles.formGrid}>
                <div style={styles.field}>
                  <label style={styles.label}>Product</label>
                  <select
                    value={draft.productId}
                    onChange={(e) => {
                      const product = products.find((item) => item.id === e.target.value)
                      setDraft({
                        productId: e.target.value,
                        quantity: 1,
                        purchaseMode: product ? getDefaultPurchaseMode(product) : 'full_box',
                      })
                    }}
                    style={styles.input}
                  >
                    <option value="">Product select karo</option>
                    {filteredProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} • {product.category || 'General'} • {Number(product.stock ?? product.stockQuantity ?? 0)} box eq
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {products.length === 0 && (
                <div style={styles.warningBox}>
                  <strong>No sellable products loaded.</strong>
                  <span style={styles.warningText}>
                    Backend se product list empty aa rahi hai ya sab products ka stock `0` hai. Isliye select box empty dikh raha hai.
                  </span>
                </div>
              )}

              {products.length > 0 && filteredProducts.length === 0 && catalogQuery.trim() && (
                <div style={styles.warningBox}>
                  <strong>No match for "{catalogQuery}".</strong>
                  <span style={styles.warningText}>
                    Search clear karo ya check karo ki product ka stock available hai.
                  </span>
                </div>
              )}

              {selectedProduct && (
                <div style={styles.productHighlight}>
                  <div>
                    <div style={styles.productName}>{selectedProduct.name}</div>
                    <div style={styles.productMeta}>
                      {selectedProduct.category || 'General'} • Stock {Number(selectedProduct.stock ?? selectedProduct.stockQuantity ?? 0)} box eq
                    </div>
                  </div>
                  <div style={styles.productPrice}>{formatCurrency(getUnitPrice(selectedProduct, draft.purchaseMode))} {getCartItemUnitPriceLabel({ purchaseMode: draft.purchaseMode })}</div>
                </div>
              )}

              <div className="offline-sales-compact-grid" style={styles.compactGrid}>
                <div style={styles.field}>
                  <label style={styles.label}>Mode</label>
                  <div style={styles.segmentRow}>
                    {availableModes.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, purchaseMode: mode, quantity: mode === 'half_box' ? 1 : prev.quantity }))}
                        style={{
                          ...styles.segmentBtn,
                          ...(draft.purchaseMode === mode ? styles.segmentBtnActive : {}),
                        }}
                      >
                        {getModeShortLabel(mode)}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Quantity</label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, maxDraftQuantity)}
                    value={draft.purchaseMode === 'half_box' ? 1 : draft.quantity}
                    onChange={(e) => setDraft((prev) => ({ ...prev, quantity: Number(e.target.value || 1) }))}
                    disabled={draft.purchaseMode === 'half_box'}
                    style={styles.input}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Action</label>
                  <button type="button" onClick={addDraftItem} style={styles.addBtn}>
                    <FaPlus />
                    Add to sale
                  </button>
                </div>
              </div>
            </div>

            <div style={styles.sectionBlock}>
              <div style={styles.sectionTitleRow}>
                <h3 style={styles.sectionTitle}>2. Customer and payment</h3>
                <span style={styles.sectionHint}>Udhar ke liye linked customer required</span>
              </div>

              <div className="offline-sales-form-grid" style={styles.formGrid}>
                <div style={styles.field}>
                  <label style={styles.label}>Existing customer</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    style={styles.input}
                  >
                    <option value="">Walk-in customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} • {customer.phone}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Discount</label>
                  <input
                    type="number"
                    min={0}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                    style={styles.input}
                  />
                </div>
              </div>

              {!linkedCustomer && (
                <div className="offline-sales-form-grid" style={styles.formGrid}>
                  <div style={styles.field}>
                    <label style={styles.label}>Walk-in name</label>
                    <input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="Optional" style={styles.input} />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Phone</label>
                    <input value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} placeholder="Optional" style={styles.input} />
                  </div>
                </div>
              )}

              {!linkedCustomer && (
                <div style={styles.field}>
                  <label style={styles.label}>Address / note for bill</label>
                  <input value={walkInAddress} onChange={(e) => setWalkInAddress(e.target.value)} placeholder="Optional" style={styles.input} />
                </div>
              )}

              {linkedCustomer && (
                <div style={styles.customerCard}>
                  <div style={styles.customerHeader}>
                    <FaUser />
                    Linked customer account
                  </div>
                  <div style={styles.customerName}>{linkedCustomer.name}</div>
                  <div style={styles.customerMeta}>{linkedCustomer.phone || 'No phone'} • Outstanding {formatCurrency(linkedCustomer.outstanding || 0)}</div>
                </div>
              )}

              <div className="offline-sales-payment-grid" style={styles.paymentGrid}>
                {PAYMENT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value)}
                    style={{
                      ...styles.paymentCard,
                      borderColor: paymentMethod === option.value ? option.tone : c.border,
                      boxShadow: paymentMethod === option.value ? `0 0 0 1px ${option.tone}` : 'none',
                    }}
                  >
                    <div style={{ ...styles.paymentDot, background: option.tone }} />
                    <div style={styles.paymentLabel}>{option.label}</div>
                    <div style={styles.paymentHelp}>{option.help}</div>
                  </button>
                ))}
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Internal note</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Example: shop counter sale, quick dispatch, partial carton request"
                  style={styles.textarea}
                />
              </div>
            </div>
          </section>

          <aside style={styles.summaryPanel}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Live Sale Summary</h2>
                  <p style={styles.panelSubtext}>Save hote hi bill banega aur stock minus hoga.</p>
                </div>
                <div style={styles.summaryPill}>
                  <FaLayerGroup />
                  {saleItems.length} items
                </div>
              </div>

              <div style={styles.summaryItems}>
                {saleItems.length === 0 && (
                  <div style={styles.emptyState}>
                    <FaCashRegister style={{ fontSize: 24, color: c.textSecondary }} />
                    <p style={styles.emptyText}>Abhi tak koi item add nahi hua.</p>
                  </div>
                )}

                {saleItems.map((item, index) => (
                  <div key={`${item.productId}-${item.purchaseMode}`} style={styles.itemCard}>
                    <div style={styles.itemTop}>
                      <div>
                        <div style={styles.itemName}>{item.name}</div>
                        <div style={styles.itemMeta}>{getCartItemSummary(item)} • {formatCurrency(item.price)} {getCartItemUnitPriceLabel(item)}</div>
                      </div>
                      <button type="button" onClick={() => removeItem(index)} style={styles.iconBtn}>
                        <FaTrash />
                      </button>
                    </div>
                    <div style={styles.itemFooter}>
                      <input
                        type="number"
                        min={1}
                        max={item.maxQuantity}
                        disabled={item.purchaseMode === 'half_box'}
                        value={item.quantity}
                        onChange={(e) => updateItemQuantity(index, e.target.value)}
                        style={styles.qtyInput}
                      />
                      <span style={styles.itemValue}>{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={styles.totals}>
                <div style={styles.totalRow}><span>Total units</span><strong>{totalUnits}</strong></div>
                <div style={styles.totalRow}><span>Box equivalent</span><strong>{Number(totalBoxEquivalent.toFixed(2))}</strong></div>
                <div style={styles.totalRow}><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
                <div style={styles.totalRow}><span>Discount</span><strong>{formatCurrency(discountValue)}</strong></div>
                <div style={{ ...styles.totalRow, ...styles.totalGrand }}><span>Grand total</span><strong>{formatCurrency(grandTotal)}</strong></div>
              </div>

              <button type="button" onClick={submitSale} disabled={saving} style={styles.primaryBtn}>
                <FaReceipt />
                {saving ? 'Saving sale...' : paymentMethod === 'Udhar' ? 'Create Udhar Sale' : 'Save Sale & Generate Bill'}
              </button>
              <button type="button" onClick={resetForm} style={styles.secondaryBtn}>
                Clear Draft
              </button>
            </div>

            <div style={styles.historyCard}>
              <div style={styles.summaryHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Recent Offline Sales</h2>
                  <p style={styles.panelSubtext}>Last entries, taaki counter team ko instant context mile.</p>
                </div>
              </div>

              <div style={styles.historyList}>
                {sales.slice(0, 8).map((sale) => (
                  <div key={sale.id} style={styles.historyItem}>
                    <div style={styles.historyTop}>
                      <div>
                        <div style={styles.historyNumber}>{sale.saleNumber}</div>
                        <div style={styles.historyCustomer}>{sale.customerName || 'Walk-in Customer'}</div>
                      </div>
                      <div style={{
                        ...styles.historyBadge,
                        background: String(sale.paymentMethod).toLowerCase() === 'udhar' ? 'rgba(249, 115, 22, 0.14)' : 'rgba(34, 197, 94, 0.14)',
                        color: String(sale.paymentMethod).toLowerCase() === 'udhar' ? '#f97316' : '#22c55e',
                      }}>
                        {sale.paymentMethod}
                      </div>
                    </div>
                    <div style={styles.historyMeta}>
                      {formatDateTime(sale.saleDate || sale.createdAt)} • {sale.items?.length || 0} items
                    </div>
                    {String(sale.paymentMethod || '').toLowerCase() === 'udhar' && (
                      <div style={styles.udharNote}>
                        Added {formatCurrency(sale.total)} on udhar{sale.customer?.outstanding != null ? ` • Total outstanding ${formatCurrency(sale.customer.outstanding)}` : ''}
                      </div>
                    )}
                    <div style={styles.historyBottom}>
                      <span>{sale.customerPhone || 'No phone'}</span>
                      <strong>{formatCurrency(sale.total)}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="button" onClick={() => printBill(sale)} style={{ ...styles.collectBtn, background: 'rgba(59,130,246,0.14)', color: '#3b82f6', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <FaPrint /> Print Bill
                      </button>
                      {String(sale.paymentMethod || '').toLowerCase() === 'udhar' && sale.customerId && (
                        <button type="button" onClick={() => goToPaymentsForCustomer(sale.customerId)} style={{ ...styles.collectBtn, flex: 1 }}>
                          Manage Udhar →
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {sales.length === 0 && (
                  <div style={styles.emptyState}>
                    <FaReceipt style={{ fontSize: 24, color: c.textSecondary }} />
                    <p style={styles.emptyText}>Offline sales history abhi empty hai.</p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

      </div>
    </AdminLayout>
  )
}

const getStyles = (c) => ({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    color: c.text,
  },
  loadingWrap: {
    minHeight: '60vh',
    display: 'grid',
    placeItems: 'center',
    gap: '12px',
  },
  spinner: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: `3px solid ${c.spinnerBorder}`,
    borderTopColor: c.accent,
    animation: 'spin 0.9s linear infinite',
  },
  loadingText: {
    color: c.textSecondary,
    fontSize: 14,
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: '1.35fr 1fr',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: '16px',
    background: darkGradient(c),
    border: `1px solid ${c.border}`,
    overflow: 'hidden',
  },
  heroCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    padding: '7px 12px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  heroTitle: {
    margin: 0,
    fontSize: '30px',
    color: '#fff',
  },
  heroText: {
    margin: 0,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 1.6,
    maxWidth: 560,
    fontSize: 14,
  },
  heroStats: {
    display: 'grid',
    gap: '12px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 18px',
    borderRadius: '20px',
    background: 'rgba(15, 23, 42, 0.26)',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 800,
    color: '#fff',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 13,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.35fr 0.95fr',
    gap: '12px',
    alignItems: 'start',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '14px 16px 0',
    borderRadius: '14px 14px 0 0',
    background: c.card,
    border: `1px solid ${c.border}`,
    borderBottom: 'none',
  },
  panelTitle: {
    margin: 0,
    fontSize: 22,
  },
  panelSubtext: {
    margin: '6px 0 0',
    fontSize: 13,
    color: c.textSecondary,
    lineHeight: 1.6,
  },
  modeChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(14,165,233,0.12)',
    color: c.accent,
    border: `1px solid rgba(14,165,233,0.24)`,
    borderRadius: 999,
    padding: '9px 12px',
    fontSize: 12,
    fontWeight: 700,
  },
  sectionBlock: {
    background: c.card,
    border: `1px solid ${c.border}`,
    borderTop: 'none',
    padding: '0 22px 22px',
  },
  sectionTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    paddingTop: '18px',
    marginBottom: '14px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: 15,
  },
  sectionHint: {
    color: c.textSecondary,
    fontSize: 12,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '14px',
    marginBottom: '14px',
  },
  compactGrid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 0.7fr 0.7fr',
    gap: '14px',
    alignItems: 'end',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: c.text,
  },
  input: {
    width: '100%',
    borderRadius: '14px',
    border: `1px solid ${c.border}`,
    background: c.inputBg,
    color: c.text,
    padding: '12px 14px',
    fontSize: 14,
    outline: 'none',
  },
  textarea: {
    width: '100%',
    minHeight: 92,
    resize: 'vertical',
    borderRadius: '14px',
    border: `1px solid ${c.border}`,
    background: c.inputBg,
    color: c.text,
    padding: '12px 14px',
    fontSize: 14,
    outline: 'none',
  },
  segmentRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  segmentBtn: {
    borderRadius: '12px',
    border: `1px solid ${c.border}`,
    background: c.inputBg,
    color: c.textSecondary,
    padding: '10px 12px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  segmentBtnActive: {
    color: '#fff',
    background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
    borderColor: '#0ea5e9',
  },
  addBtn: {
    height: 48,
    border: 'none',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, #0f766e 0%, #0ea5e9 100%)',
    color: '#fff',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  productHighlight: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '14px',
    borderRadius: '18px',
    background: c.inputBg,
    border: `1px solid ${c.border}`,
    padding: '14px 16px',
    marginBottom: '14px',
  },
  productName: {
    fontWeight: 800,
    fontSize: 15,
  },
  productMeta: {
    marginTop: 4,
    color: c.textSecondary,
    fontSize: 13,
  },
  productPrice: {
    fontWeight: 800,
    color: c.accent,
  },
  customerCard: {
    borderRadius: '18px',
    padding: '14px 16px',
    background: 'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(59,130,246,0.04))',
    border: `1px solid rgba(14,165,233,0.24)`,
    marginBottom: '14px',
  },
  customerHeader: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    color: c.accent,
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  customerName: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: 800,
  },
  customerMeta: {
    marginTop: 5,
    color: c.textSecondary,
    fontSize: 13,
  },
  paymentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
    marginBottom: '14px',
  },
  paymentCard: {
    textAlign: 'left',
    borderRadius: '18px',
    border: `1px solid ${c.border}`,
    background: c.inputBg,
    color: c.text,
    padding: '14px 14px 15px',
    cursor: 'pointer',
  },
  paymentDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    marginBottom: 10,
  },
  paymentLabel: {
    fontWeight: 800,
    marginBottom: 4,
  },
  paymentHelp: {
    color: c.textSecondary,
    fontSize: 12,
    lineHeight: 1.5,
  },
  warningBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    borderRadius: '16px',
    padding: '14px 16px',
    background: 'rgba(249,115,22,0.12)',
    border: '1px solid rgba(249,115,22,0.26)',
    color: c.text,
    marginBottom: '14px',
  },
  warningText: {
    color: c.textSecondary,
    fontSize: 13,
    lineHeight: 1.6,
  },
  summaryPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  summaryCard: {
    background: c.card,
    border: `1px solid ${c.border}`,
    borderRadius: '14px',
    padding: '14px',
    position: 'sticky',
    top: 84,
  },
  summaryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '16px',
  },
  summaryPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: c.inputBg,
    color: c.textSecondary,
    border: `1px solid ${c.border}`,
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
  },
  summaryItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  itemCard: {
    borderRadius: '18px',
    border: `1px solid ${c.border}`,
    background: c.inputBg,
    padding: '14px',
  },
  itemTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '14px',
    alignItems: 'flex-start',
  },
  itemName: {
    fontWeight: 800,
  },
  itemMeta: {
    marginTop: 4,
    color: c.textSecondary,
    fontSize: 12,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    background: 'rgba(239,68,68,0.12)',
    color: c.danger,
    display: 'grid',
    placeItems: 'center',
  },
  itemFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginTop: '12px',
  },
  qtyInput: {
    width: 84,
    borderRadius: '12px',
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.text,
    padding: '9px 10px',
  },
  itemValue: {
    fontWeight: 800,
  },
  totals: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '16px',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: c.textSecondary,
    fontSize: 14,
  },
  totalGrand: {
    color: c.text,
    fontSize: 16,
    paddingTop: 10,
    borderTop: `1px solid ${c.border}`,
  },
  primaryBtn: {
    width: '100%',
    border: 'none',
    borderRadius: '16px',
    padding: '14px 16px',
    background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
    color: '#fff',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: '10px',
  },
  secondaryBtn: {
    width: '100%',
    borderRadius: '16px',
    padding: '13px 16px',
    background: 'transparent',
    color: c.textSecondary,
    fontWeight: 700,
    border: `1px solid ${c.border}`,
    cursor: 'pointer',
  },
  historyCard: {
    background: c.card,
    border: `1px solid ${c.border}`,
    borderRadius: '14px',
    padding: '12px',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  historyItem: {
    borderRadius: '18px',
    padding: '12px',
    border: `1px solid ${c.border}`,
    background: c.inputBg,
  },
  historyTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  historyNumber: {
    fontWeight: 800,
    color: c.text,
  },
  historyCustomer: {
    marginTop: 4,
    color: c.textSecondary,
    fontSize: 13,
  },
  historyBadge: {
    borderRadius: 999,
    padding: '7px 11px',
    fontSize: 11,
    fontWeight: 800,
  },
  historyMeta: {
    marginTop: 10,
    color: c.textSecondary,
    fontSize: 12,
  },
  udharNote: {
    marginTop: 8,
    borderRadius: '12px',
    padding: '8px 10px',
    background: 'rgba(249,115,22,0.08)',
    border: '1px solid rgba(249,115,22,0.24)',
    color: '#fb923c',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.5,
  },
  historyBottom: {
    marginTop: 10,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    fontSize: 13,
  },
  collectBtn: {
    marginTop: 10,
    width: '100%',
    border: 'none',
    borderRadius: '12px',
    padding: '9px 12px',
    background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
    color: '#fff',
    fontWeight: 800,
    cursor: 'pointer',
  },
  udharModal: {
    width: 'min(920px, 92vw)',
    color: c.text,
  },
  udharModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    alignItems: 'flex-start',
    marginBottom: '18px',
  },
  udharModalEyebrow: {
    color: c.accent,
    fontWeight: 800,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
  },
  udharModalTitle: {
    margin: 0,
    fontSize: 24,
  },
  udharModalSubtext: {
    margin: '6px 0 0',
    color: c.textSecondary,
    fontSize: 14,
  },
  udharSaleChip: {
    borderRadius: 999,
    padding: '10px 14px',
    background: 'rgba(249,115,22,0.1)',
    border: '1px solid rgba(249,115,22,0.24)',
    color: '#fb923c',
    fontWeight: 800,
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  udharManagerGrid: {
    display: 'grid',
    gridTemplateColumns: '0.9fr 1.1fr',
    gap: '16px',
  },
  udharManagerCard: {
    borderRadius: '20px',
    border: `1px solid ${c.border}`,
    background: c.inputBg,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  udharCardTitle: {
    margin: 0,
    fontSize: 16,
  },
  udharHistoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  udharHistoryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    borderRadius: '14px',
    border: `1px solid ${c.border}`,
    padding: '10px 12px',
    background: c.surface,
  },
  udharHistoryTitle: {
    fontWeight: 700,
    fontSize: 13,
  },
  udharHistoryMeta: {
    marginTop: 4,
    color: c.textSecondary,
    fontSize: 12,
  },
  udharHistoryAmount: {
    fontWeight: 800,
    fontSize: 14,
    whiteSpace: 'nowrap',
  },
  emptyState: {
    borderRadius: '18px',
    border: `1px dashed ${c.border}`,
    padding: '28px 16px',
    textAlign: 'center',
    display: 'grid',
    placeItems: 'center',
    gap: '8px',
  },
  emptyText: {
    margin: 0,
    color: c.textSecondary,
    fontSize: 13,
  },
})

const darkGradient = (c) => c.bg === '#0f172a'
  ? 'radial-gradient(circle at top left, rgba(14,165,233,0.34), transparent 34%), linear-gradient(135deg, #111827 0%, #0f172a 42%, #1d4ed8 140%)'
  : 'radial-gradient(circle at top left, rgba(14,165,233,0.28), transparent 34%), linear-gradient(135deg, #0f766e 0%, #0ea5e9 48%, #1d4ed8 140%)'

export default OfflineSales
