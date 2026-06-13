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
import ImageCropModal from '../components/ImageCropModal'
import { uploadImage, deleteImage, getImageUrl } from '../services/googleDrive'

const MAX_IMAGES = 4

const initialForm = {
  name: '',
  category: '',
  brand: '',
  description: '',
  boxQuantity: '',
  volume: '',
  volumeUnit: 'ml',
  pricePerBox: '',
  costPricePerBox: '',
  mrp: '',
  stockQuantity: '',
  lowStockAlert: '10',
  images: [],
  status: 'active',
  gstPercent: '',
  deliveryCharge: '',
  allowPiecePurchase: false,
  allowHalfBox: false,
  offer: null,
  // Variants mode (nested)
  hasVariants: false,
  variants: [],     // Array of variant objects (see backend schema)
}

const emptyVariant = () => ({
  variantId: '',       // server assigns; empty = new
  flavor: '',
  volume: '',
  volumeUnit: 'ml',
  pricePerBox: '',
  mrp: '',
  costPricePerBox: '',
  boxQuantity: '24',
  stockQuantity: '0',
  lowStockAlert: '5',
  gstPercent: '',
  deliveryCharge: '',
  allowPiecePurchase: false,
  allowHalfBox: false,
  isActive: true,
  status: 'active',
  image: '',
  images: null,
})

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
  const [variantsViewTarget, setVariantsViewTarget] = useState(null)   // product whose variants to show in popover
  const [restockTargetVariant, setRestockTargetVariant] = useState(null) // { productId, variantId, label } for quick restock from popover
  const [restockQty, setRestockQty] = useState('')
  const [restocking, setRestocking] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [formData, setFormData] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [categories, setCategories] = useState([])
  const [imageFiles, setImageFiles] = useState([])
  const [activeImageSlot, setActiveImageSlot] = useState(null)
  const [cropSrc, setCropSrc] = useState(null)
  const [showCrop, setShowCrop] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
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

  // Effective stock + low-stock checks (works for both variants + single-SKU)
  const effectiveStock = (p) => {
    if (p.hasVariants === true) return Number(p.totalStock) || 0
    return Number(p.stockQuantity) || 0
  }
  const isLowStock = (p) => {
    if (p.hasVariants === true) return p.hasLowStock === true
    return (Number(p.stockQuantity) || 0) <= (Number(p.lowStockAlert) || 10)
  }
  const isOutOfStock = (p) => {
    if (p.hasVariants === true) return p.outOfStock === true
    return (Number(p.stockQuantity) || 0) === 0
  }

  // Filtering logic
  const filteredProducts = products.filter(p => {
    // Search filter — matches name + brand + variant flavors
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const hits =
        (p.name || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.availableFlavors || []).some(f => String(f).toLowerCase().includes(q))
      if (!hits) return false
    }
    // Category filter
    if (categoryFilter !== 'All' && p.category !== categoryFilter) return false
    // Stock filter
    if (stockFilter === 'In Stock' && !isOutOfStock(p) && !isLowStock(p)) return true
    if (stockFilter === 'Low Stock' && isLowStock(p) && !isOutOfStock(p)) return true
    if (stockFilter === 'Out of Stock' && isOutOfStock(p)) return true
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

  // Auto-sync the offer label from buyQty / freeQty / free product name.
  // Skips if user manually customized the label (_labelTouched=true) or if
  // free product isn't selected yet.
  useEffect(() => {
    const offer = formData.offer
    if (!offer?.enabled) return
    if (offer._labelTouched) return
    const freeProduct = products.find(p => p.id === offer.freeProductId)
    if (!freeProduct) return
    const newLabel = `Buy ${offer.buyQty || 1}, Get ${offer.freeQty || 1} ${freeProduct.name} Free!`
    if (offer.label === newLabel) return
    setFormData(prev => ({ ...prev, offer: { ...prev.offer, label: newLabel } }))
  }, [
    formData.offer?.enabled,
    formData.offer?.buyQty,
    formData.offer?.freeQty,
    formData.offer?.freeProductId,
    formData.offer?._labelTouched,
    products,
  ])

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

  // Generic image upload — slotKey can be a number (product image index) OR
  // an object { type: 'variant', index: N } for variant image upload.
  const handleImageUpload = (e, slotKey) => {
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
    setActiveImageSlot(slotKey)
    // Store File for upload — keyed differently depending on slot type
    if (typeof slotKey === 'object' && slotKey?.type === 'variant') {
      // Variant image: use product imageFiles slot N+1000 to avoid collision with product slots
      setImageFiles(prev => {
        const next = [...prev]
        next[1000 + slotKey.index] = file
        return next
      })
    } else {
      setImageFiles(prev => {
        const next = [...prev]
        next[slotKey] = file
        return next
      })
    }
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
    const slot = activeImageSlot
    if (typeof slot === 'object' && slot?.type === 'variant') {
      // Set image on variant
      setFormData(prev => {
        const next = [...(prev.variants || [])]
        if (next[slot.index]) {
          next[slot.index] = { ...next[slot.index], image: croppedDataUrl }
        }
        return { ...prev, variants: next }
      })
    } else {
      setFormData(prev => {
        const next = [...(prev.images || [])]
        next[slot] = croppedDataUrl
        return { ...prev, images: next }
      })
    }
  }

  const handleVariantImageRemove = (variantIdx) => {
    setFormData(prev => {
      const next = [...(prev.variants || [])]
      if (next[variantIdx]) {
        next[variantIdx] = { ...next[variantIdx], image: '' }
      }
      return { ...prev, variants: next }
    })
    setImageFiles(prev => {
      const next = [...prev]
      next[1000 + variantIdx] = undefined
      return next
    })
  }

  const removeImage = (slotIndex) => {
    setFormData(prev => {
      const next = [...(prev.images || [])]
      next.splice(slotIndex, 1)
      return { ...prev, images: next }
    })
    setImageFiles(prev => {
      const next = [...prev]
      next.splice(slotIndex, 1)
      return next
    })
  }

  const openAddModal = () => {
    setEditingProduct(null)
    setFormData(initialForm)
    setImageFiles([])
    setShowModal(true)
  }

  const openEditModal = (product) => {
    setEditingProduct(product)
    // Backward compat: load images array or fallback to single image
    const existingImages = Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : product.image ? [product.image] : []
    const incomingVariants = Array.isArray(product.variants)
      ? product.variants.map(v => ({
          variantId: v.variantId || '',
          flavor: v.flavor || '',
          volume: v.volume ?? '',
          volumeUnit: v.volumeUnit || 'ml',
          pricePerBox: v.pricePerBox ?? '',
          mrp: v.mrp ?? '',
          costPricePerBox: v.costPricePerBox ?? '',
          boxQuantity: v.boxQuantity ?? '24',
          stockQuantity: v.stockQuantity ?? '0',
          lowStockAlert: v.lowStockAlert ?? '5',
          gstPercent: v.gstPercent ?? '',
          deliveryCharge: v.deliveryCharge ?? '',
          allowPiecePurchase: Boolean(v.allowPiecePurchase),
          allowHalfBox: Boolean(v.allowHalfBox),
          isActive: v.isActive !== false,
          status: v.status || 'active',
          image: v.image || '',
          images: Array.isArray(v.images) ? v.images : null,
          offer: v.offer || null,
        }))
      : []
    setFormData({
      name: product.name || '',
      category: product.category || '',
      brand: product.brand || '',
      description: product.description || '',
      boxQuantity: product.boxQuantity || '',
      volume: product.volume || '',
      volumeUnit: product.volumeUnit || 'ml',
      pricePerBox: product.pricePerBox || '',
      costPricePerBox: product.costPricePerBox || '',
      mrp: product.mrp || '',
      stockQuantity: product.stockQuantity || '',
      lowStockAlert: product.lowStockAlert || '10',
      images: existingImages,
      status: product.status || 'active',
      gstPercent: product.gstPercent ?? '',
      deliveryCharge: product.deliveryCharge ?? '',
      allowPiecePurchase: Boolean(product.allowPiecePurchase),
      allowHalfBox: Boolean(product.allowHalfBox),
      // Mark existing label as user-confirmed so auto-sync doesn't overwrite a saved custom label
      offer: product.offer ? { ...product.offer, _labelTouched: Boolean(product.offer.label) } : null,
      hasVariants: product.hasVariants === true,
      variants: incomingVariants,
    })
    setImageFiles([])
    setShowModal(true)
  }

  // Variants helpers
  const handleVariantChange = (idx, field, value) => {
    setFormData(prev => {
      const next = [...(prev.variants || [])]
      next[idx] = { ...next[idx], [field]: value }
      // Mutex piece/half
      if (field === 'allowPiecePurchase' && value === true) {
        next[idx].allowHalfBox = false
      }
      return { ...prev, variants: next }
    })
  }

  const addVariant = () => {
    setFormData(prev => {
      const variants = [...(prev.variants || []), emptyVariant()]
      if (variants.length > 20) {
        toast.error('Maximum 20 variants per product')
        return prev
      }
      return { ...prev, variants }
    })
  }

  const removeVariant = (idx) => {
    setFormData(prev => {
      const next = [...(prev.variants || [])]
      next.splice(idx, 1)
      return { ...prev, variants: next }
    })
  }

  const duplicateVariant = (idx) => {
    setFormData(prev => {
      const variants = [...(prev.variants || [])]
      if (variants.length >= 20) {
        toast.error('Maximum 20 variants per product')
        return prev
      }
      const src = { ...variants[idx], variantId: '' }    // new variant, server assigns id
      variants.splice(idx + 1, 0, src)
      return { ...prev, variants }
    })
  }

  // Compute aggregates for live preview
  const variantAggregates = (() => {
    const vs = (formData.variants || []).filter(v => v.status !== 'discontinued' && v.isActive !== false)
    if (vs.length === 0) return null
    const prices = vs.map(v => Number(v.pricePerBox) || 0).filter(p => p > 0)
    const stocks = vs.map(v => Number(v.stockQuantity) || 0)
    const lowCount = vs.filter(v => (Number(v.stockQuantity) || 0) <= (Number(v.lowStockAlert) || 0)).length
    return {
      count: formData.variants.length,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      totalStock: stocks.reduce((a, b) => a + b, 0),
      lowCount,
    }
  })()

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
      const finalImages = [...(formData.images || [])]

      const hasNewBase64 = finalImages.some((img, i) => img && img.startsWith('data:') && imageFiles[i])

      // Upload new images to Google Drive
      if (hasNewBase64) {
        setUploadingImage(true)
        try {
          for (let i = 0; i < finalImages.length; i++) {
            if (finalImages[i] && finalImages[i].startsWith('data:') && imageFiles[i]) {
              const fileName = `product_${formData.name.replace(/\s+/g, '_')}_${i}_${Date.now()}.jpg`
              const fileId = await uploadImage(imageFiles[i], 'products', fileName)
              finalImages[i] = getImageUrl(fileId)
            }
          }

          // Delete replaced images on edit so Cloudinary doesn't accumulate orphans.
          // Server's diffRemovedImageUrls also handles this defensively at write time;
          // this client-side call is best-effort and idempotent (404 swallowed).
          if (editingProduct) {
            const oldRefs = [
              editingProduct.image,
              ...(Array.isArray(editingProduct.images) ? editingProduct.images : []),
            ].filter(Boolean)
            const newSet = new Set(finalImages.filter(Boolean))
            for (const oldRef of oldRefs) {
              if (!newSet.has(oldRef)) {
                await deleteImage(oldRef).catch(() => {})
              }
            }
          }
        } catch (err) {
          toast.error('Image upload failed: ' + (err.message || 'upload error'))
          return
        } finally {
          setUploadingImage(false)
        }
      }

      const cleanImages = finalImages.filter(Boolean)
      // Belt-and-suspenders: never persist base64 to Firestore.
      if (cleanImages.some(img => typeof img === 'string' && img.startsWith('data:'))) {
        toast.error('Image upload incomplete. Please retry.')
        return
      }

      // Upload variant images to Cloudinary (variant.image as base64 → public_id)
      const variantsWithImages = [...(formData.variants || [])]
      if (formData.hasVariants && variantsWithImages.length > 0) {
        setUploadingImage(true)
        try {
          for (let i = 0; i < variantsWithImages.length; i++) {
            const v = variantsWithImages[i]
            const file = imageFiles[1000 + i]
            if (v?.image && typeof v.image === 'string' && v.image.startsWith('data:') && file) {
              const variantLabel = `${v.flavor || 'variant'}_${v.volume || 'x'}${v.volumeUnit || ''}`.replace(/\s+/g, '_')
              const fileName = `product_${formData.name.replace(/\s+/g, '_')}_${variantLabel}_${Date.now()}.jpg`
              const fileId = await uploadImage(file, 'products', fileName)
              variantsWithImages[i] = { ...v, image: getImageUrl(fileId) }
            }
          }
        } catch (err) {
          toast.error('Variant image upload failed: ' + (err.message || 'Drive error'))
          return
        } finally {
          setUploadingImage(false)
        }
        // Safety: refuse to save if any variant.image still base64
        if (variantsWithImages.some(v => typeof v?.image === 'string' && v.image.startsWith('data:'))) {
          toast.error('Variant image upload incomplete. Please retry.')
          return
        }
      }

      // Build variants payload — only included if variants mode is enabled
      const variantsPayload = formData.hasVariants
        ? variantsWithImages.map(v => ({
            variantId: v.variantId || undefined,    // undefined → server assigns new
            flavor: v.flavor || null,
            volume: Number(v.volume) || 0,
            volumeUnit: v.volumeUnit || 'ml',
            pricePerBox: Number(v.pricePerBox) || 0,
            mrp: Number(v.mrp) || 0,
            costPricePerBox: Number(v.costPricePerBox) || 0,
            boxQuantity: Number(v.boxQuantity) || 24,
            stockQuantity: Number(v.stockQuantity) || 0,
            lowStockAlert: Number(v.lowStockAlert) || 0,
            gstPercent: v.gstPercent !== '' ? Number(v.gstPercent) : 0,
            deliveryCharge: v.deliveryCharge !== '' ? Number(v.deliveryCharge) : 0,
            allowPiecePurchase: Boolean(v.allowPiecePurchase),
            allowHalfBox: v.allowPiecePurchase ? false : Boolean(v.allowHalfBox),
            isActive: v.isActive !== false,
            status: v.status || 'active',
            image: v.image || null,
            images: Array.isArray(v.images) ? v.images : null,
            // Per-variant offer override (optional; null = inherit from product)
            offer: v.offer?.enabled ? {
              enabled: true,
              buyQty: Number(v.offer.buyQty) || 1,
              freeProductId: v.offer.freeProductId || null,
              freeVariantId: v.offer.freeVariantId || null,
              freeQty: Number(v.offer.freeQty) || 1,
              label: v.offer.label || '',
            } : null,
          }))
        : []

      // Pre-submit duplicate-variant client check (server also validates)
      if (formData.hasVariants && variantsPayload.length > 0) {
        const seen = new Set()
        for (const v of variantsPayload) {
          const key = `${v.flavor || '_default'}|${v.volume}|${v.volumeUnit}`
          if (seen.has(key)) {
            toast.error(`Duplicate variant: ${v.flavor ? v.flavor + ' ' : ''}${v.volume}${v.volumeUnit}`)
            return
          }
          seen.add(key)
        }
        if (variantsPayload.some(v => !v.volume || v.volume <= 0)) {
          toast.error('Every variant needs a volume > 0')
          return
        }
      }

      const payload = {
        name: formData.name,
        category: formData.category,
        brand: formData.brand || null,
        description: formData.description,
        boxQuantity: Number(formData.boxQuantity) || 0,
        volume: formData.volume ? Number(formData.volume) : null,
        volumeUnit: formData.volumeUnit || null,
        pricePerBox: Number(formData.pricePerBox) || 0,
        costPricePerBox: Number(formData.costPricePerBox) || 0,
        mrp: Number(formData.mrp) || 0,
        stockQuantity: Number(formData.stockQuantity) || 0,
        lowStockAlert: Number(formData.lowStockAlert) || 10,
        images: cleanImages,
        image: cleanImages[0] || '',
        status: formData.status,
        gstPercent: formData.gstPercent !== '' ? Number(formData.gstPercent) : null,
        deliveryCharge: formData.deliveryCharge !== '' ? Number(formData.deliveryCharge) : null,
        allowPiecePurchase: Boolean(formData.allowPiecePurchase),
        allowHalfBox: formData.allowPiecePurchase ? false : Boolean(formData.allowHalfBox),
        offer: formData.offer?.enabled ? {
          enabled: true,
          buyQty: Number(formData.offer.buyQty) || 1,
          freeProductId: formData.offer.freeProductId || null,
          freeVariantId: formData.offer.freeVariantId || null,   // optional explicit free variant
          freeQty: Number(formData.offer.freeQty) || 1,
          label: formData.offer.label || '',
        } : null,
        variants: variantsPayload,    // empty array if hasVariants=false; server treats as no variants
      }

      if (editingProduct) {
        await API.put(`/products/${editingProduct.id}`, payload)
        toast.success('Product updated successfully')
      } else {
        await API.post('/products', payload)
        toast.success('Product added successfully')
      }

      setShowModal(false)
      setImageFiles([])
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
                  <th className="admin-actions-col" style={styles.th}>Actions</th>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Price/Box</th>
                  <th style={styles.th}>Stock</th>
                  <th style={styles.th}>Status</th>
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
                      <td className="admin-actions-col" style={styles.td}>
                        <div className="admin-actions" style={styles.actionButtons}>
                          <button style={styles.editBtn} onClick={() => openEditModal(product)} title="Edit">
                            <FaEdit />
                          </button>
                          {product.hasVariants === true && (
                            <button
                              onClick={() => setVariantsViewTarget(product)}
                              title="View all variants"
                              style={{
                                padding: '6px 10px', borderRadius: 6, border: `1px solid ${c.border}`,
                                background: 'rgba(99, 102, 241, 0.08)', color: '#6366f1',
                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontWeight: 700, fontSize: 11,
                              }}
                            >
                              <FaBox style={{ fontSize: 11 }} /> {(product.variants || []).length}
                            </button>
                          )}
                          <button style={styles.deleteBtn} onClick={() => openDeleteModal(product)} title="Delete">
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.productInfo}>
                          <img
                            src={product.images?.[0] || product.image || '/images/placeholder-drink.svg'}
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
                        {(() => {
                          const isActive = (product.status || 'active') === 'active'
                          return (
                            <span style={{
                              ...styles.statusBadge,
                              background: isActive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: isActive ? '#22c55e' : '#ef4444',
                              border: `1px solid ${isActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                            }}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          )
                        })()}
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
          <div style={styles.formGroup}>
            <label style={styles.label}>Brand</label>
            <input
              type="text"
              name="brand"
              value={formData.brand}
              onChange={handleInputChange}
              style={styles.input}
              placeholder="e.g. Coca-Cola"
            />
          </div>
          {/* ─── Product Mode Toggle ───────────────────────────────────────── */}
          <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
            <label style={styles.label}>Product Mode</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{
                flex: 1, minWidth: 200, padding: 12, borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${!formData.hasVariants ? '#f97316' : c.border}`,
                background: !formData.hasVariants ? 'rgba(249,115,22,0.08)' : c.bg,
                display: 'flex', alignItems: 'center', gap: 10,
                color: c.text,
              }}>
                <input
                  type="radio"
                  name="hasVariants"
                  checked={!formData.hasVariants}
                  onChange={() => setFormData(prev => ({ ...prev, hasVariants: false }))}
                />
                <div>
                  <div style={{ fontWeight: 600, color: c.text }}>Single product</div>
                  <div style={{ fontSize: 12, color: c.textSecondary }}>One price, one size, one stock</div>
                </div>
              </label>
              <label style={{
                flex: 1, minWidth: 200, padding: 12, borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${formData.hasVariants ? '#f97316' : c.border}`,
                background: formData.hasVariants ? 'rgba(249,115,22,0.08)' : c.bg,
                display: 'flex', alignItems: 'center', gap: 10,
                color: c.text,
              }}>
                <input
                  type="radio"
                  name="hasVariants"
                  checked={formData.hasVariants}
                  onChange={() => setFormData(prev => {
                    // If flipping ON for first time and no variants yet, seed one starter row from current top-level fields
                    if (!prev.hasVariants && (prev.variants || []).length === 0) {
                      return {
                        ...prev,
                        hasVariants: true,
                        variants: [{
                          ...emptyVariant(),
                          flavor: '',
                          volume: prev.volume || '',
                          volumeUnit: prev.volumeUnit || 'ml',
                          pricePerBox: prev.pricePerBox || '',
                          mrp: prev.mrp || '',
                          costPricePerBox: prev.costPricePerBox || '',
                          boxQuantity: prev.boxQuantity || '24',
                          stockQuantity: prev.stockQuantity || '0',
                          lowStockAlert: prev.lowStockAlert || '5',
                          gstPercent: prev.gstPercent || '',
                          deliveryCharge: prev.deliveryCharge || '',
                          allowPiecePurchase: prev.allowPiecePurchase,
                          allowHalfBox: prev.allowHalfBox,
                        }]
                      }
                    }
                    return { ...prev, hasVariants: true }
                  })}
                />
                <div>
                  <div style={{ fontWeight: 600, color: c.text }}>Product with variants</div>
                  <div style={{ fontSize: 12, color: c.textSecondary }}>Multiple flavors / sizes — each with own price + stock</div>
                </div>
              </label>
            </div>
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
          {/* Single-mode pricing/stock fields — HIDDEN in variants mode (captured per variant) */}
          {!formData.hasVariants && (
            <>
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
            </>
          )}
          <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
            <label style={styles.label}>Product Images <span style={{ fontSize: 12, color: c.textSecondary, fontWeight: 400 }}>(max 4 — first image is required)</span></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {Array.from({ length: MAX_IMAGES }).map((_, idx) => {
                const img = (formData.images || [])[idx]
                const slotId = `product-image-upload-${idx}`
                return (
                  <div key={idx} style={{
                    position: 'relative',
                    border: `2px dashed ${img ? 'transparent' : idx === 0 ? '#f97316' : c.border}`,
                    borderRadius: 12,
                    background: img ? 'transparent' : c.bg,
                    aspectRatio: '1',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}>
                    {img ? (
                      <>
                        <img
                          src={img}
                          alt={`Image ${idx + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }}
                          onError={(e) => { e.target.src = '/images/placeholder-drink.svg' }}
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          style={{
                            position: 'absolute', top: 4, right: 4,
                            background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: '50%',
                            width: 24, height: 24, color: '#fff', fontSize: 12,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <FaTrash style={{ fontSize: 10 }} />
                        </button>
                        {idx === 0 && (
                          <span style={{
                            position: 'absolute', bottom: 4, left: 4,
                            background: 'rgba(249,115,22,0.9)', color: '#fff',
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          }}>
                            Primary
                          </span>
                        )}
                      </>
                    ) : (
                      <label htmlFor={slotId} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        cursor: 'pointer', padding: 10, width: '100%', height: '100%',
                        justifyContent: 'center',
                      }}>
                        <FaCloudUploadAlt style={{ fontSize: 20, color: idx === 0 ? '#f97316' : c.textSecondary }} />
                        <span style={{ fontSize: 11, color: idx === 0 ? '#f97316' : c.textSecondary, fontWeight: idx === 0 ? 600 : 400, textAlign: 'center' }}>
                          {idx === 0 ? 'Primary *' : `Image ${idx + 1}`}
                        </span>
                      </label>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, idx)}
                      style={{ display: 'none' }}
                      id={slotId}
                    />
                  </div>
                )
              })}
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
          {/* Selling Options — HIDDEN in variants mode (per-variant toggles inside each variant row) */}
          {!formData.hasVariants && (
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
          )}

          {/* Offer Section */}
          <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
            <label style={styles.label}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Buy X Get Y Free Offer
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: formData.offer?.enabled ? '#22c55e' : c.textSecondary }}>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.offer?.enabled)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData(prev => ({ ...prev, offer: { enabled: true, buyQty: 2, freeProductId: '', freeQty: 1, label: '', _labelTouched: false } }))
                      } else {
                        setFormData(prev => ({ ...prev, offer: null }))
                      }
                    }}
                  />
                  {formData.offer?.enabled ? 'Active' : 'Off'}
                </label>
              </span>
            </label>

            {formData.offer?.enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: c.bg, borderRadius: 12, border: `1px solid ${c.border}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ ...styles.label, fontSize: 12 }}>Buy Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.offer.buyQty || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, offer: { ...prev.offer, buyQty: e.target.value } }))}
                      style={styles.input}
                      placeholder="e.g. 2"
                    />
                  </div>
                  <div>
                    <label style={{ ...styles.label, fontSize: 12 }}>Free Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.offer.freeQty || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, offer: { ...prev.offer, freeQty: e.target.value } }))}
                      style={styles.input}
                      placeholder="e.g. 1"
                    />
                  </div>
                </div>
                <div style={{ position: 'relative' }}>
                  <label style={{ ...styles.label, fontSize: 12 }}>Free Product</label>
                  <input
                    type="text"
                    value={formData.offer._searchQuery ?? (formData.offer.freeProductId ? (products.find(p => p.id === formData.offer.freeProductId)?.name || '') : '')}
                    onChange={(e) => {
                      setFormData(prev => ({
                        ...prev,
                        offer: { ...prev.offer, _searchQuery: e.target.value, freeProductId: '' }
                      }))
                    }}
                    onFocus={() => setFormData(prev => ({ ...prev, offer: { ...prev.offer, _searchOpen: true, _searchQuery: prev.offer._searchQuery ?? '' } }))}
                    onBlur={() => setTimeout(() => setFormData(prev => ({ ...prev, offer: { ...prev.offer, _searchOpen: false } })), 200)}
                    style={styles.input}
                    placeholder="Search product name..."
                  />
                  {formData.offer._searchOpen && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                      background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10,
                      maxHeight: 200, overflowY: 'auto', marginTop: 4,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    }}>
                      {products
                        .filter(p => {
                          const q = (formData.offer._searchQuery || '').toLowerCase()
                          return !q || p.name?.toLowerCase().includes(q) || p.id?.toLowerCase().includes(q)
                        })
                        .slice(0, 20)
                        .map(p => (
                          <div
                            key={p.id}
                            onMouseDown={() => {
                              setFormData(prev => ({
                                ...prev,
                                offer: {
                                  ...prev.offer,
                                  freeProductId: p.id,
                                  _searchQuery: undefined,
                                  _searchOpen: false,
                                }
                              }))
                            }}
                            style={{
                              padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                              color: c.text, borderBottom: `1px solid ${c.border}`,
                              display: 'flex', alignItems: 'center', gap: 10,
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59,130,246,0.08)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            {p.images?.[0] || p.image ? (
                              <img src={p.images?.[0] || p.image} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} referrerPolicy="no-referrer" />
                            ) : (
                              <div style={{ width: 28, height: 28, borderRadius: 6, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: c.textSecondary }}>?</div>
                            )}
                            <div>
                              <div style={{ fontWeight: 600 }}>{p.name}</div>
                              <div style={{ fontSize: 11, color: c.textSecondary }}>{p.id} · {p.category}</div>
                            </div>
                          </div>
                        ))}
                      {products.filter(p => {
                        const q = (formData.offer._searchQuery || '').toLowerCase()
                        return !q || p.name?.toLowerCase().includes(q) || p.id?.toLowerCase().includes(q)
                      }).length === 0 && (
                        <div style={{ padding: '14px', textAlign: 'center', color: c.textSecondary, fontSize: 13 }}>No products found</div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ ...styles.label, fontSize: 12 }}>Offer Label <span style={{ fontWeight: 400, color: c.textSecondary }}>(customer ko ye dikhega)</span></label>
                  <input
                    type="text"
                    value={formData.offer.label || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      offer: {
                        ...prev.offer,
                        label: e.target.value,
                        // Empty input → resume auto-sync; any text → respect manual edit
                        _labelTouched: e.target.value.length > 0,
                      }
                    }))}
                    style={styles.input}
                    placeholder="e.g. Buy 2 Boxes, Get 1 Sprite Free!"
                  />
                </div>

                {/* Preview */}
                {formData.offer.label && (
                  <div style={{
                    padding: '12px 16px',
                    background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))',
                    border: '1px solid rgba(34,197,94,0.25)',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>🎁</span>
                    <div>
                      <div style={{ fontSize: 11, color: c.textSecondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer Preview</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>{formData.offer.label}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── Variants Editor (only shown when hasVariants=true) ─────────── */}
          {formData.hasVariants && (
            <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
              <label style={styles.label}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span>Variants ({(formData.variants || []).length})</span>
                  <button
                    type="button"
                    onClick={addVariant}
                    style={{
                      background: '#f97316', color: '#fff', border: 'none',
                      padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                      fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6
                    }}
                  >
                    <FaPlus size={11} /> Add Variant
                  </button>
                </span>
              </label>

              {variantAggregates && (
                <div style={{
                  display: 'flex', gap: 12, padding: 10, marginBottom: 12,
                  background: c.bg, borderRadius: 8, fontSize: 12, flexWrap: 'wrap',
                  color: c.text,
                }}>
                  <span><b>{variantAggregates.count}</b> variant{variantAggregates.count !== 1 ? 's' : ''}</span>
                  <span>Price: ₹<b>{variantAggregates.minPrice}</b>–<b>{variantAggregates.maxPrice}</b></span>
                  <span>Stock: <b>{Math.round(variantAggregates.totalStock * 100) / 100}</b> total</span>
                  {variantAggregates.lowCount > 0 && (
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{variantAggregates.lowCount} low stock</span>
                  )}
                </div>
              )}

              {(formData.variants || []).length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: c.textSecondary, fontSize: 13, border: `1px dashed ${c.border}`, borderRadius: 10 }}>
                  No variants yet. Click "Add Variant" to add one.
                </div>
              )}

              {(formData.variants || []).map((v, idx) => {
                const stock = Number(v.stockQuantity) || 0
                const threshold = Number(v.lowStockAlert) || 0
                const stockDot = stock <= 0 ? '#ef4444' : stock <= threshold ? '#f59e0b' : '#22c55e'
                return (
                  <div key={idx} style={{
                    padding: 12, marginBottom: 10, border: `1px solid ${c.border}`,
                    borderRadius: 10, background: c.bg, color: c.text,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: c.text }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: stockDot, display: 'inline-block' }} />
                        Variant #{idx + 1}{v.variantId ? ` (${v.variantId})` : ' (new)'}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => duplicateVariant(idx)} title="Duplicate"
                          style={{ padding: '4px 10px', fontSize: 11, background: c.surface, color: c.text, border: `1px solid ${c.border}`, borderRadius: 6, cursor: 'pointer' }}>
                          Duplicate
                        </button>
                        <button type="button" onClick={() => removeVariant(idx)} title="Remove"
                          style={{ padding: '4px 10px', fontSize: 11, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer' }}>
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Variant image slot — single image per variant (overrides product image when set) */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
                      <div style={{
                        position: 'relative',
                        width: 88, height: 88, flexShrink: 0,
                        border: `2px dashed ${v.image ? 'transparent' : c.border}`,
                        borderRadius: 10,
                        background: v.image ? 'transparent' : c.surface,
                        overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {v.image ? (
                          <>
                            <img
                              src={v.image}
                              alt={`Variant ${idx + 1}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => { e.target.src = '/images/placeholder-drink.svg' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleVariantImageRemove(idx)}
                              style={{
                                position: 'absolute', top: 4, right: 4,
                                background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: '50%',
                                width: 22, height: 22, color: '#fff', fontSize: 10,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                              title="Remove variant image"
                            >
                              <FaTrash style={{ fontSize: 9 }} />
                            </button>
                          </>
                        ) : (
                          <label htmlFor={`variant-image-${idx}`} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                            cursor: 'pointer', padding: 6, width: '100%', height: '100%',
                            justifyContent: 'center',
                          }}>
                            <FaCloudUploadAlt style={{ fontSize: 18, color: c.textSecondary }} />
                            <span style={{ fontSize: 10, color: c.textSecondary, fontWeight: 600, textAlign: 'center' }}>
                              Variant Image
                            </span>
                          </label>
                        )}
                        <input
                          type="file" accept="image/*"
                          onChange={(e) => handleImageUpload(e, { type: 'variant', index: idx })}
                          style={{ display: 'none' }}
                          id={`variant-image-${idx}`}
                        />
                      </div>
                      <div style={{ flex: 1, fontSize: 11, color: c.textSecondary, paddingTop: 4 }}>
                        <strong style={{ color: c.text, display: 'block', marginBottom: 2 }}>Variant image (optional)</strong>
                        Different flavors usually have different packaging. Customer ko alag image dikhana sales me help karta hai. Blank = product ke main image inherit karega.
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, color: c.textSecondary, display: 'block', marginBottom: 2 }}>Flavor</label>
                        <input type="text" value={v.flavor} placeholder="Original / Cherry"
                          onChange={(e) => handleVariantChange(idx, 'flavor', e.target.value)}
                          style={{ ...styles.input, padding: '6px 10px', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: c.textSecondary, display: 'block', marginBottom: 2 }}>Volume *</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input type="number" value={v.volume} placeholder="250"
                            onChange={(e) => handleVariantChange(idx, 'volume', e.target.value)}
                            onWheel={(e) => e.target.blur()}
                            style={{ ...styles.input, padding: '6px 10px', fontSize: 13, flex: 1 }} />
                          <select value={v.volumeUnit}
                            onChange={(e) => handleVariantChange(idx, 'volumeUnit', e.target.value)}
                            style={{ ...styles.input, padding: '6px 10px', fontSize: 13, width: 60 }}>
                            <option value="ml">ml</option>
                            <option value="L">L</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: c.textSecondary, display: 'block', marginBottom: 2 }}>Price/Box *</label>
                        <input type="number" value={v.pricePerBox} placeholder="450"
                          onChange={(e) => handleVariantChange(idx, 'pricePerBox', e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          style={{ ...styles.input, padding: '6px 10px', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: c.textSecondary, display: 'block', marginBottom: 2 }}>MRP</label>
                        <input type="number" value={v.mrp} placeholder="500"
                          onChange={(e) => handleVariantChange(idx, 'mrp', e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          style={{ ...styles.input, padding: '6px 10px', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: c.textSecondary, display: 'block', marginBottom: 2 }}>Cost/Box</label>
                        <input type="number" value={v.costPricePerBox} placeholder="300"
                          onChange={(e) => handleVariantChange(idx, 'costPricePerBox', e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          style={{ ...styles.input, padding: '6px 10px', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: c.textSecondary, display: 'block', marginBottom: 2 }}>Stock</label>
                        <input type="number" value={v.stockQuantity} placeholder="0"
                          onChange={(e) => handleVariantChange(idx, 'stockQuantity', e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          style={{ ...styles.input, padding: '6px 10px', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: c.textSecondary, display: 'block', marginBottom: 2 }}>Low Alert</label>
                        <input type="number" value={v.lowStockAlert} placeholder="5"
                          onChange={(e) => handleVariantChange(idx, 'lowStockAlert', e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          style={{ ...styles.input, padding: '6px 10px', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: c.textSecondary, display: 'block', marginBottom: 2 }}>Box Qty</label>
                        <input type="number" value={v.boxQuantity} placeholder="24"
                          onChange={(e) => handleVariantChange(idx, 'boxQuantity', e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          style={{ ...styles.input, padding: '6px 10px', fontSize: 13 }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontSize: 12, color: c.text }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: c.text }}>
                        <input type="checkbox" checked={Boolean(v.allowPiecePurchase)}
                          onChange={(e) => handleVariantChange(idx, 'allowPiecePurchase', e.target.checked)} />
                        Sell by Piece
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: v.allowPiecePurchase ? 0.5 : 1, color: c.text }}>
                        <input type="checkbox" checked={Boolean(v.allowHalfBox)} disabled={Boolean(v.allowPiecePurchase)}
                          onChange={(e) => handleVariantChange(idx, 'allowHalfBox', e.target.checked)} />
                        Allow Half Box
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: c.text }}>
                        <input type="checkbox" checked={v.isActive !== false}
                          onChange={(e) => handleVariantChange(idx, 'isActive', e.target.checked)} />
                        Active
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: v.offer?.enabled ? '#22c55e' : c.textSecondary }}>
                        <input
                          type="checkbox"
                          checked={Boolean(v.offer?.enabled)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              handleVariantChange(idx, 'offer', { enabled: true, buyQty: 2, freeProductId: '', freeVariantId: null, freeQty: 1, label: '' })
                            } else {
                              handleVariantChange(idx, 'offer', null)
                            }
                          }}
                        />
                        Custom Offer
                      </label>
                    </div>

                    {/* Per-variant offer override panel (inline, collapsible) */}
                    {v.offer?.enabled && (
                      <div style={{
                        marginTop: 10, padding: 10, background: c.surface,
                        borderRadius: 8, border: `1px dashed ${c.border}`,
                        color: c.text,
                      }}>
                        <div style={{ fontSize: 11, color: c.textSecondary, marginBottom: 8, fontWeight: 600 }}>
                          🎁 Offer for this variant only (overrides product offer)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 11, color: c.textSecondary, display: 'block', marginBottom: 2 }}>Buy Qty</label>
                            <input type="number" min="1" value={v.offer.buyQty || ''}
                              onChange={(e) => handleVariantChange(idx, 'offer', { ...v.offer, buyQty: e.target.value })}
                              style={{ ...styles.input, padding: '6px 10px', fontSize: 13 }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: c.textSecondary, display: 'block', marginBottom: 2 }}>Free Qty</label>
                            <input type="number" min="1" value={v.offer.freeQty || ''}
                              onChange={(e) => handleVariantChange(idx, 'offer', { ...v.offer, freeQty: e.target.value })}
                              style={{ ...styles.input, padding: '6px 10px', fontSize: 13 }} />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 11, color: c.textSecondary, display: 'block', marginBottom: 2 }}>Customer label</label>
                            <input type="text" value={v.offer.label || ''}
                              placeholder={`e.g. Buy ${v.offer.buyQty || 2}, Get ${v.offer.freeQty || 1} Free!`}
                              onChange={(e) => handleVariantChange(idx, 'offer', { ...v.offer, label: e.target.value })}
                              style={{ ...styles.input, padding: '6px 10px', fontSize: 13 }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
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

      {/* Variants Quick-View Popover Modal — admin view + quick restock per variant */}
      <Modal
        isOpen={Boolean(variantsViewTarget)}
        onClose={() => { setVariantsViewTarget(null); setRestockTargetVariant(null) }}
        title={variantsViewTarget ? `${variantsViewTarget.name} — Variants (${(variantsViewTarget.variants || []).length})` : 'Variants'}
      >
        <div style={{ padding: '4px 4px 12px', color: c.text }}>
          {variantsViewTarget && (
            <>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 12, padding: 12, marginBottom: 14,
                background: c.bg, borderRadius: 10, fontSize: 12, color: c.text,
              }}>
                <span><strong>{(variantsViewTarget.variants || []).length}</strong> variants</span>
                <span>Price: ₹<strong>{variantsViewTarget.minPrice || 0}</strong>–<strong>{variantsViewTarget.maxPrice || 0}</strong></span>
                <span>Total stock: <strong>{variantsViewTarget.totalStock || 0}</strong></span>
                {variantsViewTarget.hasLowStock && (
                  <span style={{ color: '#ef4444', fontWeight: 700 }}>⚠ Low stock alert</span>
                )}
              </div>

              <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                      <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 11, fontWeight: 700, color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.04 }}>Variant</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, fontWeight: 700, color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.04 }}>Price</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, fontWeight: 700, color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.04 }}>Stock</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, fontWeight: 700, color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.04 }}>Status</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, fontWeight: 700, color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.04 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(variantsViewTarget.variants || []).map((v) => {
                      const stock = Number(v.stockQuantity) || 0
                      const threshold = Number(v.lowStockAlert) || 0
                      const isLow = stock <= threshold
                      const isOut = stock <= 0
                      const dot = isOut ? '#ef4444' : isLow ? '#f59e0b' : '#22c55e'
                      const label = `${v.flavor ? v.flavor + ' ' : ''}${v.volume}${v.volumeUnit || ''}`.trim()
                      return (
                        <tr key={v.variantId} style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={{ padding: '10px 6px', color: c.text }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {v.image && (
                                <img src={v.image} alt={label}
                                  style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                                  onError={(e) => { e.target.style.display = 'none' }} />
                              )}
                              <div>
                                <div style={{ fontWeight: 700, color: c.text }}>{label || '—'}</div>
                                <div style={{ fontSize: 10, color: c.textSecondary }}>{v.variantId}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'right', color: c.text }}>
                            <div style={{ fontWeight: 700 }}>{formatCurrency(v.pricePerBox)}</div>
                            {v.mrp > 0 && v.mrp > v.pricePerBox && (
                              <div style={{ fontSize: 10, color: c.textSecondary, textDecoration: 'line-through' }}>{formatCurrency(v.mrp)}</div>
                            )}
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
                              <span style={{ fontWeight: 700, color: dot }}>{stock}</span>
                              <span style={{ fontSize: 10, color: c.textSecondary }}>/ alert {threshold}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'right', fontSize: 11 }}>
                            <span style={{
                              padding: '3px 9px', borderRadius: 999, fontWeight: 700,
                              background: isOut ? 'rgba(239,68,68,0.12)' : isLow ? 'rgba(245,158,11,0.14)' : 'rgba(34,197,94,0.14)',
                              color: isOut ? '#ef4444' : isLow ? '#f59e0b' : '#22c55e',
                            }}>
                              {isOut ? 'OUT' : isLow ? 'LOW' : 'OK'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                            <button
                              onClick={() => { setRestockTargetVariant({ productId: variantsViewTarget.id, variantId: v.variantId, label }); setRestockQty('') }}
                              style={{
                                padding: '5px 10px', borderRadius: 6, border: 'none',
                                background: '#f97316', color: '#fff',
                                fontWeight: 700, fontSize: 11, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <FaPlus style={{ fontSize: 9 }} /> Restock
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Inline restock form when admin clicks Restock */}
              {restockTargetVariant && (
                <div style={{
                  marginTop: 14, padding: 12, background: c.surface,
                  borderRadius: 10, border: `1px solid ${c.border}`, color: c.text,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.text, marginBottom: 8 }}>
                    Add stock to <span style={{ color: '#f97316' }}>{restockTargetVariant.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="number"
                      value={restockQty}
                      onChange={(e) => setRestockQty(e.target.value)}
                      placeholder="Quantity (boxes)"
                      style={{ ...styles.input, padding: '7px 10px', fontSize: 13, flex: 1, minWidth: 140 }}
                      autoFocus
                    />
                    <button
                      style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: '#f97316', color: '#fff',
                        fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      }}
                      disabled={restocking || !restockQty}
                      onClick={async () => {
                        const qty = Number(restockQty)
                        if (!qty || qty <= 0) { toast.error('Valid quantity enter karo'); return }
                        try {
                          setRestocking(true)
                          await API.put(`/products/${restockTargetVariant.productId}/restock`, {
                            quantity: qty,
                            variantId: restockTargetVariant.variantId,
                          })
                          toast.success(`Restocked ${restockTargetVariant.label} (+${qty})`)
                          setRestockTargetVariant(null)
                          setRestockQty('')
                          // Refresh products to reflect new stock
                          await fetchProducts()
                          // Refresh the popover with latest product variants
                          const refreshed = (await API.get(`/products/${restockTargetVariant.productId}`)).data
                          if (refreshed) setVariantsViewTarget(refreshed)
                        } catch (err) {
                          toast.error(err.response?.data?.message || 'Restock failed')
                        } finally {
                          setRestocking(false)
                        }
                      }}
                    >
                      {restocking ? 'Adding...' : 'Add Stock'}
                    </button>
                    <button
                      style={{
                        padding: '8px 12px', borderRadius: 8, border: `1px solid ${c.border}`,
                        background: 'transparent', color: c.textSecondary,
                        fontWeight: 600, fontSize: 12, cursor: 'pointer',
                      }}
                      onClick={() => { setRestockTargetVariant(null); setRestockQty('') }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

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
