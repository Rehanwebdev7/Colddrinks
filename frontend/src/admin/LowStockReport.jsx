import { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import { FaPlus, FaBoxOpen } from 'react-icons/fa'

const LowStockReport = () => {
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const [report, setReport] = useState([])
  const [loading, setLoading] = useState(true)
  const [restockTarget, setRestockTarget] = useState(null)   // { productId, variantId, productName, label }
  const [restockQty, setRestockQty] = useState('')
  const [restocking, setRestocking] = useState(false)

  const fetchReport = async () => {
    try {
      setLoading(true)
      const res = await API.get('/admin/low-stock')
      const data = Array.isArray(res.data) ? res.data : []
      setReport(data)
    } catch (err) {
      console.error('low-stock fetch failed', err)
      toast.error('Failed to load low stock report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReport() }, [])

  const openRestock = (productId, productName, variant) => {
    const label = variant.variantId
      ? `${variant.flavor ? variant.flavor + ' ' : ''}${variant.volume}${variant.volumeUnit || ''}`
      : 'Single SKU'
    setRestockTarget({ productId, variantId: variant.variantId, productName, label })
    setRestockQty('')
  }

  const handleRestock = async () => {
    if (!restockTarget) return
    const qty = Number(restockQty)
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity')
      return
    }
    try {
      setRestocking(true)
      const body = { quantity: qty }
      if (restockTarget.variantId) body.variantId = restockTarget.variantId
      await API.put(`/products/${restockTarget.productId}/restock`, body)
      toast.success(`Restocked ${restockTarget.productName} ${restockTarget.label} (+${qty})`)
      setRestockTarget(null)
      fetchReport()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Restock failed')
    } finally {
      setRestocking(false)
    }
  }

  const styles = {
    container: { padding: 24 },
    header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 },
    h1: { margin: 0, fontSize: 24, fontWeight: 700, color: c.text },
    subtitle: { fontSize: 14, color: c.textSecondary, marginTop: 4 },
    card: { background: c.surface, borderRadius: 12, padding: 16, marginBottom: 12, border: `1px solid ${c.border}` },
    row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${c.border}` },
    label: { fontSize: 13, color: c.textSecondary },
    stockText: { fontWeight: 700, fontSize: 15 },
    btn: {
      padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
    },
    btnPrimary: { background: '#f97316', color: '#fff' },
    btnCancel: { background: c.bg, color: c.text, border: `1px solid ${c.border}` },
    empty: { padding: 60, textAlign: 'center', color: c.textSecondary },
    modalContent: { padding: 20 },
    modalLabel: { display: 'block', fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 6 },
    modalInput: {
      width: '100%', padding: '10px 12px', borderRadius: 8,
      border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 14,
    },
    modalFooter: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 },
  }

  return (
    <AdminLayout>
      <div style={styles.container}>
        <div style={styles.header}>
          <FaBoxOpen size={28} color="#f97316" />
          <div>
            <h1 style={styles.h1}>Low Stock Report</h1>
            <p style={styles.subtitle}>Variants + products below their threshold. Click "Restock" to add inventory.</p>
          </div>
        </div>

        {loading && <p style={{ color: c.textSecondary }}>Loading...</p>}

        {!loading && report.length === 0 && (
          <div style={styles.empty}>
            <FaBoxOpen size={40} color="#22c55e" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>All stock looks healthy 🎉</p>
            <p style={{ fontSize: 13, color: c.textSecondary, marginTop: 4 }}>No products or variants below their alert threshold.</p>
          </div>
        )}

        {!loading && report.map((entry) => (
          <div key={entry.productId} style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              {entry.image && (
                <img src={entry.image} alt={entry.productName}
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }}
                  onError={(e) => { e.target.src = '/images/placeholder-drink.svg' }}
                />
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: c.text }}>
                  {entry.productName}
                </div>
                <div style={{ fontSize: 12, color: c.textSecondary }}>
                  {entry.brand && <span>{entry.brand} • </span>}
                  {entry.category}
                  {entry.lowVariants.length > 1 && (
                    <span> • <b>{entry.lowVariants.length} variants low</b></span>
                  )}
                </div>
              </div>
            </div>

            {entry.lowVariants.map((v, vIdx) => {
              const dot = v.stockQuantity <= 0 ? '#ef4444' : '#f59e0b'
              const variantLabel = v.variantId
                ? `${v.flavor ? v.flavor + ' ' : ''}${v.volume}${v.volumeUnit || ''}`
                : 'Single SKU'
              return (
                <div key={vIdx} style={styles.row}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot }} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{variantLabel}</span>
                  <span style={styles.label}>Stock: <span style={{ ...styles.stockText, color: dot }}>{v.stockQuantity}</span></span>
                  <span style={styles.label}>Alert: <b>{v.lowStockAlert}</b></span>
                  <button
                    style={{ ...styles.btn, ...styles.btnPrimary }}
                    onClick={() => openRestock(entry.productId, entry.productName, v)}
                  >
                    <FaPlus size={11} /> Restock
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <Modal
        isOpen={Boolean(restockTarget)}
        onClose={() => setRestockTarget(null)}
        title={restockTarget ? `Restock ${restockTarget.productName}` : 'Restock'}
      >
        <div style={styles.modalContent}>
          {restockTarget && (
            <>
              <div style={{ marginBottom: 16, padding: 12, background: c.bg, borderRadius: 8, fontSize: 13 }}>
                <div><b>Product:</b> {restockTarget.productName}</div>
                <div><b>Variant:</b> {restockTarget.label}</div>
              </div>
              <label style={styles.modalLabel}>Quantity to add (in boxes)</label>
              <input
                type="number"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                placeholder="e.g. 50"
                style={styles.modalInput}
                autoFocus
              />
              <div style={styles.modalFooter}>
                <button style={{ ...styles.btn, ...styles.btnCancel }} onClick={() => setRestockTarget(null)}>
                  Cancel
                </button>
                <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleRestock} disabled={restocking}>
                  {restocking ? 'Restocking...' : `Add ${restockQty || 0} boxes`}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </AdminLayout>
  )
}

export default LowStockReport
