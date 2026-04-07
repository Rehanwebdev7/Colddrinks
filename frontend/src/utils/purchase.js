const roundPrice = (value) => Math.round((Number(value) || 0) * 100) / 100

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

export const getCartItemId = (productId, purchaseMode) => `${productId}:${purchaseMode}`

export const getMaxPurchaseQuantity = (product, purchaseMode) => {
  const stockBoxes = Number(product?.stock ?? product?.stockQuantity ?? 0)
  const unitBoxEquivalent = getUnitBoxEquivalent(product, purchaseMode)
  if (stockBoxes <= 0 || unitBoxEquivalent <= 0) return 0
  return Math.max(0, Math.floor(stockBoxes / unitBoxEquivalent))
}

export const buildCartItem = (product, quantity = 1, purchaseMode = getDefaultPurchaseMode(product)) => {
  const productId = product?._id || product?.id
  const unitPrice = getUnitPrice(product, purchaseMode)
  const unitBoxEquivalent = getUnitBoxEquivalent(product, purchaseMode)
  const maxQuantity = getMaxPurchaseQuantity(product, purchaseMode)

  return {
    cartItemId: getCartItemId(productId, purchaseMode),
    productId,
    name: product?.name,
    image: product?.image,
    category: product?.category || '',
    quantity,
    purchaseMode,
    price: unitPrice,
    pricePerBox: getPricePerBox(product),
    boxQuantity: getBoxQuantity(product),
    boxEquivalent: roundPrice(unitBoxEquivalent * quantity),
    stock: Number(product?.stock ?? product?.stockQuantity ?? 0),
    maxQuantity,
    deliveryCharge: Number(product?.deliveryCharge || 0),
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
