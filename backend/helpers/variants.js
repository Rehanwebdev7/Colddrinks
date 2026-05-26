/**
 * Variant helpers — central resolution + aggregate maintenance for nested variants.
 *
 * Architecture: variants live as a nested array on each product doc. To keep snapshot
 * sites (cart, order, inventory) backward-compatible, this module exposes a single
 * resolution function that yields EITHER the resolved variant OR the product itself
 * for legacy single-SKU products. Existing pricing/stock helpers in server.js work
 * on whatever "stockable" object is passed — variant fields mirror product field names.
 */

/**
 * Resolve a variant by id within a product. Returns null if:
 *   - product is legacy single-SKU (hasVariants !== true)
 *   - no variantId was provided
 *   - variantId provided but no matching variant in array
 *
 * Caller pattern:
 *   const variant = resolveVariant(product, item.variantId);
 *   const stockable = variant ?? product;     // fallback for legacy/orphan
 */
function resolveVariant(product, variantId) {
  if (!product || product.hasVariants !== true) return null;
  if (!variantId) return null;
  return (product.variants || []).find(v => v && v.variantId === variantId) || null;
}

/**
 * Returns the variant if resolvable, else the product itself.
 * Use this where you just need a "thing to read price/stock/box-qty from".
 */
function getEffectiveStockable(product, variantId) {
  return resolveVariant(product, variantId) || product;
}

/**
 * Recompute denormalized aggregates from the variants array.
 * MUST be called by every server-side handler that writes to product.variants.
 *
 * Aggregates auto-maintained:
 *   hasVariants, availableFlavors, availableVolumes, volumeUnit (dominant),
 *   minPrice, maxPrice, totalStock, hasLowStock, outOfStock
 */
function recomputeAggregates(product) {
  if (!product) return product;
  const vs = Array.isArray(product.variants) ? product.variants.filter(Boolean) : [];

  if (vs.length === 0) {
    // Legacy single-SKU shape: aggregates mirror top-level fields.
    product.hasVariants = false;
    product.availableFlavors = [];
    product.availableVolumes = [];
    product.minPrice = Number(product.pricePerBox) || 0;
    product.maxPrice = Number(product.pricePerBox) || 0;
    product.totalStock = Number(product.stockQuantity) || 0;
    product.hasLowStock = (Number(product.stockQuantity) || 0) <= (Number(product.lowStockAlert) || 0);
    product.outOfStock = (Number(product.stockQuantity) || 0) <= 0;
    return product;
  }

  product.hasVariants = true;

  // Distinct flavors, preserving variant entry order
  const flavorSet = new Set();
  const flavors = [];
  for (const v of vs) {
    const f = v.flavor;
    if (f && !flavorSet.has(f)) {
      flavorSet.add(f);
      flavors.push(f);
    }
  }
  product.availableFlavors = flavors;

  // Distinct volumes (numeric, sorted ascending)
  const volumeSet = new Set();
  for (const v of vs) {
    if (v.volume != null) volumeSet.add(Number(v.volume));
  }
  product.availableVolumes = Array.from(volumeSet).sort((a, b) => a - b);

  // Dominant volumeUnit (most common, fallback to first variant's)
  const unitCounts = {};
  for (const v of vs) {
    if (v.volumeUnit) unitCounts[v.volumeUnit] = (unitCounts[v.volumeUnit] || 0) + 1;
  }
  const sortedUnits = Object.entries(unitCounts).sort((a, b) => b[1] - a[1]);
  product.volumeUnit = sortedUnits.length > 0 ? sortedUnits[0][0] : (vs[0]?.volumeUnit || null);

  // Price + stock aggregates (only count active, non-discontinued variants)
  const activeVariants = vs.filter(v => v.status !== 'discontinued' && v.isActive !== false);
  const prices = activeVariants.map(v => Number(v.pricePerBox) || 0).filter(p => p > 0);
  product.minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  product.maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

  const totalStock = activeVariants.reduce((sum, v) => sum + (Number(v.stockQuantity) || 0), 0);
  product.totalStock = Math.round(totalStock * 100) / 100;

  product.hasLowStock = activeVariants.some(v => (Number(v.stockQuantity) || 0) <= (Number(v.lowStockAlert) || 0));
  product.outOfStock = activeVariants.length === 0 || activeVariants.every(v => (Number(v.stockQuantity) || 0) <= 0);

  return product;
}

/**
 * Assign the next variantId (V-NNN) within a product, using a high-water-mark counter
 * stored on the product doc. Counter never reuses ids even after variant deletion —
 * critical for order snapshot integrity (legacy line items keep their variantId valid).
 */
function nextVariantId(product) {
  if (!product) throw new Error('nextVariantId: product is required');
  const current = Number(product._variantCounter) || 0;
  // Also inspect existing variants to handle counter-drift from manual Firestore edits
  const existingMax = Array.isArray(product.variants)
    ? product.variants.reduce((max, v) => {
        const n = parseInt(String(v?.variantId || '').replace('V-', ''), 10);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0)
    : 0;
  const next = Math.max(current, existingMax) + 1;
  product._variantCounter = next;
  return `V-${String(next).padStart(3, '0')}`;
}

/**
 * Validate a single variant object. Returns { ok, error } — caller throws/rejects on !ok.
 * Used by handleProductsAdd / handleProductsUpdate / bulk variant import.
 */
function validateVariant(v, { existingVariants = [], allowedUnits = ['ml', 'L'] } = {}) {
  if (!v || typeof v !== 'object') return { ok: false, error: 'Variant must be an object' };

  // Required numeric fields
  if (v.volume == null || Number(v.volume) <= 0) return { ok: false, error: 'Variant volume must be > 0' };
  if (!v.volumeUnit || !allowedUnits.includes(v.volumeUnit)) {
    return { ok: false, error: `Variant volumeUnit must be one of: ${allowedUnits.join(', ')}` };
  }
  if (Number(v.pricePerBox) < 0) return { ok: false, error: 'Variant pricePerBox must be >= 0' };
  if (Number(v.stockQuantity) < 0) return { ok: false, error: 'Variant stockQuantity must be >= 0' };
  if (Number(v.lowStockAlert) < 0) return { ok: false, error: 'Variant lowStockAlert must be >= 0' };
  if (Number(v.boxQuantity) <= 0) return { ok: false, error: 'Variant boxQuantity must be > 0' };

  // Flavor is optional (string or null)
  if (v.flavor != null && typeof v.flavor !== 'string') {
    return { ok: false, error: 'Variant flavor must be a string or null' };
  }

  // Unique constraint within product: (flavor, volume, volumeUnit)
  const flavorKey = v.flavor || '_default';
  const dup = existingVariants.find(ev =>
    ev && ev.variantId !== v.variantId &&
    (ev.flavor || '_default') === flavorKey &&
    Number(ev.volume) === Number(v.volume) &&
    ev.volumeUnit === v.volumeUnit
  );
  if (dup) {
    const label = v.flavor ? `${v.flavor} ${v.volume}${v.volumeUnit}` : `${v.volume}${v.volumeUnit}`;
    return { ok: false, error: `Variant ${label} already exists in this product` };
  }

  return { ok: true };
}

/**
 * Normalize a variant object — coerce numeric fields, default missing booleans,
 * set timestamps. Mutates and returns the variant.
 */
function normalizeVariant(v, { isNew = false } = {}) {
  if (!v || typeof v !== 'object') return v;
  v.volume = Number(v.volume) || 0;
  v.volumeUnit = v.volumeUnit || 'ml';
  v.pricePerBox = Number(v.pricePerBox) || 0;
  v.mrp = Number(v.mrp) || 0;
  v.costPricePerBox = Number(v.costPricePerBox) || 0;
  v.boxQuantity = Number(v.boxQuantity) || 24;
  v.stockQuantity = Math.round((Number(v.stockQuantity) || 0) * 100) / 100;
  v.lowStockAlert = Number(v.lowStockAlert) || 0;
  v.gstPercent = Number(v.gstPercent) || 0;
  v.deliveryCharge = Number(v.deliveryCharge) || 0;
  v.allowPiecePurchase = Boolean(v.allowPiecePurchase);
  v.allowHalfBox = !v.allowPiecePurchase && Boolean(v.allowHalfBox);
  v.flavor = v.flavor || null;
  v.isActive = v.isActive !== false;
  if (!v.status) v.status = v.stockQuantity > 0 ? 'active' : 'out_of_stock';
  if (v.images != null && !Array.isArray(v.images)) v.images = null;
  if (v.image != null && typeof v.image !== 'string') v.image = null;
  // Offer pass-through (optional). Sanity-check shape; reject invalid offers silently.
  if (v.offer != null) {
    if (typeof v.offer === 'object' && v.offer.enabled) {
      v.offer = {
        enabled: true,
        buyQty: Number(v.offer.buyQty) || 1,
        freeProductId: v.offer.freeProductId || null,
        freeVariantId: v.offer.freeVariantId || null,
        freeQty: Number(v.offer.freeQty) || 1,
        label: typeof v.offer.label === 'string' ? v.offer.label : '',
      };
    } else {
      v.offer = null;
    }
  }
  const now = new Date().toISOString();
  if (isNew && !v.createdAt) v.createdAt = now;
  v.updatedAt = now;
  return v;
}

/**
 * Backfill variantId on legacy order/cart items that reference a product
 * which has since been migrated to variants mode. Idempotent.
 *
 * Strategy: items lacking variantId get assigned product.variants[0].variantId
 * (the first variant — sensible default). Caller is responsible for persistence.
 *
 * @returns number of items modified
 */
function backfillVariantIdsOnItems(items, productLookup) {
  if (!Array.isArray(items)) return 0;
  let modified = 0;
  for (const item of items) {
    if (!item || item.variantId) continue;          // already set or invalid
    const product = productLookup(item.productId);
    if (!product || product.hasVariants !== true) continue;
    const firstVariant = (product.variants || [])[0];
    if (!firstVariant) continue;
    item.variantId = firstVariant.variantId;
    if (firstVariant.flavor && !item.flavor) item.flavor = firstVariant.flavor;
    if (firstVariant.volume != null && item.volume == null) item.volume = firstVariant.volume;
    if (firstVariant.volumeUnit && !item.volumeUnit) item.volumeUnit = firstVariant.volumeUnit;
    modified++;
  }
  return modified;
}

module.exports = {
  resolveVariant,
  getEffectiveStockable,
  recomputeAggregates,
  nextVariantId,
  validateVariant,
  normalizeVariant,
  backfillVariantIdsOnItems,
};
