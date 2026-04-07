import { useState, useEffect } from 'react'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import { FaPlus, FaEdit, FaTrash, FaTruck, FaRupeeSign, FaSearch, FaArrowLeft, FaShoppingBag, FaMoneyBillWave, FaUpload } from 'react-icons/fa'
import { uploadImage, getImageUrl } from '../services/googleDrive'
import useDrive from '../services/useDrive'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'

const Suppliers = () => {
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const { driveReady } = useDrive()
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [newProductImageFile, setNewProductImageFile] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modals
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', address: '' })
  const [saving, setSaving] = useState(false)

  // Detail view
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [purchases, setPurchases] = useState([])
  const [payments, setPayments] = useState([])

  // Purchase modal
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [purchaseForm, setPurchaseForm] = useState({ productId: '', quantity: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '', unit: 'box' })
  const [productSearch, setProductSearch] = useState('')
  const [showProductList, setShowProductList] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [newRate, setNewRate] = useState('')
  const [showNewProductModal, setShowNewProductModal] = useState(false)
  const [newProductForm, setNewProductForm] = useState({ name: '', category: '', description: '', boxQuantity: '', volume: '', pricePerBox: '', costPricePerBox: '', mrp: '', stockQuantity: '', lowStockAlert: '10', image: '', allowPiecePurchase: false, allowHalfBox: false })
  const [categories, setCategories] = useState([])

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], method: 'cash', notes: '' })

  useEffect(() => { fetchSuppliers(); fetchProducts(); fetchCategories() }, [])

  const fetchCategories = async () => {
    try {
      const res = await API.get('/categories')
      const data = Array.isArray(res.data) ? res.data : []
      setCategories(data.filter(c => c.status === 'active').map(c => c.name))
    } catch { setCategories(['Soft Drinks', 'Energy Drinks', 'Juices', 'Water']) }
  }

  const fetchSuppliers = async () => {
    try {
      setLoading(true)
      const res = await API.get('/suppliers')
      setSuppliers(Array.isArray(res.data) ? res.data : [])
    } catch { toast.error('Failed to load suppliers') }
    finally { setLoading(false) }
  }

  const fetchProducts = async () => {
    try {
      const res = await API.get('/products')
      setProducts(Array.isArray(res.data) ? res.data : [])
    } catch { /* ignore */ }
  }

  const openSupplierDetail = async (supplier) => {
    setSelectedSupplier(supplier)
    try {
      const [purchRes, payRes] = await Promise.all([
        API.get(`/suppliers/${supplier.id}/purchases`),
        API.get(`/suppliers/${supplier.id}/payments`)
      ])
      setPurchases(Array.isArray(purchRes.data) ? purchRes.data : [])
      setPayments(Array.isArray(payRes.data) ? payRes.data : [])
    } catch { toast.error('Failed to load supplier details') }
  }

  const handleSaveSupplier = async () => {
    if (!supplierForm.name.trim()) { toast.error('Name is required'); return }
    if (supplierForm.phone && supplierForm.phone.length !== 10) { toast.error('Phone number 10 digit ka hona chahiye'); return }
    setSaving(true)
    try {
      if (editingSupplier) {
        await API.put(`/suppliers/${editingSupplier.id}`, supplierForm)
        toast.success('Supplier updated')
      } else {
        await API.post('/suppliers', supplierForm)
        toast.success('Supplier added')
      }
      setShowSupplierModal(false)
      setEditingSupplier(null)
      fetchSuppliers()
    } catch { toast.error('Failed to save supplier') }
    finally { setSaving(false) }
  }

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm('Delete this supplier?')) return
    try {
      await API.delete(`/suppliers/${id}`)
      toast.success('Supplier deleted')
      fetchSuppliers()
      if (selectedSupplier?.id === id) setSelectedSupplier(null)
    } catch { toast.error('Failed to delete') }
  }

  const handleAddPurchase = async () => {
    if (!purchaseForm.amount) { toast.error('Amount is required'); return }
    setSaving(true)
    try {
      const payload = { ...purchaseForm }
      // Send product updates (price, mrp, selling options etc)
      if (selectedProduct) {
        payload.productUpdate = {
          pricePerBox: Number(selectedProduct.pricePerBox) || 0,
          costPricePerBox: Number(selectedProduct.costPricePerBox) || 0,
          mrp: Number(selectedProduct.mrp) || 0,
          boxQuantity: Number(selectedProduct.boxQuantity) || 24,
          allowPiecePurchase: Boolean(selectedProduct.allowPiecePurchase),
          allowHalfBox: selectedProduct.allowPiecePurchase ? false : Boolean(selectedProduct.allowHalfBox),
        }
      }
      await API.post(`/suppliers/${selectedSupplier.id}/purchases`, payload)
      toast.success('Purchase added — stock & rates updated!')
      setShowPurchaseModal(false)
      setPurchaseForm({ productId: '', quantity: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '', unit: 'box' })
      setProductSearch(''); setSelectedProduct(null); setNewRate('')
      openSupplierDetail(selectedSupplier)
      fetchSuppliers()
      fetchProducts()
    } catch { toast.error('Failed to add purchase') }
    finally { setSaving(false) }
  }

  const resetNewProductForm = () => { setNewProductForm({ name: '', category: '', description: '', boxQuantity: '', volume: '', pricePerBox: '', costPricePerBox: '', mrp: '', stockQuantity: '', lowStockAlert: '10', image: '', allowPiecePurchase: false, allowHalfBox: false }); setNewProductImageFile(null) }

  const handleNewProductImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please select a valid image'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image 5MB se chhoti honi chahiye'); return }
    setNewProductImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setNewProductForm(p => ({ ...p, image: reader.result }))
    reader.readAsDataURL(file)
  }

  const handleSaveNewProduct = async () => {
    if (!newProductForm.name || !newProductForm.category || !newProductForm.pricePerBox) {
      toast.error('Name, Category aur Price per Box required hai'); return
    }
    setSaving(true)
    try {
      let imageUrl = newProductForm.image
      // Upload to Google Drive if file selected
      if (newProductImageFile && driveReady) {
        setUploadingImage(true)
        try {
          const fileName = `product_${newProductForm.name.replace(/\s+/g, '_')}_${Date.now()}.jpg`
          const fileId = await uploadImage(newProductImageFile, 'products', fileName)
          imageUrl = getImageUrl(fileId)
        } catch (err) { toast.error('Image upload failed: ' + err.message); return }
        finally { setUploadingImage(false) }
      }
      const prodRes = await API.post('/products', {
        name: newProductForm.name.trim(),
        category: newProductForm.category,
        description: newProductForm.description,
        boxQuantity: Number(newProductForm.boxQuantity) || 24,
        volume: newProductForm.volume ? Number(newProductForm.volume) : null,
        pricePerBox: Number(newProductForm.pricePerBox) || 0,
        costPricePerBox: Number(newProductForm.costPricePerBox) || 0,
        mrp: Number(newProductForm.mrp) || 0,
        stockQuantity: Number(newProductForm.stockQuantity) || 0,
        lowStockAlert: Number(newProductForm.lowStockAlert) || 10,
        image: imageUrl,
        allowPiecePurchase: Boolean(newProductForm.allowPiecePurchase),
        allowHalfBox: newProductForm.allowPiecePurchase ? false : Boolean(newProductForm.allowHalfBox),
        status: 'active'
      })
      const newProd = prodRes.data?.data || prodRes.data
      toast.success('Product added!')
      setShowNewProductModal(false)
      resetNewProductForm()
      await fetchProducts()
      setPurchaseForm(p => ({ ...p, productId: newProd.id || newProd._id }))
      setSelectedProduct(newProd)
      setProductSearch(newProd.name)
      setShowProductList(false)
    } catch { toast.error('Failed to add product') }
    finally { setSaving(false) }
  }

  const handleAddPayment = async () => {
    if (!paymentForm.amount) { toast.error('Amount is required'); return }
    const totalPurch = purchases.reduce((s, p) => s + (p.amount || 0), 0)
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0)
    const pendingAmt = totalPurch - totalPaid
    if (Number(paymentForm.amount) > pendingAmt) { toast.error(`Baki sirf ${fmt(pendingAmt)} hai — zyada nahi de sakte`); return }
    setSaving(true)
    try {
      await API.post(`/suppliers/${selectedSupplier.id}/payments`, paymentForm)
      toast.success('Payment added')
      setShowPaymentModal(false)
      setPaymentForm({ amount: '', date: new Date().toISOString().split('T')[0], method: 'cash', notes: '' })
      openSupplierDetail(selectedSupplier)
      fetchSuppliers()
    } catch { toast.error('Failed to add payment') }
    finally { setSaving(false) }
  }

  const openEditSupplier = (s) => {
    setEditingSupplier(s)
    setSupplierForm({ name: s.name, phone: s.phone || '', address: s.address || '' })
    setShowSupplierModal(true)
  }

  const openAddSupplier = () => {
    setEditingSupplier(null)
    setSupplierForm({ name: '', phone: '', address: '' })
    setShowSupplierModal(true)
  }

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone || '').includes(search))
  const totalPending = suppliers.reduce((s, sup) => s + (sup.pending || 0), 0)

  const s = getStyles(c)

  if (loading) return <AdminLayout><div style={s.center}><p style={{ color: c.textSecondary }}>Loading...</p></div></AdminLayout>

  // ─── SUPPLIER DETAIL VIEW ───
  if (selectedSupplier) {
    const sup = suppliers.find(x => x.id === selectedSupplier.id) || selectedSupplier
    const totalPurch = purchases.reduce((s, p) => s + (p.amount || 0), 0)
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0)
    const pending = totalPurch - totalPaid

    return (
      <AdminLayout>
        <div style={s.page}>
          <button onClick={() => setSelectedSupplier(null)} style={s.backBtn}><FaArrowLeft /> Back to Suppliers</button>
          <div style={s.detailHeader}>
            <div>
              <h1 style={s.title}>{sup.name}</h1>
              <p style={s.subtitle}>{sup.phone || 'No phone'} {sup.address ? `· ${sup.address}` : ''}</p>
            </div>
          </div>

          {/* Khata Summary */}
          <div style={s.khataGrid}>
            <div style={{ ...s.khataCard, borderLeft: '4px solid #3b82f6' }}>
              <p style={s.khataLabel}>Total Purchased</p>
              <p style={{ ...s.khataValue, color: '#3b82f6' }}>{fmt(totalPurch)}</p>
            </div>
            <div style={{ ...s.khataCard, borderLeft: '4px solid #22c55e' }}>
              <p style={s.khataLabel}>Total Paid</p>
              <p style={{ ...s.khataValue, color: '#22c55e' }}>{fmt(totalPaid)}</p>
            </div>
            <div style={{ ...s.khataCard, borderLeft: `4px solid ${pending > 0 ? '#ef4444' : '#22c55e'}` }}>
              <p style={s.khataLabel}>Pending (Baki)</p>
              <p style={{ ...s.khataValue, color: pending > 0 ? '#ef4444' : '#22c55e' }}>{fmt(pending)}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button style={s.purchaseBtn} onClick={() => setShowPurchaseModal(true)}><FaShoppingBag /> Add Purchase</button>
            <button style={s.paymentBtn} onClick={() => setShowPaymentModal(true)}><FaMoneyBillWave /> Add Payment</button>
          </div>

          {/* Purchases List */}
          <div style={s.sectionCard}>
            <h3 style={s.sectionTitle}>Purchases (Maal Liya)</h3>
            {purchases.length === 0 ? <p style={s.empty}>No purchases yet</p> : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Date</th><th style={s.th}>Product</th><th style={s.th}>Qty</th><th style={s.th}>Amount</th><th style={s.th}>Notes</th>
                  </tr></thead>
                  <tbody>{purchases.sort((a, b) => b.date?.localeCompare(a.date)).map(p => (
                    <tr key={p.id} style={s.tr}>
                      <td style={s.td}>{p.date}</td>
                      <td style={s.td}>{p.productName || '-'}</td>
                      <td style={s.td}>{p.quantity || '-'}</td>
                      <td style={{ ...s.td, fontWeight: '700', color: '#3b82f6' }}>{fmt(p.amount)}</td>
                      <td style={s.td}>{p.notes || '-'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payments List */}
          <div style={s.sectionCard}>
            <h3 style={s.sectionTitle}>Payments (Diya)</h3>
            {payments.length === 0 ? <p style={s.empty}>No payments yet</p> : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Date</th><th style={s.th}>Amount</th><th style={s.th}>Method</th><th style={s.th}>Notes</th><th style={s.th}>Baki</th>
                  </tr></thead>
                  <tbody>{(() => {
                    const totalPurch = purchases.reduce((s, p) => s + (p.amount || 0), 0)
                    const sorted = [...payments].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''))
                    let runningPaid = 0
                    const rows = sorted.map(p => {
                      runningPaid += (p.amount || 0)
                      const baki = totalPurch - runningPaid
                      return { ...p, baki }
                    })
                    return rows.reverse().map(p => {
                      const methodLabels = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', bank_transfer: 'Bank Transfer' }
                      const methodColors = { cash: '#22c55e', upi: '#3b82f6', cheque: '#f59e0b', bank_transfer: '#8b5cf6' }
                      const method = p.method || 'cash'
                      return (
                        <tr key={p.id} style={s.tr}>
                          <td style={s.td}>{p.date}</td>
                          <td style={{ ...s.td, fontWeight: '700', color: '#22c55e' }}>{fmt(p.amount)}</td>
                          <td style={s.td}>
                            <span style={{ background: `${methodColors[method]}20`, color: methodColors[method], padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                              {methodLabels[method] || method}
                            </span>
                          </td>
                          <td style={s.td}>{p.notes || '-'}</td>
                          <td style={{ ...s.td, fontWeight: '600', color: p.baki > 0 ? '#ef4444' : '#22c55e' }}>{fmt(p.baki)}</td>
                        </tr>
                      )
                    })
                  })()}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Purchase Modal */}
        <Modal isOpen={showPurchaseModal} onClose={() => { setShowPurchaseModal(false); setProductSearch(''); setSelectedProduct(null); setNewRate(''); setShowProductList(false) }} title="Add Purchase">
          <div style={s.formGrid}>
            {/* Product Search + New Button */}
            <div style={{ ...s.formGroup, gridColumn: '1 / -1' }}>
              <label style={s.label}>Product</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type="text"
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); setShowProductList(true); if (!e.target.value) { setSelectedProduct(null); setPurchaseForm(p => ({ ...p, productId: '' })) } }}
                    onFocus={() => setShowProductList(true)}
                    style={s.input}
                    placeholder="Search product..."
                  />
                  {showProductList && productSearch && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                      {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).map(p => (
                        <div key={p._id || p.id} onClick={() => {
                          setSelectedProduct(p)
                          setPurchaseForm(prev => ({ ...prev, productId: p._id || p.id }))
                          setProductSearch(p.name)
                          setShowProductList(false)
                          setNewRate('')
                        }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: `1px solid ${c.border}`, color: c.text, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.background = c.card}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ fontWeight: 600 }}>{p.name}</span>
                          <span style={{ fontSize: 12, color: c.textSecondary }}>₹{p.pricePerBox || p.price} · Stock: {p.stockQuantity || 0}</span>
                        </div>
                      ))}
                      {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                        <div style={{ padding: '10px 12px', color: c.textSecondary, fontSize: 13 }}>No product found</div>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => setShowNewProductModal(true)} style={{ ...s.saveBtn, whiteSpace: 'nowrap', padding: '8px 14px', fontSize: 13 }}>+ New</button>
              </div>
            </div>

            {/* Selected product — full editable details */}
            {selectedProduct && (
              <div style={{ gridColumn: '1 / -1', background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${c.border}`, paddingBottom: 8, marginBottom: 4 }}>
                  <span style={{ color: c.text, fontWeight: 700, fontSize: 15 }}>{selectedProduct.name}</span>
                  <span style={{ fontSize: 12, color: c.textSecondary }}>Current Stock: {selectedProduct.stockQuantity || 0} box</span>
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Price per Box (₹) — Selling Price</label>
                  <input type="number" min="0" onWheel={e => e.target.blur()} value={selectedProduct.pricePerBox || ''} onChange={e => setSelectedProduct(p => ({ ...p, pricePerBox: e.target.value }))} style={s.input} placeholder={`Current: ₹${selectedProduct.pricePerBox || 0}`} />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Cost Price per Box (₹)</label>
                  <input type="number" min="0" onWheel={e => e.target.blur()} value={selectedProduct.costPricePerBox || ''} onChange={e => setSelectedProduct(p => ({ ...p, costPricePerBox: e.target.value }))} style={s.input} placeholder="Kitne me kharida" />
                  <span style={{ fontSize: 11, color: c.textSecondary, marginTop: 2, display: 'block' }}>Profit calculate karne ke liye</span>
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>MRP (₹)</label>
                  <input type="number" min="0" onWheel={e => e.target.blur()} value={selectedProduct.mrp || ''} onChange={e => setSelectedProduct(p => ({ ...p, mrp: e.target.value }))} style={s.input} placeholder="e.g. 500" />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Box Quantity</label>
                  <input type="number" min="0" onWheel={e => e.target.blur()} value={selectedProduct.boxQuantity || ''} onChange={e => setSelectedProduct(p => ({ ...p, boxQuantity: e.target.value }))} style={s.input} placeholder="e.g. 24" />
                </div>
                <div style={{ ...s.formGroup, gridColumn: '1 / -1' }}>
                  <label style={s.label}>Selling Options</label>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: c.text, fontSize: 14 }}>
                      <input type="checkbox" checked={Boolean(selectedProduct.allowPiecePurchase)} onChange={e => setSelectedProduct(p => ({ ...p, allowPiecePurchase: e.target.checked, allowHalfBox: e.target.checked ? false : p.allowHalfBox }))} />
                      <span>Sell by Piece</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: c.text, fontSize: 14, opacity: selectedProduct.allowPiecePurchase ? 0.5 : 1 }}>
                      <input type="checkbox" checked={Boolean(selectedProduct.allowHalfBox)} onChange={e => setSelectedProduct(p => ({ ...p, allowHalfBox: e.target.checked }))} disabled={Boolean(selectedProduct.allowPiecePurchase)} />
                      <span>Allow Half Box</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div style={s.formGroup}>
              <label style={s.label}>Quantity</label>
              <input type="number" min="0" onWheel={e => e.target.blur()} value={purchaseForm.quantity} onChange={e => {
                const qty = e.target.value
                // Auto calculate amount using COST PRICE (kharid rate)
                if (selectedProduct && qty) {
                  const costPrice = Number(selectedProduct.costPricePerBox) || Number(selectedProduct.pricePerBox) || 0
                  const rate = purchaseForm.unit === 'piece'
                    ? costPrice / (Number(selectedProduct.boxQuantity) || 24)
                    : costPrice
                  setPurchaseForm(p => ({ ...p, quantity: qty, amount: String(Math.round(rate * Number(qty) * 100) / 100) }))
                } else {
                  setPurchaseForm(p => ({ ...p, quantity: qty }))
                }
              }} style={s.input} placeholder="e.g. 10" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Unit</label>
              <select value={purchaseForm.unit} onChange={e => {
                const unit = e.target.value
                if (selectedProduct && purchaseForm.quantity) {
                  const costPrice = Number(selectedProduct.costPricePerBox) || Number(selectedProduct.pricePerBox) || 0
                  const rate = unit === 'piece'
                    ? costPrice / (Number(selectedProduct.boxQuantity) || 24)
                    : costPrice
                  setPurchaseForm(p => ({ ...p, unit, amount: String(Math.round(rate * Number(purchaseForm.quantity) * 100) / 100) }))
                } else {
                  setPurchaseForm(p => ({ ...p, unit }))
                }
              }} style={s.input}>
                <option value="box">Box</option>
                <option value="piece">Piece</option>
              </select>
            </div>

            <div style={s.formGroup}>
              <label style={s.label}>Amount (₹) *</label>
              <input type="number" min="0" onWheel={e => e.target.blur()} value={purchaseForm.amount} onChange={e => setPurchaseForm(p => ({ ...p, amount: e.target.value }))} style={s.input} placeholder="Total amount" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Date</label>
              <input type="date" value={purchaseForm.date} onChange={e => setPurchaseForm(p => ({ ...p, date: e.target.value }))} style={s.input} />
            </div>
            <div style={{ ...s.formGroup, gridColumn: '1 / -1' }}>
              <label style={s.label}>Notes</label>
              <input type="text" value={purchaseForm.notes} onChange={e => setPurchaseForm(p => ({ ...p, notes: e.target.value }))} style={s.input} placeholder="Optional notes" />
            </div>
          </div>
          <div style={s.modalFooter}>
            <button style={s.cancelBtn} onClick={() => { setShowPurchaseModal(false); setProductSearch(''); setSelectedProduct(null); setNewRate('') }}>Cancel</button>
            <button style={s.saveBtn} onClick={handleAddPurchase} disabled={saving}>{saving ? 'Saving...' : 'Add Purchase'}</button>
          </div>
        </Modal>

        {/* New Product Modal — Same as Products page form */}
        <Modal isOpen={showNewProductModal} onClose={() => { setShowNewProductModal(false); resetNewProductForm() }} title="Add New Product">
          <div style={s.formGrid}>
            <div style={s.formGroup}>
              <label style={s.label}>Product Name *</label>
              <input type="text" value={newProductForm.name} onChange={e => setNewProductForm(p => ({ ...p, name: e.target.value }))} style={s.input} placeholder="e.g. Coca Cola 300ml" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Category *</label>
              <select value={newProductForm.category} onChange={e => setNewProductForm(p => ({ ...p, category: e.target.value }))} style={s.input}>
                <option value="">Select Category</option>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div style={{ ...s.formGroup, gridColumn: '1 / -1' }}>
              <label style={s.label}>Description</label>
              <textarea value={newProductForm.description} onChange={e => setNewProductForm(p => ({ ...p, description: e.target.value }))} style={{ ...s.input, minHeight: 80, resize: 'vertical' }} placeholder="Product description" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Box Quantity</label>
              <input type="number" min="0" onWheel={e => e.target.blur()} value={newProductForm.boxQuantity} onChange={e => setNewProductForm(p => ({ ...p, boxQuantity: e.target.value }))} style={s.input} placeholder="e.g. 24" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Bottle Volume (ml)</label>
              <input type="number" min="0" onWheel={e => e.target.blur()} value={newProductForm.volume} onChange={e => setNewProductForm(p => ({ ...p, volume: e.target.value }))} style={s.input} placeholder="e.g. 300" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Price per Box *</label>
              <input type="number" min="0" onWheel={e => e.target.blur()} value={newProductForm.pricePerBox} onChange={e => setNewProductForm(p => ({ ...p, pricePerBox: e.target.value }))} style={s.input} placeholder="e.g. 450" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Cost Price per Box</label>
              <input type="number" min="0" onWheel={e => e.target.blur()} value={newProductForm.costPricePerBox} onChange={e => setNewProductForm(p => ({ ...p, costPricePerBox: e.target.value }))} style={s.input} placeholder="Kitne me kharida" />
              <span style={{ fontSize: 11, color: c.textSecondary, marginTop: 4, display: 'block' }}>Profit calculate karne ke liye</span>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>MRP</label>
              <input type="number" min="0" onWheel={e => e.target.blur()} value={newProductForm.mrp} onChange={e => setNewProductForm(p => ({ ...p, mrp: e.target.value }))} style={s.input} placeholder="e.g. 500" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Stock Quantity</label>
              <input type="number" min="0" onWheel={e => e.target.blur()} value={newProductForm.stockQuantity} onChange={e => setNewProductForm(p => ({ ...p, stockQuantity: e.target.value }))} style={s.input} placeholder="e.g. 100" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Low Stock Alert</label>
              <input type="number" min="0" onWheel={e => e.target.blur()} value={newProductForm.lowStockAlert} onChange={e => setNewProductForm(p => ({ ...p, lowStockAlert: e.target.value }))} style={s.input} placeholder="e.g. 10" />
              <span style={{ fontSize: 11, color: c.textSecondary, marginTop: 4, display: 'block' }}>Ye threshold box equivalent me hota hai.</span>
            </div>
            <div style={{ ...s.formGroup, gridColumn: '1 / -1' }}>
              <label style={s.label}>Product Image</label>
              <div style={{ border: `2px dashed ${c.border}`, borderRadius: 8, padding: 16, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 80 }}>
                {newProductForm.image ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img src={newProductForm.image} alt="Preview" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }} onError={e => { e.target.src = '/images/placeholder-drink.svg' }} />
                    <button type="button" onClick={() => { setNewProductForm(p => ({ ...p, image: '' })); setNewProductImageFile(null) }} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Remove</button>
                  </div>
                ) : (
                  <div style={{ color: c.textSecondary, fontSize: 13 }}>
                    <FaUpload style={{ fontSize: 20, marginBottom: 4 }} /><br />Upload an image
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleNewProductImageUpload} style={{ display: 'none' }} id="new-product-img-upload" />
                <label htmlFor="new-product-img-upload" style={{ background: c.surface, border: `1px solid ${c.border}`, color: c.text, borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FaUpload /> Choose File
                </label>
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 12, color: c.textSecondary }}>Or enter image URL</label>
                <input type="text" value={newProductForm.image.startsWith('data:') ? '' : newProductForm.image} onChange={e => { setNewProductForm(p => ({ ...p, image: e.target.value })); setNewProductImageFile(null) }} style={{ ...s.input, marginTop: 4 }} placeholder="https://..." />
              </div>
            </div>
            <div style={{ ...s.formGroup, gridColumn: '1 / -1' }}>
              <label style={s.label}>Selling Options</label>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: c.text, fontSize: 14 }}>
                  <input type="checkbox" checked={Boolean(newProductForm.allowPiecePurchase)} onChange={e => setNewProductForm(p => ({ ...p, allowPiecePurchase: e.target.checked, allowHalfBox: e.target.checked ? false : p.allowHalfBox }))} />
                  <span>Sell by Piece</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: c.text, fontSize: 14, opacity: newProductForm.allowPiecePurchase ? 0.5 : 1 }}>
                  <input type="checkbox" checked={Boolean(newProductForm.allowHalfBox)} onChange={e => setNewProductForm(p => ({ ...p, allowHalfBox: e.target.checked }))} disabled={Boolean(newProductForm.allowPiecePurchase)} />
                  <span>Allow Half Box</span>
                </label>
              </div>
              <span style={{ fontSize: 11, color: c.textSecondary, marginTop: 6, display: 'block' }}>'Sell by Piece' on hoga to product sirf piece mode me bikega. Agar off hai, to 'Allow Half Box' se full box ke saath half box enable hoga.</span>
            </div>
          </div>
          <div style={s.modalFooter}>
            <button style={s.cancelBtn} onClick={() => { setShowNewProductModal(false); resetNewProductForm() }}>Cancel</button>
            <button style={s.saveBtn} onClick={handleSaveNewProduct} disabled={saving || uploadingImage}>{uploadingImage ? 'Uploading Image...' : saving ? 'Saving...' : 'Add Product'}</button>
          </div>
        </Modal>

        {/* Payment Modal */}
        <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Add Payment">
          {/* Supplier Khata Summary */}
          {(() => {
            const tp = purchases.reduce((s, p) => s + (p.amount || 0), 0)
            const tpaid = payments.reduce((s, p) => s + (p.amount || 0), 0)
            const pend = tp - tpaid
            return (
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: c.text, marginBottom: 8 }}>{selectedSupplier?.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 13 }}>
                  <div>
                    <div style={{ color: c.textSecondary, fontSize: 11 }}>Maal Liya</div>
                    <div style={{ color: '#3b82f6', fontWeight: 700 }}>{fmt(tp)}</div>
                  </div>
                  <div>
                    <div style={{ color: c.textSecondary, fontSize: 11 }}>Diya</div>
                    <div style={{ color: '#22c55e', fontWeight: 700 }}>{fmt(tpaid)}</div>
                  </div>
                  <div>
                    <div style={{ color: c.textSecondary, fontSize: 11 }}>Baki</div>
                    <div style={{ color: pend > 0 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>{fmt(pend)}</div>
                  </div>
                </div>
              </div>
            )
          })()}
          <div style={s.formGrid}>
            <div style={s.formGroup}>
              <label style={s.label}>Amount (₹) *</label>
              <input type="number" min="0" onWheel={e => e.target.blur()} value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} style={s.input} placeholder="Payment amount" max={purchases.reduce((s, p) => s + (p.amount || 0), 0) - payments.reduce((s, p) => s + (p.amount || 0), 0)} />
              {paymentForm.amount && Number(paymentForm.amount) > (purchases.reduce((s, p) => s + (p.amount || 0), 0) - payments.reduce((s, p) => s + (p.amount || 0), 0)) && (
                <span style={{ fontSize: 11, color: '#ef4444', marginTop: 4, display: 'block' }}>Baki amount se zyada nahi de sakte!</span>
              )}
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Payment Method</label>
              <select value={paymentForm.method} onChange={e => setPaymentForm(p => ({ ...p, method: e.target.value }))} style={s.input}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Date</label>
              <input type="date" value={paymentForm.date} onChange={e => setPaymentForm(p => ({ ...p, date: e.target.value }))} style={s.input} />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Notes</label>
              <input type="text" value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} style={s.input} placeholder="Optional notes" />
            </div>
          </div>
          <div style={s.modalFooter}>
            <button style={s.cancelBtn} onClick={() => setShowPaymentModal(false)}>Cancel</button>
            <button style={{ ...s.saveBtn, background: '#22c55e' }} onClick={handleAddPayment} disabled={saving}>{saving ? 'Saving...' : 'Add Payment'}</button>
          </div>
        </Modal>
      </AdminLayout>
    )
  }

  // ─── SUPPLIERS LIST VIEW ───
  return (
    <AdminLayout>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}><FaTruck style={{ marginRight: '10px', color: '#0ea5e9' }} />Suppliers</h1>
            <p style={s.subtitle}>{suppliers.length} suppliers · Pending: {fmt(totalPending)}</p>
          </div>
          <button style={s.addBtn} onClick={openAddSupplier}><FaPlus /> Add Supplier</button>
        </div>

        {/* Search */}
        <div style={s.searchWrap}>
          <FaSearch style={{ color: c.textSecondary }} />
          <input type="text" placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} style={s.searchInput} />
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div style={s.center}><p style={{ color: c.textSecondary }}>No suppliers found</p></div>
        ) : (
          <div style={s.list}>
            {filtered.map(sup => (
              <div key={sup.id} style={s.supplierCard} onClick={() => openSupplierDetail(sup)}>
                <div style={s.supplierInfo}>
                  <div style={s.supplierAvatar}>{sup.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <h3 style={s.supplierName}>{sup.name}</h3>
                    <p style={s.supplierPhone}>{sup.phone || 'No phone'}</p>
                  </div>
                </div>
                <div style={s.supplierRight}>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '11px', color: c.textSecondary, margin: 0 }}>Pending</p>
                    <p style={{ fontSize: '16px', fontWeight: '700', color: sup.pending > 0 ? '#ef4444' : '#22c55e', margin: 0 }}>{fmt(sup.pending)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={s.iconBtn} onClick={e => { e.stopPropagation(); openEditSupplier(sup) }}><FaEdit /></button>
                    <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={e => { e.stopPropagation(); handleDeleteSupplier(sup.id) }}><FaTrash /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Supplier Modal */}
      <Modal isOpen={showSupplierModal} onClose={() => setShowSupplierModal(false)} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}>
        <div style={s.formGrid}>
          <div style={s.formGroup}>
            <label style={s.label}>Name *</label>
            <input type="text" value={supplierForm.name} onChange={e => setSupplierForm(p => ({ ...p, name: e.target.value }))} style={s.input} placeholder="Supplier name" />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Phone</label>
            <input type="tel" value={supplierForm.phone} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setSupplierForm(p => ({ ...p, phone: v })) }} style={s.input} placeholder="10 digit number" maxLength={10} inputMode="numeric" />
          </div>
          <div style={{ ...s.formGroup, gridColumn: '1 / -1' }}>
            <label style={s.label}>Address</label>
            <input type="text" value={supplierForm.address} onChange={e => setSupplierForm(p => ({ ...p, address: e.target.value }))} style={s.input} placeholder="Address" />
          </div>
        </div>
        <div style={s.modalFooter}>
          <button style={s.cancelBtn} onClick={() => setShowSupplierModal(false)}>Cancel</button>
          <button style={s.saveBtn} onClick={handleSaveSupplier} disabled={saving}>{saving ? 'Saving...' : editingSupplier ? 'Update' : 'Add Supplier'}</button>
        </div>
      </Modal>
    </AdminLayout>
  )
}

const getStyles = (c) => ({
  page: { maxWidth: '1200px', margin: '0 auto' },
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' },
  title: { fontSize: '24px', fontWeight: '700', color: c.text, margin: 0 },
  subtitle: { fontSize: '13px', color: c.textSecondary, marginTop: '4px' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#e23744', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  searchWrap: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: c.cardBg || c.surface, border: `1px solid ${c.border}`, borderRadius: '12px', marginBottom: '20px' },
  searchInput: { flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', color: c.text },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  supplierCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: c.cardBg || c.surface, border: `1px solid ${c.border}`, borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', gap: '12px' },
  supplierInfo: { display: 'flex', alignItems: 'center', gap: '12px' },
  supplierAvatar: { width: '42px', height: '42px', borderRadius: '50%', background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700', flexShrink: 0 },
  supplierName: { fontSize: '15px', fontWeight: '600', color: c.text, margin: 0 },
  supplierPhone: { fontSize: '12px', color: c.textSecondary, margin: 0 },
  supplierRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  iconBtn: { background: 'none', border: 'none', color: c.textSecondary, cursor: 'pointer', padding: '6px', fontSize: '14px', borderRadius: '6px' },
  // Detail view
  backBtn: { display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: `1px solid ${c.border}`, borderRadius: '10px', padding: '8px 16px', color: c.text, fontSize: '13px', cursor: 'pointer', marginBottom: '16px' },
  detailHeader: { marginBottom: '20px' },
  khataGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' },
  khataCard: { padding: '16px', background: c.cardBg || c.surface, border: `1px solid ${c.border}`, borderRadius: '12px' },
  khataLabel: { fontSize: '12px', color: c.textSecondary, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  khataValue: { fontSize: '22px', fontWeight: '800', margin: 0, fontFamily: "'Poppins', sans-serif" },
  purchaseBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  paymentBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  sectionCard: { padding: '16px', background: c.cardBg || c.surface, border: `1px solid ${c.border}`, borderRadius: '12px', marginBottom: '16px' },
  sectionTitle: { fontSize: '16px', fontWeight: '700', color: c.text, margin: '0 0 12px' },
  empty: { fontSize: '13px', color: c.textSecondary, textAlign: 'center', padding: '20px 0' },
  tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 8px', fontSize: '11px', fontWeight: '600', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${c.border}` },
  td: { padding: '10px 8px', fontSize: '13px', color: c.text, borderBottom: `1px solid ${c.border}` },
  tr: {},
  // Form
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  formGroup: {},
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: c.text, marginBottom: '6px' },
  input: { width: '100%', padding: '10px 14px', border: `1px solid ${c.border}`, borderRadius: '10px', fontSize: '14px', color: c.text, background: c.inputBg || c.surface, outline: 'none', boxSizing: 'border-box' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  cancelBtn: { padding: '10px 20px', background: 'transparent', border: `1px solid ${c.border}`, borderRadius: '10px', color: c.textSecondary, fontSize: '14px', cursor: 'pointer' },
  saveBtn: { padding: '10px 24px', background: '#e23744', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
})

export default Suppliers
