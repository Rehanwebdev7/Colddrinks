import { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import { FaPlus, FaTrash, FaImage, FaUpload, FaCloudUploadAlt, FaEdit } from 'react-icons/fa'
import useDrive from '../services/useDrive'
import { uploadImage, deleteImage, getImageUrl } from '../services/googleDrive'
import ImageCropModal from '../components/ImageCropModal'

const initialForm = {
  image: '',
  title: '',
  subtitle: '',
  link: '',
  active: true
}

const Sliders = () => {
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const [sliders, setSliders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingSlider, setEditingSlider] = useState(null)
  const [formData, setFormData] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [showCrop, setShowCrop] = useState(false)
  const [products, setProducts] = useState([])
  const { driveReady, needsSetup, driveLoading, setupDrive } = useDrive()

  useEffect(() => {
    fetchSliders()
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const res = await API.get('/products')
      setProducts(Array.isArray(res.data) ? res.data : [])
    } catch { /* ignore */ }
  }

  const fetchSliders = async () => {
    try {
      setLoading(true)
      const response = await API.get('/sliders')
      const data = response.data
      setSliders(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch sliders:', error)
      toast.error('Failed to load sliders')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB')
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setCropSrc(reader.result)
      setShowCrop(true)
    }
    reader.onerror = () => {
      toast.error('Failed to read image file')
    }
    reader.readAsDataURL(file)
  }

  const handleCropDone = (croppedDataUrl) => {
    setFormData(prev => ({ ...prev, image: croppedDataUrl }))
  }

  const openAddModal = () => {
    setEditingSlider(null)
    setFormData(initialForm)
    setImageFile(null)
    setShowModal(true)
  }

  const openEditModal = (slider) => {
    setEditingSlider(slider)
    setFormData({
      image: slider.image || '',
      title: slider.title || '',
      subtitle: slider.subtitle || '',
      link: slider.link || '',
      active: slider.active !== false
    })
    setImageFile(null)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formData.image) {
      toast.error('Please provide a slider image')
      return
    }

    try {
      setSaving(true)
      let imageUrl = formData.image
      let driveFileId = ''

      // Upload to Google Drive if file selected and Drive is ready
      if (imageFile && driveReady) {
        setUploadingImage(true)
        try {
          const fileName = `slider_${Date.now()}.jpg`
          driveFileId = await uploadImage(imageFile, 'sliders', fileName)
          imageUrl = getImageUrl(driveFileId)
        } catch (err) {
          toast.error('Image upload failed: ' + err.message)
          return
        } finally {
          setUploadingImage(false)
        }
      }

      const payload = {
        image: imageUrl,
        driveFileId,
        title: formData.title,
        subtitle: formData.subtitle,
        link: formData.link,
        active: formData.active
      }

      if (editingSlider) {
        await API.put(`/sliders/${editingSlider.id || editingSlider.sliderId}`, payload)
        toast.success('Slider updated!')
      } else {
        await API.post('/sliders', payload)
        toast.success('Slider added!')
      }
      setShowModal(false)
      setImageFile(null)
      fetchSliders()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add slider')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (slider) => {
    const sliderId = slider.id || slider.sliderId
    if (!sliderId) return

    try {
      // Delete from Google Drive if it has a driveFileId
      if (slider.driveFileId && driveReady) {
        await deleteImage(slider.driveFileId).catch(() => {})
      }
      await API.delete(`/sliders/${sliderId}`)
      toast.success('Slider deleted successfully')
      fetchSliders()
    } catch (error) {
      toast.error('Failed to delete slider')
    }
  }

  const styles = getStyles(c)

  if (loading) {
    return (
      <AdminLayout>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading sliders...</p>
        </div>
        <style>{spinnerKeyframes}</style>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div style={styles.page}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>
              <FaImage style={{ marginRight: '10px', color: '#0ea5e9' }} />
              Sliders
            </h1>
            <p style={styles.subtitle}>{sliders.length} total sliders</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {needsSetup && (
              <button
                style={{ ...styles.addBtn, background: '#0ea5e9', boxShadow: '0 2px 8px rgba(14,165,233,0.3)' }}
                onClick={() => setupDrive().then(() => toast.success('Google Drive connected!')).catch(err => toast.error(err.message))}
              >
                <FaCloudUploadAlt /> Setup Drive
              </button>
            )}
            {driveReady && (
              <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: '500' }}>Drive Connected</span>
            )}
            <button style={styles.addBtn} onClick={openAddModal}>
              <FaPlus /> Add Slider
            </button>
          </div>
        </div>

        {/* Sliders Grid */}
        {sliders.length === 0 ? (
          <div style={styles.emptyState}>
            <FaImage style={{ fontSize: '48px', color: c.border, marginBottom: '16px' }} />
            <p style={{ color: c.textSecondary, fontSize: '16px', margin: 0 }}>No sliders found</p>
            <p style={{ color: c.textSecondary, fontSize: '13px', marginTop: '4px' }}>
              Add your first slider to get started
            </p>
          </div>
        ) : (
          <div style={styles.grid}>
            {sliders.map((slider) => (
              <div key={slider.id || slider.sliderId} style={styles.card}>
                <div style={styles.imageWrapper}>
                  <img
                    src={slider.image || '/images/placeholder-drink.svg'}
                    alt={slider.title || 'Slider'}
                    style={styles.cardImage}
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.target.src = '/images/placeholder-drink.svg' }}
                  />
                  <span style={{
                    ...styles.statusBadge,
                    background: slider.active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: slider.active ? '#22c55e' : '#ef4444',
                    border: `1px solid ${slider.active ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  }}>
                    {slider.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={styles.cardBody}>
                  <h3 style={styles.cardTitle}>{slider.title || 'Untitled Slider'}</h3>
                  {slider.subtitle && (
                    <p style={styles.cardSubtitle}>{slider.subtitle}</p>
                  )}
                  <div style={styles.cardFooter}>
                    <button
                      style={{ ...styles.deleteBtn, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' }}
                      onClick={() => openEditModal(slider)}
                      title="Edit Slider"
                    >
                      <FaEdit /> Edit
                    </button>
                    <button
                      style={styles.deleteBtn}
                      onClick={() => handleDelete(slider)}
                      title="Delete Slider"
                    >
                      <FaTrash /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Slider Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingSlider ? 'Edit Slider' : 'Add New Slider'}
      >
        <div style={styles.formGrid}>
          {/* Image Upload */}
          <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
            <label style={styles.label}>Slider Image *</label>
            <div style={styles.imageUploadArea}>
              {formData.image ? (
                <div style={styles.imagePreviewContainer}>
                  <img
                    src={formData.image}
                    alt="Preview"
                    style={styles.imagePreview}
                    onError={(e) => { e.target.src = '/images/placeholder-drink.svg' }}
                  />
                  <button
                    type="button"
                    style={styles.removeImageBtn}
                    onClick={() => setFormData(prev => ({ ...prev, image: '' }))}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div style={styles.uploadPlaceholder}>
                  <FaUpload style={{ fontSize: '24px', color: c.textSecondary }} />
                  <span style={{ color: c.textSecondary, fontSize: '13px' }}>Upload an image</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={styles.fileInput}
                id="slider-image-upload"
              />
              <label htmlFor="slider-image-upload" style={styles.uploadBtn}>
                <FaUpload /> Choose File
              </label>
            </div>
            <div style={{ marginTop: '8px' }}>
              <label style={{ ...styles.label, fontSize: '12px', color: c.textSecondary }}>Or enter image URL</label>
              <input
                type="text"
                name="image"
                value={formData.image.startsWith('data:') ? '' : formData.image}
                onChange={handleInputChange}
                style={{ ...styles.input, marginTop: '4px' }}
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Title */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Title</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              style={styles.input}
              placeholder="e.g. Summer Sale"
            />
          </div>

          {/* Subtitle */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Subtitle</label>
            <input
              type="text"
              name="subtitle"
              value={formData.subtitle}
              onChange={handleInputChange}
              style={styles.input}
              placeholder="e.g. Up to 50% off"
            />
          </div>

          {/* Link to Product */}
          <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
            <label style={styles.label}>Link to Product (click karne pe kahan jaaye)</label>
            <select
              name="link"
              value={formData.link}
              onChange={handleInputChange}
              style={{ ...styles.input, cursor: 'pointer' }}
            >
              <option value="">-- No Link --</option>
              <option value="/products">All Products Page</option>
              {products.map(p => (
                <option key={p._id || p.id} value={`/product/${p._id || p.id}`}>
                  {p.name} — ₹{p.pricePerBox || p.price}
                </option>
              ))}
            </select>
          </div>

          {/* Active Toggle */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Status</label>
            <div
              style={styles.toggleWrapper}
              onClick={() => setFormData(prev => ({ ...prev, active: !prev.active }))}
            >
              <div style={{
                ...styles.toggleTrack,
                background: formData.active ? '#22c55e' : c.border,
              }}>
                <div style={{
                  ...styles.toggleThumb,
                  transform: formData.active ? 'translateX(22px)' : 'translateX(2px)',
                }} />
              </div>
              <span style={{
                color: formData.active ? '#22c55e' : c.textSecondary,
                fontSize: '14px',
                fontWeight: '500',
              }}>
                {formData.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.cancelBtn} onClick={() => setShowModal(false)}>
            Cancel
          </button>
          <button style={styles.saveBtn} onClick={handleSave} disabled={saving || uploadingImage}>
            {uploadingImage ? 'Uploading Image...' : saving ? 'Saving...' : editingSlider ? 'Update Slider' : 'Add Slider'}
          </button>
        </div>
      </Modal>

      <ImageCropModal isOpen={showCrop} onClose={() => setShowCrop(false)} imageSrc={cropSrc} onCropDone={handleCropDone} aspect={16/9} />
      <style>{spinnerKeyframes}</style>
    </AdminLayout>
  )
}

const spinnerKeyframes = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`

const getStyles = (c) => ({
  page: {
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '12px',
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
    fontSize: '13px',
    color: c.textSecondary,
    margin: '4px 0 0 0',
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: '#e23744',
    border: 'none',
    borderRadius: '10px',
    padding: '12px 24px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    boxShadow: '0 2px 8px rgba(226, 55, 68, 0.3)',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    background: c.surface,
    borderRadius: '14px',
    border: `1px solid ${c.border}`,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '20px',
  },
  card: {
    background: c.surface,
    borderRadius: '14px',
    border: `1px solid ${c.border}`,
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  imageWrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '200px',
    objectFit: 'cover',
    borderRadius: '10px 10px 0 0',
    display: 'block',
  },
  statusBadge: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    backdropFilter: 'blur(8px)',
  },
  cardBody: {
    padding: '16px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: c.text,
    margin: '0 0 4px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardSubtitle: {
    fontSize: '13px',
    color: c.textSecondary,
    margin: '0 0 12px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    paddingTop: '12px',
    borderTop: `1px solid ${c.border}`,
  },
  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: '8px',
    padding: '8px 14px',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'background 0.2s',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: '16px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: `3px solid ${c.border}`,
    borderTop: '3px solid #e23744',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: c.textSecondary,
    fontSize: '14px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    color: c.textSecondary,
    fontSize: '13px',
    fontWeight: '500',
  },
  input: {
    padding: '10px 14px',
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
    background: c.bg,
    color: c.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
    transition: 'border-color 0.2s',
  },
  imageUploadArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    border: `1px dashed ${c.border}`,
    borderRadius: '10px',
    background: c.bg,
  },
  imagePreviewContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  imagePreview: {
    width: '100px',
    height: '100px',
    borderRadius: '10px',
    objectFit: 'cover',
    border: `1px solid ${c.border}`,
  },
  removeImageBtn: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    padding: '4px 12px',
    color: '#ef4444',
    fontSize: '12px',
    cursor: 'pointer',
  },
  uploadPlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '12px 20px',
  },
  fileInput: {
    display: 'none',
  },
  uploadBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: c.border,
    border: `1px solid ${c.textSecondary}`,
    borderRadius: '8px',
    padding: '10px 18px',
    color: c.text,
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background 0.2s',
    whiteSpace: 'nowrap',
  },
  toggleWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    paddingTop: '4px',
  },
  toggleTrack: {
    width: '46px',
    height: '24px',
    borderRadius: '12px',
    position: 'relative',
    transition: 'background 0.2s',
  },
  toggleThumb: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: '2px',
    transition: 'transform 0.2s',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '24px',
    paddingTop: '16px',
    borderTop: `1px solid ${c.border}`,
  },
  cancelBtn: {
    background: c.border,
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    color: c.text,
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  saveBtn: {
    background: '#e23744',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 24px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    boxShadow: '0 2px 8px rgba(226, 55, 68, 0.3)',
  },
})

export default Sliders
