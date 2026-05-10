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
import Modal from '../components/Modal'
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

const sanitizeWholeNumberInput = (value) => String(value || '').replace(/\D/g, '')

const normalizeQuantityValue = (value, maxQuantity) => {
  const parsed = Number.parseInt(String(value || ''), 10)
  const safeMax = Math.max(1, Number(maxQuantity) || 1)
  if (Number.isNaN(parsed) || parsed < 1) return 1
  return Math.min(parsed, safeMax)
}

const preventAccidentalQuantityScroll = (event) => {
  event.preventDefault()
}

const preventStepperKeys = (event) => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) {
    event.preventDefault()
  }
}

const getSaleItemKey = (item) => `${item.productId}-${item.purchaseMode}`

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
  const [draftQuantityInput, setDraftQuantityInput] = useState('1')
  const [saleItems, setSaleItems] = useState([])
  const [itemQuantityInputs, setItemQuantityInputs] = useState({})
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [walkInAddress, setWalkInAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [discount, setDiscount] = useState('')
  const [note, setNote] = useState('')
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    setItemQuantityInputs((prev) => {
      const next = {}
      saleItems.forEach((item) => {
        const itemKey = getSaleItemKey(item)
        next[itemKey] = prev[itemKey] ?? String(item.quantity || 1)
      })
      return next
    })
  }, [saleItems])

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

    if (query) {
      nextProducts = nextProducts.filter((product) =>
        [product.name, product.category, product.id]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      )
    }

    // When a filter is active (category or search), show ALL matches.
    // Otherwise cap the default catalog view for visual hygiene.
    const hasFilter = categoryFilter !== 'all' || !!query
    return hasFilter ? nextProducts : nextProducts.slice(0, 24)
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
    setDraftQuantityInput('1')
    setSaleItems([])
    setItemQuantityInputs({})
    setSelectedCustomerId('')
    setWalkInName('')
    setWalkInPhone('')
    setWalkInAddress('')
    setPaymentMethod('Cash')
    setDiscount('')
    setNote('')
  }

  const quickAddItem = (product, mode, qty = 1) => {
    if (!product) return
    const useMode = mode || getDefaultPurchaseMode(product)
    const useQty = useMode === 'half_box' ? 1 : Math.max(1, Number(qty) || 1)
    const maxQuantity = getMaxPurchaseQuantity(product, useMode)
    if (useQty > maxQuantity) {
      toast.error(`Max ${maxQuantity} ${getModeShortLabel(useMode)} stock available`)
      return
    }

    const existingIndex = saleItems.findIndex(
      (item) => item.productId === product.id && item.purchaseMode === useMode
    )
    const unitBox = getUnitBoxEquivalent(product, useMode)

    if (existingIndex >= 0) {
      const merged = useMode === 'half_box' ? 1 : saleItems[existingIndex].quantity + useQty
      if (merged > maxQuantity) {
        toast.error('Stock se zyada nahi add ho sakta')
        return
      }
      setSaleItems((prev) => prev.map((it, i) => i === existingIndex ? {
        ...it,
        quantity: merged,
        boxEquivalent: Number((unitBox * merged).toFixed(2)),
      } : it))
    } else {
      setSaleItems((prev) => [...prev, {
        productId: product.id,
        name: product.name,
        image: product.image || '',
        quantity: useQty,
        purchaseMode: useMode,
        price: getUnitPrice(product, useMode),
        boxQuantity: Number(product.boxQuantity || product.bottlesPerBox || product.unitsPerBox || 24),
        boxEquivalent: Number((unitBox * useQty).toFixed(2)),
        stock: Number(product.stock ?? product.stockQuantity ?? 0),
        maxQuantity,
      }])
    }
  }

  const inCartCount = (productId, mode) => {
    const found = saleItems.find((it) => it.productId === productId && it.purchaseMode === mode)
    return found?.quantity || 0
  }

  const updateQuantityById = (productId, mode, nextQty) => {
    setSaleItems((prev) => {
      const idx = prev.findIndex((it) => it.productId === productId && it.purchaseMode === mode)
      if (idx === -1) return prev
      const target = prev[idx]
      if (nextQty <= 0) return prev.filter((_, i) => i !== idx)
      if (target.purchaseMode === 'half_box') return prev
      const max = target.maxQuantity || 1
      const safe = Math.min(Math.max(1, nextQty), max)
      return prev.map((it, i) => i === idx ? {
        ...it,
        quantity: safe,
        boxEquivalent: Number((safe * getUnitBoxEquivalent({ ...it, boxQuantity: it.boxQuantity }, it.purchaseMode)).toFixed(2)),
      } : it)
    })
  }

  const removeByProductMode = (productId, mode) => {
    setSaleItems((prev) => prev.filter((it) => !(it.productId === productId && it.purchaseMode === mode)))
  }

  const addDraftItem = () => {
    if (!selectedProduct) {
      toast.error('Product select karo')
      return
    }

    const quantity = draft.purchaseMode === 'half_box' ? 1 : Number(draftQuantityInput)
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
    setDraftQuantityInput('1')
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

  const handleDraftQuantityChange = (value) => {
    if (draft.purchaseMode === 'half_box') return
    const sanitizedValue = sanitizeWholeNumberInput(value)
    setDraftQuantityInput(sanitizedValue)
    setDraft((prev) => ({
      ...prev,
      quantity: sanitizedValue === '' ? '' : Number(sanitizedValue),
    }))
  }

  const commitDraftQuantity = () => {
    if (draft.purchaseMode === 'half_box') {
      setDraftQuantityInput('1')
      setDraft((prev) => ({ ...prev, quantity: 1 }))
      return
    }

    const normalizedQuantity = normalizeQuantityValue(draftQuantityInput, maxDraftQuantity)
    setDraftQuantityInput(String(normalizedQuantity))
    setDraft((prev) => ({ ...prev, quantity: normalizedQuantity }))
  }

  const handleItemQuantityChange = (item, value) => {
    if (item.purchaseMode === 'half_box') return
    const sanitizedValue = sanitizeWholeNumberInput(value)
    setItemQuantityInputs((prev) => ({
      ...prev,
      [getSaleItemKey(item)]: sanitizedValue,
    }))
    // Live: if a valid number is entered, push it to saleItems immediately
    // so line total & grand total recalculate without needing blur.
    if (sanitizedValue !== '') {
      const parsed = Number.parseInt(sanitizedValue, 10)
      if (!Number.isNaN(parsed) && parsed >= 1) {
        const idx = saleItems.findIndex((it) => getSaleItemKey(it) === getSaleItemKey(item))
        if (idx !== -1) updateItemQuantity(idx, parsed)
      }
    }
  }

  const commitItemQuantity = (index) => {
    const target = saleItems[index]
    if (!target || target.purchaseMode === 'half_box') return

    const itemKey = getSaleItemKey(target)
    const normalizedQuantity = normalizeQuantityValue(itemQuantityInputs[itemKey], target.maxQuantity)
    updateItemQuantity(index, normalizedQuantity)
    setItemQuantityInputs((prev) => ({
      ...prev,
      [itemKey]: String(normalizedQuantity),
    }))
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
      setShowCheckoutModal(false)
      await fetchData()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Offline sale save nahi hui')
    } finally {
      setSaving(false)
    }
  }

  const openCheckout = () => {
    if (saleItems.length === 0) {
      toast.error('Pehle koi product add karo')
      return
    }
    setShowCheckoutModal(true)
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
          .offline-sales-input::placeholder,
          .offline-sales-textarea::placeholder,
          .offline-sales-qty-input::placeholder {
            color: ${c.textSecondary};
            opacity: 1;
          }
          .offline-sales-input:focus,
          .offline-sales-textarea:focus,
          .offline-sales-qty-input:focus {
            border-color: ${c.accent} !important;
            box-shadow: 0 0 0 1px ${c.accent}, 0 0 0 4px rgba(14, 165, 233, 0.12);
          }
          .offline-sales-qty-input[disabled] {
            cursor: not-allowed;
            opacity: 0.72;
          }
          /* Search bar: no inner focus rectangle — wrapper handles all visual feedback */
          .offline-sales-search-input,
          .offline-sales-search-input:focus {
            outline: none !important;
            box-shadow: none !important;
            border: none !important;
          }
          .offline-sales-search-wrap {
            transition: border-color 0.18s ease, background 0.18s ease;
          }
          .offline-sales-search-wrap:hover {
            border-color: ${c.accent || '#0ea5e9'};
          }
          .offline-sales-search-wrap:focus-within {
            border-color: ${c.accent || '#0ea5e9'};
          }
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
        <section className="offline-sales-hero" style={styles.heroCompact}>
          <div style={styles.heroCompactLeft}>
            <span style={styles.heroBadgeCompact}><FaBolt /> Counter Mode</span>
            <h1 style={styles.heroTitleCompact}>Offline Sales</h1>
          </div>
          <div style={styles.heroCompactStats}>
            <div style={styles.statPill}>
              <FaReceipt style={{ color: '#0ea5e9', fontSize: 14 }} />
              <div style={styles.statPillBody}>
                <div style={styles.statPillValue}>{todaySales.length}</div>
                <div style={styles.statPillLabel}>Aaj sales</div>
              </div>
            </div>
            <div style={styles.statPill}>
              <FaCashRegister style={{ color: '#22c55e', fontSize: 14 }} />
              <div style={styles.statPillBody}>
                <div style={styles.statPillValue}>{formatCurrency(todayRevenue)}</div>
                <div style={styles.statPillLabel}>Revenue</div>
              </div>
            </div>
            <div style={styles.statPill}>
              <FaArrowTrendDown style={{ color: '#f97316', fontSize: 14 }} />
              <div style={styles.statPillBody}>
                <div style={styles.statPillValue}>{formatCurrency(todayUdhar)}</div>
                <div style={styles.statPillLabel}>Udhar</div>
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
                <span style={styles.sectionHint}>{filteredProducts.length} of {products.length} products • Stock waale only</span>
              </div>

              {/* Live search bar */}
              <div className="offline-sales-search-wrap" style={styles.searchBar}>
                <FaCashRegister style={{ color: c.textSecondary, fontSize: 14, flexShrink: 0 }} />
                <input
                  className="offline-sales-search-input"
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  placeholder="Type to search by name, category or product id..."
                  style={styles.searchInputInline}
                  autoFocus
                />
                {catalogQuery && (
                  <button type="button" onClick={() => setCatalogQuery('')} style={styles.clearBtn} aria-label="Clear search">×</button>
                )}
              </div>

              {/* Category chips */}
              {categoryOptions.length > 0 && (
                <div style={styles.chipsRow}>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('all')}
                    style={{ ...styles.chip, ...(categoryFilter === 'all' ? styles.chipActive : {}) }}
                  >
                    All
                  </button>
                  {categoryOptions.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setCategoryFilter(category)}
                      style={{ ...styles.chip, ...(categoryFilter === category ? styles.chipActive : {}) }}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}

              {/* Product grid */}
              {products.length === 0 ? (
                <div style={styles.warningBox}>
                  <strong>No sellable products loaded.</strong>
                  <span style={styles.warningText}>Backend se product list empty hai ya sab ka stock 0 hai.</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div style={styles.emptyGrid}>
                  <FaCashRegister style={{ fontSize: 28, color: c.textSecondary, opacity: 0.6 }} />
                  <strong style={{ marginTop: 8 }}>
                    {catalogQuery ? `No match for "${catalogQuery}"` : `No products in ${categoryFilter}`}
                  </strong>
                  <span style={styles.warningText}>Filter clear karo ya alag spelling try karo.</span>
                </div>
              ) : (
                <div className="offline-sales-product-grid" style={styles.productGrid}>
                  {filteredProducts.map((product) => (
                    <ProductPickRow
                      key={product.id}
                      product={product}
                      c={c}
                      onAdd={quickAddItem}
                      onUpdateQty={updateQuantityById}
                      onRemove={removeByProductMode}
                      formatCurrency={formatCurrency}
                      inCartCount={inCartCount}
                    />
                  ))}
                </div>
              )}
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
                  <div key={`${item.productId}-${item.purchaseMode}`} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px',
                    background: c.inputBg,
                    border: `1px solid ${c.border}`,
                    borderRadius: 10,
                  }}>
                    {/* Name + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: c.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 2 }}>
                        {formatCurrency(item.price)} {getCartItemUnitPriceLabel(item)} · {getModeShortLabel(item.purchaseMode)}
                      </div>
                    </div>

                    {/* Qty stepper */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
                      background: 'rgba(14,165,233,0.10)',
                      border: `1px solid ${c.accent || '#0ea5e9'}`,
                      borderRadius: 8, padding: 3,
                    }}>
                      <button
                        type="button"
                        onClick={() => item.purchaseMode === 'half_box' ? removeItem(index) : updateItemQuantity(index, item.quantity - 1)}
                        style={{
                          width: 24, height: 24, borderRadius: 5, border: 'none',
                          background: 'rgba(239,68,68,0.18)', color: '#ef4444',
                          cursor: 'pointer', fontSize: 14, fontWeight: 800, lineHeight: 1,
                          display: 'grid', placeItems: 'center',
                        }}
                        title={item.quantity === 1 ? 'Remove' : 'Decrease'}
                      >
                        {item.quantity === 1 ? <FaTrash style={{ fontSize: 9 }} /> : '−'}
                      </button>
                      <input
                        className="offline-sales-qty-input"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        disabled={item.purchaseMode === 'half_box'}
                        value={item.purchaseMode === 'half_box' ? '1' : (itemQuantityInputs[getSaleItemKey(item)] ?? String(item.quantity))}
                        onChange={(e) => handleItemQuantityChange(item, e.target.value)}
                        onBlur={() => commitItemQuantity(index)}
                        onWheel={(e) => e.currentTarget.blur()}
                        onKeyDown={(e) => {
                          preventStepperKeys(e)
                          if (e.key === 'Enter') e.currentTarget.blur()
                        }}
                        onFocus={(e) => e.target.select()}
                        style={{
                          width: 36, textAlign: 'center', padding: '0 2px',
                          border: 'none', background: 'transparent',
                          color: c.text, fontWeight: 800, fontSize: 13,
                          outline: 'none', MozAppearance: 'textfield',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(index, item.quantity + 1)}
                        disabled={item.purchaseMode === 'half_box' || item.quantity >= (item.maxQuantity || 1)}
                        style={{
                          width: 24, height: 24, borderRadius: 5, border: 'none',
                          background: (item.purchaseMode === 'half_box' || item.quantity >= (item.maxQuantity || 1)) ? c.border : 'linear-gradient(135deg, #22c55e, #16a34a)',
                          color: (item.purchaseMode === 'half_box' || item.quantity >= (item.maxQuantity || 1)) ? c.textSecondary : '#fff',
                          cursor: (item.purchaseMode === 'half_box' || item.quantity >= (item.maxQuantity || 1)) ? 'not-allowed' : 'pointer',
                          fontSize: 14, fontWeight: 800, lineHeight: 1,
                          display: 'grid', placeItems: 'center',
                        }}
                        title="Increase"
                      >+</button>
                    </div>

                    {/* Line total */}
                    <div style={{ flexShrink: 0, fontWeight: 800, fontSize: 14, color: c.accent || '#0ea5e9', minWidth: 70, textAlign: 'right' }}>
                      {formatCurrency(item.price * item.quantity)}
                    </div>

                    {/* Explicit delete icon */}
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      title="Remove from sale"
                      style={{
                        flexShrink: 0,
                        width: 28, height: 28, borderRadius: 6, border: 'none',
                        background: 'rgba(239,68,68,0.14)', color: '#ef4444',
                        cursor: 'pointer', fontSize: 12,
                        display: 'grid', placeItems: 'center',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.28)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.14)' }}
                    >
                      <FaTrash />
                    </button>
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

              <button type="button" onClick={openCheckout} disabled={saving || saleItems.length === 0} style={styles.primaryBtn}>
                <FaReceipt />
                Checkout & Generate Bill
              </button>
              <button type="button" onClick={resetForm} style={styles.secondaryBtn}>
                Clear Draft
              </button>
            </div>

            <button
              type="button"
              onClick={() => navigate('/admin/offline-sales-history')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '14px 20px',
                background: `linear-gradient(135deg, rgba(249,115,22,0.12), rgba(249,115,22,0.06))`,
                border: `1px solid rgba(249,115,22,0.25)`,
                borderRadius: 12,
                color: '#f97316',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <FaReceipt /> View Sales History →
            </button>
          </aside>
        </div>

      </div>

      {/* Checkout Modal: customer + payment + confirm */}
      {showCheckoutModal && (
        <Modal
          isOpen={showCheckoutModal}
          onClose={() => setShowCheckoutModal(false)}
          maxWidth="640px"
          title={`Checkout · ${formatCurrency(grandTotal)} · ${saleItems.length} item${saleItems.length !== 1 ? 's' : ''}`}
          footer={(
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                disabled={saving}
                style={{
                  padding: '10px 18px', borderRadius: 10, border: `1px solid ${c.border}`,
                  background: 'transparent', color: c.text, fontWeight: 600, cursor: 'pointer', fontSize: 13,
                }}
              >
                ← Back to Items
              </button>
              <button
                type="button"
                onClick={submitSale}
                disabled={saving}
                style={{
                  padding: '10px 22px', borderRadius: 10, border: 'none',
                  background: paymentMethod === 'Udhar'
                    ? 'linear-gradient(135deg, #f97316, #ea580c)'
                    : 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <FaReceipt />
                {saving ? 'Saving sale...' : paymentMethod === 'Udhar' ? 'Confirm Udhar Sale' : 'Confirm & Generate Bill'}
              </button>
            </div>
          )}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Order summary strip */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
              padding: '10px 14px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: 10,
            }}>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: c.textSecondary }}>
                <span>{totalUnits} units</span>
                <span>{Number(totalBoxEquivalent.toFixed(2))} box eq</span>
                <span>Subtotal {formatCurrency(subtotal)}</span>
                {discountValue > 0 && <span>− {formatCurrency(discountValue)} off</span>}
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, color: c.accent || '#0ea5e9' }}>{formatCurrency(grandTotal)}</div>
            </div>

            {/* Customer + discount */}
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
                  onWheel={(e) => e.currentTarget.blur()}
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

            <div>
              <div style={{ ...styles.label, marginBottom: 8 }}>Payment method</div>
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
        </Modal>
      )}
    </AdminLayout>
  )
}

const ProductPickRow = ({ product, c, onAdd, onUpdateQty, onRemove, formatCurrency, inCartCount }) => {
  const modes = getAllowedPurchaseModes(product)
  const defaultMode = getDefaultPurchaseMode(product)
  const [mode, setMode] = useState(defaultMode)
  const stock = Number(product.stock ?? product.stockQuantity ?? 0)
  const max = getMaxPurchaseQuantity(product, mode)
  const price = getUnitPrice(product, mode)
  const inCart = inCartCount(product.id, mode)
  const outOfStock = max < 1
  const lowStock = stock < 5
  const isHalfBox = mode === 'half_box'

  // Local draft so user can briefly empty the input via backspace.
  // Sync back from canonical state whenever cart count changes externally.
  const [qtyDraft, setQtyDraft] = useState(String(inCart || ''))
  useEffect(() => { setQtyDraft(String(inCart || '')) }, [inCart])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px',
      background: c.inputBg,
      border: `1px solid ${inCart > 0 ? (c.accent || '#0ea5e9') : c.border}`,
      borderRadius: 12,
      transition: 'border-color 0.18s ease, background 0.18s ease',
      opacity: outOfStock ? 0.55 : 1,
    }}
      onMouseEnter={(e) => { if (!outOfStock && inCart === 0) e.currentTarget.style.borderColor = c.accent || '#0ea5e9' }}
      onMouseLeave={(e) => { if (inCart === 0) e.currentTarget.style.borderColor = c.border }}
    >
      {/* Image / Initial */}
      {product.image ? (
        <img src={product.image} alt={product.name}
          style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0, background: c.surface }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(14,165,233,0.14)', display: 'grid', placeItems: 'center', flexShrink: 0, color: c.accent || '#0ea5e9', fontSize: 20, fontWeight: 800 }}>
          {String(product.name || '?').charAt(0).toUpperCase()}
        </div>
      )}

      {/* Name + Category + Stock */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: c.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {product.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: c.textSecondary }}>{product.category || 'General'}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
            background: outOfStock ? 'rgba(239,68,68,0.14)' : lowStock ? 'rgba(245,158,11,0.14)' : 'rgba(34,197,94,0.14)',
            color: outOfStock ? '#ef4444' : lowStock ? '#f59e0b' : '#22c55e',
          }}>
            {outOfStock ? 'OUT' : lowStock ? `LOW · ${stock}` : `${stock} box eq`}
          </span>
        </div>
      </div>

      {/* Mode chips (only if multiple modes) */}
      {modes.length > 1 && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                padding: '5px 10px', fontSize: 11, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
                background: mode === m ? 'linear-gradient(135deg, #0ea5e9, #2563eb)' : 'transparent',
                color: mode === m ? '#fff' : c.textSecondary,
                border: `1px solid ${mode === m ? '#0ea5e9' : c.border}`,
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {getModeShortLabel(m)}
            </button>
          ))}
        </div>
      )}

      {/* Price */}
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 84 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: c.accent || '#0ea5e9', lineHeight: 1 }}>
          {formatCurrency(price)}
        </div>
        <div style={{ fontSize: 10, color: c.textSecondary, fontWeight: 600, marginTop: 2 }}>
          /{mode === 'piece' ? 'pc' : mode === 'half_box' ? 'half' : 'box'}
        </div>
      </div>

      {/* Action: Add button OR "Added" indicator (qty managed in cart panel) */}
      <div style={{ flexShrink: 0, minWidth: 130 }}>
        {inCart === 0 ? (
          <button
            type="button"
            onClick={() => onAdd(product, mode, 1)}
            disabled={outOfStock}
            style={{
              width: '100%', padding: '8px 14px', borderRadius: 8, border: 'none',
              background: outOfStock ? c.border : 'linear-gradient(135deg, #0f766e 0%, #0ea5e9 100%)',
              color: outOfStock ? c.textSecondary : '#fff',
              fontWeight: 700, fontSize: 12, cursor: outOfStock ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.18s ease', whiteSpace: 'nowrap',
            }}
          >
            <FaPlus style={{ fontSize: 10 }} /> {outOfStock ? 'Out' : 'Add to sale'}
          </button>
        ) : (
          <div style={{
            width: '100%', padding: '8px 14px', borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(22,163,74,0.12))',
            border: `1px solid rgba(34,197,94,0.4)`,
            color: '#22c55e',
            fontWeight: 700, fontSize: 12,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            whiteSpace: 'nowrap',
          }}
            title="Manage quantity in cart panel →"
          >
            ✓ Added · {inCart}
          </div>
        )}
      </div>
    </div>
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
  heroCompact: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '14px',
    padding: '12px 18px',
    borderRadius: '14px',
    background: darkGradient(c),
    border: `1px solid ${c.border}`,
    flexWrap: 'wrap',
  },
  heroCompactLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  },
  heroBadgeCompact: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.14)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  heroTitleCompact: {
    margin: 0,
    fontSize: '22px',
    color: '#fff',
    fontWeight: 800,
    letterSpacing: '-0.01em',
  },
  heroCompactStats: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    flex: 1,
    justifyContent: 'flex-end',
  },
  statPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    minWidth: 150,
    borderRadius: 14,
    background: 'rgba(15, 23, 42, 0.38)',
    border: '1px solid rgba(255,255,255,0.14)',
    flex: '1 1 auto',
  },
  statPillBody: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.15,
    minWidth: 0,
  },
  statPillValue: {
    fontSize: 18,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '-0.01em',
  },
  statPillLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.78)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
    marginTop: 2,
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '4px 14px',
    background: c.inputBg,
    border: `1px solid ${c.border}`,
    borderRadius: 12,
    marginBottom: 12,
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
  },
  searchInputInline: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    color: c.text,
    padding: '10px 0',
    fontSize: 14,
    outline: 'none',
    minWidth: 0,
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: c.textSecondary,
    fontSize: 18,
    fontWeight: 800,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  chip: {
    padding: '6px 12px',
    borderRadius: 999,
    border: `1px solid ${c.border}`,
    background: c.inputBg,
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  chipActive: {
    background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
    color: '#fff',
    borderColor: '#0ea5e9',
  },
  productGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 560,
    overflowY: 'auto',
    paddingRight: 4,
  },
  emptyGrid: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '40px 20px',
    background: c.inputBg,
    border: `1px dashed ${c.border}`,
    borderRadius: 12,
    textAlign: 'center',
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
    fontSize: 20,
    color: c.text,
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  panelSubtext: {
    margin: '6px 0 0',
    fontSize: 13,
    color: c.textSecondary,
    lineHeight: 1.5,
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
    color: c.text,
    fontWeight: 700,
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
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
    boxShadow: c.surface === c.inputBg ? `inset 0 0 0 1px ${c.border}` : 'none',
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
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
    boxShadow: c.surface === c.inputBg ? `inset 0 0 0 1px ${c.border}` : 'none',
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
    boxShadow: c.surface === c.inputBg ? `inset 0 0 0 1px ${c.border}` : 'none',
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
    background: c.inputBg,
    color: c.text,
    padding: '9px 10px',
    fontWeight: 700,
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
    boxShadow: c.surface === c.inputBg ? `inset 0 0 0 1px ${c.border}` : 'none',
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
