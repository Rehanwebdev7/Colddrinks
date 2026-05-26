/**
 * Snapshot fixture tests — verifies snapshotLineItem + snapshotInventoryMovement
 * produce expected output across 12 scenarios. Single test run gates the entire
 * variants feature: any future refactor that breaks snapshot semantics fails here.
 *
 * Run: node scripts/test-snapshots.js
 * Exit code 0 = all pass; 1 = any fail.
 */

const assert = require('assert');
const {
  snapshotLineItem,
  snapshotInventoryMovement,
  makeCartItemId,
} = require('../helpers/lineItemSnapshot');
const {
  resolveVariant,
  getEffectiveStockable,
  recomputeAggregates,
  nextVariantId,
  validateVariant,
  normalizeVariant,
} = require('../helpers/variants');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message, stack: err.stack });
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const legacySingleSKU = {
  id: 'PRD-001',
  name: 'Sprite',
  category: 'Soft Drink',
  brand: null,
  pricePerBox: 450,
  mrp: 500,
  stockQuantity: 24,
  lowStockAlert: 5,
  boxQuantity: 24,
  volume: 250,
  volumeUnit: null,
  image: 'https://lh3.googleusercontent.com/d/file1',
  images: ['https://lh3.googleusercontent.com/d/file1'],
  allowPiecePurchase: true,
  allowHalfBox: false,
  gstPercent: 0,
  deliveryCharge: 0,
  status: 'active',
  offer: null,
  // No variants array, no hasVariants flag — pure legacy
};

const variantsProduct = {
  id: 'PRD-005',
  name: 'Coca-Cola',
  category: 'Soft Drink',
  brand: 'Coca-Cola',
  description: '',
  image: 'https://lh3.googleusercontent.com/d/cola-shared',
  images: ['https://lh3.googleusercontent.com/d/cola-shared'],
  status: 'active',
  offer: null,
  hasVariants: true,
  _variantCounter: 3,
  variants: [
    {
      variantId: 'V-001',
      flavor: 'Original',
      volume: 250,
      volumeUnit: 'ml',
      pricePerBox: 450,
      mrp: 500,
      costPricePerBox: 300,
      boxQuantity: 24,
      stockQuantity: 50,
      lowStockAlert: 5,
      gstPercent: 0,
      deliveryCharge: 0,
      allowPiecePurchase: true,
      allowHalfBox: false,
      image: null,
      images: null,
      status: 'active',
      isActive: true,
    },
    {
      variantId: 'V-002',
      flavor: 'Original',
      volume: 500,
      volumeUnit: 'ml',
      pricePerBox: 750,
      mrp: 800,
      costPricePerBox: 500,
      boxQuantity: 12,
      stockQuantity: 30,
      lowStockAlert: 3,
      gstPercent: 0,
      deliveryCharge: 0,
      allowPiecePurchase: false,
      allowHalfBox: true,
      image: null,
      images: null,
      status: 'active',
      isActive: true,
    },
    {
      variantId: 'V-003',
      flavor: 'Cherry',
      volume: 250,
      volumeUnit: 'ml',
      pricePerBox: 480,
      mrp: 520,
      costPricePerBox: 320,
      boxQuantity: 24,
      stockQuantity: 2,             // below threshold
      lowStockAlert: 5,
      gstPercent: 0,
      deliveryCharge: 0,
      allowPiecePurchase: true,
      allowHalfBox: false,
      image: 'https://lh3.googleusercontent.com/d/cola-cherry',
      images: ['https://lh3.googleusercontent.com/d/cola-cherry'],
      status: 'active',
      isActive: true,
    },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

section('Section 1 — resolveVariant + getEffectiveStockable');

test('legacy product returns null on resolve', () => {
  assert.strictEqual(resolveVariant(legacySingleSKU, 'V-001'), null);
});

test('variants product returns variant on resolve', () => {
  const v = resolveVariant(variantsProduct, 'V-002');
  assert.strictEqual(v.variantId, 'V-002');
  assert.strictEqual(v.volume, 500);
});

test('variants product returns null for unknown variantId', () => {
  assert.strictEqual(resolveVariant(variantsProduct, 'V-999'), null);
});

test('variants product returns null when variantId missing', () => {
  assert.strictEqual(resolveVariant(variantsProduct, null), null);
  assert.strictEqual(resolveVariant(variantsProduct, undefined), null);
});

test('getEffectiveStockable falls back to product for legacy', () => {
  const s = getEffectiveStockable(legacySingleSKU, null);
  assert.strictEqual(s.id, 'PRD-001');
  assert.strictEqual(s.pricePerBox, 450);
});

test('getEffectiveStockable returns variant for variants product', () => {
  const s = getEffectiveStockable(variantsProduct, 'V-001');
  assert.strictEqual(s.variantId, 'V-001');
  assert.strictEqual(s.pricePerBox, 450);
});

test('getEffectiveStockable falls back to product when variantId is orphan', () => {
  const s = getEffectiveStockable(variantsProduct, 'V-999');
  assert.strictEqual(s.id, 'PRD-005');
});

section('Section 2 — recomputeAggregates');

test('legacy product (no variants) → hasVariants=false, aggregates mirror top-level', () => {
  const p = { ...legacySingleSKU };
  recomputeAggregates(p);
  assert.strictEqual(p.hasVariants, false);
  assert.deepStrictEqual(p.availableFlavors, []);
  assert.strictEqual(p.minPrice, 450);
  assert.strictEqual(p.totalStock, 24);
  assert.strictEqual(p.hasLowStock, false);
  assert.strictEqual(p.outOfStock, false);
});

test('legacy product with low stock → hasLowStock=true', () => {
  const p = { ...legacySingleSKU, stockQuantity: 3, lowStockAlert: 5 };
  recomputeAggregates(p);
  assert.strictEqual(p.hasLowStock, true);
  assert.strictEqual(p.outOfStock, false);
});

test('variants product → aggregates computed from variants[]', () => {
  const p = JSON.parse(JSON.stringify(variantsProduct));
  recomputeAggregates(p);
  assert.strictEqual(p.hasVariants, true);
  assert.deepStrictEqual(p.availableFlavors, ['Original', 'Cherry']);
  assert.deepStrictEqual(p.availableVolumes, [250, 500]);
  assert.strictEqual(p.volumeUnit, 'ml');
  assert.strictEqual(p.minPrice, 450);
  assert.strictEqual(p.maxPrice, 750);
  assert.strictEqual(p.totalStock, 82);
  assert.strictEqual(p.hasLowStock, true);    // V-003 has stock=2 ≤ lowStockAlert=5
  assert.strictEqual(p.outOfStock, false);
});

test('variants product with all variants out of stock → outOfStock=true', () => {
  const p = JSON.parse(JSON.stringify(variantsProduct));
  for (const v of p.variants) v.stockQuantity = 0;
  recomputeAggregates(p);
  assert.strictEqual(p.outOfStock, true);
  assert.strictEqual(p.totalStock, 0);
});

test('discontinued variants excluded from aggregates', () => {
  const p = JSON.parse(JSON.stringify(variantsProduct));
  p.variants[0].status = 'discontinued';
  recomputeAggregates(p);
  assert.deepStrictEqual(p.availableFlavors, ['Original', 'Cherry']); // Cherry still active
  // Note: availableFlavors reads from raw variants list; minPrice/maxPrice exclude discontinued
  assert.strictEqual(p.minPrice, 480);                                // V-002 (750) + V-003 (480) active
  assert.strictEqual(p.maxPrice, 750);
});

section('Section 3 — snapshotLineItem (legacy single-SKU)');

test('legacy product + full_box snapshot', () => {
  const snap = snapshotLineItem(legacySingleSKU, null, 2, 'full_box');
  assert.strictEqual(snap.productId, 'PRD-001');
  assert.strictEqual(snap.variantId, null);
  assert.strictEqual(snap.name, 'Sprite');
  assert.strictEqual(snap.flavor, null);
  assert.strictEqual(snap.quantity, 2);
  assert.strictEqual(snap.purchaseMode, 'full_box');
  assert.strictEqual(snap.price, 450);
  assert.strictEqual(snap.pricePerBox, 450);
  assert.strictEqual(snap.boxEquivalent, 2);
  assert.strictEqual(snap.unavailable, undefined);
});

test('legacy product + piece purchase mode', () => {
  const snap = snapshotLineItem(legacySingleSKU, null, 3, 'piece');
  assert.strictEqual(snap.purchaseMode, 'piece');
  assert.strictEqual(snap.price, 450 / 24);   // ₹18.75 unrounded; let's compute
  // 450 / 24 = 18.75
  assert.strictEqual(snap.price, 18.75);
  assert.strictEqual(snap.boxEquivalent, 0.13);   // 3 * (1/24) = 0.125 → rounded to 0.13
});

test('legacy product + half_box mode (when not allowed, falls back to full_box)', () => {
  // legacySingleSKU has allowPiecePurchase=true so half_box should normalize away
  const snap = snapshotLineItem(legacySingleSKU, null, 1, 'half_box');
  assert.strictEqual(snap.purchaseMode, 'full_box');
});

section('Section 4 — snapshotLineItem (variants product)');

test('variants product + Cherry variant + piece mode', () => {
  const snap = snapshotLineItem(variantsProduct, 'V-003', 4, 'piece');
  assert.strictEqual(snap.productId, 'PRD-005');
  assert.strictEqual(snap.variantId, 'V-003');
  assert.strictEqual(snap.flavor, 'Cherry');
  assert.strictEqual(snap.volume, 250);
  assert.strictEqual(snap.volumeUnit, 'ml');
  assert.strictEqual(snap.image, 'https://lh3.googleusercontent.com/d/cola-cherry');  // variant override
  assert.strictEqual(snap.price, 480 / 24);  // 20
  assert.strictEqual(snap.pricePerBox, 480);
});

test('variants product + Original 500ml + half_box mode', () => {
  const snap = snapshotLineItem(variantsProduct, 'V-002', 1, 'half_box');
  assert.strictEqual(snap.variantId, 'V-002');
  assert.strictEqual(snap.purchaseMode, 'half_box');
  assert.strictEqual(snap.price, 375);   // 750 / 2
  assert.strictEqual(snap.image, 'https://lh3.googleusercontent.com/d/cola-shared'); // inherits product image
});

test('variants product + Original 250ml + full_box', () => {
  const snap = snapshotLineItem(variantsProduct, 'V-001', 2, 'full_box');
  assert.strictEqual(snap.variantId, 'V-001');
  assert.strictEqual(snap.flavor, 'Original');
  assert.strictEqual(snap.price, 450);
  assert.strictEqual(snap.boxQuantity, 24);
});

test('variants product + orphan variantId → unavailable flag set', () => {
  const snap = snapshotLineItem(variantsProduct, 'V-999', 1, 'full_box');
  assert.strictEqual(snap.unavailable, true);
  assert.strictEqual(snap.unavailableReason, 'Variant no longer exists');
  // Falls back to product top-level fields
  assert.strictEqual(snap.name, 'Coca-Cola');
});

section('Section 5 — snapshotInventoryMovement');

test('legacy product movement', () => {
  const mov = snapshotInventoryMovement(legacySingleSKU, null, 2, 'full_box', 'out', 'online_order_confirmed');
  assert.strictEqual(mov.productId, 'PRD-001');
  assert.strictEqual(mov.variantId, null);
  assert.strictEqual(mov.productName, 'Sprite');
  assert.strictEqual(mov.direction, 'out');
  assert.strictEqual(mov.boxEquivalent, 2);
});

test('variants product movement includes flavor + volume in productName', () => {
  const mov = snapshotInventoryMovement(variantsProduct, 'V-003', 5, 'piece', 'out', 'offline_sale');
  assert.strictEqual(mov.productId, 'PRD-005');
  assert.strictEqual(mov.variantId, 'V-003');
  assert.strictEqual(mov.productName, 'Coca-Cola Cherry 250ml');
  assert.strictEqual(mov.type, 'offline_sale');
});

section('Section 6 — cart item id key');

test('makeCartItemId composes correctly for legacy', () => {
  assert.strictEqual(makeCartItemId('PRD-001', null, 'full_box'), 'PRD-001:default:full_box');
});

test('makeCartItemId composes correctly for variants', () => {
  assert.strictEqual(makeCartItemId('PRD-005', 'V-002', 'half_box'), 'PRD-005:V-002:half_box');
});

section('Section 7 — variant id assignment');

test('nextVariantId increments correctly on a fresh product', () => {
  const p = { variants: [] };
  assert.strictEqual(nextVariantId(p), 'V-001');
  assert.strictEqual(p._variantCounter, 1);
  assert.strictEqual(nextVariantId(p), 'V-002');
});

test('nextVariantId respects existing high-water-mark', () => {
  const p = {
    _variantCounter: 5,
    variants: [{ variantId: 'V-007' }, { variantId: 'V-003' }],
  };
  // Should be max(5, 7) + 1 = 8
  assert.strictEqual(nextVariantId(p), 'V-008');
});

section('Section 8 — variant validation');

test('valid variant passes', () => {
  const result = validateVariant({
    flavor: 'Cherry', volume: 250, volumeUnit: 'ml',
    pricePerBox: 450, stockQuantity: 10, lowStockAlert: 2, boxQuantity: 24,
  });
  assert.strictEqual(result.ok, true);
});

test('variant with volume=0 rejected', () => {
  const result = validateVariant({
    flavor: 'Cherry', volume: 0, volumeUnit: 'ml',
    pricePerBox: 450, stockQuantity: 10, boxQuantity: 24,
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /volume/);
});

test('variant with invalid volumeUnit rejected', () => {
  const result = validateVariant({
    flavor: 'Cherry', volume: 250, volumeUnit: 'oz',
    pricePerBox: 450, stockQuantity: 10, boxQuantity: 24,
  });
  assert.strictEqual(result.ok, false);
});

test('duplicate variant (same flavor + volume + unit) rejected', () => {
  const existing = [
    { variantId: 'V-001', flavor: 'Cherry', volume: 250, volumeUnit: 'ml',
      pricePerBox: 450, stockQuantity: 10, boxQuantity: 24 },
  ];
  const result = validateVariant({
    flavor: 'Cherry', volume: 250, volumeUnit: 'ml',
    pricePerBox: 480, stockQuantity: 20, boxQuantity: 24,
  }, { existingVariants: existing });
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /already exists/);
});

section('Section 9 — variant normalization');

test('normalizeVariant coerces numbers + defaults booleans', () => {
  const v = normalizeVariant({ volume: '250', volumeUnit: 'ml', pricePerBox: '450', stockQuantity: '10' }, { isNew: true });
  assert.strictEqual(v.volume, 250);
  assert.strictEqual(v.pricePerBox, 450);
  assert.strictEqual(v.stockQuantity, 10);
  assert.strictEqual(v.allowPiecePurchase, false);
  assert.strictEqual(v.allowHalfBox, false);
  assert.strictEqual(v.isActive, true);
  assert.ok(v.createdAt);
  assert.ok(v.updatedAt);
});

test('normalizeVariant: half_box exclusive of piece purchase', () => {
  const v = normalizeVariant({
    volume: 1000, volumeUnit: 'ml', pricePerBox: 750, stockQuantity: 5,
    boxQuantity: 6, allowPiecePurchase: true, allowHalfBox: true,
  });
  assert.strictEqual(v.allowPiecePurchase, true);
  assert.strictEqual(v.allowHalfBox, false);   // mutex with piece
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}: ${f.error}`);
  }
  process.exit(1);
}

console.log('All snapshot fixture tests passed.');
process.exit(0);
