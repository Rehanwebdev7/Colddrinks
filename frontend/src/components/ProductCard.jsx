import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaShoppingCart } from 'react-icons/fa'
import { FiHeart, FiCheck } from 'react-icons/fi'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import API from '../config/api'
import toast from 'react-hot-toast'
import {
  canPurchaseByPiece,
  getCartItemId,
  getAllowedPurchaseModes,
  getDefaultPurchaseMode,
  getMaxPurchaseQuantity,
  getModeShortLabel,
  getUnitPrice,
} from '../utils/purchase'

const ProductCard = ({ product }) => {
  const navigate = useNavigate()
  const { items, addToCart, updateQuantity, removeFromCart } = useCart()
  const { isAuthenticated } = useAuth()
  const [wishlisted, setWishlisted] = useState(false)
  const [wishLoading, setWishLoading] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  const allowedModes = getAllowedPurchaseModes(product)
  const defaultMode = getDefaultPurchaseMode(product)
  const firstAvailableMode = allowedModes.find((mode) => getMaxPurchaseQuantity(product, mode) > 0) || defaultMode
  const [purchaseMode, setPurchaseMode] = useState(defaultMode)

  const productId = product._id || product.id
  const name = product.name
  const image = product.image
  const category = product.category
  const price = product.pricePerBox || product.price
  const mrp = product.mrp
  const stock = product.stockQuantity ?? product.stock ?? 0

  const isOutOfStock = stock <= 0
  const savingsPercent = mrp && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0
  const maxQuantity = getMaxPurchaseQuantity(product, purchaseMode)
  const unitPrice = getUnitPrice(product, purchaseMode)
  const isPieceMode = canPurchaseByPiece(product)
  const unitMrp = mrp ? getUnitPrice({ ...product, pricePerBox: mrp, price: mrp }, purchaseMode) : 0
  const isFixedHalfBox = purchaseMode === 'half_box'
  const cartItemId = getCartItemId(productId, purchaseMode)
  const cartItem = items.find((item) => item.cartItemId === cartItemId)
  const cartQuantity = cartItem?.quantity || 0
  const lowStockText = isPieceMode
    ? `Only ${maxQuantity} pieces left`
    : Number.isInteger(stock)
      ? `Only ${stock} box${stock === 1 ? '' : 'es'} left`
      : `Only ${stock} box equivalent left`

  // Check wishlist status on mount
  useEffect(() => {
    if (isAuthenticated && productId) {
      API.get(`/wishlist/check/${productId}`)
        .then(res => setWishlisted(res.data?.inWishlist || false))
        .catch(() => {})
    }
  }, [isAuthenticated, productId])

  useEffect(() => {
    setPurchaseMode(firstAvailableMode)
  }, [firstAvailableMode, productId])

  useEffect(() => {
    if (!justAdded) return
    const timer = window.setTimeout(() => setJustAdded(false), 900)
    return () => window.clearTimeout(timer)
  }, [justAdded])

  const handleCardNavigate = (e) => {
    if (e.target.closest('button, input, textarea, select, .product-card-actions')) return
    navigate(`/product/${productId}`)
  }

  const handleAddToCart = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (isOutOfStock || maxQuantity === 0) return
    addToCart(product, 1, purchaseMode)
    setJustAdded(true)
    toast.success(isFixedHalfBox ? `${name} half box added to cart!` : `${name} added to cart!`)
  }

  const handleDecrease = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!cartItem) return
    if (cartQuantity <= 1 || isFixedHalfBox) {
      removeFromCart(cartItemId)
      return
    }
    updateQuantity(cartItemId, cartQuantity - 1)
  }

  const handleIncrease = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!cartItem || cartQuantity >= maxQuantity) return
    updateQuantity(cartItemId, cartQuantity + 1)
    setJustAdded(true)
  }

  const handleQuantityInput = (e) => {
    e.stopPropagation()
    if (!cartItem || isFixedHalfBox) return
    const nextValue = e.target.value.replace(/[^\d]/g, '')

    if (nextValue === '') {
      removeFromCart(cartItemId)
      return
    }

    const numericValue = Number(nextValue)
    if (!Number.isFinite(numericValue)) return
    if (numericValue < 1) {
      removeFromCart(cartItemId)
      return
    }

    updateQuantity(cartItemId, Math.min(numericValue, maxQuantity))
  }

  const handleWishlistToggle = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isAuthenticated) {
      toast.error('Please login to add to wishlist')
      return
    }
    if (wishLoading) return
    setWishLoading(true)
    try {
      const res = await API.post('/wishlist/toggle', {
        productId,
        productName: name,
        productImage: image,
        productPrice: price,
        productStock: stock
      })
      setWishlisted(res.data?.inWishlist || false)
      toast.success(res.data?.inWishlist ? 'Added to wishlist!' : 'Removed from wishlist')
    } catch {
      toast.error('Failed to update wishlist')
    } finally {
      setWishLoading(false)
    }
  }

  return (
    <div
      className={`product-card${isOutOfStock ? ' out-of-stock' : ''}${justAdded ? ' just-added' : ''}`}
      onClick={handleCardNavigate}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button, input, textarea, select, .product-card-actions')) {
          e.preventDefault()
          navigate(`/product/${productId}`)
        }
      }}
      role="link"
      tabIndex={0}
      aria-label={`Open ${name}`}
    >
      <div className="product-card-link">
        <div className="product-card-image-wrapper">
          <img src={image || '/images/placeholder-drink.svg'} alt={name} className="product-card-image" referrerPolicy="no-referrer" />
          {category && <span className="product-card-badge">{category}</span>}
          {savingsPercent > 0 && <span className="product-card-badge sale">{savingsPercent}% OFF</span>}
          {isOutOfStock && (
            <div className="product-card-overlay">
              <span className="product-card-overlay-text">Out of Stock</span>
            </div>
          )}
          {/* Wishlist Heart */}
          <button
            className={`wishlist-btn${wishlisted ? ' active' : ''}`}
            onClick={handleWishlistToggle}
            title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <FiHeart style={wishlisted ? { fill: 'currentColor' } : {}} />
          </button>
        </div>
        <div className="product-card-body">
          <div className="product-card-topline">
            <h3 className="product-card-name">{name}</h3>
            <div className="product-card-price">
              &#8377;{unitPrice.toFixed(2).replace(/\.00$/, '')}
              <span className="per-box">
                {purchaseMode === 'piece' ? '/piece' : purchaseMode === 'half_box' ? '/half box' : '/box'}
              </span>
              {unitMrp > unitPrice && <span className="original-price">&#8377;{unitMrp.toFixed(2).replace(/\.00$/, '')}</span>}
            </div>
          </div>
          <div className="product-card-meta-row">
            <div className="product-card-box-info">
              {product.volume ? `${product.volume}ml · ` : ''}{product.boxQuantity || product.unitsPerBox || 24} {isPieceMode ? 'cans' : 'bottles'}/box
            </div>
            <div className="product-card-stock">
              {isOutOfStock ? (
                <span className="stock-status stock-out">Out of Stock</span>
              ) : stock <= 10 ? (
                <span className="stock-status stock-low">{lowStockText}</span>
              ) : (
                <span className="stock-status stock-in">In Stock</span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="product-card-actions" onClick={(e) => e.stopPropagation()}>
        <div className="purchase-selector" onClick={(e) => e.stopPropagation()}>
          <div className="purchase-mode-tabs">
            {allowedModes.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`purchase-mode-tab${purchaseMode === mode ? ' active' : ''}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setPurchaseMode(mode)
                }}
              >
                {getModeShortLabel(mode)}
              </button>
            ))}
          </div>
          {cartQuantity > 0 ? (
            <div className="purchase-qty-row">
              <div className="mini-qty-control">
                <button type="button" className="mini-qty-btn" onClick={handleDecrease}>
                  -
                </button>
                {isFixedHalfBox ? (
                  <span className="mini-qty-value">{cartQuantity}</span>
                ) : (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="mini-qty-input"
                    value={cartQuantity}
                    onClick={(e) => e.stopPropagation()}
                    onChange={handleQuantityInput}
                  />
                )}
                <button type="button" className="mini-qty-btn" onClick={handleIncrease} disabled={isFixedHalfBox || cartQuantity >= maxQuantity}>
                  +
                </button>
              </div>
              <span className="purchase-qty-note">
                {isFixedHalfBox ? 'Half box already added' : purchaseMode === 'piece' ? 'Adjust pieces from here' : 'Adjust quantity from here'}
              </span>
            </div>
          ) : (
            <div className="purchase-qty-row purchase-hint-row">
              <span className="purchase-fixed-note">
                {isFixedHalfBox ? 'Half box fixed at 1' : 'Tap add to start'}
              </span>
              <span className="purchase-qty-note">
                {isFixedHalfBox ? 'For 1.5 box, add 1 full box + 1 half box' : purchaseMode === 'piece' ? 'Then increase pieces from here' : 'Then increase quantity from here'}
              </span>
            </div>
          )}
        </div>
        {cartQuantity > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            className={`btn btn-primary btn-full btn-added${justAdded ? ' btn-added-pulse' : ''}`}
          >
            <FiCheck />
            {isFixedHalfBox ? 'Half Box Added' : 'Added to Cart'}
          </button>
        ) : (
          <button onClick={handleAddToCart} disabled={isOutOfStock || maxQuantity === 0} className={`btn btn-primary btn-full${isOutOfStock || maxQuantity === 0 ? ' btn-disabled' : ''}`}>
            <FaShoppingCart />
            {isOutOfStock ? 'Out of Stock' : isFixedHalfBox ? 'Add Half Box' : 'Add to Cart'}
          </button>
        )}
      </div>
    </div>
  )
}

export default ProductCard
