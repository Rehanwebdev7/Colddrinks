const roundPrice = (value) => Math.round((Number(value) || 0) * 100) / 100

/**
 * Resolve a variant from a product. Returns null if product has no variants
 * or no matching variantId. Callers pass this result alongside or in place
 * of product to existing helpers — variants mirror product field names so
 * helpers work transparently on either.
 */
export const resolveVariant = (product, variantId) => {
  if (!product || product.hasVariants !== true) return null
  if (!variantId) return null
  return (product.variants || []).find(v => v && v.variantId === variantId) || null
}

/**
 * Returns the variant (if resolvable) else product. Single read point for
 * stockable fields.
 */
export const getEffectiveStockable = (product, variantId) => (
  resolveVariant(product, variantId) || product
)

export const getBoxQuantity = (product) => {
  const qty = Number(product?.boxQuantity || product?.bottlesPerBox || product?.unitsPerBox || 24)
  return qty > 0 ? qty : 24
}

export const getPricePerBox = (product) => roundPrice(product?.pricePerBox ?? product?.price ?? 0)

export const canPurchaseByPiece = (product) => {
  return Boolean(product?.allowPiecePurchase)
}

export const canPurchaseHalfBox = (product) => {
  return !canPurchaseByPiece(product) && Boolean(product?.allowHalfBox)
}

export const getDefaultPurchaseMode = (product) => (
  canPurchaseByPiece(product) ? 'piece' : 'full_box'
)

export const getAllowedPurchaseModes = (product) => {
  if (canPurchaseByPiece(product)) return ['piece']
  return canPurchaseHalfBox(product) ? ['full_box', 'half_box'] : ['full_box']
}

export const getUnitBoxEquivalent = (product, purchaseMode) => {
  if (purchaseMode === 'piece') {
    return 1 / getBoxQuantity(product)
  }
  if (purchaseMode === 'half_box') {
    return 0.5
  }
  return 1
}

export const getUnitPrice = (product, purchaseMode) => {
  const pricePerBox = getPricePerBox(product)
  if (purchaseMode === 'piece') {
    return roundPrice(pricePerBox / getBoxQuantity(product))
  }
  if (purchaseMode === 'half_box') {
    return roundPrice(pricePerBox / 2)
  }
  return pricePerBox
}

export const getModeLabel = (purchaseMode, quantity = 1) => {
  if (purchaseMode === 'piece') return quantity === 1 ? 'Piece' : 'Pieces'
  if (purchaseMode === 'half_box') return quantity === 1 ? 'Half Box' : 'Half Boxes'
  return quantity === 1 ? 'Box' : 'Boxes'
}

export const getModeShortLabel = (purchaseMode) => {
  if (purchaseMode === 'piece') return 'Per Piece'
  if (purchaseMode === 'half_box') return 'Half Box'
  return 'Full Box'
}

export const getCartItemId = (productId, purchaseMode, variantId) => (
  `${productId}:${variantId || 'default'}:${purchaseMode || 'full_box'}`
)

export const getMaxPurchaseQuantity = (product, purchaseMode) => {
  const stockBoxes = Number(product?.stock ?? product?.stockQuantity ?? 0)
  const unitBoxEquivalent = getUnitBoxEquivalent(product, purchaseMode)
  if (stockBoxes <= 0 || unitBoxEquivalent <= 0) return 0
  return Math.max(0, Math.floor(stockBoxes / unitBoxEquivalent))
}

export const buildCartItem = (product, quantity = 1, purchaseMode, variantId = null) => {
  const productId = product?._id || product?.id
  const variant = resolveVariant(product, variantId)
  const stockable = variant || product
  const mode = purchaseMode || getDefaultPurchaseMode(stockable)
  const unitPrice = getUnitPrice(stockable, mode)
  const unitBoxEquivalent = getUnitBoxEquivalent(stockable, mode)
  const maxQuantity = getMaxPurchaseQuantity(stockable, mode)

  // Image precedence: variant image override > product image
  const image = (variant?.image)
    || (Array.isArray(variant?.images) && variant.images[0])
    || product?.image
    || (Array.isArray(product?.images) && product.images[0])
    || ''

  return {
    cartItemId: getCartItemId(productId, mode, variant?.variantId),
    productId,
    variantId: variant?.variantId || null,
    flavor: variant?.flavor ?? null,
    volume: variant?.volume ?? product?.volume ?? null,
    volumeUnit: variant?.volumeUnit ?? product?.volumeUnit ?? null,
    name: product?.name,
    image,
    category: product?.category || '',
    brand: product?.brand ?? null,
    quantity,
    purchaseMode: mode,
    price: unitPrice,
    pricePerBox: getPricePerBox(stockable),
    boxQuantity: getBoxQuantity(stockable),
    boxEquivalent: roundPrice(unitBoxEquivalent * quantity),
    stock: Number(stockable?.stock ?? stockable?.stockQuantity ?? 0),
    maxQuantity,
    deliveryCharge: Number(stockable?.deliveryCharge || 0),
    offer: product?.offer?.enabled ? product.offer : null,
  }
}

export const getCartItemSummary = (item) => {
  const quantity = Number(item?.quantity || 0)
  const mode = item?.purchaseMode || 'full_box'
  return `${quantity} ${getModeLabel(mode, quantity)}`
}

export const getCartItemUnitPriceLabel = (item) => {
  const mode = item?.purchaseMode || 'full_box'
  if (mode === 'piece') return '/piece'
  if (mode === 'half_box') return '/half box'
  return '/box'
}
