import { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import {
  FaPlus, FaEdit, FaTrash, FaSearch, FaImage, FaUpload,
  FaFilter, FaChevronLeft, FaChevronRight, FaBox, FaCloudUploadAlt
} from 'react-icons/fa'
import useDrive from '../services/useDrive'
import ImageCropModal from '../components/ImageCropModal'
import { uploadImage, deleteImage, getImageUrl } from '../services/googleDrive'

const initialForm = {
  name: '',
  category: '',
  description: '',
  boxQuantity: '',
  volume: '',
  pricePerBox: '',
  costPricePerBox: '',
  mrp: '',
  stockQuantity: '',
  lowStockAlert: '10',
  image: '',
  status: 'active',
  gstPercent: '',
  deliveryCharge: '',
  allowPiecePurchase: false,
  allowHalfBox: false,
}

const getSellingModeLabel = (product) => {
  if (product.allowPiecePurchase) return 'Piece'
  if (product.allowHalfBox) return 'Full + Half'
  return 'Full Only'
}

const getStockDisplay = (product) => {
  const stock = Number(product.stockQuantity || 0)
  const perBox = Number(product.boxQuantity || 24) || 24

  if (product.allowPiecePurchase) {
    const pieces = Math.round(stock * perBox)
    return {
      main: `${pieces} pieces`,
      sub: `${stock} box equivalent · ${perBox} per box`,
    }
  }

  if (product.allowHalfBox) {
    const fullBoxes = Math.floor(stock)
    const hasHalf = Math.abs(stock - fullBoxes - 0.5) < 0.001
    return {
      main: hasHalf ? `${fullBoxes} boxes + 1 half` : `${stock} boxes`,
      sub: `${stock} total box equivalent`,
    }
  }

  return {
    main: `${stock} boxes`,
    sub: `${perBox} per box`,
  }
}

const getLowStockHint = (product) => {
  const threshold = Number(product.lowStockAlert || 10)
  const perBox = Number(product.boxQuantity || 24) || 24

  if (product.allowPiecePurchase) {
    return `Alert at ${Math.round(threshold * perBox)} pieces`
  }

  if (product.allowHalfBox) {
    const fullBoxes = Math.floor(threshold)
    const hasHalf = Math.abs(threshold - fullBoxes - 0.5) < 0.001
    return hasHalf ? `Alert at ${fullBoxes} boxes + 1 half` : `Alert at ${threshold} boxes`
  }

  return `Alert at ${threshold} boxes`
}

const Products = () => {
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [stockFilter, setStockFilter] = useState('All')
  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [formData, setFormData] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [categories, setCategories] = useState([])
  const [imageFile, setImageFile] = useState(null)
  const [cropSrc, setCropSrc] = useState(null)
  const [showCrop, setShowCrop] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const { driveReady, needsSetup, driveLoading, setupDrive } = useDrive()
  const itemsPerPage = 10

  useEffect(() => {
    fetchProducts()
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const response = await API.get('/categories')
      const data = Array.isArray(response.data) ? response.data : []
      setCategories(data.filter(c => c.status === 'active').map(c => c.name))
    } catch {
      setCategories(['Soft Drinks', 'Energy Drinks', 'Juices', 'Water'])
    }
  }

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const response = await API.get('/products')
      const data = response.data
      setProducts(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch products:', error)
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  // Filtering logic
  const filteredProducts = products.filter(p => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!p.name?.toLowerCase().includes(q)) return false
    }
    // Category filter
    if (categoryFilter !== 'All' && p.category !== categoryFilter) return false
    // Stock filter
    if (stockFilter === 'In Stock' && (p.stockQuantity || 0) > (p.lowStockAlert || 10)) return true
    if (stockFilter === 'Low Stock' && (p.stockQuantity || 0) > 0 && (p.stockQuantity || 0) <= (p.lowStockAlert || 10)) return true
    if (stockFilter === 'Out of Stock' && (p.stockQuantity || 0) === 0) return true
    if (stockFilter !== 'All') return false
    return true
  })

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, categoryFilter, stockFilter])

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    const nextValue = type === 'checkbox' ? checked : value
    setFormData(prev => {
      if (name === 'allowPiecePurchase') {
        return {
          ...prev,
          allowPiecePurchase: checked,
          allowHalfBox: checked ? false : prev.allowHalfBox,
        }
      }
      return { ...prev, [name]: nextValue }
    })
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
    setEditingProduct(null)
    setFormData(initialForm)
    setImageFile(null)
    setShowModal(true)
  }

  const openEditModal = (product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name || '',
      category: product.category || '',
      description: product.description || '',
      boxQuantity: product.boxQuantity || '',
      volume: product.volume || '',
      pricePerBox: product.pricePerBox || '',
      costPricePerBox: product.costPricePerBox || '',
      mrp: product.mrp || '',
      stockQuantity: product.stockQuantity || '',
      lowStockAlert: product.lowStockAlert || '10',
      image: product.image || '',
      status: product.status || 'active',
      gstPercent: product.gstPercent ?? '',
      deliveryCharge: product.deliveryCharge ?? '',
      allowPiecePurchase: Boolean(product.allowPiecePurchase),
      allowHalfBox: Boolean(product.allowHalfBox),
    })
    setShowModal(true)
  }

  const openDeleteModal = (product) => {
    setDeleteTarget(product)
    setShowDeleteModal(true)
  }

  const handleSave = async () => {
    if (!formData.name || !formData.category || !formData.pricePerBox) {
      toast.error('Please fill in required fields (Name, Category, Price per Box)')
      return
    }

    try {
      setSaving(true)
      let imageUrl = formData.image

      // Upload new image to Google Drive if a file was selected
      if (imageFile && driveReady) {
        setUploadingImage(true)
        try {
          const fileName = `product_${formData.name.replace(/\s+/g, '_')}_${Date.now()}.jpg`
          const fileId = await uploadImage(imageFile, 'products', fileName)
          imageUrl = getImageUrl(fileId)

          // Delete old Drive image if editing and old image was from Drive
          if (editingProduct?.driveFileId) {
            await deleteImage(editingProduct.driveFileId).catch(() => {})
          }
        } catch (err) {
          toast.error('Image upload failed: ' + err.message)
          return
        } finally {
          setUploadingImage(false)
        }
      }

      const payload = {
        name: formData.name,
        category: formData.category,
        description: formData.description,
        boxQuantity: Number(formData.boxQuantity) || 0,
        volume: formData.volume ? Number(formData.volume) : null,
        pricePerBox: Number(formData.pricePerBox) || 0,
        costPricePerBox: Number(formData.costPricePerBox) || 0,
        mrp: Number(formData.mrp) || 0,
        stockQuantity: Number(formData.stockQuantity) || 0,
        lowStockAlert: Number(formData.lowStockAlert) || 10,
        image: imageUrl,
        status: formData.status,
        gstPercent: formData.gstPercent !== '' ? Number(formData.gstPercent) : null,
        deliveryCharge: formData.deliveryCharge !== '' ? Number(formData.deliveryCharge) : null,
        allowPiecePurchase: Boolean(formData.allowPiecePurchase),
        allowHalfBox: formData.allowPiecePurchase ? false : Boolean(formData.allowHalfBox),
      }

      if (editingProduct) {
        await API.put(`/products/${editingProduct.id}`, payload)
        toast.success('Product updated successfully')
      } else {
        await API.post('/products', payload)
        toast.success('Product added successfully')
      }

      setShowModal(false)
      setImageFile(null)
      fetchProducts()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await API.delete(`/products/${deleteTarget.id}`)
      toast.success('Product deleted successfully')
      setShowDeleteModal(false)
      setDeleteTarget(null)
      fetchProducts()
    } catch (error) {
      toast.error('Failed to delete product')
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0)
  }

  const getStockColor = (product) => {
    const qty = product.stockQuantity || 0
    const threshold = product.lowStockAlert || 10
    if (qty === 0) return '#ef4444'
    if (qty <= threshold) return '#f59e0b'
    return '#22c55e'
  }

  const getStockLabel = (product) => {
    const qty = product.stockQuantity || 0
    const threshold = product.lowStockAlert || 10
    if (qty === 0) return 'Out of Stock'
    if (qty <= threshold) return 'Low Stock'
    return 'In Stock'
  }

  const styles = getStyles(c)

  if (loading) {
    return (
      <AdminLayout>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading products...</p>
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
            <h1 style={styles.title}>Products</h1>
            <p style={styles.subtitle}>{products.length} total products</p>
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
              <FaPlus /> Add Product
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={styles.filterBar}>
          <div style={styles.searchWrapper}>
            <FaSearch style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <div style={styles.filterGroup}>
            <FaFilter style={{ color: c.textSecondary, fontSize: '12px' }} />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="All">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="All">All Stock</option>
              <option value="In Stock">In Stock</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
          </div>
        </div>

        {/* Products Table */}
        <div style={styles.tableCard}>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Price/Box</th>
                  <th style={styles.th}>Stock</th>
                  <th style={styles.th}>Status</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={styles.emptyCell}>
                      <FaBox style={{ fontSize: '32px', color: c.border, marginBottom: '12px' }} />
                      <div>No products found</div>
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((product) => (
                    <tr key={product.id} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={styles.productInfo}>
                          <img
                            src={product.image || '/images/placeholder-drink.svg'}
                            alt={product.name}
                            style={styles.productImage}
                            referrerPolicy="no-referrer"
                            onError={(e) => { e.target.src = '/images/placeholder-drink.svg' }}
                          />
                          <div>
                            <div style={styles.productName}>{product.name}</div>
                            {product.boxQuantity > 0 && (
                              <div style={styles.productMeta}>{product.boxQuantity} per box{product.volume ? ` · ${product.volume}ml` : ''}</div>
                            )}
                            {!product.boxQuantity && product.volume > 0 && (
                              <div style={styles.productMeta}>{product.volume}ml</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.categoryBadge}>{product.category}</span>
                        <div style={styles.modeHint}>{getSellingModeLabel(product)}</div>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.priceMain}>{formatCurrency(product.pricePerBox)}</div>
                        {product.mrp > 0 && product.mrp !== product.pricePerBox && (
                          <div style={styles.priceMrp}>MRP {formatCurrency(product.mrp)}</div>
                        )}
                      </td>
                      <td style={styles.td}>
                        {(() => {
                          const stockDisplay = getStockDisplay(product)
                          return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            ...styles.stockDot,
                            background: getStockColor(product)
                          }} />
                          <div>
                            <div style={{
                              fontWeight: '600',
                              color: getStockColor(product),
                              fontSize: '14px'
                            }}>
                              {stockDisplay.main}
                            </div>
                            <div style={{
                              fontSize: '11px',
                              color: getStockColor(product),
                              opacity: 0.8
                            }}>
                              {getStockLabel(product)} · {stockDisplay.sub}
                            </div>
                            <div style={{
                              fontSize: '11px',
                              color: c.textSecondary,
                              marginTop: '2px'
                            }}>
                              {getLowStockHint(product)}
                            </div>
                          </div>
                        </div>
                          )
                        })()}
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusBadge,
                          background: product.status === 'active' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: product.status === 'active' ? '#22c55e' : '#ef4444',
                          border: `1px solid ${product.status === 'active' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                        }}>
                          {product.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <div style={styles.actionButtons}>
                          <button style={styles.editBtn} onClick={() => openEditModal(product)} title="Edit">
                            <FaEdit />
                          </button>
                          <button style={styles.deleteBtn} onClick={() => openDeleteModal(product)} title="Delete">
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={styles.pagination}>
              <span style={styles.pageInfo}>
                Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredProducts.length)} of {filteredProducts.length}
              </span>
              <div style={styles.pageButtons}>
                <button
                  style={{
                    ...styles.pageBtn,
                    opacity: currentPage === 1 ? 0.4 : 1,
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <FaChevronLeft />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    style={{
                      ...styles.pageBtn,
                      ...(currentPage === page ? styles.activePageBtn : {})
                    }}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  style={{
                    ...styles.pageBtn,
                    opacity: currentPage === totalPages ? 0.4 : 1,
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <FaChevronRight />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Product Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingProduct ? 'Edit Product' : 'Add New Product'}
      >
        <div style={styles.formGrid}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Product Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              style={styles.input}
              placeholder="e.g. Coca Cola 300ml"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Category *</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              style={styles.input}
            >
              <option value="">Select Category</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
            <label style={styles.label}>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
              placeholder="Product description"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Box Quantity</label>
            <input
              type="number"
              name="boxQuantity"
              value={formData.boxQuantity}
              onChange={handleInputChange}
              onWheel={(e) => e.target.blur()}
              style={styles.input}
              placeholder="e.g. 24"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Bottle Volume (ml)</label>
            <input
              type="number"
              name="volume"
              value={formData.volume}
              onChange={handleInputChange}
              onWheel={(e) => e.target.blur()}
              style={styles.input}
              placeholder="e.g. 300"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Price per Box *</label>
            <input
              type="number"
              name="pricePerBox"
              value={formData.pricePerBox}
              onChange={handleInputChange}
              onWheel={(e) => e.target.blur()}
              style={styles.input}
              placeholder="e.g. 450"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Cost Price per Box</label>
            <input
              type="number"
              name="costPricePerBox"
              value={formData.costPricePerBox}
              onChange={handleInputChange}
              onWheel={(e) => e.target.blur()}
              style={styles.input}
              placeholder="Kitne me kharida"
            />
            <span style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px', display: 'block' }}>Profit calculate karne ke liye</span>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>MRP</label>
            <input
              type="number"
              name="mrp"
              value={formData.mrp}
              onChange={handleInputChange}
              onWheel={(e) => e.target.blur()}
              style={styles.input}
              placeholder="e.g. 500"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Stock Quantity</label>
            <input
              type="number"
              name="stockQuantity"
              value={formData.stockQuantity}
              onChange={handleInputChange}
              onWheel={(e) => e.target.blur()}
              style={styles.input}
              placeholder="e.g. 100"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Low Stock Alert</label>
            <input
              type="number"
              name="lowStockAlert"
              value={formData.lowStockAlert}
              onChange={handleInputChange}
              onWheel={(e) => e.target.blur()}
              style={styles.input}
              placeholder="e.g. 10"
            />
            <p style={styles.inlineHint}>
              Ye threshold box equivalent me hota hai. Example: piece product me `10` ka matlab `10 boxes worth` stock.
            </p>
          </div>
          <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
            <label style={styles.label}>Product Image</label>
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
                id="product-image-upload"
              />
              <label htmlFor="product-image-upload" style={styles.uploadBtn}>
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
          <div style={styles.formGroup}>
            <label style={styles.label}>Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              style={styles.input}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
            <label style={styles.label}>Selling Options</label>
            <div style={styles.checkboxRow}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  name="allowPiecePurchase"
                  checked={Boolean(formData.allowPiecePurchase)}
                  onChange={handleInputChange}
                />
                <span>Sell by Piece</span>
              </label>
              <label style={{ ...styles.checkboxLabel, opacity: formData.allowPiecePurchase ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  name="allowHalfBox"
                  checked={Boolean(formData.allowHalfBox)}
                  onChange={handleInputChange}
                  disabled={Boolean(formData.allowPiecePurchase)}
                />
                <span>Allow Half Box</span>
              </label>
            </div>
            <p style={styles.optionHint}>
              `Sell by Piece` on hoga to product sirf piece mode me bikega. Agar off hai, to `Allow Half Box` se full box ke saath half box enable hoga.
            </p>
          </div>
        </div>
        <div style={styles.modalFooter}>
          <button style={styles.cancelBtn} onClick={() => setShowModal(false)}>
            Cancel
          </button>
          <button style={styles.saveBtn} onClick={handleSave} disabled={saving || uploadingImage}>
            {uploadingImage ? 'Uploading Image...' : saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Add Product'}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Product"
      >
        <p style={styles.deleteMessage}>
          Are you sure you want to delete <strong style={{ color: c.text }}>{deleteTarget?.name}</strong>?
          This action cannot be undone.
        </p>
        <div style={styles.modalFooter}>
          <button style={styles.cancelBtn} onClick={() => setShowDeleteModal(false)}>
            Cancel
          </button>
          <button style={styles.confirmDeleteBtn} onClick={handleDelete}>
            Delete Product
          </button>
        </div>
      </Modal>

      <ImageCropModal isOpen={showCrop} onClose={() => setShowCrop(false)} imageSrc={cropSrc} onCropDone={handleCropDone} aspect={1} />
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
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '12px'
  },
  title: {
    fontSize: '26px',
    fontWeight: '700',
    color: c.text,
    margin: 0
  },
  subtitle: {
    fontSize: '13px',
    color: c.textSecondary,
    margin: '4px 0 0 0'
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
    boxShadow: '0 2px 8px rgba(226, 55, 68, 0.3)'
  },
  filterBar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  searchWrapper: {
    position: 'relative',
    flex: 1,
    minWidth: '240px'
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
    padding: '11px 16px 11px 40px',
    border: `1px solid ${c.border}`,
    borderRadius: '10px',
    background: c.surface,
    color: c.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s'
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  filterSelect: {
    padding: '11px 16px',
    border: `1px solid ${c.border}`,
    borderRadius: '10px',
    background: c.surface,
    color: c.text,
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '160px'
  },
  tableCard: {
    background: c.surface,
    borderRadius: '14px',
    border: `1px solid ${c.border}`,
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
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
    padding: '14px 18px',
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
    padding: '14px 18px',
    color: c.text,
    fontSize: '14px',
    borderBottom: `1px solid ${c.border}`,
    verticalAlign: 'middle'
  },
  emptyCell: {
    padding: '60px 40px',
    textAlign: 'center',
    color: c.textSecondary,
    fontSize: '14px'
  },
  productInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  productImage: {
    width: '48px',
    height: '48px',
    borderRadius: '10px',
    objectFit: 'cover',
    border: `1px solid ${c.border}`,
    background: c.bg
  },
  productName: {
    fontWeight: '600',
    color: c.text,
    fontSize: '14px'
  },
  productMeta: {
    fontSize: '12px',
    color: c.textSecondary,
    marginTop: '2px'
  },
  modeHint: {
    fontSize: '11px',
    color: c.textSecondary,
    marginTop: '6px',
    fontWeight: '600'
  },
  categoryBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '500',
    background: 'rgba(14, 165, 233, 0.1)',
    color: '#38bdf8',
    border: '1px solid rgba(14, 165, 233, 0.2)'
  },
  priceMain: {
    fontWeight: '600',
    color: c.text,
    fontSize: '14px'
  },
  priceMrp: {
    fontSize: '11px',
    color: c.textSecondary,
    textDecoration: 'line-through',
    marginTop: '2px'
  },
  stockDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0
  },
  statusBadge: {
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block'
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end'
  },
  editBtn: {
    background: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: '8px',
    padding: '8px 10px',
    color: '#3b82f6',
    cursor: 'pointer',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    transition: 'background 0.2s'
  },
  deleteBtn: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: '8px',
    padding: '8px 10px',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    transition: 'background 0.2s'
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 18px',
    borderTop: `1px solid ${c.border}`
  },
  pageInfo: {
    color: c.textSecondary,
    fontSize: '13px'
  },
  pageButtons: {
    display: 'flex',
    gap: '4px'
  },
  pageBtn: {
    background: c.bg,
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
    padding: '7px 12px',
    color: c.text,
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '34px',
    transition: 'all 0.2s'
  },
  activePageBtn: {
    background: '#e23744',
    borderColor: '#e23744',
    color: '#fff'
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
    borderTop: '3px solid #e23744',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  loadingText: {
    color: c.textSecondary,
    fontSize: '14px'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  checkboxRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    marginTop: '4px'
  },
  checkboxLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    color: c.text,
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  optionHint: {
    margin: '8px 0 0 0',
    color: c.textSecondary,
    fontSize: '12px',
    lineHeight: 1.5
  },
  inlineHint: {
    margin: '6px 0 0 0',
    color: c.textSecondary,
    fontSize: '11px',
    lineHeight: 1.4
  },
  label: {
    color: c.textSecondary,
    fontSize: '13px',
    fontWeight: '500'
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
    transition: 'border-color 0.2s'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '24px',
    paddingTop: '16px',
    borderTop: `1px solid ${c.border}`
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
    transition: 'background 0.2s'
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
    boxShadow: '0 2px 8px rgba(226, 55, 68, 0.3)'
  },
  deleteMessage: {
    color: c.text,
    fontSize: '14px',
    lineHeight: '1.6',
    margin: '0 0 8px 0'
  },
  confirmDeleteBtn: {
    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 24px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  imageUploadArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    border: `1px dashed ${c.border}`,
    borderRadius: '10px',
    background: c.bg
  },
  imagePreviewContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px'
  },
  imagePreview: {
    width: '100px',
    height: '100px',
    borderRadius: '10px',
    objectFit: 'cover',
    border: `1px solid ${c.border}`
  },
  removeImageBtn: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    padding: '4px 12px',
    color: '#ef4444',
    fontSize: '12px',
    cursor: 'pointer'
  },
  uploadPlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '12px 20px'
  },
  fileInput: {
    display: 'none'
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
    whiteSpace: 'nowrap'
  }
})

export default Products
