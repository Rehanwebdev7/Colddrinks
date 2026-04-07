import { useState, useEffect } from 'react'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiTrash2, FiTag } from 'react-icons/fi'

const Coupons = () => {
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
    <AdminLayout title="Coupon Management">
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Coupons ({coupons.length})</h2>
        <button
          className="btn btn-primary"
          onClick={() => { resetForm(); setShowForm(!showForm) }}
        >
          <FiPlus /> {showForm ? 'Cancel' : 'Add Coupon'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          marginBottom: 24,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16
        }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Coupon Code</label>
            <input className="form-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SAVE20" required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Discount Type</label>
            <select className="form-select" value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value })}>
              <option value="percentage">Percentage (%)</option>
              <option value="flat">Flat Amount (₹)</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Discount Value</label>
            <input className="form-input" type="number" value={form.discountValue} onChange={e => setForm({ ...form, discountValue: e.target.value })} onWheel={(e) => e.target.blur()} placeholder={form.discountType === 'percentage' ? 'e.g. 10' : 'e.g. 50'} required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Min Order Amount</label>
            <input className="form-input" type="number" value={form.minOrderAmount} onChange={e => setForm({ ...form, minOrderAmount: e.target.value })} onWheel={(e) => e.target.blur()} placeholder="e.g. 500" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Max Discount</label>
            <input className="form-input" type="number" value={form.maxDiscount} onChange={e => setForm({ ...form, maxDiscount: e.target.value })} onWheel={(e) => e.target.blur()} placeholder="e.g. 200" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Expiry Date</label>
            <input className="form-input" type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Usage Limit</label>
            <input className="form-input" type="number" value={form.usageLimit} onChange={e => setForm({ ...form, usageLimit: e.target.value })} onWheel={(e) => e.target.blur()} placeholder="e.g. 100" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn btn-primary btn-block">
              {editing ? 'Update Coupon' : 'Create Coupon'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loader-container"><div className="spinner"></div></div>
      ) : coupons.length === 0 ? (
        <div className="empty-state">
          <FiTag style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: 16 }} />
          <h3 className="empty-state-title">No coupons yet</h3>
          <p className="empty-state-text">Create your first coupon to offer discounts.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {coupons.map(coupon => (
            <div key={coupon.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              gap: 16,
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  background: 'var(--primary-gradient)',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: 50,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 1
                }}>
                  {coupon.code}
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `₹${coupon.discountValue} OFF`}
                    {coupon.maxDiscount ? ` (Max ₹${coupon.maxDiscount})` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Min: ₹{coupon.minOrderAmount || 0} · Used: {coupon.usedCount || 0}/{coupon.usageLimit || '∞'}
                    {coupon.expiryDate && ` · Expires: ${new Date(coupon.expiryDate).toLocaleDateString()}`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-icon" onClick={() => handleEdit(coupon)} title="Edit" style={{ color: 'var(--text-light)', background: 'var(--bg-light)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FiEdit2 />
                </button>
                <button className="btn-icon btn-danger" onClick={() => handleDelete(coupon.id)} title="Delete">
                  <FiTrash2 />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}

export default Coupons
