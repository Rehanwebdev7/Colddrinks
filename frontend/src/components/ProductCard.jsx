import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaShoppingCart } from 'react-icons/fa'
import { FiHeart } from 'react-icons/fi'
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

  const hasVariants = product?.hasVariants === true

  // Variant selection state (for variants products only)
  const variants = Array.isArray(product?.variants) ? product.variants : []
  const firstAvailableVariant = variants.find(v => (Number(v.stockQuantity) || 0) > 0) || variants[0] || null
  const [selectedFlavor, setSelectedFlavor] = useState(firstAvailableVariant?.flavor || null)
  const [selectedVariantId, setSelectedVariantId] = useState(firstAvailableVariant?.variantId || null)

  // Resolve selected variant
  const selectedVariant = hasVariants
    ? variants.find(v => v.variantId === selectedVariantId) || null
    : null

  // "Stockable" — variant if selected, else product (legacy single-SKU)
  const stockable = selectedVariant
    ? { ...product, ...selectedVariant, image: selectedVariant.image || product.image }
    : product

  const allowedModes = getAllowedPurchaseModes(stockable)
  const defaultMode = getDefaultPurchaseMode(stockable)
  const firstAvailableMode = allowedModes.find((mode) => getMaxPurchaseQuantity(stockable, mode) > 0) || defaultMode
  const [purchaseMode, setPurchaseMode] = useState(defaultMode)

  const productId = product._id || product.id
  const name = product.name
  // Image: variant image override > variant.images[0] > product.image > product.images[0]
  const image = selectedVariant?.image
    || (Array.isArray(selectedVariant?.images) && selectedVariant.images[0])
    || product.images?.[0] || product.image
  const category = product.category

  // Price: variant's own price when selected; for variants product without selection use minPrice
  const price = selectedVariant
    ? Number(selectedVariant.pricePerBox || 0)
    : hasVariants
      ? (Number(product.minPrice) || Number(product.pricePerBox) || 0)
      : (product.pricePerBox || product.price)
  const maxAggregatePrice = hasVariants ? (Number(product.maxPrice) || price) : price
  // Offer: per-variant override wins, else product-level
  const effectiveOffer = (selectedVariant?.offer?.enabled ? selectedVariant.offer : null) || (product.offer?.enabled ? product.offer : null)
  const offer = effectiveOffer
  const mrp = selectedVariant ? Number(selectedVariant.mrp || 0) : product.mrp
  // Stock: variant's own stock when selected; legacy: top-level
  const stock = selectedVariant
    ? Number(selectedVariant.stockQuantity || 0)
    : hasVariants
      ? (Number(product.totalStock) || 0)
      : (product.stockQuantity ?? product.stock ?? 0)

  const isOutOfStock = selectedVariant
    ? Number(selectedVariant.stockQuantity || 0) <= 0
    : hasVariants
      ? product.outOfStock === true
      : stock <= 0
  const savingsPercent = mrp && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0
  const maxQuantity = getMaxPurchaseQuantity(stockable, purchaseMode)
  const unitPrice = getUnitPrice(stockable, purchaseMode)
  const isPieceMode = canPurchaseByPiece(stockable)
  const unitMrp = mrp ? getUnitPrice({ ...stockable, pricePerBox: mrp, price: mrp }, purchaseMode) : 0
  const isFixedHalfBox = purchaseMode === 'half_box'
  const cartItemId = getCartItemId(productId, purchaseMode, selectedVariantId)
  const cartItem = items.find((item) => item.cartItemId === cartItemId)
  const cartQuantity = cartItem?.quantity || 0
  const offerText = offer?.label?.trim() || (
    offer?.enabled
      ? `Buy ${offer.buyQty || 1}, Get ${offer.freeQty || 1} Free`
      : ''
  )
  const lowStockText = isPieceMode
    ? `Only ${maxQuantity} pieces left`
    : Number.isInteger(stock)
      ? `Only ${stock} box${stock === 1 ? '' : 'es'} left`
      : `Only ${stock} box equivalent left`

  // Sizes available for currently-selected flavor (or all variants if no flavor)
  const sizesForSelectedFlavor = hasVariants
    ? variants.filter(v => selectedFlavor ? v.flavor === selectedFlavor : (v.flavor || null) === null)
    : []

  // Handlers for variant chip clicks
  const handleFlavorClick = (flavor, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (flavor === selectedFlavor) return
    setSelectedFlavor(flavor)
    // Auto-pick first in-stock variant of new flavor (or first if all out)
    const candidates = variants.filter(v => v.flavor === flavor)
    const inStock = candidates.find(v => (Number(v.stockQuantity) || 0) > 0)
    const target = inStock || candidates[0]
    if (target) {
      setSelectedVariantId(target.variantId)
      setPurchaseMode(getDefaultPurchaseMode(target))
    }
  }
  const handleSizeClick = (variant, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (variant.variantId === selectedVariantId) return
    setSelectedVariantId(variant.variantId)
    setPurchaseMode(getDefaultPurchaseMode(variant))
  }

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
    if (hasVariants && !selectedVariantId) {
      toast.error('Please select a flavor + size')
      return
    }
    addToCart(product, 1, purchaseMode, selectedVariantId)
    setJustAdded(true)
    const variantLabel = selectedVariant
      ? ` (${selectedVariant.flavor ? selectedVariant.flavor + ' ' : ''}${selectedVariant.volume}${selectedVariant.volumeUnit || ''})`
      : ''
    toast.success(isFixedHalfBox ? `${name}${variantLabel} half box added!` : `${name}${variantLabel} added to cart!`)
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
          <img
            src={image || '/images/placeholder-drink.svg'}
            alt={name}
            className="product-card-image"
            referrerPolicy="no-referrer"
            onError={(e) => { if (e.target.src !== window.location.origin + '/images/placeholder-drink.svg') e.target.src = '/images/placeholder-drink.svg' }}
          />
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
        {offerText && (
          <div className="product-card-offer-strip">
            <span className="product-card-offer-tag">Free Offer</span>
            <span className="product-card-offer-text">{offerText}</span>
          </div>
        )}
        <div className="product-card-body">
          <h3 className="product-card-name">{name}</h3>
          <div className="product-card-priceline">
            <div className="product-card-price">
              {hasVariants && price < maxAggregatePrice ? (
                <>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginRight: 4 }}>From</span>
                  &#8377;{price.toFixed(2).replace(/\.00$/, '')}
                  <span className="per-box">/box</span>
                </>
              ) : (
                <>
                  &#8377;{unitPrice.toFixed(2).replace(/\.00$/, '')}
                  <span className="per-box">
                    {hasVariants ? '/box' : purchaseMode === 'piece' ? '/piece' : purchaseMode === 'half_box' ? '/half box' : '/box'}
                  </span>
                  {!hasVariants && unitMrp > unitPrice && <span className="original-price">&#8377;{unitMrp.toFixed(2).replace(/\.00$/, '')}</span>}
                </>
              )}
            </div>
            {isOutOfStock ? (
              <span className="stock-status stock-out">Out of Stock</span>
            ) : stock <= 10 ? (
              <span className="stock-status stock-low">{lowStockText}</span>
            ) : (
              <span className="stock-status stock-in">In Stock</span>
            )}
          </div>
          <div className="product-card-meta-row">
            <div className="product-card-box-info">
              {hasVariants
                ? `${product.boxQuantity || product.unitsPerBox || ((product.variants || [])[0]?.boxQuantity) || 24} bottles/box`
                : `${product.volume ? `${product.volume}${product.volumeUnit || 'ml'} · ` : ''}${product.boxQuantity || product.unitsPerBox || 24} ${isPieceMode ? 'cans' : 'bottles'}/box`
              }
            </div>
          </div>

          {/* Variants product — interactive flavor + size chips inline */}
          {hasVariants && variants.length > 0 && (
            <div className="variant-card-section">
              {Array.isArray(product.availableFlavors) && product.availableFlavors.length > 1 && (
                <div className="variant-card-row">
                  <span className="variant-card-label">Flavor</span>
                  <div className="variant-card-chips">
                    {product.availableFlavors.map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`variant-card-chip flavor-chip${selectedFlavor === f ? ' active' : ''}`}
                        onClick={(e) => handleFlavorClick(f, e)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {sizesForSelectedFlavor.length > 1 && (
                <div className="variant-card-row">
                  <span className="variant-card-label">Size</span>
                  <div className="variant-card-chips">
                    {sizesForSelectedFlavor
                      .sort((a, b) => (Number(a.volume) || 0) - (Number(b.volume) || 0))
                      .map((v) => {
                        const isSelected = v.variantId === selectedVariantId
                        const isOut = (Number(v.stockQuantity) || 0) <= 0
                        return (
                          <button
                            key={v.variantId}
                            type="button"
                            disabled={isOut && !isSelected}
                            className={`variant-card-chip size-chip${isSelected ? ' active' : ''}${isOut && !isSelected ? ' disabled' : ''}`}
                            onClick={(e) => handleSizeClick(v, e)}
                          >
                            {v.volume}{v.volumeUnit || 'ml'}
                          </button>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="product-card-actions" onClick={(e) => e.stopPropagation()}>
        {hasVariants ? (
          // Variants product: show purchase mode tabs (based on selected variant) + Add to Cart
          <>
            {allowedModes.length > 1 && (
              <div className="purchase-selector" onClick={(e) => e.stopPropagation()}>
                <div className="purchase-mode-tabs">
                  {allowedModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`purchase-mode-tab${purchaseMode === mode ? ' active' : ''}`}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPurchaseMode(mode) }}
                    >
                      {getModeShortLabel(mode)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {cartQuantity > 0 ? (
              <div className={`cart-qty-action${justAdded ? ' cart-qty-action-pulse' : ''}`}>
                <button type="button" className="cart-qty-action-btn" onClick={handleDecrease} aria-label="Decrease quantity">−</button>
                {isFixedHalfBox ? (
                  <span className="cart-qty-action-value">{cartQuantity}</span>
                ) : (
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*"
                    className="cart-qty-action-input"
                    value={cartQuantity}
                    onClick={(e) => e.stopPropagation()}
                    onChange={handleQuantityInput}
                    aria-label="Cart quantity"
                  />
                )}
                <button
                  type="button" className="cart-qty-action-btn" onClick={handleIncrease}
                  disabled={isFixedHalfBox || cartQuantity >= maxQuantity}
                  aria-label="Increase quantity"
                >+</button>
              </div>
            ) : (
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock || maxQuantity === 0}
                className={`btn btn-primary btn-full${isOutOfStock || maxQuantity === 0 ? ' btn-disabled' : ''}`}
              >
                <FaShoppingCart />
                {isOutOfStock ? 'Out of Stock' : isFixedHalfBox ? 'Add Half Box' : 'Add to Cart'}
              </button>
            )}
          </>
        ) : (
          <>
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
            </div>
            {cartQuantity > 0 ? (
              <div className={`cart-qty-action${justAdded ? ' cart-qty-action-pulse' : ''}`}>
                <button type="button" className="cart-qty-action-btn" onClick={handleDecrease} aria-label="Decrease quantity">
                  -
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
                    onClick={(e) => e.stopPropagation()}
                    onChange={handleQuantityInput}
                    aria-label="Cart quantity"
                  />
                )}
                <button
                  type="button"
                  className="cart-qty-action-btn"
                  onClick={handleIncrease}
                  disabled={isFixedHalfBox || cartQuantity >= maxQuantity}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            ) : (
              <button onClick={handleAddToCart} disabled={isOutOfStock || maxQuantity === 0} className={`btn btn-primary btn-full${isOutOfStock || maxQuantity === 0 ? ' btn-disabled' : ''}`}>
                <FaShoppingCart />
                {isOutOfStock ? 'Out of Stock' : isFixedHalfBox ? 'Add Half Box' : 'Add to Cart'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ProductCard
