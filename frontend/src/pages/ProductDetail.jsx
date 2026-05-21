import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import API from '../config/api'
import { useCart } from '../context/CartContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import ProductCard from '../components/ProductCard'
import BackToTop from '../components/BackToTop'
import toast from 'react-hot-toast'
import { FaShoppingCart, FaBolt, FaWhatsapp } from 'react-icons/fa'
import { FiMinus, FiPlus, FiHeart, FiCopy, FiClock } from 'react-icons/fi'
import { BsBoxSeam } from 'react-icons/bs'
import { useAuth } from '../context/AuthContext'
import {
  canPurchaseByPiece,
  getAllowedPurchaseModes,
  getDefaultPurchaseMode,
  getCartItemId,
  getMaxPurchaseQuantity,
  getModeLabel,
  getModeShortLabel,
  getUnitPrice,
} from '../utils/purchase'

const RELATED_PRODUCTS_LIMIT = 6
const LARGE_DIFF = Number.MAX_SAFE_INTEGER
const VARIANT_TOKEN_BLACKLIST = new Set([
  'ml',
  'ltr',
  'liter',
  'litre',
  'l',
  'bottle',
  'bottles',
  'box',
  'boxes',
])
const KNOWN_FAMILY_PATTERNS = [
  { key: 'coca cola', patterns: ['coca cola'] },
  { key: 'pepsi', patterns: ['pepsi'] },
  { key: 'sprite', patterns: ['sprite'] },
  { key: 'campa', patterns: ['campa'] },
  { key: 'maaza', patterns: ['maaza'] },
  { key: 'bisleri', patterns: ['bisleri'] },
  { key: 'aqua water', patterns: ['aqua water', 'aqua'] },
  { key: 'sting', patterns: ['sting'] },
  { key: 'predator', patterns: ['predator'] },
  { key: 'fizzz', patterns: ['fizzz'] },
  { key: 'apple fizz', patterns: ['apple fizz'] },
  { key: 'paper boat', patterns: ['paper boat'] },
  { key: 'red bull', patterns: ['red bull'] },
  { key: 'swing', patterns: ['swing'] },
  { key: 'menthol', patterns: ['menthol'] },
]
const GENERIC_NAME_TOKENS = new Set([
  'can',
  'drink',
  'drinks',
  'ml',
  'ltr',
  'liter',
  'litre',
  'zero',
  'sugar',
  'water',
  'soda',
  'energy',
  'mrp',
])

const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ')

const getProductId = (product) => product?._id || product?.id || ''

const getSafeNumber = (value) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

const hasValidVolume = (product) => {
  const volume = getSafeNumber(product?.volume)
  return volume !== null && volume > 0
}

const formatVolumeLabel = (value) => {
  const volume = getSafeNumber(value)
  if (volume === null || volume <= 0) return ''
  if (volume >= 1000) {
    const litres = volume / 1000
    return `${Number.isInteger(litres) ? litres : Number.parseFloat(litres.toFixed(2))}L`
  }
  return `${Number.isInteger(volume) ? volume : Number.parseFloat(volume.toFixed(2))}ml`
}

const getVariantGroupName = (product) => {
  const normalizedName = normalizeText(product?.name)
  if (!normalizedName) return ''

  const tokens = normalizedName
    .split(' ')
    .filter((token) => (
      token &&
      !VARIANT_TOKEN_BLACKLIST.has(token) &&
      !/^\d+(\.\d+)?$/.test(token) &&
      !/^\d+(\.\d+)?(ml|ltr|liter|litre|l)$/.test(token)
    ))

  return tokens.join(' ')
}

const normalizeProductForDisplay = (candidateProduct) => ({
  ...candidateProduct,
  _id: getProductId(candidateProduct),
  price: candidateProduct.price ?? candidateProduct.pricePerBox,
  stock: candidateProduct.stock ?? candidateProduct.stockQuantity ?? 0,
})

const isVariantAvailable = (candidateProduct) => {
  const allowedModes = getAllowedPurchaseModes(candidateProduct)
  const firstAvailableMode = allowedModes.find((mode) => getMaxPurchaseQuantity(candidateProduct, mode) > 0) || getDefaultPurchaseMode(candidateProduct)
  return getMaxPurchaseQuantity(candidateProduct, firstAvailableMode) > 0
}

const getVariantCandidateRank = (currentProduct, candidateProduct) => {
  const currentId = getProductId(currentProduct)
  const currentCategory = normalizeText(currentProduct?.category)
  const candidateCategory = normalizeText(candidateProduct?.category)
  const candidatePrice = getSafeNumber(candidateProduct?.price ?? candidateProduct?.pricePerBox)

  return [
    getProductId(candidateProduct) === currentId ? 0 : 1,
    candidateCategory === currentCategory ? 0 : 1,
    isVariantAvailable(candidateProduct) ? 0 : 1,
    candidatePrice ?? LARGE_DIFF,
    normalizeText(candidateProduct?.name),
    getProductId(candidateProduct),
  ]
}

const compareVariantCandidates = (currentProduct, leftProduct, rightProduct) => {
  const leftRank = getVariantCandidateRank(currentProduct, leftProduct)
  const rightRank = getVariantCandidateRank(currentProduct, rightProduct)

  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] < rightRank[index]) return -1
    if (leftRank[index] > rightRank[index]) return 1
  }

  return 0
}

const getProductFamily = (product) => {
  const normalizedName = normalizeText(product?.name)
  if (!normalizedName) return ''

  const matchedFamily = KNOWN_FAMILY_PATTERNS.find(({ patterns }) => (
    patterns.some((pattern) => normalizedName.includes(pattern))
  ))
  if (matchedFamily) return matchedFamily.key

  const tokens = normalizedName
    .split(' ')
    .filter((token) => token && !GENERIC_NAME_TOKENS.has(token))

  if (tokens.length >= 2 && tokens[0] === 'coca' && tokens[1] === 'cola') {
    return 'coca cola'
  }

  return tokens[0] || ''
}

const getRelatedProductScore = (currentProduct, candidateProduct) => {
  const currentFamily = getProductFamily(currentProduct)
  const candidateFamily = getProductFamily(candidateProduct)
  const currentCategory = normalizeText(currentProduct?.category)
  const candidateCategory = normalizeText(candidateProduct?.category)
  const familyMatch = Boolean(currentFamily) && currentFamily === candidateFamily
  const categoryMatch = Boolean(currentCategory) && currentCategory === candidateCategory

  if (!familyMatch && !categoryMatch) return null

  const currentVolume = getSafeNumber(currentProduct?.volume)
  const candidateVolume = getSafeNumber(candidateProduct?.volume)
  const currentPrice = getSafeNumber(currentProduct?.price ?? currentProduct?.pricePerBox)
  const candidatePrice = getSafeNumber(candidateProduct?.price ?? candidateProduct?.pricePerBox)

  return [
    familyMatch && categoryMatch ? 0 : familyMatch ? 1 : 2,
    currentVolume !== null && candidateVolume !== null ? Math.abs(currentVolume - candidateVolume) : LARGE_DIFF,
    currentPrice !== null && candidatePrice !== null ? Math.abs(currentPrice - candidatePrice) : LARGE_DIFF,
    normalizeText(candidateProduct?.name),
  ]
}

const compareRelatedProducts = (currentProduct, leftProduct, rightProduct) => {
  const leftScore = getRelatedProductScore(currentProduct, leftProduct)
  const rightScore = getRelatedProductScore(currentProduct, rightProduct)

  if (!leftScore && !rightScore) return 0
  if (!leftScore) return 1
  if (!rightScore) return -1

  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] < rightScore[index]) return -1
    if (leftScore[index] > rightScore[index]) return 1
  }

  return 0
}

const ProductDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { items, addToCart, updateQuantity, removeFromCart } = useCart()
  const { isAuthenticated } = useAuth()

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [purchaseMode, setPurchaseMode] = useState('full_box')
  const [relatedProducts, setRelatedProducts] = useState([])
  const [sizeVariants, setSizeVariants] = useState([])
  const [wishlisted, setWishlisted] = useState(false)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [justAdded, setJustAdded] = useState(false)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  useEffect(() => { fetchProduct(); setActiveImageIndex(0) }, [id])

  useEffect(() => {
    if (!product) return
    const allowedModes = getAllowedPurchaseModes(product)
    const fallbackMode = allowedModes.find((mode) => getMaxPurchaseQuantity(product, mode) > 0) || getDefaultPurchaseMode(product)
    const availableQuantity = getMaxPurchaseQuantity(product, purchaseMode)

    if (availableQuantity === 0 && purchaseMode !== fallbackMode) {
      setPurchaseMode(fallbackMode)
      setQuantity(1)
    }
  }, [product, purchaseMode])

  useEffect(() => {
    if (!justAdded) return
    const timer = window.setTimeout(() => setJustAdded(false), 900)
    return () => window.clearTimeout(timer)
  }, [justAdded])

  const fetchProduct = async () => {
    try {
      setLoading(true)
      setError(null)
      setWishlisted(false)
      setRelatedProducts([])
      setSizeVariants([])
      let p = null
      try {
        const response = await API.get(`/products/${id}`)
        p = response.data
      } catch {
        const response = await API.get(`/products?id=${id}`)
        p = response.data
      }
      if (p) {
        if (!p.price && p.pricePerBox) p.price = p.pricePerBox
        if (p.stock === undefined && p.stockQuantity !== undefined) p.stock = p.stockQuantity
        if (!p._id && p.id) p._id = p.id
      }
      setProduct(p)
      setPurchaseMode(getDefaultPurchaseMode(p))
      setQuantity(1)

      // Save to recently viewed
      if (p) saveToRecentlyViewed(p)

      // Fetch related products and size variants
      if (p) fetchRelated(p)

      // Check wishlist
      if (isAuthenticated && (p?._id || p?.id)) {
        API.get(`/wishlist/check/${p._id || p.id}`)
          .then(res => setWishlisted(res.data?.inWishlist || false))
          .catch(() => {})
      }
    } catch (err) {
      console.error('Failed to fetch product:', err)
      setError('Product not found or failed to load.')
    } finally {
      setLoading(false)
    }
  }

  const saveToRecentlyViewed = (p) => {
    try {
      const stored = JSON.parse(localStorage.getItem('recentlyViewed') || '[]')
      const filtered = stored.filter(item => item.id !== (p._id || p.id))
      const newList = [{
        id: p._id || p.id,
        name: p.name,
        image: p.image,
        price: p.price || p.pricePerBox,
        category: p.category
      }, ...filtered].slice(0, 10)
      localStorage.setItem('recentlyViewed', JSON.stringify(newList))
    } catch {}
  }

  const fetchRelated = async (currentProduct) => {
    try {
      const response = await API.get('/products')
      const rawData = response.data.products || response.data || []
      const data = Array.isArray(rawData) ? rawData : []
      const currentProductId = getProductId(currentProduct)
      const currentVariantGroup = getVariantGroupName(currentProduct)
      const variantSource = [currentProduct, ...data]
        .map(normalizeProductForDisplay)
        .filter((candidateProduct) => candidateProduct._id)

      const uniqueProducts = []
      const seenProductIds = new Set()
      for (const candidateProduct of variantSource) {
        if (seenProductIds.has(candidateProduct._id)) continue
        seenProductIds.add(candidateProduct._id)
        uniqueProducts.push(candidateProduct)
      }

      const matchedVariants = hasValidVolume(currentProduct) && currentVariantGroup
        ? (() => {
          const groupedByVolume = new Map()

          uniqueProducts
          .filter((candidateProduct) => (
            getVariantGroupName(candidateProduct) === currentVariantGroup &&
            hasValidVolume(candidateProduct)
          ))
          .forEach((candidateProduct) => {
            const volumeLabel = formatVolumeLabel(candidateProduct?.volume)
            if (!volumeLabel) return
            const group = groupedByVolume.get(volumeLabel) || []
            group.push(candidateProduct)
            groupedByVolume.set(volumeLabel, group)
          })

          return Array.from(groupedByVolume.values())
            .map((volumeGroup) => volumeGroup.sort((leftProduct, rightProduct) => compareVariantCandidates(currentProduct, leftProduct, rightProduct))[0])
            .sort((leftProduct, rightProduct) => {
              const volumeDiff = (getSafeNumber(leftProduct?.volume) || 0) - (getSafeNumber(rightProduct?.volume) || 0)
              if (volumeDiff !== 0) return volumeDiff
              return compareVariantCandidates(currentProduct, leftProduct, rightProduct)
            })
            .map((candidateProduct) => ({
              ...candidateProduct,
              isAvailable: isVariantAvailable(candidateProduct),
            }))
        })()
        : []

      setSizeVariants(matchedVariants.length > 1 ? matchedVariants : [])

      const variantIds = new Set((matchedVariants.length > 1 ? matchedVariants : []).map((candidateProduct) => candidateProduct._id))
      const normalizedProducts = uniqueProducts.filter((candidateProduct) => candidateProduct._id !== currentProductId && !variantIds.has(candidateProduct._id))

      const scoredProducts = normalizedProducts
        .filter((candidateProduct) => getRelatedProductScore(currentProduct, candidateProduct))
        .sort((leftProduct, rightProduct) => compareRelatedProducts(currentProduct, leftProduct, rightProduct))

      const related = []
      const seenRelatedIds = new Set()
      for (const candidateProduct of scoredProducts) {
        if (seenRelatedIds.has(candidateProduct._id)) continue
        seenRelatedIds.add(candidateProduct._id)
        related.push(candidateProduct)
        if (related.length === RELATED_PRODUCTS_LIMIT) break
      }
      setRelatedProducts(related)
    } catch {
      setRelatedProducts([])
      setSizeVariants([])
    }
  }

  const handleQuantityChange = (delta) => {
    const maxQuantity = getMaxPurchaseQuantity(product, purchaseMode)
    const currentQuantity = Number.parseInt(quantity, 10) || 0
    const newQty = currentQuantity + delta
    if (newQty >= 1 && newQty <= maxQuantity) setQuantity(newQty)
  }

  const handleQuantityInputChange = (value) => {
    const maxQuantity = getMaxPurchaseQuantity(product, purchaseMode)
    const raw = value.replace(/\D/g, '')

    if (raw === '') {
      setQuantity('')
      return
    }

    const nextQuantity = Number.parseInt(raw, 10)
    if (Number.isNaN(nextQuantity)) return

    setQuantity(Math.min(Math.max(nextQuantity, 1), maxQuantity))
  }

  const normalizeQuantityInput = () => {
    const maxQuantity = getMaxPurchaseQuantity(product, purchaseMode)
    const normalizedQuantity = Number.parseInt(quantity, 10)

    if (Number.isNaN(normalizedQuantity) || normalizedQuantity < 1) {
      setQuantity(1)
      return
    }

    if (normalizedQuantity > maxQuantity) {
      setQuantity(maxQuantity)
    }
  }

  const handleAddToCart = () => {
    if (!product) return
    addToCart(product, purchaseMode === 'half_box' ? 1 : Number.parseInt(quantity, 10) || 1, purchaseMode)
    setJustAdded(true)
  }

  const handleCartDecrease = () => {
    if (!cartItem) return
    if (cartQuantity <= 1 || isFixedHalfBox) {
      removeFromCart(cartItemId)
      return
    }
    updateQuantity(cartItemId, cartQuantity - 1)
  }

  const handleCartIncrease = () => {
    if (!cartItem || cartQuantity >= maxQuantity || isFixedHalfBox) return
    updateQuantity(cartItemId, cartQuantity + 1)
    setJustAdded(true)
  }

  const handleCartQuantityInput = (e) => {
    if (!cartItem || isFixedHalfBox) return
    const nextValue = e.target.value.replace(/[^\d]/g, '')
    if (nextValue === '') {
      removeFromCart(cartItemId)
      return
    }
    const numericValue = Number(nextValue)
    if (!Number.isFinite(numericValue) || numericValue < 1) {
      removeFromCart(cartItemId)
      return
    }
    updateQuantity(cartItemId, Math.min(numericValue, maxQuantity))
  }

  const handleBuyNow = () => {
    if (!product) return
    addToCart(product, purchaseMode === 'half_box' ? 1 : Number.parseInt(quantity, 10) || 1, purchaseMode)
    navigate('/cart')
  }

  const handleWishlistToggle = async () => {
    if (!isAuthenticated) {
      toast.error('Please login to add to wishlist')
      return
    }
    try {
      const res = await API.post('/wishlist/toggle', {
        productId: product._id || product.id,
        productName: product.name,
        productImage: product.image,
        productPrice: product.price,
        productStock: product.stock
      })
      setWishlisted(res.data?.inWishlist || false)
      toast.success(res.data?.inWishlist ? 'Added to wishlist!' : 'Removed from wishlist')
    } catch {
      toast.error('Failed to update wishlist')
    }
  }

  const handleShare = (type) => {
    const url = window.location.href
    const text = `Check out ${product?.name} at ₹${product?.price}/box!`
    if (type === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank')
    } else {
      navigator.clipboard.writeText(url).then(() => {
        toast.success('Link copied to clipboard!')
      }).catch(() => {
        toast.error('Failed to copy link')
      })
    }
  }

  const getStockStatus = () => {
    if (!product) return null
    const stock = product.stock || 0
    const pieceMode = canPurchaseByPiece(product)
    const maxQuantity = getMaxPurchaseQuantity(product, pieceMode ? 'piece' : 'full_box')
    if (stock === 0) return { text: 'Out of Stock', className: 'stock-out' }
    if (stock <= 10) {
      const lowStockText = pieceMode
        ? `Low Stock (${maxQuantity} pieces left)`
        : Number.isInteger(stock)
          ? `Low Stock (${stock} boxes left)`
          : `Low Stock (${stock} box equivalent left)`
      return { text: lowStockText, className: 'stock-low' }
    }
    return { text: 'In Stock', className: 'stock-in' }
  }

  const getSavings = () => {
    if (!product || !product.mrp || !product.price) return null
    if (product.mrp <= product.price) return null
    const savings = product.mrp - product.price
    const percent = Math.round((savings / product.mrp) * 100)
    return { amount: savings, percent }
  }

  // Skeleton loading
  if (loading) {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div className="container section-padding">
          <div className="product-detail-layout">
            <div className="skeleton" style={{ aspectRatio: '1', borderRadius: 'var(--radius-xl)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
              <div className="skeleton skeleton-line w-30" />
              <div className="skeleton skeleton-line w-75" style={{ height: '28px' }} />
              <div className="skeleton skeleton-line w-50" />
              <div className="skeleton skeleton-line w-40" style={{ height: '32px' }} />
              <div className="skeleton skeleton-line w-100" style={{ height: '48px' }} />
              <div className="skeleton skeleton-line w-100" style={{ height: '48px' }} />
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="skeleton" style={{ flex: 1, height: '48px', borderRadius: '14px' }} />
                <div className="skeleton" style={{ flex: 1, height: '48px', borderRadius: '14px' }} />
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div className="error-container page-min-height">
          <svg className="empty-state-illustration" viewBox="0 0 140 140" fill="none">
            <circle cx="70" cy="70" r="65" fill="#FEE2E2" />
            <path d="M50 55l40 30M90 55l-40 30" stroke="#E23744" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <p className="error-text">{error || 'Product not found'}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Back to Home</button>
        </div>
        <Footer />
      </div>
    )
  }

  const stockStatus = getStockStatus()
  const savings = getSavings()
  const allowedModes = getAllowedPurchaseModes(product)
  const unitPrice = getUnitPrice(product, purchaseMode)
  const maxQuantity = getMaxPurchaseQuantity(product, purchaseMode)
  const unitMrp = product?.mrp ? getUnitPrice({ ...product, pricePerBox: product.mrp, price: product.mrp }, purchaseMode) : 0
  const isFixedHalfBox = purchaseMode === 'half_box'
  const currentVolumeLabel = formatVolumeLabel(product?.volume)
  const cartItemId = getCartItemId(getProductId(product), purchaseMode)
  const cartItem = items.find((item) => item.cartItemId === cartItemId)
  const cartQuantity = cartItem?.quantity || 0

  return (
    <div className="page-wrapper">
      <Navbar />

      <div className="container section-padding">
        <div className="product-detail-layout">
          {/* Product Image Gallery */}
          <div>
            <div
              className="product-detail-image-wrapper"
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
              onTouchEnd={(e) => {
                touchEndX.current = e.changedTouches[0].clientX
                const diff = touchStartX.current - touchEndX.current
                const imgCount = product.images?.length || 1
                if (imgCount <= 1) return
                if (diff > 50) setActiveImageIndex((prev) => Math.min(prev + 1, imgCount - 1))
                else if (diff < -50) setActiveImageIndex((prev) => Math.max(prev - 1, 0))
              }}
            >
              <img
                src={(product.images?.[activeImageIndex] || product.images?.[0] || product.image || '/images/placeholder-drink.svg')}
                alt={product.name}
                className="product-detail-image"
                referrerPolicy="no-referrer"
                onError={(e) => { e.target.src = '/images/placeholder-drink.svg' }}
                style={{ transition: 'opacity 0.3s ease' }}
              />
              {/* Image counter badge */}
              {product.images?.length > 1 && (
                <div className="product-detail-img-counter">
                  {activeImageIndex + 1} / {product.images.length}
                </div>
              )}
            </div>
            {(product.images?.length > 1) && (
              <>
                {/* Dot indicators */}
                <div className="product-detail-dots">
                  {product.images.map((_, idx) => (
                    <button
                      key={idx}
                      className={`product-detail-dot${activeImageIndex === idx ? ' active' : ''}`}
                      onClick={() => setActiveImageIndex(idx)}
                      aria-label={`Image ${idx + 1}`}
                    />
                  ))}
                </div>
                {/* Thumbnail strip */}
                <div className="product-detail-thumbs">
                  {product.images.map((img, idx) => (
                    <button
                      key={idx}
                      className={`product-detail-thumb${activeImageIndex === idx ? ' active' : ''}`}
                      onClick={() => setActiveImageIndex(idx)}
                    >
                      <img
                        src={img}
                        alt={`${product.name} ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        onError={(e) => { e.target.src = '/images/placeholder-drink.svg' }}
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Product Info */}
          <div className="product-detail-info">
            {product.category && (
              <span className="product-detail-category">{product.category}</span>
            )}
            <h1 className="product-detail-name">{product.name}</h1>

            <div className="product-detail-price">
              <span className="selling-price">&#8377;{unitPrice}</span>
              <span className="per-box">
                {purchaseMode === 'piece' ? '/piece' : purchaseMode === 'half_box' ? '/half box' : '/box'}
              </span>
              {unitMrp > unitPrice && (
                <span className="mrp-price">&#8377;{unitMrp}</span>
              )}
              {savings && <span className="savings-badge">Save {savings.percent}%</span>}
            </div>

            {/* Compact info pills row — pack, stock, delivery in single dense row */}
            <div className="product-detail-info-row">
              <span className="info-pill pill-pack">
                <BsBoxSeam />
                {currentVolumeLabel ? `${currentVolumeLabel} · ` : ''}{product.bottlesPerBox || product.unitsPerBox || 24} bottles
              </span>
              {stockStatus && (
                <span className={`info-pill stock-status ${stockStatus.className}`}>{stockStatus.text}</span>
              )}
              <span className="info-pill pill-delivery">
                <FiClock /> 2-3 hr delivery
              </span>
              {product.brand && (
                <span className="info-pill pill-brand">{product.brand}</span>
              )}
              {product.flavor && (
                <span className="info-pill pill-flavor">{product.flavor}</span>
              )}
            </div>

            {sizeVariants.length > 1 && (
              <div className="product-detail-variants-inline">
                <span className="product-detail-variants-label">Sizes:</span>
                <div className="product-detail-variants-grid">
                  {sizeVariants.map((variantProduct) => {
                    const variantId = getProductId(variantProduct)
                    const isSelected = variantId === getProductId(product)
                    const isDisabled = !variantProduct.isAvailable && !isSelected
                    return (
                      <button
                        key={variantId}
                        type="button"
                        className={`product-detail-variant-chip${isSelected ? ' active' : ''}${isDisabled ? ' disabled' : ''}`}
                        onClick={() => {
                          if (!isSelected && !isDisabled) navigate(`/product/${variantId}`)
                        }}
                        disabled={isDisabled}
                        aria-pressed={isSelected}
                        title={isDisabled ? 'Out of stock' : formatVolumeLabel(variantProduct.volume)}
                      >
                        <span className="product-detail-variant-volume">{formatVolumeLabel(variantProduct.volume)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Offer Banner */}
            {product.offer?.enabled && product.offer?.label && (
              <div className="product-detail-offer-banner">
                <div className="offer-banner-icon">🎁</div>
                <div className="offer-banner-content">
                  <span className="offer-banner-tag">Special Offer</span>
                  <span className="offer-banner-text">{product.offer.label}</span>
                </div>
              </div>
            )}

            <div className="quantity-selector">
              <span className="quantity-label">Purchase Type</span>
              <div className="purchase-mode-tabs product-detail-mode-tabs">
                {allowedModes.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`purchase-mode-tab${purchaseMode === mode ? ' active' : ''}`}
                    onClick={() => {
                      setPurchaseMode(mode)
                      setQuantity(1)
                    }}
                  >
                    {getModeShortLabel(mode)}
                  </button>
                ))}
              </div>
            </div>

            {cartQuantity === 0 && !isFixedHalfBox ? (
              <div className="quantity-selector">
                <span className="quantity-label">Quantity ({getModeLabel(purchaseMode).toLowerCase()}):</span>
                <div className="quantity-controls">
                  <button className="qty-btn" onClick={() => handleQuantityChange(-1)} disabled={quantity <= 1}>
                    <FiMinus />
                  </button>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="qty-value qty-input"
                    value={quantity}
                    min={1}
                    max={maxQuantity}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleQuantityInputChange(e.target.value)}
                    onBlur={normalizeQuantityInput}
                  />
                  <button className="qty-btn" onClick={() => handleQuantityChange(1)} disabled={quantity >= maxQuantity}>
                    <FiPlus />
                  </button>
                </div>
              </div>
            ) : cartQuantity === 0 ? (
              <div className="quantity-selector">
                <span className="quantity-label">Quantity</span>
                <span className="purchase-fixed-note">Half box fixed at 1. For 1.5 box, add 1 full box plus 1 half box.</span>
              </div>
            ) : null}

            <div className="product-detail-actions">
              {cartQuantity > 0 ? (
                <div className={`cart-qty-action product-detail-cart-qty${justAdded ? ' cart-qty-action-pulse' : ''}`}>
                  <button type="button" className="cart-qty-action-btn" onClick={handleCartDecrease} aria-label="Decrease cart quantity">
                    <FiMinus />
                  </button>
                  {isFixedHalfBox ? (
                    <span className="cart-qty-action-value">{cartQuantity}</span>
                  ) : (
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="cart-qty-action-input"
                      value={cartQuantity}
                      onChange={handleCartQuantityInput}
                      aria-label="Cart quantity"
                    />
                  )}
                  <button
                    type="button"
                    className="cart-qty-action-btn"
                    onClick={handleCartIncrease}
                    disabled={isFixedHalfBox || cartQuantity >= maxQuantity}
                    aria-label="Increase cart quantity"
                  >
                    <FiPlus />
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary btn-lg" onClick={handleAddToCart} disabled={product.stock === 0 || maxQuantity === 0}>
                  <FaShoppingCart /> {isFixedHalfBox ? 'Add Half Box' : 'Add to Cart'}
                </button>
              )}
              <button className="btn btn-secondary btn-lg" onClick={handleBuyNow} disabled={product.stock === 0 || maxQuantity === 0}>
                <FaBolt /> Buy Now
              </button>
              <button
                className={`btn btn-secondary btn-lg`}
                onClick={handleWishlistToggle}
                style={wishlisted ? { color: '#E23744', borderColor: '#E23744' } : {}}
              >
                <FiHeart style={wishlisted ? { fill: '#E23744' } : {}} />
              </button>
            </div>

            {/* Share Buttons */}
            <div className="share-buttons">
              <button className="share-btn whatsapp" onClick={() => handleShare('whatsapp')}>
                <FaWhatsapp /> Share on WhatsApp
              </button>
              <button className="share-btn copy-link" onClick={() => handleShare('copy')}>
                <FiCopy /> Copy Link
              </button>
            </div>

            {product.description && (
              <div className="product-detail-description">
                <h3>Description</h3>
                <p>{product.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Related Products - "You May Also Like" */}
        {relatedProducts.length > 0 && (
          <div className="related-products-section">
            <h2 className="section-title">You May Also <span>Like</span></h2>
            <div className="related-products-scroll">
              {relatedProducts.map((p) => (
                <ProductCard key={p._id || p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>

      <Footer />
      <BackToTop />
    </div>
  )
}

export default ProductDetail
