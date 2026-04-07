/**
 * Migration Script: JSON files → Firestore
 *
 * Run: node migrate-to-firestore.js
 *
 * This reads all JSON database files and pushes them to Firestore
 * following the structure defined in FIREBASE_COLLECTIONS.md
 */

const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  doc,
  setDoc,
  collection,
  Timestamp,
} = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

// ─── Firebase Config ────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: 'AIzaSyBGT5d8MrNU69i4e3NCzHY7v3cpzR80tME',
  authDomain: 'noor-coldrinks.firebaseapp.com',
  projectId: 'noor-coldrinks',
  storageBucket: 'noor-coldrinks.firebasestorage.app',
  messagingSenderId: '403777556555',
  appId: '1:403777556555:web:3957ec5e6723d0db337dce',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── Helpers ────────────────────────────────────────────────────────────────

const DB_DIR = path.join(__dirname, 'database');

function readJSON(file) {
  try {
    const data = fs.readFileSync(path.join(DB_DIR, file), 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.warn(`  Skipped ${file}: ${e.message}`);
    return [];
  }
}

function toTimestamp(dateStr) {
  if (!dateStr) return Timestamp.now();
  try {
    return Timestamp.fromDate(new Date(dateStr));
  } catch {
    return Timestamp.now();
  }
}

let successCount = 0;
let errorCount = 0;

async function writeDoc(collectionName, docId, data) {
  try {
    await setDoc(doc(db, collectionName, docId), data);
    successCount++;
  } catch (err) {
    console.error(`  ERROR writing ${collectionName}/${docId}:`, err.message);
    errorCount++;
  }
}

async function writeSubDoc(parentCol, parentId, subCol, subDocId, data) {
  try {
    const ref = doc(db, parentCol, parentId, subCol, subDocId);
    await setDoc(ref, data);
    successCount++;
  } catch (err) {
    console.error(`  ERROR writing ${parentCol}/${parentId}/${subCol}/${subDocId}:`, err.message);
    errorCount++;
  }
}

// ─── Migration Functions ────────────────────────────────────────────────────

async function migrateUsers() {
  console.log('\n📦 Migrating users...');
  const users = readJSON('users.json');
  if (!users.length) { console.log('  No users found'); return; }

  for (const user of users) {
    const userData = {
      uid: user.id,
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'customer',
      status: user.status || 'active',
      fcmToken: user.fcmToken || null,
      walletBalance: user.wallet || 0,
      totalOrders: 0,
      totalSpent: 0,
      outstanding: user.outstanding || 0,
      password: user.password || '',
      createdAt: toTimestamp(user.createdAt),
      updatedAt: Timestamp.now(),
    };

    await writeDoc('users', user.id, userData);

    // Migrate addresses as subcollection
    const addresses = Array.isArray(user.addresses) ? user.addresses : [];
    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i];
      const addrId = `ADDR-${String(i + 1).padStart(3, '0')}`;

      if (typeof addr === 'string') {
        // Simple string address
        await writeSubDoc('users', user.id, 'addresses', addrId, {
          label: 'Home',
          type: 'home',
          street: addr,
          city: '',
          state: '',
          pincode: '',
          isDefault: i === 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      } else if (addr && typeof addr === 'object') {
        await writeSubDoc('users', user.id, 'addresses', addrId, {
          label: addr.label || 'Home',
          type: addr.type || 'home',
          street: addr.street || '',
          city: addr.city || '',
          state: addr.state || '',
          pincode: addr.pincode || '',
          isDefault: addr.isDefault || i === 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }
    }
    console.log(`  ✓ ${user.id} - ${user.name} (${addresses.length} addresses)`);
  }
}

async function migrateProducts() {
  console.log('\n📦 Migrating products...');
  const products = readJSON('products.json');
  if (!products.length) { console.log('  No products found'); return; }

  for (const p of products) {
    await writeDoc('products', p.id, {
      name: p.name || '',
      description: p.description || '',
      category: p.category || '',
      price: p.pricePerBox || 0,
      pricePerBox: p.pricePerBox || 0,
      mrp: p.mrp || 0,
      boxQuantity: p.boxQuantity || 0,
      volume: p.volume || null,
      stock: p.stockQuantity || 0,
      stockQuantity: p.stockQuantity || 0,
      lowStockAlert: p.lowStockAlert || 10,
      image: p.image || '',
      gstPercent: p.gstPercent ?? 18,
      deliveryCharge: p.deliveryCharge || 0,
      rating: p.rating || 0,
      totalReviews: p.totalReviews || 0,
      status: p.status || 'active',
      createdAt: toTimestamp(p.createdAt),
      updatedAt: Timestamp.now(),
    });
    console.log(`  ✓ ${p.id} - ${p.name}`);
  }
}

async function migrateCategories() {
  console.log('\n📦 Migrating categories...');
  const categories = readJSON('categories.json');
  if (!categories.length) { console.log('  No categories found'); return; }

  for (let i = 0; i < categories.length; i++) {
    const c = categories[i];
    await writeDoc('categories', c.id, {
      name: c.name || '',
      status: c.status || 'active',
      displayOrder: i + 1,
      productCount: 0,
      createdAt: toTimestamp(c.createdAt),
      updatedAt: Timestamp.now(),
    });
    console.log(`  ✓ ${c.id} - ${c.name}`);
  }
}

async function migrateOrders() {
  console.log('\n📦 Migrating orders...');
  const orders = readJSON('orders.json');
  if (!orders.length) { console.log('  No orders found'); return; }

  for (const o of orders) {
    const orderData = {
      orderNumber: o.orderNumber || o.id,
      userId: o.userId || '',
      customerName: o.customerName || '',
      customerEmail: o.customerEmail || '',
      customerPhone: o.customerPhone || '',
      deliveryAddress: o.deliveryAddress || o.address || '',
      items: (o.items || []).map(item => ({
        productId: item.productId || item.id || '',
        name: item.name || item.productName || '',
        image: item.image || item.productImage || '',
        price: item.price || item.pricePerBox || 0,
        quantity: item.quantity || 1,
        total: item.total || (item.price || 0) * (item.quantity || 1),
      })),
      subtotal: o.subtotal || 0,
      taxAmount: o.taxAmount || o.tax || 0,
      taxPercent: o.taxPercent || 18,
      deliveryCharge: o.deliveryCharge || 0,
      couponCode: o.couponCode || null,
      couponDiscount: o.couponDiscount || 0,
      total: o.total || o.grandTotal || 0,
      paymentMethod: o.paymentMethod || 'COD',
      paymentStatus: o.paymentStatus || 'Pending',
      orderStatus: o.orderStatus || o.status || 'placed',
      currentStatusNote: o.currentStatusNote || '',
      rating: o.rating || null,
      ratingComment: o.ratingComment || null,
      notes: o.notes || '',
      createdAt: toTimestamp(o.createdAt),
      updatedAt: Timestamp.now(),
      deliveredAt: o.deliveredAt ? toTimestamp(o.deliveredAt) : null,
      cancelledAt: o.cancelledAt ? toTimestamp(o.cancelledAt) : null,
    };

    await writeDoc('orders', o.id, orderData);

    // Migrate status history as subcollection
    if (Array.isArray(o.statusHistory)) {
      for (let i = 0; i < o.statusHistory.length; i++) {
        const sh = o.statusHistory[i];
        await writeSubDoc('orders', o.id, 'statusHistory', `SH-${String(i + 1).padStart(3, '0')}`, {
          status: sh.status || '',
          note: sh.note || '',
          changedBy: sh.changedBy || 'system',
          timestamp: toTimestamp(sh.timestamp || sh.date),
        });
      }
    }
    console.log(`  ✓ ${o.id} - ${o.orderNumber}`);
  }
}

async function migrateBills() {
  console.log('\n📦 Migrating bills...');
  const bills = readJSON('bills.json');
  if (!bills.length) { console.log('  No bills found'); return; }

  for (const b of bills) {
    await writeDoc('bills', b.id, {
      billNumber: b.billNumber || b.id,
      orderId: b.orderId || '',
      orderNumber: b.orderNumber || '',
      customer: b.customer || {
        name: b.customerName || '',
        email: b.customerEmail || '',
        phone: b.customerPhone || '',
        address: b.customerAddress || '',
      },
      items: b.items || [],
      subtotal: b.subtotal || 0,
      tax: b.tax || b.taxAmount || 0,
      deliveryCharge: b.deliveryCharge || 0,
      discount: b.discount || 0,
      total: b.total || b.grandTotal || 0,
      paymentMethod: b.paymentMethod || 'COD',
      paymentStatus: b.paymentStatus || 'Pending',
      generatedBy: b.generatedBy || 'admin',
      generatedAt: toTimestamp(b.generatedAt || b.createdAt),
      createdAt: toTimestamp(b.createdAt),
    });
    console.log(`  ✓ ${b.id} - ${b.billNumber}`);
  }
}

async function migrateCoupons() {
  console.log('\n📦 Migrating coupons...');
  const coupons = readJSON('coupons.json');
  if (!coupons.length) { console.log('  No coupons found'); return; }

  for (const c of coupons) {
    await writeDoc('coupons', c.id, {
      code: c.code || '',
      description: c.description || '',
      discountType: c.discountType || 'percentage',
      discountValue: c.discountValue || 0,
      maxDiscount: c.maxDiscount || null,
      minOrderAmount: c.minOrderAmount || 0,
      usageLimit: c.usageLimit || null,
      perUserLimit: c.perUserLimit || null,
      usedCount: c.usedCount || 0,
      usedBy: c.usedBy || [],
      expiryDate: c.expiryDate || null,
      startDate: c.startDate || null,
      status: c.status || 'active',
      createdAt: toTimestamp(c.createdAt),
      updatedAt: Timestamp.now(),
    });
    console.log(`  ✓ ${c.id} - ${c.code}`);
  }
}

async function migrateSliders() {
  console.log('\n📦 Migrating sliders...');
  const sliders = readJSON('sliders.json');
  if (!sliders.length) { console.log('  No sliders found'); return; }

  for (let i = 0; i < sliders.length; i++) {
    const s = sliders[i];
    await writeDoc('sliders', s.id, {
      title: s.title || '',
      subtitle: s.subtitle || '',
      image: s.image || '',
      driveFileId: s.driveFileId || '',
      link: s.link || '',
      displayOrder: s.order ?? i + 1,
      status: s.active !== false ? 'active' : 'inactive',
      createdAt: toTimestamp(s.createdAt),
      updatedAt: Timestamp.now(),
    });
    console.log(`  ✓ ${s.id} - ${s.title || 'Untitled'}`);
  }
}

async function migratePayments() {
  console.log('\n📦 Migrating payments...');
  const payments = readJSON('payment-history.json');
  if (!payments.length) { console.log('  No payments found'); return; }

  for (const p of payments) {
    await writeDoc('payments', p.id, {
      orderId: p.orderId || '',
      orderNumber: p.orderNumber || '',
      userId: p.userId || '',
      customerName: p.customerName || '',
      method: p.method || p.type || 'COD',
      type: p.type || 'debit',
      amount: p.amount || 0,
      status: p.status || 'pending',
      description: p.description || '',
      transactionRef: p.transactionRef || null,
      createdAt: toTimestamp(p.createdAt),
      updatedAt: Timestamp.now(),
    });
    console.log(`  ✓ ${p.id}`);
  }
}

async function migrateNotifications() {
  console.log('\n📦 Migrating notifications...');
  const notifications = readJSON('notifications.json');
  if (!notifications.length) { console.log('  No notifications found'); return; }

  for (const n of notifications) {
    // Broadcast notifications go to notifications_broadcast
    if (n.targetType === 'all' || !n.userId) {
      await writeDoc('notifications_broadcast', n.id, {
        type: n.type || 'general',
        title: n.title || '',
        message: n.message || '',
        sentBy: n.sentBy || 'admin',
        createdAt: toTimestamp(n.createdAt),
      });
    }

    // User-specific notifications go as subcollection
    if (n.userId) {
      await writeSubDoc('users', n.userId, 'notifications', n.id, {
        type: n.type || 'general',
        title: n.title || '',
        message: n.message || '',
        orderId: n.orderId || null,
        isRead: n.isRead || n.read || false,
        createdAt: toTimestamp(n.createdAt),
      });
    }
    console.log(`  ✓ ${n.id} - ${n.title}`);
  }
}

async function migrateCart() {
  console.log('\n📦 Migrating cart...');
  const carts = readJSON('cart.json');
  if (!carts.length) { console.log('  No cart data found'); return; }

  for (const c of carts) {
    if (!c.userId) continue;
    const cartId = c.id || `CART-${c.userId}-${c.productId}`;
    await writeSubDoc('users', c.userId, 'cart', cartId, {
      productId: c.productId || '',
      productName: c.productName || '',
      productImage: c.productImage || '',
      price: c.price || 0,
      quantity: c.quantity || 1,
      addedAt: toTimestamp(c.addedAt || c.createdAt),
      updatedAt: Timestamp.now(),
    });
    console.log(`  ✓ ${cartId} for ${c.userId}`);
  }
}

async function migrateWishlist() {
  console.log('\n📦 Migrating wishlist...');
  const wishlist = readJSON('wishlist.json');
  if (!wishlist.length) { console.log('  No wishlist data found'); return; }

  for (const w of wishlist) {
    if (!w.userId) continue;
    const wishId = w.id || `WISH-${w.userId}-${w.productId}`;
    await writeSubDoc('users', w.userId, 'wishlist', wishId, {
      productId: w.productId || '',
      productName: w.productName || '',
      productImage: w.productImage || '',
      price: w.price || 0,
      addedAt: toTimestamp(w.addedAt || w.createdAt),
    });
    console.log(`  ✓ ${wishId} for ${w.userId}`);
  }
}

async function migrateSettings() {
  console.log('\n📦 Migrating settings...');
  try {
    const raw = fs.readFileSync(path.join(DB_DIR, 'settings.json'), 'utf8');
    const settings = JSON.parse(raw);

    await writeDoc('settings', 'app', {
      siteName: settings.siteName || 'Royal Cold Drinks',
      siteTagline: settings.siteTagline || '',
      logo: settings.logo || '',
      colors: settings.colors || {
        primary: '#E23744',
        primaryDark: '#c62828',
        primaryLight: '#ff5a65',
        accent: '#0ea5e9',
      },
      font: settings.font || 'Inter',
      contact: settings.contact || {},
      about: settings.about || '',
      policies: settings.policies || {},
      social: settings.social || {},
      paymentQr: settings.paymentQr || '',
      upiId: settings.upiId || '',
      taxPercent: settings.taxPercent ?? 18,
      freeDeliveryAbove: settings.freeDeliveryAbove || 500,
      minOrderAmount: settings.minOrderAmount || 100,
      updatedAt: Timestamp.now(),
    });
    console.log('  ✓ settings/app');
  } catch (e) {
    console.warn('  Settings migration skipped:', e.message);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function migrate() {
  console.log('============================================');
  console.log('  JSON → Firestore Migration');
  console.log('  Project: noor-coldrinks');
  console.log('============================================');

  await migrateUsers();
  await migrateProducts();
  await migrateCategories();
  await migrateOrders();
  await migrateBills();
  await migrateCoupons();
  await migrateSliders();
  await migratePayments();
  await migrateNotifications();
  await migrateCart();
  await migrateWishlist();
  await migrateSettings();

  console.log('\n============================================');
  console.log(`  Migration Complete!`);
  console.log(`  Success: ${successCount} documents`);
  console.log(`  Errors:  ${errorCount} documents`);
  console.log('============================================\n');

  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
