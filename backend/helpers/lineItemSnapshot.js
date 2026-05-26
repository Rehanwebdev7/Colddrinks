/**
 * Line-item snapshot helper — THE SINGLE SOURCE OF TRUTH for converting
 * (product, variantId, qty, purchaseMode) into a cart/order/inventory line item.
 *
 * Every snapshot site in server.js (cart builder, order item snapshot,
 * inventory movement, bill record) MUST call these functions. Single point
 * of test, single point of bug fix.
 *
 * Returns a flat object shape compatible with existing snapshot consumers:
 *   - cart items (server.js:2302–2326)
 *   - order items (server.js:1761–1792)
 *   - inventory movements (server.js:386–391)
 *   - bill records (server.js:455–463)
 */

const { resolveVariant, getEffectiveStockable } = require('./variants');

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getBoxQuantity(stockable) {
  const qty = Number(stockable?.boxQuantity || stockable?.bottlesPerBox || stockable?.unitsPerBox || 24);
  return qty > 0 ? qty : 24;
}

function allowPiece(stockable) {
  return Boolean(stockable?.allowPiecePurchase);
}

function allowHalf(stockable) {
  return !allowPiece(stockable) && Boolean(stockable?.allowHalfBox);
}

function getUnitBoxEquivalent(stockable, purchaseMode) {
  if (purchaseMode === 'piece') return 1 / getBoxQuantity(stockable);
  if (purchaseMode === 'half_box') return 0.5;
  return 1;
}

function getUnitPrice(stockable, purchaseMode) {
  const pricePerBox = Number(stockable?.pricePerBox || stockable?.price || 0);
  if (purchaseMode === 'piece') return roundCurrency(pricePerBox / getBoxQuantity(stockable));
  if (purchaseMode === 'half_box') return roundCurrency(pricePerBox / 2);
  return roundCurrency(pricePerBox);
}

function normalizeMode(stockable, requestedMode) {
  const mode = String(requestedMode || '').trim().toLowerCase();
  if (mode === 'piece' && allowPiece(stockable)) return 'piece';
  if (mode === 'half_box' && allowHalf(stockable)) return 'half_box';
  return 'full_box';
}

function getModeLabel(purchaseMode, quantity) {
  if (purchaseMode === 'piece') return quantity === 1 ? 'piece' : 'pieces';
  if (purchaseMode === 'half_box') return quantity === 1 ? 'half box' : 'half boxes';
  return quantity === 1 ? 'box' : 'boxes';
}

/**
 * Resolve the image URL for a variant or product.
 * Precedence: variant.image > variant.images[0] > product.image > product.images[0] > null
 */
function resolveImage(product, variant) {
  if (variant) {
    if (variant.image) return variant.image;
    if (Array.isArray(variant.images) && variant.images.length > 0) return variant.images[0];
  }
  if (product?.image) return product.image;
  if (Array.isArray(product?.images) && product.images.length > 0) return product.images[0];
  return null;
}

/**
 * Build a cart/order line item snapshot.
 *
 * @param {object} product   - The full product doc from products.json / Firestore
 * @param {string|null} variantId - The variant id (null for legacy single-SKU)
 * @param {number} quantity  - Requested quantity
 * @param {string} purchaseMode - 'piece' | 'half_box' | 'full_box'
 * @param {object} extras    - Optional: cartItemIdPrefix, isFreeItem flag, custom price overrides
 * @returns {object} flat snapshot object
 */
function snapshotLineItem(product, variantId, quantity, purchaseMode, extras = {}) {
  if (!product) throw new Error('snapshotLineItem: product is required');

  const variant = resolveVariant(product, variantId);
  const stockable = variant || product;     // variant fields if present, else product top-level
  const mode = normalizeMode(stockable, purchaseMode);
  const qty = Math.max(1, Math.round(Number(quantity) || 1));

  const unitBoxEq = getUnitBoxEquivalent(stockable, mode);
  const boxEquivalent = roundCurrency(qty * unitBoxEq);
  const unitPrice = getUnitPrice(stockable, mode);

  // Snapshot core fields. Pull from variant where available, else product.
  const snapshot = {
    productId: product.id,
    variantId: variant?.variantId || null,
    name: product.name,
    flavor: variant?.flavor ?? null,                              // variant-level only
    volume: variant?.volume ?? product.volume ?? null,
    volumeUnit: variant?.volumeUnit ?? product.volumeUnit ?? null,
    image: resolveImage(product, variant),
    category: product.category || '',
    brand: product.brand ?? null,
    quantity: qty,
    purchaseMode: mode,
    unitLabel: `${qty} ${getModeLabel(mode, qty)}`,
    boxQuantity: getBoxQuantity(stockable),
    boxEquivalent,
    price: unitPrice,                                              // unit price (per piece / half box / box)
    pricePerBox: roundCurrency(stockable?.pricePerBox || product?.pricePerBox || 0),
    mrp: roundCurrency(stockable?.mrp || product?.mrp || 0),
    stock: roundCurrency(stockable?.stockQuantity || stockable?.stock || 0),
    gstPercent: Number(stockable?.gstPercent ?? product?.gstPercent ?? 0),
    deliveryCharge: Number(stockable?.deliveryCharge ?? product?.deliveryCharge ?? 0),
    // Offer resolution: variant.offer (if set + enabled) wins, else product.offer
    offer: (variant?.offer?.enabled ? variant.offer : null) || product.offer || null,
    snapshotAt: new Date().toISOString(),
  };

  // Orphan flag: variantId requested but no matching variant found AND product has variants
  if (variantId && !variant && product.hasVariants === true) {
    snapshot.unavailable = true;
    snapshot.unavailableReason = 'Variant no longer exists';
  }

  // Free-item flag passes through unchanged
  if (extras.isFreeItem) snapshot.isFreeItem = true;
  if (extras.cartItemId) snapshot.cartItemId = extras.cartItemId;

  return snapshot;
}

/**
 * Build an inventory movement snapshot.
 * productName is composed as "{name} {flavor} {volume}{volumeUnit}" when applicable.
 */
function snapshotInventoryMovement(product, variantId, quantity, purchaseMode, direction, type, extras = {}) {
  if (!product) throw new Error('snapshotInventoryMovement: product is required');

  const variant = resolveVariant(product, variantId);
  const stockable = variant || product;
  const mode = normalizeMode(stockable, purchaseMode);
  const qty = Math.max(0, Number(quantity) || 0);

  const unitBoxEq = getUnitBoxEquivalent(stockable, mode);
  const boxEquivalent = roundCurrency(qty * unitBoxEq);

  const nameParts = [product.name];
  if (variant?.flavor) nameParts.push(variant.flavor);
  if (variant?.volume) nameParts.push(`${variant.volume}${variant.volumeUnit || ''}`);
  const productName = nameParts.filter(Boolean).join(' ');

  return {
    productId: product.id,
    variantId: variant?.variantId || null,
    productName,
    quantity: qty,
    purchaseMode: mode,
    boxEquivalent,
    direction: direction || (boxEquivalent >= 0 ? 'in' : 'out'),
    type: type || 'adjustment',
    referenceType: extras.referenceType || null,
    referenceId: extras.referenceId || null,
    note: extras.note || '',
    createdBy: extras.createdBy || 'system',
  };
}

/**
 * Compose a cart item id key. Used for dedup in cart Map + matching for remove/update.
 * Format: `${productId}:${variantId || 'default'}:${purchaseMode}`
 */
function makeCartItemId(productId, variantId, purchaseMode) {
  return `${productId}:${variantId || 'default'}:${purchaseMode || 'full_box'}`;
}

module.exports = {
  snapshotLineItem,
  snapshotInventoryMovement,
  makeCartItemId,
  // Re-export helpers for callers that want raw access
  resolveImage,
  getUnitPrice,
  getUnitBoxEquivalent,
  getBoxQuantity,
  normalizeMode,
  roundCurrency,
};
