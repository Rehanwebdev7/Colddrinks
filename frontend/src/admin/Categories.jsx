import { useState, useEffect } from 'react'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import { FaPlus, FaEdit, FaTrash, FaTags } from 'react-icons/fa'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'

const Categories = () => {
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [formName, setFormName] = useState('')
  const [formStatus, setFormStatus] = useState('active')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchCategories() }, [])

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await API.get('/categories')
      setCategories(Array.isArray(response.data) ? response.data : [])
    } catch {
      toast.error('Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = () => {
    setEditingCategory(null)
    setFormName('')
    setFormStatus('active')
    setShowModal(true)
  }

  const openEditModal = (cat) => {
    setEditingCategory(cat)
    setFormName(cat.name)
    setFormStatus(cat.status || 'active')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Category name is required'); return }
    try {
      setSaving(true)
      if (editingCategory) {
        await API.put(`/categories/${editingCategory.id}`, { name: formName, status: formStatus })
        toast.success('Category updated')
      } else {
        await API.post('/categories', { name: formName, status: formStatus })
        toast.success('Category created')
      }
      setShowModal(false)
      fetchCategories()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save category')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return
    try {
      await API.delete(`/categories/${cat.id}`)
      toast.success('Category deleted')
      fetchCategories()
    } catch {
      toast.error('Failed to delete category')
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: `1px solid ${c.border}`,
    borderRadius: '8px', background: c.inputBg, color: c.text,
    fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  }

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', border: `3px solid ${c.border}`, borderTop: '3px solid #0ea5e9', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: c.textSecondary }}>Loading categories...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: c.text, margin: 0 }}>
            <FaTags style={{ marginRight: '10px', color: '#0ea5e9' }} /> Categories
          </h1>
          <button onClick={openAddModal} style={{
            display: 'flex', alignItems: 'center', gap: '8px', background: '#e23744',
            border: 'none', borderRadius: '10px', padding: '10px 20px', color: '#fff',
            fontSize: '14px', fontWeight: '600', cursor: 'pointer'
          }}>
            <FaPlus /> Add Category
          </button>
        </div>

        <div style={{ background: c.surface, borderRadius: '14px', border: `1px solid ${c.border}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '14px 18px', color: c.textSecondary, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', borderBottom: `1px solid ${c.border}` }}>Name</th>
                <th style={{ textAlign: 'left', padding: '14px 18px', color: c.textSecondary, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', borderBottom: `1px solid ${c.border}` }}>Status</th>
                <th style={{ textAlign: 'right', padding: '14px 18px', color: c.textSecondary, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', borderBottom: `1px solid ${c.border}` }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: '40px', textAlign: 'center', color: c.textSecondary }}>No categories yet</td></tr>
              ) : categories.map(cat => (
                <tr key={cat.id}>
                  <td style={{ padding: '14px 18px', color: c.text, fontWeight: '500', borderBottom: `1px solid ${c.border}` }}>{cat.name}</td>
                  <td style={{ padding: '14px 18px', borderBottom: `1px solid ${c.border}` }}>
                    <span style={{
                      padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                      background: cat.status === 'active' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: cat.status === 'active' ? '#22c55e' : '#ef4444'
                    }}>
                      {cat.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', textAlign: 'right', borderBottom: `1px solid ${c.border}` }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button onClick={() => openEditModal(cat)} style={{
                        background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)',
                        borderRadius: '8px', padding: '8px 10px', color: '#3b82f6', cursor: 'pointer', fontSize: '13px'
                      }}><FaEdit /></button>
                      <button onClick={() => handleDelete(cat)} style={{
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: '8px', padding: '8px 10px', color: '#ef4444', cursor: 'pointer', fontSize: '13px'
                      }}><FaTrash /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingCategory ? 'Edit Category' : 'Add Category'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', color: c.textSecondary, fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Category Name</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} style={inputStyle} placeholder="e.g. Mocktails" />
            </div>
            <div>
              <label style={{ display: 'block', color: c.textSecondary, fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>Status</label>
              <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} style={inputStyle}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button onClick={() => setShowModal(false)} style={{
                background: c.border, border: 'none', borderRadius: '8px', padding: '10px 20px',
                color: c.text, fontSize: '14px', cursor: 'pointer'
              }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                background: '#e23744', border: 'none', borderRadius: '8px', padding: '10px 24px',
                color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
              }}>{saving ? 'Saving...' : editingCategory ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </Modal>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AdminLayout>
  )
}

export default Categories
