import { useState, useEffect } from 'react'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiTrash2, FiTag } from 'react-icons/fi'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'

const Coupons = () => {
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const s = getStyles(c)

  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    code: '',
    discountType: 'percentage',
    discountValue: '',
    minOrderAmount: '',
    maxDiscount: '',
    expiryDate: '',
    usageLimit: ''
  })

  useEffect(() => { fetchCoupons() }, [])

  const fetchCoupons = async () => {
    try {
      setLoading(true)
      const res = await API.get('/coupons')
      setCoupons(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      toast.error('Failed to load coupons')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setForm({ code: '', discountType: 'percentage', discountValue: '', minOrderAmount: '', maxDiscount: '', expiryDate: '', usageLimit: '' })
    setEditing(null)
    setShowForm(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.code || !form.discountValue) {
      toast.error('Code and discount value are required')
      return
    }

    const payload = {
      code: form.code.toUpperCase(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : 0,
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
      expiryDate: form.expiryDate || null,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null
    }

    try {
      if (editing) {
        await API.put(`/coupons/${editing}`, payload)
        toast.success('Coupon updated!')
      } else {
        await API.post('/coupons', payload)
        toast.success('Coupon created!')
      }
      resetForm()
      fetchCoupons()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save coupon')
    }
  }

  const handleEdit = (coupon) => {
    setForm({
      code: coupon.code,
      discountType: coupon.discountType || 'percentage',
      discountValue: coupon.discountValue || '',
      minOrderAmount: coupon.minOrderAmount || '',
      maxDiscount: coupon.maxDiscount || '',
      expiryDate: coupon.expiryDate ? coupon.expiryDate.split('T')[0] : '',
      usageLimit: coupon.usageLimit || ''
    })
    setEditing(coupon.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this coupon?')) return
    try {
      await API.delete(`/coupons/${id}`)
      toast.success('Coupon deleted')
      fetchCoupons()
    } catch (err) {
      toast.error('Failed to delete coupon')
    }
  }

  return (
    <AdminLayout>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}><FiTag style={{ marginRight: 10, color: '#e23744' }} /> Coupons</h1>
            <p style={s.subtitle}>{coupons.length} active · Reward repeat customers with discounts</p>
          </div>
          <button
            style={s.addBtn}
            onClick={() => { resetForm(); setShowForm(!showForm) }}
          >
            <FiPlus /> {showForm ? 'Cancel' : 'Add Coupon'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={s.formCard}>
            <div style={s.formGrid}>
              <div>
                <label style={s.label}>Coupon Code *</label>
                <input style={s.input} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SAVE20" required />
              </div>
              <div>
                <label style={s.label}>Discount Type</label>
                <select style={s.input} value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value })}>
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat Amount (₹)</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Discount Value *</label>
                <input style={s.input} type="number" value={form.discountValue} onChange={e => setForm({ ...form, discountValue: e.target.value })} onWheel={(e) => e.target.blur()} placeholder={form.discountType === 'percentage' ? 'e.g. 10' : 'e.g. 50'} required />
              </div>
              <div>
                <label style={s.label}>Min Order Amount</label>
                <input style={s.input} type="number" value={form.minOrderAmount} onChange={e => setForm({ ...form, minOrderAmount: e.target.value })} onWheel={(e) => e.target.blur()} placeholder="e.g. 500" />
              </div>
              <div>
                <label style={s.label}>Max Discount</label>
                <input style={s.input} type="number" value={form.maxDiscount} onChange={e => setForm({ ...form, maxDiscount: e.target.value })} onWheel={(e) => e.target.blur()} placeholder="e.g. 200" />
              </div>
              <div>
                <label style={s.label}>Expiry Date</label>
                <input style={s.input} type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
              <div>
                <label style={s.label}>Usage Limit</label>
                <input style={s.input} type="number" value={form.usageLimit} onChange={e => setForm({ ...form, usageLimit: e.target.value })} onWheel={(e) => e.target.blur()} placeholder="e.g. 100" />
              </div>
            </div>
            <div style={s.formFooter}>
              <button type="button" style={s.cancelBtn} onClick={resetForm}>Cancel</button>
              <button type="submit" style={s.saveBtn}>{editing ? 'Update Coupon' : 'Create Coupon'}</button>
            </div>
          </form>
        )}

        {loading ? (
          <div style={s.center}><p style={{ color: c.textSecondary }}>Loading...</p></div>
        ) : coupons.length === 0 ? (
          <div style={s.emptyState}>
            <FiTag style={{ fontSize: 40, color: c.textSecondary, marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 4px', color: c.text, fontSize: 16, fontWeight: 600 }}>No coupons yet</h3>
            <p style={{ margin: 0, color: c.textSecondary, fontSize: 13 }}>Click <strong>Add Coupon</strong> to create your first discount.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {coupons.map(coupon => (
              <div key={coupon.id} style={s.couponRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span style={s.codeBadge}>{coupon.code}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: c.text }}>
                      {coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `₹${coupon.discountValue} OFF`}
                      {coupon.maxDiscount ? ` (Max ₹${coupon.maxDiscount})` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                      Min: ₹{coupon.minOrderAmount || 0} · Used: {coupon.usedCount || 0}/{coupon.usageLimit || '∞'}
                      {coupon.expiryDate && ` · Expires: ${new Date(coupon.expiryDate).toLocaleDateString()}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={s.editBtn} onClick={() => handleEdit(coupon)} title="Edit">
                    <FiEdit2 />
                  </button>
                  <button style={s.deleteBtn} onClick={() => handleDelete(coupon.id)} title="Delete">
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

const getStyles = (c) => ({
  page: { maxWidth: '1100px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: '22px', fontWeight: 700, color: c.text, margin: 0 },
  subtitle: { fontSize: 13, color: c.textSecondary, margin: '4px 0 0' },
  addBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#e23744', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  formCard: { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 20, marginBottom: 20 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 },
  label: { display: 'block', fontSize: 12, fontWeight: 500, color: c.textSecondary, marginBottom: 5 },
  input: { width: '100%', padding: '9px 12px', border: `1px solid ${c.border}`, borderRadius: 8, background: c.inputBg, color: c.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  formFooter: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  cancelBtn: { padding: '9px 18px', background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textSecondary, fontSize: 13, cursor: 'pointer' },
  saveBtn: { padding: '9px 22px', background: '#e23744', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 },
  emptyState: { background: c.surface, border: `1px dashed ${c.border}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center' },
  couponRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, gap: 14, flexWrap: 'wrap' },
  codeBadge: { background: 'linear-gradient(135deg, #e23744, #b91c1c)', color: '#fff', padding: '6px 14px', borderRadius: 50, fontSize: 13, fontWeight: 700, letterSpacing: 1 },
  editBtn: { background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 8, padding: 8, color: '#f59e0b', cursor: 'pointer', fontSize: 14 },
  deleteBtn: { background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: 8, color: '#ef4444', cursor: 'pointer', fontSize: 14 },
})

export default Coupons
