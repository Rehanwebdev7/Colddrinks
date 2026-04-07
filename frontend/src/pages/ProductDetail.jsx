import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import API from '../config/api'
import { useCart } from '../context/CartContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import ProductCard from '../components/ProductCard'
import BackToTop from '../components/BackToTop'
import toast from 'react-hot-toast'
import { FaShoppingCart, FaBolt, FaWhatsapp } from 'react-icons/fa'
import { FiMinus, FiPlus, FiHeart, FiShare2, FiCopy, FiClock } from 'react-icons/fi'
import { MdLocalShipping } from 'react-icons/md'
import { BsBoxSeam } from 'react-icons/bs'
import { useAuth } from '../context/AuthContext'
import {
  canPurchaseByPiece,
  getAllowedPurchaseModes,
  getDefaultPurchaseMode,
  getMaxPurchaseQuantity,
  getModeLabel,
  getModeShortLabel,
  getUnitPrice,
} from '../utils/purchase'

const ProductDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart } = useCart()
  const { isAuthenticated } = useAuth()

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [purchaseMode, setPurchaseMode] = useState('full_box')
  const [relatedProducts, setRelatedProducts] = useState([])
  const [wishlisted, setWishlisted] = useState(false)

  useEffect(() => { fetchProduct() }, [id])

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

  const fetchProduct = async () => {
    try {
      setLoading(true)
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

      // Fetch related products
      if (p?.category) fetchRelated(p.category, p._id || p.id)

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

  const fetchRelated = async (category, currentId) => {
    try {
      const response = await API.get('/products')
      const rawData = response.data.products || response.data || []
      const data = Array.isArray(rawData) ? rawData : []
      const related = data
        .filter(p => {
          const pid = p._id || p.id
          return p.category === category && pid !== currentId
        })
        .slice(0, 6)
        .map(p => ({
          ...p,
          _id: p._id || p.id,
          price: p.price ?? p.pricePerBox,
          stock: p.stock ?? p.stockQuantity ?? 0,
        }))
      setRelatedProducts(related)
    } catch {}
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
  const firstAvailableMode = allowedModes.find((mode) => getMaxPurchaseQuantity(product, mode) > 0) || getDefaultPurchaseMode(product)
  const unitPrice = getUnitPrice(product, purchaseMode)
  const maxQuantity = getMaxPurchaseQuantity(product, purchaseMode)
  const unitMrp = product?.mrp ? getUnitPrice({ ...product, pricePerBox: product.mrp, price: product.mrp }, purchaseMode) : 0
  const isFixedHalfBox = purchaseMode === 'half_box'

  return (
    <div className="page-wrapper">
      <Navbar />

      <div className="container section-padding">
        <div className="product-detail-layout">
          {/* Product Image */}
          <div className="product-detail-image-wrapper">
            <img
              src={product.image || '/images/placeholder-drink.svg'}
              alt={product.name}
              className="product-detail-image"
              referrerPolicy="no-referrer"
              onError={(e) => { e.target.src = '/images/placeholder-drink.svg' }}
            />
          </div>

          {/* Product Info */}
          <div className="product-detail-info">
            {product.category && (
              <span className="product-detail-category">{product.category}</span>
            )}
            <h1 className="product-detail-name">{product.name}</h1>

            <div className="product-detail-box-info">
              <BsBoxSeam className="box-icon" />
              <span>{product.volume ? `${product.volume}ml · ` : ''}{product.bottlesPerBox || product.unitsPerBox || 24} bottles per box</span>
            </div>

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

            {stockStatus && (
              <div className={`stock-status ${stockStatus.className}`}>{stockStatus.text}</div>
            )}

            {/* Delivery Estimation */}
            <div className="delivery-badge">
              <FiClock /> Delivery in 2-3 hours
            </div>

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

            {!isFixedHalfBox ? (
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
            ) : (
              <div className="quantity-selector">
                <span className="quantity-label">Quantity</span>
                <span className="purchase-fixed-note">Half box fixed at 1. For 1.5 box, add 1 full box plus 1 half box.</span>
              </div>
            )}

            <div className="product-detail-actions">
              <button className="btn btn-primary btn-lg" onClick={handleAddToCart} disabled={product.stock === 0 || maxQuantity === 0}>
                <FaShoppingCart /> {isFixedHalfBox ? 'Add Half Box' : 'Add to Cart'}
              </button>
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
