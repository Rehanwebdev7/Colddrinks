/**
 * Cold Drinks Shop - Node.js API Server
 * Run: node server.js
 * Listens on port 8000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envLines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// ─── Firebase Admin SDK (for FCM push notifications) ───────────────────────
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'noor-coldrinks'
});

const fcmAdmin = admin.messaging();

// ─── Firebase Setup ─────────────────────────────────────────────────────────

const { initializeApp: initFirebase } = require('firebase/app');
const {
  getFirestore,
  collection: fsCollection,
  getDocs,
  doc: fsDoc,
  setDoc: fsSetDoc,
  deleteDoc: fsDeleteDoc,
  writeBatch,
  getDoc: fsGetDoc,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBGT5d8MrNU69i4e3NCzHY7v3cpzR80tME',
  authDomain: 'noor-coldrinks.firebaseapp.com',
  projectId: 'noor-coldrinks',
  storageBucket: 'noor-coldrinks.firebasestorage.app',
  messagingSenderId: '403777556555',
  appId: '1:403777556555:web:3957ec5e6723d0db337dce',
};

const fbApp = initFirebase(firebaseConfig);
const fsDb = getFirestore(fbApp);

// ─── Configuration ───────────────────────────────────────────────────────────

const PORT = 8000;
const JWT_SECRET = 'cold_drinks_shop_secret_key_2024';
const DB_DIR = path.join(__dirname, 'database');
const TAX_RATE = 0.18;

// ─── Firestore Collection Mapping ───────────────────────────────────────────

const COLL_MAP = {
  'users.json': 'users',
  'products.json': 'products',
  'orders.json': 'orders',
  'cart.json': 'cart',
  'bills.json': 'bills',
  'categories.json': 'categories',
  'coupons.json': 'coupons',
  'payment-history.json': 'paymentHistory',
  'payment-requests.json': 'paymentRequests',
  'sliders.json': 'sliders',
  'wishlist.json': 'wishlist',
  'offline-sales.json': 'offlineSales',
  'inventory-movements.json': 'inventoryMovements',
  'suppliers.json': 'suppliers',
  'supplier-purchases.json': 'supplierPurchases',
  'supplier-payments.json': 'supplierPayments',
};

// ─── In-Memory Cache ────────────────────────────────────────────────────────

const cache = {};
let firestoreReady = false;
let mailTransporterPromise = null;

function getDocId(item, file) {
  if (item.id) return item.id;
  if (file === 'cart.json' && item.userId) return item.userId;
  return null;
}

function cleanForFirestore(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getProductBoxQuantity(product) {
  const qty = Number(product?.boxQuantity || product?.bottlesPerBox || product?.unitsPerBox || 24);
  return qty > 0 ? qty : 24;
}

function allowPiecePurchase(product) {
  return Boolean(product?.allowPiecePurchase);
}

function allowHalfBox(product) {
  return !allowPiecePurchase(product) && Boolean(product?.allowHalfBox);
}

function getDefaultPurchaseMode(product) {
  return allowPiecePurchase(product) ? 'piece' : 'full_box';
}

function normalizePurchaseMode(product, requestedMode) {
  const mode = String(requestedMode || '').trim().toLowerCase();
  if (mode === 'piece' && allowPiecePurchase(product)) return 'piece';
  if (mode === 'half_box' && allowHalfBox(product)) return 'half_box';
  return 'full_box';
}

function getUnitBoxEquivalent(product, purchaseMode) {
  if (purchaseMode === 'piece') return 1 / getProductBoxQuantity(product);
  if (purchaseMode === 'half_box') return 0.5;
  return 1;
}

function getUnitPrice(product, purchaseMode) {
  const pricePerBox = Number(product?.pricePerBox || product?.price || 0);
  if (purchaseMode === 'piece') return roundCurrency(pricePerBox / getProductBoxQuantity(product));
  if (purchaseMode === 'half_box') return roundCurrency(pricePerBox / 2);
  return roundCurrency(pricePerBox);
}

function getMaxPurchaseQuantity(product, purchaseMode) {
  const stockBoxes = Number(product?.stockQuantity || product?.stock || 0);
  const unitBoxEquivalent = getUnitBoxEquivalent(product, purchaseMode);
  if (stockBoxes <= 0 || unitBoxEquivalent <= 0) return 0;
  return Math.floor(stockBoxes / unitBoxEquivalent);
}

function getPurchaseLabel(purchaseMode, quantity) {
  if (purchaseMode === 'piece') return quantity === 1 ? 'piece' : 'pieces';
  if (purchaseMode === 'half_box') return quantity === 1 ? 'half box' : 'half boxes';
  return quantity === 1 ? 'box' : 'boxes';
}

function getStockDeduction(item) {
  return roundCurrency(item?.boxEquivalent != null ? item.boxEquivalent : Number(item?.quantity || 0));
}

function getReadableStockText(product, stockValue) {
  const stock = roundCurrency(stockValue);
  const perBox = getProductBoxQuantity(product);

  if (allowPiecePurchase(product)) {
    return `${Math.round(stock * perBox)} pieces`;
  }

  if (allowHalfBox(product)) {
    const fullBoxes = Math.floor(stock);
    const hasHalf = Math.abs(stock - fullBoxes - 0.5) < 0.001;
    return hasHalf ? `${fullBoxes} boxes + 1 half` : `${stock} boxes`;
  }

  return `${stock} boxes`;
}

function createInventoryMovement(entry) {
  const movements = readDB('inventory-movements.json');
  const maxId = movements.reduce((max, item) => {
    const num = parseInt(String(item.id || '').replace('MOV-', ''));
    return Number.isFinite(num) && num > max ? num : max;
  }, 0);

  const movement = {
    id: `MOV-${String(maxId + 1).padStart(4, '0')}`,
    createdAt: new Date().toISOString(),
    ...entry
  };

  movements.push(movement);
  writeDB('inventory-movements.json', movements);
  return movement;
}

function applyInventoryDelta({ productId, deltaBoxes, movement }) {
  const products = readDB('products.json');
  const index = products.findIndex(p => p.id === productId);
  if (index === -1) {
    return { ok: false, message: 'Product not found' };
  }

  const product = products[index];
  const currentStock = Number(product.stockQuantity || 0);
  const nextStock = roundCurrency(currentStock + Number(deltaBoxes || 0));

  if (nextStock < 0) {
    return { ok: false, message: `${product.name}: insufficient stock` };
  }

  products[index].stockQuantity = nextStock;
  if (nextStock === 0) {
    products[index].status = 'out_of_stock';
  } else if (products[index].status === 'out_of_stock') {
    products[index].status = 'active';
  }

  writeDB('products.json', products);

  if (movement) {
    createInventoryMovement({
      productId,
      productName: product.name,
      quantity: movement.quantity,
      purchaseMode: movement.purchaseMode || 'full_box',
      boxEquivalent: roundCurrency(Math.abs(Number(deltaBoxes || 0))),
      direction: Number(deltaBoxes || 0) >= 0 ? 'in' : 'out',
      type: movement.type || 'adjustment',
      referenceType: movement.referenceType || null,
      referenceId: movement.referenceId || null,
      note: movement.note || '',
      createdBy: movement.createdBy || 'system',
    });
  }

  return { ok: true, product: products[index] };
}

function createBillRecord({
  sourceType = 'order',
  sourceId,
  orderNumber,
  orderDate,
  userId = null,
  customerName,
  customerPhone = '',
  customerAddress = '',
  items = [],
  subtotal = 0,
  gst = 0,
  discount = 0,
  deliveryCharge = 0,
  total = 0,
  paymentStatus = 'Pending',
  paymentMethod = 'COD',
  orderStatus = 'Placed'
}) {
  const bills = readDB('bills.json');
  const existingBill = bills.find(b =>
    (sourceType === 'offline_sale' && b.sourceType === 'offline_sale' && b.sourceId === sourceId) ||
    (sourceType !== 'offline_sale' && b.orderId === sourceId)
  );

  if (existingBill) return existingBill;

  const maxId = bills.reduce((max, b) => {
    const num = parseInt(String(b.id || '').replace('BILL-', ''));
    return Number.isFinite(num) && num > max ? num : max;
  }, 0);

  const maxNum = bills.reduce((max, b) => {
    const num = parseInt(String(b.billNumber || '').replace('BILL-', ''));
    return Number.isFinite(num) && num > max ? num : max;
  }, 2000);

  const newBill = {
    id: `BILL-${String(maxId + 1).padStart(3, '0')}`,
    billNumber: `BILL-${maxNum + 1}`,
    sourceType,
    sourceId,
    orderId: sourceId,
    orderNumber,
    userId,
    customerName,
    customerPhone,
    customerAddress,
    billDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    orderDate: orderDate || new Date().toISOString(),
    items: items.map(item => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      amount: roundCurrency((item.price || 0) * (item.quantity || 0)),
      purchaseMode: item.purchaseMode || 'full_box',
      unitLabel: item.unitLabel || null
    })),
    subtotal,
    gst,
    discount,
    deliveryCharge,
    total,
    paymentStatus,
    paymentMethod,
    orderStatus,
    pdfUrl: `/bills/BILL-${maxNum + 1}.pdf`
  };

  bills.push(newBill);
  writeDB('bills.json', bills);
  return newBill;
}

// Convert Firestore Timestamp objects back to ISO strings
function normalizeData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  // Firestore Timestamp → ISO string
  if (obj.seconds !== undefined && obj.nanoseconds !== undefined && Object.keys(obj).length === 2) {
    return new Date(obj.seconds * 1000).toISOString();
  }
  if (Array.isArray(obj)) return obj.map(normalizeData);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = normalizeData(value);
  }
  return result;
}

// ─── Firestore Sync ─────────────────────────────────────────────────────────

async function syncToFirestore(file, newData, prevData, force) {
  const collName = COLL_MAP[file];
  if (!collName || (!firestoreReady && !force)) return;

  try {
    const prevIds = new Set((prevData || []).map(i => getDocId(i, file)).filter(Boolean));
    const newMap = new Map();
    for (const item of newData) {
      const id = getDocId(item, file);
      if (id) newMap.set(id, item);
    }

    const ops = [];

    // Detect deletions
    for (const id of prevIds) {
      if (!newMap.has(id)) {
        ops.push({ type: 'delete', id });
      }
    }

    // Set all current documents
    for (const [id, item] of newMap) {
      ops.push({ type: 'set', id, data: cleanForFirestore(item) });
    }

    // Execute in batches of 450 (Firestore limit is 500)
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(fsDb);
      const chunk = ops.slice(i, i + 450);
      for (const op of chunk) {
        const ref = fsDoc(fsDb, collName, op.id);
        if (op.type === 'delete') batch.delete(ref);
        else batch.set(ref, op.data);
      }
      await batch.commit();
    }
  } catch (err) {
    console.error(`  Firestore sync error (${collName}):`, err.message);
  }
}

// ─── Load from Firestore / Auto-Migrate from JSON ──────────────────────────

function readJSONFile(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DB_DIR, file), 'utf8'));
  } catch { return []; }
}

function readJSONSettings() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DB_DIR, 'settings.json'), 'utf8'));
  } catch { return {}; }
}

function writeJSONFile(file, data) {
  try {
    fs.writeFileSync(path.join(DB_DIR, file), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`JSON write error (${file}):`, err.message);
  }
}

function writeJSONSettings(data) {
  try {
    fs.writeFileSync(path.join(DB_DIR, 'settings.json'), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('JSON write error (settings.json):', err.message);
  }
}

function preloadJSONFallbackCache() {
  for (const file of Object.keys(COLL_MAP)) {
    cache[file] = readJSONFile(file);
  }
  cache['settings.json'] = readJSONSettings();
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    })
  ]);
}

async function initFirestore() {
  console.log('\n🔥 Connecting to Firestore (noor-coldrinks)...');
  let migratedCount = 0;

  // Check if force re-migration is needed (old data had transformed field names)
  let needsRemigration = false;
  try {
    const ordersSnap = await getDocs(fsCollection(fsDb, 'orders'));
    if (!ordersSnap.empty) {
      const sampleDoc = ordersSnap.docs[0].data();
      // Old migration used 'createdAt' instead of 'orderDate', and missing 'id' field
      if (!sampleDoc.id && !sampleDoc.orderNumber) {
        needsRemigration = true;
      }
    }
  } catch {}

  if (needsRemigration) {
    console.log('  ⚠ Detected old migrated data with wrong field names. Force re-migrating from JSON...');
    for (const [file, collName] of Object.entries(COLL_MAP)) {
      try {
        // Delete all existing docs in the collection
        const snapshot = await getDocs(fsCollection(fsDb, collName));
        if (!snapshot.empty) {
          for (let i = 0; i < snapshot.docs.length; i += 450) {
            const batch = writeBatch(fsDb);
            const chunk = snapshot.docs.slice(i, i + 450);
            for (const d of chunk) batch.delete(d.ref);
            await batch.commit();
          }
          console.log(`  🗑 ${collName}: cleared ${snapshot.docs.length} old docs`);
        }
        // Re-push fresh JSON data
        const jsonData = readJSONFile(file);
        cache[file] = jsonData;
        if (jsonData.length > 0) {
          await syncToFirestore(file, jsonData, [], true);
          console.log(`  ↑ ${collName}: ${jsonData.length} docs (re-migrated from JSON)`);
          migratedCount += jsonData.length;
        } else {
          console.log(`  - ${collName}: empty`);
        }
      } catch (err) {
        console.warn(`  ✗ ${collName}: ${err.message}`);
        cache[file] = readJSONFile(file);
      }
    }
  } else {
    for (const [file, collName] of Object.entries(COLL_MAP)) {
      try {
        const snapshot = await getDocs(fsCollection(fsDb, collName));
        if (!snapshot.empty) {
          cache[file] = snapshot.docs.map(d => {
            const data = normalizeData(d.data());
            // Ensure document ID is included in data (for lookups)
            if (file === 'cart.json') {
              if (!data.userId) data.userId = d.id;
            } else {
              if (!data.id) data.id = d.id;
            }
            return data;
          });
          writeJSONFile(file, cache[file]);
          console.log(`  ✓ ${collName}: ${cache[file].length} docs`);
        } else {
          // Auto-migrate from JSON if Firestore is empty
          const jsonData = readJSONFile(file);
          cache[file] = jsonData;
          if (jsonData.length > 0) {
            await syncToFirestore(file, jsonData, [], true);
            console.log(`  ↑ ${collName}: ${jsonData.length} docs (migrated from JSON)`);
            migratedCount += jsonData.length;
          } else {
            console.log(`  - ${collName}: empty`);
          }
        }
      } catch (err) {
        console.warn(`  ✗ ${collName}: ${err.message}`);
        cache[file] = readJSONFile(file);
      }
    }
  }

  // Settings (single document)
  try {
    const snap = await fsGetDoc(fsDoc(fsDb, 'settings', 'app'));
    if (snap.exists()) {
      const data = snap.data();
      // Exclude driveRefreshToken from app settings cache
      const { driveRefreshToken, ...appSettings } = normalizeData(data);
      cache['settings.json'] = appSettings;
      writeJSONSettings(appSettings);
      console.log('  ✓ settings/app: loaded');
    } else {
      const jsonSettings = readJSONSettings();
      cache['settings.json'] = jsonSettings;
      if (Object.keys(jsonSettings).length > 0) {
        await fsSetDoc(fsDoc(fsDb, 'settings', 'app'), cleanForFirestore(jsonSettings), { merge: true });
        console.log('  ↑ settings/app: migrated from JSON');
      }
    }
  } catch (err) {
    console.warn(`  ✗ settings: ${err.message}`);
    cache['settings.json'] = readJSONSettings();
  }

  firestoreReady = true;
  if (migratedCount > 0) {
    console.log(`\n  📦 Auto-migrated ${migratedCount} docs from JSON to Firestore`);
  }
  console.log('🔥 Firestore ready!\n');
}

// ─── Database Helpers (Firestore-backed) ────────────────────────────────────

function readDB(file) {
  if (cache[file]) return JSON.parse(JSON.stringify(cache[file]));
  return readJSONFile(file);
}

function writeDB(file, data) {
  const prev = cache[file] || [];
  cache[file] = data;
  writeJSONFile(file, data);
  // Async sync to Firestore
  syncToFirestore(file, data, prev).catch(err =>
    console.error(`Firestore write error (${COLL_MAP[file] || file}):`, err.message)
  );
}

function readSettings() {
  if (cache['settings.json']) return JSON.parse(JSON.stringify(cache['settings.json']));
  return readJSONSettings();
}

function writeSettings(data) {
  cache['settings.json'] = data;
  writeJSONSettings(data);
  if (firestoreReady) {
    fsSetDoc(fsDoc(fsDb, 'settings', 'app'), cleanForFirestore(data), { merge: true })
      .catch(err => console.error('Settings sync error:', err.message));
  }
}

// ─── Password Hashing ───────────────────────────────────────────────────────

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// ─── JWT Implementation ─────────────────────────────────────────────────────

function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

function createJWT(payload) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  // Admin tokens expire in 8 hours, customer tokens in 24 hours
  const expiry = payload.role === 'admin' ? 86400 : 86400;
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiry }));
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
}

function verifyJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(base64UrlDecode(body));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ─── Request Helpers ─────────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function success(res, data, message = 'Success', statusCode = 200) {
  sendJSON(res, statusCode, { success: true, data, message });
}

function error(res, message = 'Error', statusCode = 400) {
  sendJSON(res, statusCode, { success: false, data: null, message });
}

function getAuthUser(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return null;
  const payload = verifyJWT(token);
  if (!payload) return null;
  const users = readDB('users.json');
  return users.find(u => u.id === payload.id) || null;
}

function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) { error(res, 'Authentication required', 401); return null; }
  return user;
}

function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (user && user.role !== 'admin') { error(res, 'Admin access required', 403); return null; }
  return user;
}

function getQueryParams(req) {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const params = {};
  parsed.searchParams.forEach((value, key) => { params[key] = value; });
  return params;
}

function getPathname(req) {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  return parsed.pathname.replace(/\/+$/, '') || '/';
}

function sanitizeUser(user) {
  const {
    password,
    resetTokenHash,
    resetTokenExpiry,
    resetRequestedAt,
    ...safe
  } = user;
  return safe;
}

async function addOutstandingForDeliveredOrder(order, deliveredBy) {
  if (!order || order.paymentMethod === 'Online' || order.paymentStatus !== 'Pending' || order.outstandingAdded) {
    return order;
  }

  const users = readDB('users.json');
  const uIdx = users.findIndex(u => u.id === order.userId);
  if (uIdx !== -1) {
    users[uIdx].outstanding = (users[uIdx].outstanding || 0) + (order.total || 0);
    writeDB('users.json', users);
    addPaymentHistory(order.userId, 'debit', order.total || 0, `Order ${order.orderNumber} delivered (COD) - added to outstanding`, order.id);
    createNotification('payment', 'Baaki Rakam Update', `Order ${order.orderNumber} (COD) ke liye ₹${(order.total || 0).toFixed(2)} aapke baaki mein add ho gaya hai.`, order.userId);
    await sendPushToUser(order.userId, '📊 Baaki Rakam Update', `Order ${order.orderNumber} (COD) ke liye ₹${(order.total || 0).toFixed(2)} aapke baaki mein add ho gaya hai.`, { type: 'payment', link: '/profile' });
  }

  order.outstandingAdded = true;
  order.outstandingAddedAt = new Date().toISOString();
  order.outstandingAddedBy = deliveredBy || 'admin';
  return order;
}

function getFrontendBaseUrl(req) {
  const envUrl = process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/+$/, '');
  return `http://localhost:3000`;
}

async function getMailTransporter() {
  if (!mailTransporterPromise) {
    mailTransporterPromise = (async () => {
      const smtpService = process.env.SMTP_SERVICE;
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (!smtpUser || !smtpPass || (!smtpService && !smtpHost)) {
        throw new Error('SMTP is not configured');
      }

      const transporter = smtpService
        ? nodemailer.createTransport({
            service: smtpService,
            auth: { user: smtpUser, pass: smtpPass }
          })
        : nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort || 587,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass }
          });

      await transporter.verify();
      return transporter;
    })().catch((err) => {
      mailTransporterPromise = null;
      throw err;
    });
  }

  return mailTransporterPromise;
}

async function sendPasswordResetEmail({ req, email, name, token }) {
  const transporter = await getMailTransporter();
  const resetLink = `${getFrontendBaseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Reset your password',
    text: [
      `Hi ${name || 'there'},`,
      '',
      'We received a request to reset your password.',
      `Open this link to continue: ${resetLink}`,
      '',
      'This link expires in 15 minutes and can only be used once.',
      'If you did not request this, you can ignore this email.'
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 12px;">Reset your password</h2>
        <p style="margin:0 0 12px;">Hi ${name || 'there'},</p>
        <p style="margin:0 0 16px;">We received a request to reset your password.</p>
        <p style="margin:0 0 20px;">
          <a href="${resetLink}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
            Reset Password
          </a>
        </p>
        <p style="margin:0 0 12px;">This link expires in 15 minutes and can only be used once.</p>
        <p style="margin:0 0 8px;font-size:14px;color:#475569;">If the button does not work, open this link:</p>
        <p style="margin:0 0 12px;font-size:14px;word-break:break-all;color:#0f172a;">${resetLink}</p>
        <p style="margin:0;font-size:14px;color:#475569;">If you did not request this, you can ignore this email.</p>
      </div>
    `
  });
}

// ─── Notification Helper ─────────────────────────────────────────────────────

function createNotification(type, title, message, targetUserId) {
  const notifications = readDB('notifications.json');
  const maxId = notifications.reduce((max, n) => {
    const num = parseInt(n.id.replace('NOTIF-', ''));
    return num > max ? num : max;
  }, 0);
  const newNotification = {
    id: `NOTIF-${String(maxId + 1).padStart(3, '0')}`,
    type: type || 'general',
    title,
    message,
    image: '',
    targetUserId: targetUserId || null,
    isRead: false,
    createdAt: new Date().toISOString()
  };
  notifications.push(newNotification);
  writeDB('notifications.json', notifications);
  return newNotification;
}

// ─── FCM Push Notification Helpers ──────────────────────────────────────────

async function sendPush(token, title, body, data = {}) {
  if (!token) return;
  try {
    // Send DATA-ONLY message (no 'notification' field).
    // This ensures onBackgroundMessage always fires in the service worker
    // and onMessage always fires in the frontend — giving us full control
    // over how notifications are displayed, with custom sound + vibration.
    const msgData = { title, body };
    for (const [k, v] of Object.entries(data)) {
      msgData[k] = String(v);
    }

    await fcmAdmin.send({
      token,
      data: msgData,
      webpush: {
        headers: { Urgency: 'high' }
      }
    });
    console.log('[FCM] Push sent to', token.substring(0, 12) + '...');
  } catch (err) {
    // If token is invalid/expired, remove it from user
    if (err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token') {
      const users = readDB('users.json');
      const userIdx = users.findIndex(u => u.fcmToken === token);
      if (userIdx !== -1) {
        users[userIdx].fcmToken = null;
        writeDB('users.json', users);
        console.log('[FCM] Removed stale token for user', users[userIdx].id);
      }
    }
    console.error('[FCM] Send error:', err.code, err.message);
  }
}

async function sendPushToUser(userId, title, body, data = {}) {
  const users = readDB('users.json');
  const user = users.find(u => u.id === userId);
  if (user && user.fcmToken) {
    await sendPush(user.fcmToken, title, body, { ...data, role: user.role || 'customer' });
  }
}

async function sendPushToAdmin(title, body, data = {}) {
  const users = readDB('users.json');
  const admins = users.filter(u => u.role === 'admin' && u.fcmToken);
  for (const adm of admins) {
    await sendPush(adm.fcmToken, title, body, { ...data, role: 'admin' });
  }
}

async function sendPushToAll(title, body, data = {}) {
  const users = readDB('users.json');
  const usersWithTokens = users.filter(u => u.fcmToken && u.role === 'customer');
  for (const user of usersWithTokens) {
    await sendPush(user.fcmToken, title, body, { ...data, role: 'customer' });
  }
}

// ─── Payment History Helper ──────────────────────────────────────────────────

function addPaymentHistory(userId, type, amount, description, orderId, method) {
  const history = readDB('payment-history.json');
  const maxId = history.reduce((max, h) => {
    const num = parseInt(h.id.replace('PH-', ''));
    return num > max ? num : max;
  }, 0);
  const entry = {
    id: `PH-${String(maxId + 1).padStart(3, '0')}`,
    userId,
    type, // 'debit' = outstanding increased, 'credit' = outstanding decreased
    amount: Math.round(amount * 100) / 100,
    description,
    orderId: orderId || null,
    method: method || null,
    createdAt: new Date().toISOString()
  };
  history.push(entry);
  writeDB('payment-history.json', history);
  return entry;
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

// ─── AUTH ────────────────────────────────────────────────────────────────────

async function handleAuthRegister(req, res) {
  const body = await parseBody(req);
  const { name, email, phone, password } = body;

  if (!name || !email || !phone || !password) {
    return error(res, 'All fields are required: name, email, phone, password');
  }

  const users = readDB('users.json');

  if (users.find(u => u.email === email)) {
    return error(res, 'Email already registered');
  }
  if (users.find(u => u.phone === phone)) {
    return error(res, 'Phone number already registered');
  }

  const maxId = users.reduce((max, u) => {
    const num = parseInt(u.id.replace('USR-', ''));
    return num > max ? num : max;
  }, 0);

  const newUser = {
    id: `USR-${String(maxId + 1).padStart(3, '0')}`,
    name,
    email,
    phone,
    password: hashPassword(password),
    role: body.role || 'customer',
    addresses: body.addresses || (body.address ? [body.address] : []),
    wallet: 0,
    fcmToken: body.fcmToken || null,
    createdAt: new Date().toISOString(),
    status: 'active'
  };

  users.push(newUser);
  writeDB('users.json', users);

  const token = createJWT({ id: newUser.id, email: newUser.email, role: newUser.role });
  return success(res, { token, user: sanitizeUser(newUser) }, 'Registration successful', 201);
}

async function handleAuthLogin(req, res) {
  const body = await parseBody(req);
  const { email, phone, password } = body;

  if ((!email && !phone) || !password) {
    return error(res, 'Email/phone and password are required');
  }

  const normalizePhone = (p) => {
    if (!p) return ''
    const digits = p.replace(/[^0-9]/g, '')
    if (digits.length === 10) return '+91' + digits
    if (digits.length === 12 && digits.startsWith('91')) return '+' + digits
    if (digits.length === 13 && digits.startsWith('91')) return '+' + digits
    return p
  }

  const users = readDB('users.json');
  const normalizedPhone = phone ? normalizePhone(phone) : null
  const user = users.find(u =>
    (email && u.email === email) || (normalizedPhone && normalizePhone(u.phone) === normalizedPhone)
  );

  if (!user) return error(res, 'Invalid credentials', 401);
  if (!verifyPassword(password, user.password)) return error(res, 'Invalid credentials', 401);
  if (user.status !== 'active') return error(res, 'Account is inactive', 403);

  const token = createJWT({ id: user.id, email: user.email, role: user.role });
  return success(res, { token, user: sanitizeUser(user) }, 'Login successful');
}

async function handleAuthVerify(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  return success(res, { user: sanitizeUser(user) }, 'Token is valid');
}

async function handleAuthProfile(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const body = await parseBody(req);
  const users = readDB('users.json');
  const index = users.findIndex(u => u.id === user.id);
  if (index === -1) return error(res, 'User not found', 404);

  if (body.name) users[index].name = body.name;
  if (body.email) users[index].email = body.email;
  if (body.phone) users[index].phone = body.phone;
  if (body.avatar !== undefined) users[index].avatar = body.avatar;
  if (body.addresses) users[index].addresses = body.addresses;
  if (body.address) {
    if (!users[index].addresses) users[index].addresses = [];
    users[index].addresses = [body.address];
  }

  writeDB('users.json', users);
  return success(res, { user: sanitizeUser(users[index]) }, 'Profile updated');
}

async function handleAuthChangePassword(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const body = await parseBody(req);
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) return error(res, 'Current and new password required');
  if (!verifyPassword(currentPassword, user.password)) return error(res, 'Current password is incorrect', 401);
  if (newPassword.length < 6) return error(res, 'New password must be at least 6 characters');

  const users = readDB('users.json');
  const index = users.findIndex(u => u.id === user.id);
  users[index].password = hashPassword(newPassword);
  writeDB('users.json', users);

  return success(res, null, 'Password changed successfully');
}

// ─── FCM TOKEN SAVE ─────────────────────────────────────────────────────────

async function handleFCMTokenSave(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const body = await parseBody(req);
  const fcmToken = body.fcmToken || null; // null = clear token (logout)

  const users = readDB('users.json');
  const index = users.findIndex(u => u.id === user.id);
  if (index === -1) return error(res, 'User not found', 404);

  // If setting a token, remove it from any other user who had it
  // (prevents stale tokens from old logins on same device)
  if (fcmToken) {
    let changed = false;
    users.forEach((u, i) => {
      if (i !== index && u.fcmToken === fcmToken) {
        u.fcmToken = null;
        changed = true;
      }
    });
  }

  users[index].fcmToken = fcmToken;
  writeDB('users.json', users);

  return success(res, null, fcmToken ? 'FCM token saved' : 'FCM token cleared');
}

// ─── FORGOT PASSWORD ─────────────────────────────────────────────────────────

async function handleForgotPassword(req, res) {
  const body = await parseBody(req);
  const { email } = body;

  if (!email) {
    return error(res, 'Email is required');
  }

  const users = readDB('users.json');
  const index = users.findIndex(u => (u.email || '').toLowerCase() === email.toLowerCase());
  const genericMessage = 'If an account exists for this email, a reset link has been sent.';

  if (index === -1) {
    return success(res, null, genericMessage);
  }

  const token = createResetToken();
  users[index].resetTokenHash = hashResetToken(token);
  users[index].resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  users[index].resetRequestedAt = new Date().toISOString();
  writeDB('users.json', users);

  try {
    await sendPasswordResetEmail({
      req,
      email: users[index].email,
      name: users[index].name,
      token
    });
  } catch (err) {
    console.error('Forgot password mail error:', err.message);
    users[index].resetTokenHash = null;
    users[index].resetTokenExpiry = null;
    users[index].resetRequestedAt = null;
    writeDB('users.json', users);
    return error(res, 'Password reset email service is not available right now', 503);
  }

  return success(res, null, genericMessage);
}

async function handleForgotPasswordVerify(req, res) {
  const { token } = getQueryParams(req);

  if (!token) return error(res, 'Reset token is required');

  const users = readDB('users.json');
  const tokenHash = hashResetToken(token);
  const user = users.find(u => u.resetTokenHash === tokenHash);

  if (!user || !user.resetTokenExpiry || new Date(user.resetTokenExpiry).getTime() < Date.now()) {
    return error(res, 'This reset link is invalid or expired', 400);
  }

  return success(res, { email: user.email, role: user.role }, 'Reset link is valid');
}

async function handleResetPassword(req, res) {
  const body = await parseBody(req);
  const { token, newPassword } = body;

  if (!token || !newPassword) {
    return error(res, 'Reset token and new password are required');
  }
  if (newPassword.length < 6) {
    return error(res, 'New password must be at least 6 characters');
  }

  const users = readDB('users.json');
  const tokenHash = hashResetToken(token);
  const index = users.findIndex(u => u.resetTokenHash === tokenHash);

  if (index === -1 || !users[index].resetTokenExpiry || new Date(users[index].resetTokenExpiry).getTime() < Date.now()) {
    return error(res, 'This reset link is invalid or expired', 400);
  }

  users[index].password = hashPassword(newPassword);
  users[index].resetTokenHash = null;
  users[index].resetTokenExpiry = null;
  users[index].resetRequestedAt = null;
  writeDB('users.json', users);

  return success(res, { role: users[index].role }, 'Password reset successfully. You can now login with your new password.');
}

// ─── USERS (Admin) ──────────────────────────────────────────────────────────

async function handleUsers(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const query = getQueryParams(req);
  let users = readDB('users.json').map(sanitizeUser);
  const orders = readDB('orders.json');

  // Attach order count and total spent to each user
  users = users.map(u => {
    const userOrders = orders.filter(o => o.userId === u.id);
    return {
      ...u,
      ordersCount: userOrders.length,
      totalSpent: userOrders.reduce((sum, o) => sum + (o.total || 0), 0)
    };
  });

  if (query.role) {
    users = users.filter(u => u.role === query.role);
  }

  return success(res, users);
}

async function handleUserAction(req, res, userId, action) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const users = readDB('users.json');
  const index = users.findIndex(u => u.id === userId);
  if (index === -1) return error(res, 'User not found', 404);

  if (action === 'block') {
    users[index].status = 'blocked';
  } else if (action === 'unblock') {
    users[index].status = 'active';
  } else {
    return error(res, 'Invalid action');
  }

  writeDB('users.json', users);
  return success(res, sanitizeUser(users[index]), `User ${action}ed successfully`);
}

// ─── PRODUCTS ────────────────────────────────────────────────────────────────

async function handleProducts(req, res) {
  const query = getQueryParams(req);
  let products = readDB('products.json');

  if (query.id) {
    const product = products.find(p => p.id === query.id);
    return product ? success(res, product) : error(res, 'Product not found', 404);
  }
  if (query.category) {
    products = products.filter(p => p.category.toLowerCase() === query.category.toLowerCase());
  }
  if (query.search) {
    const s = query.search.toLowerCase();
    products = products.filter(p => p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s));
  }
  if (query.status) {
    products = products.filter(p => p.status === query.status);
  }

  return success(res, products);
}

async function handleProductById(req, res, productId) {
  const products = readDB('products.json');
  const product = products.find(p => p.id === productId);
  if (!product) return error(res, 'Product not found', 404);

  if (req.method === 'GET') {
    return success(res, product);
  }

  // PUT - update product
  if (req.method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const body = await parseBody(req);
    const index = products.findIndex(p => p.id === productId);
    const { id, _id, ...updates } = body;
    products[index] = { ...products[index], ...updates };
    writeDB('products.json', products);
    return success(res, products[index], 'Product updated successfully');
  }

  // DELETE
  if (req.method === 'DELETE') {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const index = products.findIndex(p => p.id === productId);
    const removed = products.splice(index, 1)[0];
    writeDB('products.json', products);
    return success(res, removed, 'Product deleted successfully');
  }
}

async function handleProductRestock(req, res, productId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const products = readDB('products.json');
  const index = products.findIndex(p => p.id === productId);
  if (index === -1) return error(res, 'Product not found', 404);

  products[index].stockQuantity = (products[index].stockQuantity || 0) + (body.quantity || 50);
  if (products[index].status === 'out_of_stock') products[index].status = 'active';
  writeDB('products.json', products);
  return success(res, products[index], 'Product restocked');
}

async function handleProductsAdd(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const products = readDB('products.json');

  const maxId = products.reduce((max, p) => {
    const num = parseInt(p.id.replace('PRD-', ''));
    return num > max ? num : max;
  }, 0);

  const newProduct = {
    id: `PRD-${String(maxId + 1).padStart(3, '0')}`,
    name: body.name || '',
    category: body.category || '',
    description: body.description || '',
    boxQuantity: body.boxQuantity || body.bottlesPerBox || 24,
    pricePerBox: body.pricePerBox || body.price || 0,
    mrp: body.mrp || 0,
    stockQuantity: body.stockQuantity || body.stock || 0,
    lowStockAlert: body.lowStockAlert || 10,
    image: body.image || '',
    rating: body.rating || 0,
    totalReviews: body.totalReviews || 0,
    status: body.status || 'active',
    gstPercent: body.gstPercent !== undefined ? Number(body.gstPercent) : null,
    deliveryCharge: body.deliveryCharge !== undefined ? Number(body.deliveryCharge) : null,
    volume: body.volume ? Number(body.volume) : null,
    allowPiecePurchase: body.allowPiecePurchase !== undefined ? Boolean(body.allowPiecePurchase) : undefined,
    allowHalfBox: body.allowHalfBox !== undefined ? Boolean(body.allowHalfBox) : undefined,
    costPricePerBox: body.costPricePerBox !== undefined ? Number(body.costPricePerBox) : 0
  };

  products.push(newProduct);
  writeDB('products.json', products);
  return success(res, newProduct, 'Product added successfully', 201);
}

async function handleProductsUpdate(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  if (!body.id) return error(res, 'Product ID is required');

  const products = readDB('products.json');
  const index = products.findIndex(p => p.id === body.id);
  if (index === -1) return error(res, 'Product not found', 404);

  const { id, ...updates } = body;
  products[index] = { ...products[index], ...updates };
  writeDB('products.json', products);
  return success(res, products[index], 'Product updated successfully');
}

async function handleProductsDelete(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const query = getQueryParams(req);
  const body = await parseBody(req);
  const productId = query.id || body.id;

  if (!productId) return error(res, 'Product ID is required');

  const products = readDB('products.json');
  const index = products.findIndex(p => p.id === productId);
  if (index === -1) return error(res, 'Product not found', 404);

  const removed = products.splice(index, 1)[0];
  writeDB('products.json', products);
  return success(res, removed, 'Product deleted successfully');
}

// ─── ORDERS ──────────────────────────────────────────────────────────────────

async function handleOrders(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const query = getQueryParams(req);
  let orders = readDB('orders.json');

  if (user.role !== 'admin') {
    orders = orders.filter(o => o.userId === user.id);
  }

  if (query.user_id && user.role === 'admin') {
    orders = orders.filter(o => o.userId === query.user_id);
  }
  if (query.customerId && user.role === 'admin') {
    orders = orders.filter(o => o.userId === query.customerId);
  }
  if (query.status) {
    orders = orders.filter(o => o.orderStatus === query.status);
  }
  if (query.payment_status) {
    orders = orders.filter(o => o.paymentStatus === query.payment_status);
  }

  return success(res, orders);
}

async function handleOrderById(req, res, orderId) {
  const user = requireAuth(req, res);
  if (!user) return;

  const orders = readDB('orders.json');
  const order = orders.find(o => o.id === orderId || o.orderNumber === orderId);
  if (!order) return error(res, 'Order not found', 404);

  if (user.role !== 'admin' && order.userId !== user.id) {
    return error(res, 'Access denied', 403);
  }

  return success(res, order);
}

async function handleOrdersCreate(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  if (user.status === 'blocked') {
    return error(res, 'Your account has been blocked. Please contact support for assistance.', 403);
  }

  const body = await parseBody(req);
  const { items, deliveryAddress, paymentMethod, couponCode, discount: couponDiscount } = body;

  if (!items || !items.length) return error(res, 'Order items are required');
  if (!deliveryAddress) return error(res, 'Delivery address is required');

  const products = readDB('products.json');
  const orders = readDB('orders.json');

  // Check stock before creating order
  const stockErrors = [];
  const orderItems = items.map(item => {
    const product = products.find(p => p.id === item.productId);
    if (!product) return null;
    const purchaseMode = normalizePurchaseMode(product, item.purchaseMode);
    const requestedQuantity = purchaseMode === 'half_box' ? 1 : Number(item.quantity);
    if (!requestedQuantity || requestedQuantity <= 0) return null;
    const maxQuantity = getMaxPurchaseQuantity(product, purchaseMode);
    const unitBoxEquivalent = getUnitBoxEquivalent(product, purchaseMode);
    const boxEquivalent = roundCurrency(requestedQuantity * unitBoxEquivalent);

    if (requestedQuantity > maxQuantity || Number(product.stockQuantity || 0) < boxEquivalent) {
      const availableLabel = allowPiecePurchase(product) && purchaseMode === 'piece'
        ? `${maxQuantity} ${getPurchaseLabel(purchaseMode, maxQuantity)}`
        : `${roundCurrency(Number(product.stockQuantity || 0))} boxes equivalent`;
      stockErrors.push(`${product.name}: only ${availableLabel} available, you requested ${requestedQuantity} ${getPurchaseLabel(purchaseMode, requestedQuantity)}`);
      return null;
    }
    return {
      productId: item.productId,
      name: product.name,
      image: product.image || '',
      quantity: requestedQuantity,
      purchaseMode,
      unitLabel: getPurchaseLabel(purchaseMode, requestedQuantity),
      boxQuantity: getProductBoxQuantity(product),
      boxEquivalent,
      price: getUnitPrice(product, purchaseMode),
      pricePerBox: roundCurrency(product.pricePerBox),
      gstPercent: product.gstPercent != null ? product.gstPercent : null,
      deliveryCharge: product.deliveryCharge != null ? product.deliveryCharge : null
    };
  }).filter(Boolean);

  if (stockErrors.length > 0) return error(res, `Insufficient stock: ${stockErrors.join(', ')}`);
  if (!orderItems.length) return error(res, 'No valid products in order');

  const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  let tax = 0;
  let totalDelivery = 0;
  orderItems.forEach(item => {
    if (item.deliveryCharge != null) {
      totalDelivery += item.deliveryCharge * getStockDeduction(item);
    }
  });
  totalDelivery = Math.round(totalDelivery * 100) / 100;
  const total = Math.round((subtotal + totalDelivery) * 100) / 100;

  const maxNum = orders.reduce((max, o) => {
    const num = parseInt(o.orderNumber.replace('ORD-', ''));
    return num > max ? num : max;
  }, 1000);

  const maxId = orders.reduce((max, o) => {
    const num = parseInt(o.id.replace('ORD-', ''));
    return num > max ? num : max;
  }, 0);

  // Apply coupon discount if provided
  const appliedDiscount = couponDiscount ? Math.round(Number(couponDiscount) * 100) / 100 : 0;
  const finalTotal = Math.round((total - appliedDiscount) * 100) / 100;

  const now = new Date().toISOString();
  const newOrder = {
    id: `ORD-${String(maxId + 1).padStart(3, '0')}`,
    orderNumber: `ORD-${maxNum + 1}`,
    userId: user.id,
    customerName: user.name,
    customerPhone: user.phone,
    deliveryAddress,
    orderDate: now,
    items: orderItems,
    subtotal,
    tax,
    deliveryCharge: totalDelivery,
    discount: appliedDiscount,
    couponCode: couponCode || null,
    total: appliedDiscount > 0 ? finalTotal : total,
    orderStatus: 'Placed',
    paymentStatus: paymentMethod === 'Online' ? 'Verification Pending' : 'Pending',
    paymentMethod: paymentMethod || 'COD',
    statusHistory: [{ status: 'Placed', timestamp: now }],
    updatedAt: now
  };

  orders.push(newOrder);
  writeDB('orders.json', orders);

  // Stock is NOT reduced here — it will be reduced when admin confirms the order

  // Notifications + FCM Push
  if (paymentMethod === 'Online') {
    // Notify admin to verify online payment
    createNotification('payment', 'Payment Verification Required', `${user.name} placed order ${newOrder.orderNumber} with an online payment of ₹${total.toFixed(2)}. Verification is pending.`, null);
    createNotification('order', 'Order Placed', `Your order ${newOrder.orderNumber} has been placed successfully. Online payment verification is in progress.`, user.id);
    // FCM Push to admin
    await sendPushToAdmin('💳 Payment Verification Required', `${user.name} placed order ${newOrder.orderNumber} with an online payment of ₹${total.toFixed(2)}.`, { type: 'new_order', orderId: newOrder.id, link: '/admin/orders' });
    // FCM Push to customer
    await sendPushToUser(user.id, '✅ Order Placed', `Your order ${newOrder.orderNumber} has been placed successfully. Payment verification is in progress.`, { type: 'order', orderId: newOrder.id, link: '/my-orders' });
  } else {
    // COD - outstanding will be added when admin marks as Delivered
    createNotification('order', 'New Order Received', `${user.name} placed order ${newOrder.orderNumber} for ₹${total.toFixed(2)} (COD).`, null);
    createNotification('order', 'Order Placed', `Your order ${newOrder.orderNumber} has been placed successfully.`, user.id);
    // FCM Push to admin
    await sendPushToAdmin('🛒 New Order Received', `${user.name} placed order ${newOrder.orderNumber} for ₹${total.toFixed(2)} (COD).`, { type: 'new_order', orderId: newOrder.id, link: '/admin/orders' });
    // FCM Push to customer
    await sendPushToUser(user.id, '✅ Order Placed', `Your order ${newOrder.orderNumber} has been placed successfully.`, { type: 'order', orderId: newOrder.id, link: '/my-orders' });
  }

  return success(res, newOrder, 'Order placed successfully', 201);
}

async function handleOrdersStatus(req, res, orderId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  // orderId can come from URL param or body
  const targetId = orderId || body.orderId;

  if (!targetId) return error(res, 'Order ID is required');

  const orders = readDB('orders.json');
  const index = orders.findIndex(o => o.id === targetId || o.orderNumber === targetId);
  if (index === -1) return error(res, 'Order not found', 404);

  const now = new Date().toISOString();
  const status = body.status;
  const paymentStatus = body.paymentStatus;
  const prevStatus = (orders[index].orderStatus || '').toLowerCase();
  const newStatus = (status || '').toLowerCase();
  const prevPaymentStatus = orders[index].paymentStatus;

  // Idempotency: reject if order already has this status (prevents duplicate entries)
  if (status && prevStatus === newStatus) {
    return error(res, `Order is already "${orders[index].orderStatus}"`);
  }

  if (status) {
    orders[index].orderStatus = status;
    if (!orders[index].statusHistory) orders[index].statusHistory = [];
    orders[index].statusHistory.push({ status, timestamp: now });
  }
  if (paymentStatus) {
    orders[index].paymentStatus = paymentStatus;
  }
  orders[index].updatedAt = now;

  // When admin confirms order → reduce stock from inventory
  if (newStatus === 'confirmed' && prevStatus === 'placed') {
    (orders[index].items || []).forEach(item => {
      applyInventoryDelta({
        productId: item.productId,
        deltaBoxes: -getStockDeduction(item),
        movement: {
          quantity: item.quantity,
          purchaseMode: item.purchaseMode,
          type: 'online_order_confirmed',
          referenceType: 'order',
          referenceId: orders[index].id,
          note: `Stock reserved on order confirmation ${orders[index].orderNumber}`,
          createdBy: admin.id
        }
      });
    });

    // Check for low stock and send notifications
    const products = readDB('products.json');
    (orders[index].items || []).forEach(item => {
      const pIdx = products.findIndex(p => p.id === item.productId);
      if (pIdx !== -1) {
        const p = products[pIdx];
        const threshold = p.lowStockAlert || 10;
        if (p.stockQuantity === 0) {
          createNotification('stock', 'Stock Khatam', `${p.name} ka stock khatam ho gaya hai!`, null);
          sendPushToAdmin('Stock Khatam', `${p.name} ka stock khatam!`, { type: 'stock' });
        } else if (p.stockQuantity <= threshold) {
          const readableStock = getReadableStockText(p, p.stockQuantity);
          const readableThreshold = getReadableStockText(p, threshold);
          createNotification('stock', 'Stock Kam Hai', `${p.name} ka stock kam hai: ${readableStock} bacha hai (alert ${readableThreshold} pe).`, null);
          sendPushToAdmin('Stock Kam Hai', `${p.name}: sirf ${readableStock} bacha hai`, { type: 'stock' });
        }
      }
    });
  }

  // Manual admin fallback: if delivered directly, add COD outstanding once.
  if (newStatus === 'delivered') {
    orders[index].deliveryConfirmedBy = 'admin';
    orders[index].deliveredAt = now;
    orders[index] = await addOutstandingForDeliveredOrder(orders[index], 'admin');
  }

  // When admin approves online payment (changes paymentStatus to 'Paid' from 'Verification Pending')
  if (paymentStatus === 'Paid' && prevPaymentStatus === 'Verification Pending') {
    orders[index].paymentVerifiedAt = now;
    orders[index].paymentActionBy = 'admin';
    addPaymentHistory(orders[index].userId, 'credit', orders[index].total || 0, `Online payment verified for order ${orders[index].orderNumber}`, orders[index].id, 'Online');
    createNotification('payment', 'Payment Verified', `Your online payment of ₹${(orders[index].total || 0).toFixed(2)} for order ${orders[index].orderNumber} has been verified successfully.`, orders[index].userId);
    await sendPushToUser(orders[index].userId, '✅ Payment Verified', `Your online payment of ₹${(orders[index].total || 0).toFixed(2)} for order ${orders[index].orderNumber} has been verified successfully.`, { type: 'payment', link: '/my-orders' });
  }

  // When admin rejects online payment — order auto-cancel, NO outstanding added
  if (paymentStatus === 'Rejected' && prevPaymentStatus === 'Verification Pending') {
    orders[index].paymentRejectedAt = now;
    orders[index].paymentActionBy = 'admin';
    // Auto-cancel the order — paisa nahi aaya to order cancel
    orders[index].orderStatus = 'cancelled';
    orders[index].cancelledAt = now;
    orders[index].cancelledBy = 'admin';
    orders[index].cancelReason = 'Online payment rejected';
    if (!orders[index].statusHistory) orders[index].statusHistory = [];
    orders[index].statusHistory.push({ status: 'cancelled', timestamp: now, note: 'Auto-cancelled: online payment rejected' });
    // Restore stock if it was reduced during confirm
    const products = readDB('products.json');
    (orders[index].items || []).forEach(item => {
      const pIdx = products.findIndex(p => p.id === item.productId);
      if (pIdx !== -1) {
        products[pIdx].stockQuantity = (products[pIdx].stockQuantity || 0) + (item.boxEquivalent || item.quantity || 0);
      }
    });
    writeDB('products.json', products);
    // Restore coupon usage if used
    if (orders[index].couponCode) {
      const coupons = readDB('coupons.json');
      const cIdx = coupons.findIndex(c => c.code === orders[index].couponCode);
      if (cIdx !== -1 && (coupons[cIdx].usedCount || 0) > 0) {
        coupons[cIdx].usedCount = (coupons[cIdx].usedCount || 0) - 1;
        writeDB('coupons.json', coupons);
      }
    }
    // NO outstanding added — user ko product mila hi nahi
    createNotification('payment', 'Payment Rejected', `Your online payment for order ${orders[index].orderNumber} was rejected. The order has been cancelled automatically.`, orders[index].userId);
    await sendPushToUser(orders[index].userId, '❌ Payment Rejected', `Your online payment for order ${orders[index].orderNumber} was rejected, so the order has been cancelled automatically.`, { type: 'payment', link: '/my-orders' });
    // Notify admin too
    createNotification('order', 'Order Cancelled Automatically', `Order ${orders[index].orderNumber} was cancelled automatically because the online payment was rejected.`, null);
  }

  // Persist all order modifications (status, paymentVerifiedAt, paymentRejectedAt, etc.)
  writeDB('orders.json', orders);

  // Notify user about status update
  if (status && orders[index].userId) {
    createNotification('order', 'Order Update', `Aapke order ${orders[index].orderNumber} ka status ab "${status}" ho gaya hai.`, orders[index].userId);
    await sendPushToUser(orders[index].userId, '📦 Order Update', `Aapka order ${orders[index].orderNumber} ab "${status}" hai.`, { type: 'order', orderId: orders[index].id, link: '/my-orders' });
  }

  return success(res, orders[index], 'Order status updated');
}

async function handleOrderRequestDeliveryConfirmation(req, res, orderId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const orders = readDB('orders.json');
  const index = orders.findIndex(o => o.id === orderId || o.orderNumber === orderId);
  if (index === -1) return error(res, 'Order not found', 404);

  const currentStatus = (orders[index].orderStatus || '').toLowerCase();
  if (currentStatus !== 'shipped') {
    return error(res, 'Delivery confirmation can only be requested for shipped orders');
  }
  if (orders[index].customerDeliveryConfirmed) {
    return error(res, 'Delivery already confirmed by customer');
  }
  if (orders[index].deliveryConfirmationRequestedAt) {
    return error(res, 'Customer delivery confirmation already requested');
  }

  const now = new Date().toISOString();
  orders[index].deliveryConfirmationRequestedAt = now;
  orders[index].deliveryConfirmationRequestedBy = admin.id;
  orders[index].updatedAt = now;
  if (!orders[index].statusHistory) orders[index].statusHistory = [];
  orders[index].statusHistory.push({
    status: 'Awaiting Confirmation',
    timestamp: now,
    note: 'Customer delivery confirmation requested by admin'
  });
  writeDB('orders.json', orders);

  createNotification('order', 'Delivery Confirm Karo', `Order ${orders[index].orderNumber} ka saman milne ke baad delivery confirm kar dijiye.`, orders[index].userId);
  await sendPushToUser(orders[index].userId, '📦 Delivery Confirm Karo', `Order ${orders[index].orderNumber} ka saman milne ke baad delivery confirm kar dijiye.`, { type: 'order', orderId: orders[index].id, link: `/order/${orders[index].id}` });

  return success(res, orders[index], 'Customer delivery confirmation requested');
}

async function handleOrderConfirmDelivery(req, res, orderId) {
  const user = requireAuth(req, res);
  if (!user) return;

  const orders = readDB('orders.json');
  const index = orders.findIndex(o => o.id === orderId || o.orderNumber === orderId);
  if (index === -1) return error(res, 'Order not found', 404);

  const order = orders[index];
  if (order.userId !== user.id) return error(res, 'Access denied', 403);

  const currentStatus = (order.orderStatus || '').toLowerCase();
  if (currentStatus === 'cancelled') return error(res, 'Cancelled orders cannot be confirmed');
  if (currentStatus === 'delivered' || order.customerDeliveryConfirmed) {
    return error(res, 'Delivery is already confirmed');
  }
  if (currentStatus !== 'shipped') {
    return error(res, 'Delivery can only be confirmed after the order is shipped');
  }
  if (!order.deliveryConfirmationRequestedAt) {
    return error(res, 'Delivery confirmation is not available for this order yet');
  }

  const now = new Date().toISOString();
  order.customerDeliveryConfirmed = true;
  order.customerDeliveryConfirmedAt = now;
  order.deliveryConfirmedBy = 'customer';
  order.orderStatus = 'delivered';
  order.deliveredAt = now;
  order.updatedAt = now;
  if (!order.statusHistory) order.statusHistory = [];
  order.statusHistory.push({ status: 'Delivered', timestamp: now, note: 'Confirmed by customer' });
  orders[index] = await addOutstandingForDeliveredOrder(order, 'customer');
  writeDB('orders.json', orders);

  createNotification('order', 'Delivery Confirm Hua', `Customer ne order ${order.orderNumber} ki delivery confirm kar di.`, null);
  createNotification('order', 'Delivery Confirm Hua', `Aapne order ${order.orderNumber} ki delivery confirm kar di hai.`, order.userId);
  await sendPushToAdmin('✅ Delivery Confirm Hua', `Customer ne order ${order.orderNumber} ki delivery confirm kar di.`, { type: 'order', orderId: order.id, link: '/admin/orders' });
  await sendPushToUser(order.userId, '✅ Delivery Confirm Hua', `Aapne order ${order.orderNumber} ki delivery confirm kar di hai.`, { type: 'order', orderId: order.id, link: `/order/${order.id}` });

  return success(res, orders[index], 'Delivery confirmed successfully');
}

// ─── OFFLINE SALES ──────────────────────────────────────────────────────────

async function handleOfflineSalesList(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const sales = readDB('offline-sales.json');
  const users = readDB('users.json').map(sanitizeUser);

  const result = sales
    .map((sale) => {
      const linkedCustomer = sale.customerId ? users.find(u => u.id === sale.customerId) : null;
      return {
        ...sale,
        customer: linkedCustomer || null
      };
    })
    .sort((a, b) => new Date(b.createdAt || b.saleDate) - new Date(a.createdAt || a.saleDate));

  return success(res, result);
}

async function handleOfflineSalesCreate(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const {
    items = [],
    customerId = null,
    customerName = '',
    customerPhone = '',
    customerAddress = '',
    paymentMethod = 'Cash',
    note = '',
    discount = 0,
  } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return error(res, 'At least one item is required');
  }

  const users = readDB('users.json');
  const linkedCustomer = customerId ? users.find(u => u.id === customerId) : null;
  if (customerId && !linkedCustomer) {
    return error(res, 'Selected customer not found', 404);
  }

  const normalizedPaymentMethod = String(paymentMethod || 'Cash').trim();
  const isUdhar = normalizedPaymentMethod.toLowerCase() === 'udhar';
  if (isUdhar && !linkedCustomer) {
    return error(res, 'Udhar sale ke liye customer account select karna zaroori hai');
  }

  const products = readDB('products.json');
  const stockErrors = [];
  const saleItems = items.map((item) => {
    const product = products.find(p => p.id === item.productId);
    if (!product) {
      stockErrors.push(`Product ${item.productId} not found`);
      return null;
    }

    const purchaseMode = normalizePurchaseMode(product, item.purchaseMode);
    const requestedQuantity = purchaseMode === 'half_box' ? 1 : Number(item.quantity);
    if (!requestedQuantity || requestedQuantity <= 0) {
      stockErrors.push(`${product.name}: invalid quantity`);
      return null;
    }

    const maxQuantity = getMaxPurchaseQuantity(product, purchaseMode);
    const unitBoxEquivalent = getUnitBoxEquivalent(product, purchaseMode);
    const boxEquivalent = roundCurrency(requestedQuantity * unitBoxEquivalent);

    if (requestedQuantity > maxQuantity || Number(product.stockQuantity || 0) < boxEquivalent) {
      stockErrors.push(`${product.name}: only ${maxQuantity} ${getPurchaseLabel(purchaseMode, maxQuantity)} available`);
      return null;
    }

    return {
      productId: item.productId,
      name: product.name,
      image: product.image || '',
      quantity: requestedQuantity,
      purchaseMode,
      unitLabel: getPurchaseLabel(purchaseMode, requestedQuantity),
      boxQuantity: getProductBoxQuantity(product),
      boxEquivalent,
      price: getUnitPrice(product, purchaseMode),
      pricePerBox: roundCurrency(product.pricePerBox),
      gstPercent: product.gstPercent != null ? product.gstPercent : null,
    };
  }).filter(Boolean);

  if (stockErrors.length > 0) return error(res, `Invalid sale: ${stockErrors.join(', ')}`);

  const subtotal = roundCurrency(saleItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0));
  const appliedDiscount = roundCurrency(discount || 0);
  const total = roundCurrency(Math.max(0, subtotal - appliedDiscount));
  const paymentStatus = isUdhar ? 'Pending' : 'Paid';

  const sales = readDB('offline-sales.json');
  const maxId = sales.reduce((max, s) => {
    const num = parseInt(String(s.id || '').replace('SALE-', ''));
    return Number.isFinite(num) && num > max ? num : max;
  }, 0);
  const maxNum = sales.reduce((max, s) => {
    const num = parseInt(String(s.saleNumber || '').replace('SALE-', ''));
    return Number.isFinite(num) && num > max ? num : max;
  }, 5000);

  const now = new Date().toISOString();
  const sale = {
    id: `SALE-${String(maxId + 1).padStart(4, '0')}`,
    saleNumber: `SALE-${maxNum + 1}`,
    saleDate: now,
    createdAt: now,
    createdBy: admin.id,
    source: 'offline',
    customerId: linkedCustomer?.id || null,
    customerName: linkedCustomer?.name || customerName || 'Walk-in Customer',
    customerPhone: linkedCustomer?.phone || customerPhone || '',
    customerAddress: linkedCustomer?.address || customerAddress || '',
    items: saleItems,
    subtotal,
    discount: appliedDiscount,
    total,
    paymentMethod: normalizedPaymentMethod,
    paymentStatus,
    note: note || '',
    outstandingAdded: false,
  };

  for (const item of saleItems) {
    const result = applyInventoryDelta({
      productId: item.productId,
      deltaBoxes: -getStockDeduction(item),
      movement: {
        quantity: item.quantity,
        purchaseMode: item.purchaseMode,
        type: 'offline_sale',
        referenceType: 'offline_sale',
        referenceId: sale.id,
        note: `Offline sale ${sale.saleNumber}`,
        createdBy: admin.id
      }
    });

    if (!result.ok) {
      return error(res, result.message || 'Failed to update stock');
    }
  }

  if (isUdhar && linkedCustomer) {
    const uIdx = users.findIndex(u => u.id === linkedCustomer.id);
    if (uIdx !== -1) {
      users[uIdx].outstanding = roundCurrency((users[uIdx].outstanding || 0) + total);
      writeDB('users.json', users);
      addPaymentHistory(linkedCustomer.id, 'debit', total, `Offline udhar sale ${sale.saleNumber}`, sale.id, 'Udhar');
      sale.outstandingAdded = true;
      sale.outstandingAddedAt = now;
    }
  } else if (linkedCustomer) {
    addPaymentHistory(linkedCustomer.id, 'credit', total, `Offline paid sale ${sale.saleNumber}`, sale.id, normalizedPaymentMethod);
  }

  sales.push(sale);
  writeDB('offline-sales.json', sales);

  const bill = createBillRecord({
    sourceType: 'offline_sale',
    sourceId: sale.id,
    orderNumber: sale.saleNumber,
    orderDate: sale.saleDate,
    userId: sale.customerId,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    customerAddress: sale.customerAddress,
    items: sale.items,
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    paymentStatus: sale.paymentStatus,
    paymentMethod: sale.paymentMethod,
    orderStatus: 'Completed'
  });

  createNotification(
    'order',
    'Offline Sale Recorded',
    `${sale.saleNumber} recorded for ${sale.customerName} worth ₹${sale.total.toFixed(2)}.`,
    null
  );

  return success(res, { ...sale, bill }, 'Offline sale recorded successfully', 201);
}

// ─── CART ────────────────────────────────────────────────────────────────────

async function handleCartGet(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const carts = readDB('cart.json');
  const cart = carts.find(c => c.userId === user.id);
  return success(res, cart || { userId: user.id, items: [] });
}

async function handleCartAdd(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const body = await parseBody(req);
  const { productId, quantity } = body;

  if (!productId) return error(res, 'Product ID is required');

  const products = readDB('products.json');
  const product = products.find(p => p.id === productId);
  if (!product) return error(res, 'Product not found', 404);

  const carts = readDB('cart.json');
  let cartIndex = carts.findIndex(c => c.userId === user.id);

  if (cartIndex === -1) {
    carts.push({ userId: user.id, items: [] });
    cartIndex = carts.length - 1;
  }

  const itemIndex = carts[cartIndex].items.findIndex(i => i.productId === productId);
  const qty = quantity || 1;

  if (itemIndex !== -1) {
    carts[cartIndex].items[itemIndex].quantity = qty;
    carts[cartIndex].items[itemIndex].pricePerBox = product.pricePerBox;
  } else {
    carts[cartIndex].items.push({
      productId: product.id,
      name: product.name,
      quantity: qty,
      pricePerBox: product.pricePerBox,
      image: product.image
    });
  }

  writeDB('cart.json', carts);
  return success(res, carts[cartIndex], 'Cart updated');
}

async function handleCartSync(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const body = await parseBody(req);
  const { items } = body;

  const carts = readDB('cart.json');
  let cartIndex = carts.findIndex(c => c.userId === user.id);

  if (cartIndex === -1) {
    carts.push({ userId: user.id, items: items || [] });
    cartIndex = carts.length - 1;
  } else {
    carts[cartIndex].items = items || [];
  }

  writeDB('cart.json', carts);
  return success(res, carts[cartIndex], 'Cart synced');
}

async function handleCartRemove(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const query = getQueryParams(req);
  const body = await parseBody(req);
  const productId = query.productId || body.productId;

  if (!productId) return error(res, 'Product ID is required');

  const carts = readDB('cart.json');
  const cartIndex = carts.findIndex(c => c.userId === user.id);
  if (cartIndex === -1) return error(res, 'Cart not found', 404);

  carts[cartIndex].items = carts[cartIndex].items.filter(i => i.productId !== productId);
  writeDB('cart.json', carts);
  return success(res, carts[cartIndex], 'Item removed from cart');
}

async function handleCartClear(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const carts = readDB('cart.json');
  const cartIndex = carts.findIndex(c => c.userId === user.id);

  if (cartIndex !== -1) {
    carts[cartIndex].items = [];
    writeDB('cart.json', carts);
  }

  return success(res, { userId: user.id, items: [] }, 'Cart cleared');
}

// ─── BILLS ───────────────────────────────────────────────────────────────────

async function handleBills(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const bills = readDB('bills.json');
  return success(res, bills);
}

async function handleBillsGenerate(req, res, orderIdFromUrl) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const orderId = orderIdFromUrl || body.orderId;

  if (!orderId) return error(res, 'Order ID is required');

  const orders = readDB('orders.json');
  const order = orders.find(o => o.id === orderId || o.orderNumber === orderId);
  if (!order) return error(res, 'Order not found', 404);

  const newBill = createBillRecord({
    sourceType: 'order',
    sourceId: order.id,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate,
    userId: order.userId,
    customerName: order.customerName,
    customerPhone: order.customerPhone || '',
    customerAddress: order.deliveryAddress || '',
    items: order.items,
    subtotal: order.subtotal,
    gst: order.tax,
    discount: order.discount || 0,
    deliveryCharge: order.deliveryCharge || 0,
    total: order.total,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod || 'COD',
    orderStatus: order.orderStatus || 'Placed'
  });
  return success(res, newBill, 'Bill generated successfully', 201);
}

async function handleBillsDownload(req, res) {
  const query = getQueryParams(req);
  const billId = query.id || query.billNumber;

  if (!billId) return error(res, 'Bill ID is required');

  const bills = readDB('bills.json');
  const bill = bills.find(b => b.id === billId || b.billNumber === billId);
  if (!bill) return error(res, 'Bill not found', 404);

  const itemsHTML = bill.items.map(item => {
    const mode = item.purchaseMode === 'piece' ? 'Pieces' : item.purchaseMode === 'half_box' ? 'Half Boxes' : 'Boxes'
    const rateLabel = item.purchaseMode === 'piece' ? '/pc' : item.purchaseMode === 'half_box' ? '/half' : '/box'
    return `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${item.name}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity} ${mode}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">Rs. ${item.price.toFixed(2)} ${rateLabel}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">Rs. ${item.amount.toFixed(2)}</td>
    </tr>`
  }).join('');

  const sett = readSettings();
  const shopName = sett.siteName || 'Shop';
  const shopAddress = (sett.contact && sett.contact.address) || '';
  const shopPhone = (sett.contact && sett.contact.phone) || '';
  const shopEmail = (sett.contact && sett.contact.email) || '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${bill.billNumber}</title></head>
<body style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px">
  <div style="text-align:center;border-bottom:2px solid #333;padding-bottom:20px;margin-bottom:20px">
    <h1 style="color:#E23744;margin:0">${shopName}</h1>
    <p style="color:#666;margin:5px 0">${shopAddress}</p>
    <p style="color:#666;margin:5px 0">Phone: ${shopPhone} | Email: ${shopEmail}</p>
  </div>
  <div style="display:flex;justify-content:space-between;margin-bottom:20px">
    <div><strong>Bill To:</strong><br>${bill.customerName}</div>
    <div style="text-align:right">
      <strong>Invoice #:</strong> ${bill.billNumber}<br>
      <strong>Date:</strong> ${(() => { const d = new Date(bill.billDate || bill.createdAt || bill.orderDate); return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-IN'); })()}<br>
      <strong>Order:</strong> ${bill.orderId}
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="padding:10px;text-align:left">Item</th>
        <th style="padding:10px;text-align:center">Qty (Boxes)</th>
        <th style="padding:10px;text-align:right">Price/Box</th>
        <th style="padding:10px;text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  <div style="text-align:right;margin-top:20px">
    <p><strong>Subtotal:</strong> Rs. ${bill.subtotal.toFixed(2)}</p>
    ${bill.gst > 0 ? `<p><strong>GST:</strong> Rs. ${bill.gst.toFixed(2)}</p>` : ''}
    <hr style="width:200px;margin-left:auto">
    <p style="font-size:1.2em"><strong>Total:</strong> Rs. ${bill.total.toFixed(2)}</p>
    <p style="color:${bill.paymentStatus === 'Paid' ? 'green' : 'red'}">Payment Status: ${bill.paymentStatus}</p>
  </div>
  <div style="margin-top:40px;border-top:1px solid #eee;padding-top:20px;text-align:center;color:#999;font-size:12px">
    <p>Thank you for your business! | This is a computer-generated invoice.</p>
  </div>
</body>
</html>`;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

async function handleDashboardStats(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const orders = readDB('orders.json');
  const products = readDB('products.json');

  const totalOrders = orders.length;
  const totalRevenue = orders.filter(o => o.paymentStatus === 'Paid').reduce((sum, o) => sum + o.total, 0);
  const pendingPayments = orders.filter(o => o.paymentStatus === 'Pending').reduce((sum, o) => sum + o.total, 0);
  const lowStockCount = products.filter(p => p.stockQuantity <= p.lowStockAlert).length;

  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => (o.orderDate || o.createdAt || '').startsWith(today));
  const todayRevenue = todayOrders.filter(o => o.paymentStatus === 'Paid').reduce((sum, o) => sum + o.total, 0);

  // Profit calculation: delivered/paid orders ka (selling - cost) per item
  const productMap = {};
  products.forEach(p => { productMap[p.id] = p; });

  const calcProfit = (ordersList) => {
    return ordersList
      .filter(o => o.orderStatus === 'delivered' || o.paymentStatus === 'Paid')
      .reduce((totalProfit, order) => {
        const itemsProfit = (order.items || []).reduce((sum, item) => {
          const product = productMap[item.productId];
          const costPerBox = product?.costPricePerBox || 0;
          const sellingPrice = item.price || 0;
          const qty = item.quantity || 0;
          // For piece/half_box, use boxEquivalent if available
          const boxEq = item.boxEquivalent || qty;
          const cost = costPerBox * boxEq;
          const revenue = sellingPrice * qty;
          return sum + (revenue - cost);
        }, 0);
        return totalProfit + itemsProfit;
      }, 0);
  };

  const totalProfit = calcProfit(orders);
  const todayProfit = calcProfit(todayOrders);

  return success(res, {
    totalOrders,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    pendingPayments: Math.round(pendingPayments * 100) / 100,
    lowStockCount,
    todayOrders: todayOrders.length,
    todayRevenue: Math.round(todayRevenue * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    todayProfit: Math.round(todayProfit * 100) / 100
  });
}

async function handleDashboardCharts(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const orders = readDB('orders.json');
  const products = readDB('products.json');

  const weeklyOrders = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const count = orders.filter(o => (o.orderDate || o.createdAt || '').startsWith(dateStr)).length;
    weeklyOrders.push({ date: dateStr, day: dayName, orders: count });
  }

  const categoryRevenue = {};
  orders.filter(o => o.paymentStatus === 'Paid').forEach(order => {
    order.items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      const cat = product ? product.category : 'Other';
      if (!categoryRevenue[cat]) categoryRevenue[cat] = 0;
      categoryRevenue[cat] += item.price * item.quantity;
    });
  });
  const revenueByCategory = Object.entries(categoryRevenue).map(([category, revenue]) => ({
    category,
    revenue: Math.round(revenue * 100) / 100
  }));

  const statusCounts = {};
  orders.forEach(o => {
    statusCounts[o.orderStatus] = (statusCounts[o.orderStatus] || 0) + 1;
  });
  const orderStatusDistribution = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  return success(res, { weeklyOrders, revenueByCategory, orderStatusDistribution });
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

async function handleNotificationsList(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  let notifications = readDB('notifications.json');

  if (user.role !== 'admin') {
    notifications = notifications.filter(n => n.targetUserId === user.id);
  }

  notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return success(res, notifications);
}

async function handleNotificationsSend(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const { type, title, message: msg, targetUserId, image } = body;

  if (!title || !msg) return error(res, 'Title and message are required');

  const notifications = readDB('notifications.json');

  const maxId = notifications.reduce((max, n) => {
    const num = parseInt(n.id.replace('NOTIF-', ''));
    return num > max ? num : max;
  }, 0);

  const newNotification = {
    id: `NOTIF-${String(maxId + 1).padStart(3, '0')}`,
    type: type || 'general',
    title,
    message: msg,
    image: image || '',
    targetUserId: targetUserId || null,
    isRead: false,
    createdAt: new Date().toISOString()
  };

  notifications.push(newNotification);
  writeDB('notifications.json', notifications);

  // FCM Push for admin-sent notifications (announcements)
  if (targetUserId) {
    // Send to specific user
    await sendPushToUser(targetUserId, title, msg, { type: type || 'general', link: '/notifications' });
  } else {
    // Broadcast to all customers
    await sendPushToAll('📢 ' + title, msg, { type: 'announcement', link: '/notifications' });
  }

  return success(res, newNotification, 'Notification sent', 201);
}

async function handleNotificationsMarkRead(req, res, notifId) {
  const user = requireAuth(req, res);
  if (!user) return;

  const body = await parseBody(req);
  const notifications = readDB('notifications.json');

  if (notifId) {
    // Mark single notification from URL: /notifications/:id/read
    const index = notifications.findIndex(n => n.id === notifId);
    if (index === -1) return error(res, 'Notification not found', 404);
    notifications[index].isRead = true;
  } else if (body.markAll) {
    notifications.forEach(n => {
      if (user.role === 'admin' || n.targetUserId === user.id) {
        n.isRead = true;
      }
    });
  } else if (body.notificationId) {
    const index = notifications.findIndex(n => n.id === body.notificationId);
    if (index === -1) return error(res, 'Notification not found', 404);
    notifications[index].isRead = true;
  } else {
    return error(res, 'Provide notificationId or markAll: true');
  }

  writeDB('notifications.json', notifications);
  return success(res, null, 'Notifications marked as read');
}

async function handleNotificationsReadAll(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const notifications = readDB('notifications.json');
  notifications.forEach(n => {
    if (user.role === 'admin' || n.targetUserId === user.id) {
      n.isRead = true;
    }
  });

  writeDB('notifications.json', notifications);
  return success(res, null, 'All notifications marked as read');
}

// ─── PAYMENTS ────────────────────────────────────────────────────────────────

async function handleOnlinePaymentHistory(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const orders = readDB('orders.json');
  const users = readDB('users.json');

  // Get all online payment orders (pending, paid, rejected)
  const onlineOrders = orders
    .filter(o => o.paymentMethod === 'Online')
    .sort((a, b) => new Date(b.createdAt || b.orderDate) - new Date(a.createdAt || a.orderDate))
    .map(o => {
      const user = users.find(u => u.id === o.userId);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        userName: user?.name || o.customerName || 'Unknown',
        userPhone: user?.phone || o.customerPhone || '',
        total: o.total || 0,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt || o.orderDate,
        paymentVerifiedAt: o.paymentVerifiedAt || null,
        paymentRejectedAt: o.paymentRejectedAt || null,
        paymentActionBy: o.paymentActionBy || null,
        items: o.items || []
      };
    });

  return success(res, { onlinePayments: onlineOrders });
}

async function handlePaymentsStats(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const orders = readDB('orders.json');
  const users = readDB('users.json');
  const totalPaid = orders.filter(o => o.paymentStatus === 'Paid').reduce((sum, o) => sum + (o.total || 0), 0);
  const totalPending = orders.filter(o => o.paymentStatus === 'Pending' || o.paymentStatus === 'Verification Pending').reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = orders.length;
  const paidOrders = orders.filter(o => o.paymentStatus === 'Paid').length;

  // Today's collection
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCollection = orders.filter(o => o.paymentStatus === 'Paid' && new Date(o.updatedAt || o.orderDate) >= today).reduce((sum, o) => sum + (o.total || 0), 0);

  // Monthly total
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthlyTotal = orders.filter(o => o.paymentStatus === 'Paid' && new Date(o.updatedAt || o.orderDate) >= monthStart).reduce((sum, o) => sum + (o.total || 0), 0);

  // Outstanding balances
  const outstandingUsers = users.filter(u => (u.outstanding || 0) > 0);
  const outstandingBalances = outstandingUsers.map(u => {
    const userOrders = orders.filter(o => o.userId === u.id);
    const totalAmount = userOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const outstanding = Math.round((u.outstanding || 0) * 100) / 100;
    const paid = Math.round(
      userOrders
        .filter(o => o.paymentStatus === 'Paid')
        .reduce((sum, o) => sum + (o.total || 0), 0) * 100
    ) / 100;
    return {
      _id: u.id,
      name: u.name,
      phone: u.phone,
      totalOrders: userOrders.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      paid,
      pending: outstanding
    };
  });

  return success(res, {
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalPending: Math.round(totalPending * 100) / 100,
    pendingCollection: Math.round(totalPending * 100) / 100,
    todayCollection: Math.round(todayCollection * 100) / 100,
    monthlyTotal: Math.round(monthlyTotal * 100) / 100,
    totalOrders,
    paidOrders,
    collectionRate: totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 100) : 0,
    outstandingBalances
  });
}

async function handlePaymentsRecord(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const { customerId, orderId, amount, method } = body;

  if (orderId) {
    const orders = readDB('orders.json');
    const index = orders.findIndex(o => o.id === orderId || o.orderNumber === orderId);
    if (index === -1) return error(res, 'Order not found', 404);

    orders[index].paymentStatus = 'Paid';
    orders[index].paymentMethod = method || orders[index].paymentMethod;
    orders[index].updatedAt = new Date().toISOString();
    writeDB('orders.json', orders);

    // Reduce outstanding for user
    if (orders[index].userId) {
      const users = readDB('users.json');
      const uIdx = users.findIndex(u => u.id === orders[index].userId);
      if (uIdx !== -1) {
        users[uIdx].outstanding = Math.max(0, (users[uIdx].outstanding || 0) - (orders[index].total || 0));
        writeDB('users.json', users);
      }
      addPaymentHistory(orders[index].userId, 'credit', orders[index].total || 0, `Payment recorded for order ${orders[index].orderNumber}`, orders[index].id, method || orders[index].paymentMethod);
      createNotification('payment', 'Payment Recorded', `A payment of ₹${(orders[index].total || 0).toFixed(2)} for order ${orders[index].orderNumber} has been recorded successfully.`, orders[index].userId);
      await sendPushToUser(orders[index].userId, '💰 Payment Recorded', `A payment of ₹${(orders[index].total || 0).toFixed(2)} for order ${orders[index].orderNumber} has been recorded successfully.`, { type: 'payment', link: '/my-orders' });
    }

    return success(res, orders[index], 'Payment recorded');
  }

  // Record payment by customer ID (reduce outstanding)
  if (customerId && amount) {
    const users = readDB('users.json');
    const uIdx = users.findIndex(u => u.id === customerId);
    if (uIdx !== -1) {
      users[uIdx].outstanding = Math.max(0, (users[uIdx].outstanding || 0) - Number(amount));
      writeDB('users.json', users);
      addPaymentHistory(customerId, 'credit', Number(amount), `Payment of ₹${Number(amount).toFixed(2)} recorded by admin`, null, method);
      createNotification('payment', 'Payment Recorded', `A payment of ₹${Number(amount).toFixed(2)} has been recorded successfully.`, customerId);
      await sendPushToUser(customerId, '💰 Payment Recorded', `A payment of ₹${Number(amount).toFixed(2)} has been recorded successfully.`, { type: 'payment', link: '/profile' });
    }
  }

  return success(res, { customerId, amount, method, recordedAt: new Date().toISOString() }, 'Payment recorded');
}

async function handlePaymentsHistory(req, res, customerId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const orders = readDB('orders.json');
  const customerOrders = orders.filter(o => o.userId === customerId);
  const history = readDB('payment-history.json');
  const customerHistory = history.filter(h => h.userId === customerId);

  // Order-based payments
  const orderPayments = customerOrders.map(o => ({
    id: o.id,
    orderId: o.id,
    orderNumber: o.orderNumber,
    amount: o.total,
    status: o.paymentStatus,
    method: o.paymentMethod,
    type: 'order',
    date: o.orderDate
  }));

  // General payments (from payment-history.json)
  const generalPayments = customerHistory.map(h => ({
    id: h.id,
    orderId: h.orderId,
    orderNumber: h.orderId ? (orders.find(o => o.id === h.orderId)?.orderNumber || null) : null,
    amount: h.amount,
    status: h.type === 'credit' ? 'Paid' : h.type === 'debit' ? 'Pending' : h.type,
    method: h.method,
    type: h.type,
    description: h.description,
    date: h.createdAt
  }));

  // Merge and sort by date (newest first)
  const all = [...orderPayments, ...generalPayments].sort((a, b) => new Date(b.date) - new Date(a.date));

  return success(res, all);
}

// ─── ORDER CANCEL (Customer) ─────────────────────────────────────────────────

async function handleOrderCancel(req, res, orderId) {
  const user = requireAuth(req, res);
  if (!user) return;

  const orders = readDB('orders.json');
  const index = orders.findIndex(o => o.id === orderId || o.orderNumber === orderId);
  if (index === -1) return error(res, 'Order not found', 404);

  const order = orders[index];

  // Verify order belongs to user (unless admin)
  if (user.role !== 'admin' && order.userId !== user.id) {
    return error(res, 'Access denied', 403);
  }

  // Only allow cancel if Placed or Confirmed
  const currentStatus = (order.orderStatus || '').toLowerCase();
  if (currentStatus !== 'placed' && currentStatus !== 'confirmed') {
    return error(res, 'Order can only be cancelled when status is Placed or Confirmed');
  }

  const now = new Date().toISOString();
  orders[index].orderStatus = 'Cancelled';
  if (!orders[index].statusHistory) orders[index].statusHistory = [];
  orders[index].statusHistory.push({ status: 'Cancelled', timestamp: now, note: 'Cancelled by customer' });
  orders[index].updatedAt = now;
  writeDB('orders.json', orders);

  // Restore product stock only if order was confirmed (stock reduced on confirm)
  const wasConfirmed = (order.statusHistory || []).some(s => s.status.toLowerCase() === 'confirmed');
  if (wasConfirmed) {
    const products = readDB('products.json');
    (order.items || []).forEach(item => {
      const pIdx = products.findIndex(p => p.id === item.productId);
      if (pIdx !== -1) {
        products[pIdx].stockQuantity = roundCurrency((products[pIdx].stockQuantity || 0) + getStockDeduction(item));
        if (products[pIdx].status === 'out_of_stock') products[pIdx].status = 'active';
      }
    });
    writeDB('products.json', products);
  }

  // If COD and already delivered (outstanding was added), reduce outstanding on cancel
  const wasDelivered = (order.statusHistory || []).some(s => s.status.toLowerCase() === 'delivered');
  if (order.paymentMethod !== 'Online' && wasDelivered && order.paymentStatus !== 'Paid') {
    const users = readDB('users.json');
    const uIdx = users.findIndex(u => u.id === order.userId);
    if (uIdx !== -1) {
      users[uIdx].outstanding = Math.max(0, (users[uIdx].outstanding || 0) - (order.total || 0));
      writeDB('users.json', users);
      addPaymentHistory(order.userId, 'credit', order.total || 0, `Order ${order.orderNumber} cancelled - outstanding reduced`, order.id);
    }
  }

  // Restore coupon usedCount if order had a coupon applied
  if (order.couponCode) {
    const coupons = readDB('coupons.json');
    const cIdx = coupons.findIndex(c => c.code === order.couponCode);
    if (cIdx !== -1 && (coupons[cIdx].usedCount || 0) > 0) {
      coupons[cIdx].usedCount = (coupons[cIdx].usedCount || 0) - 1;
      writeDB('coupons.json', coupons);
    }
  }

  // Notifications + FCM Push
  createNotification('order', 'Order Cancelled', `${user.name} cancelled order ${order.orderNumber}.`, null);
  createNotification('order', 'Order Cancelled', `Your order ${order.orderNumber} has been cancelled successfully.`, order.userId);
  await sendPushToAdmin('🚫 Order Cancelled', `${user.name} cancelled order ${order.orderNumber}.`, { type: 'order', link: '/admin/orders' });
  await sendPushToUser(order.userId, '🚫 Order Cancelled', `Your order ${order.orderNumber} has been cancelled successfully.`, { type: 'order', link: '/my-orders' });

  return success(res, orders[index], 'Order cancelled successfully');
}

// ─── PAYMENT SUMMARY (User) ─────────────────────────────────────────────────

async function handlePaymentSummary(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const orders = readDB('orders.json');
  const userOrders = orders.filter(o => o.userId === user.id);
  const totalOrders = userOrders.length;
  const totalSpent = userOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalPaid = userOrders.filter(o => o.paymentStatus === 'Paid').reduce((sum, o) => sum + (o.total || 0), 0);

  // Get outstanding from user record
  const users = readDB('users.json');
  const currentUser = users.find(u => u.id === user.id);
  const outstanding = currentUser?.outstanding || 0;

  // Get payment history for this user
  const paymentHistory = readDB('payment-history.json')
    .filter(h => h.userId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Get clearance requests for this user
  const clearanceRequests = readDB('payment-requests.json')
    .filter(r => r.userId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return success(res, {
    totalOrders,
    totalSpent: Math.round(totalSpent * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    paymentHistory,
    clearanceRequests,
    orders: userOrders.map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      total: o.total,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      orderStatus: o.orderStatus,
      orderDate: o.orderDate
    }))
  });
}

async function handlePaymentClearRequest(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const body = await parseBody(req);
  const requests = readDB('payment-requests.json');

  const maxId = requests.reduce((max, r) => {
    const num = parseInt(r.id.replace('PREQ-', ''));
    return num > max ? num : max;
  }, 0);

  const newRequest = {
    id: `PREQ-${String(maxId + 1).padStart(3, '0')}`,
    userId: user.id,
    userName: user.name,
    userPhone: user.phone,
    amount: body.amount || 0,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  requests.push(newRequest);
  writeDB('payment-requests.json', requests);

  // Notify admin
  createNotification('payment', 'Payment Clearance Request', `${user.name} requested payment clearance for ₹${(body.amount || 0).toFixed(2)}.`, null);
  // FCM Push to admin
  await sendPushToAdmin('💰 Payment Clearance Request', `${user.name} requested payment clearance for ₹${(body.amount || 0).toFixed(2)}.`, { type: 'payment', link: '/admin/payments' });

  return success(res, newRequest, 'Clearance request submitted', 201);
}

async function handlePaymentOutstanding(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const users = readDB('users.json').filter(u => (u.outstanding || 0) > 0);
  const orders = readDB('orders.json');

  const result = users.map(u => {
    const userOrders = orders.filter(o => o.userId === u.id);
    const totalAmount = userOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const outstanding = Math.round((u.outstanding || 0) * 100) / 100;
    const totalPaid = Math.round(
      userOrders
        .filter(o => o.paymentStatus === 'Paid')
        .reduce((sum, o) => sum + (o.total || 0), 0) * 100
    ) / 100;
    return {
      _id: u.id,
      name: u.name,
      phone: u.phone,
      totalOrders: userOrders.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalPaid,
      outstanding
    };
  });

  return success(res, result);
}

async function handlePaymentClearRequestAction(req, res, requestId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const requests = readDB('payment-requests.json');
  const index = requests.findIndex(r => r.id === requestId);
  if (index === -1) return error(res, 'Request not found', 404);

  const action = body.action; // 'approve' or 'reject'
  requests[index].status = action === 'approve' ? 'approved' : 'rejected';
  requests[index].updatedAt = new Date().toISOString();

  if (action === 'approve') {
    // Reduce user outstanding
    const users = readDB('users.json');
    const uIdx = users.findIndex(u => u.id === requests[index].userId);
    if (uIdx !== -1) {
      users[uIdx].outstanding = Math.max(0, (users[uIdx].outstanding || 0) - (requests[index].amount || 0));
      writeDB('users.json', users);
    }
    addPaymentHistory(requests[index].userId, 'credit', requests[index].amount || 0, `Payment clearance approved - ₹${(requests[index].amount || 0).toFixed(2)} cleared`, null, 'Clearance');
    createNotification('payment', 'Payment Clear Hua', `Aapki ₹${(requests[index].amount || 0).toFixed(2)} ki payment clearance approve ho gayi hai.`, requests[index].userId);
    await sendPushToUser(requests[index].userId, '✅ Payment Clear Hua', `Aapki ₹${(requests[index].amount || 0).toFixed(2)} ki payment clearance approve ho gayi hai.`, { type: 'payment', link: '/profile' });
  } else {
    createNotification('payment', 'Payment Clear Nahi Hua', `Aapki ₹${(requests[index].amount || 0).toFixed(2)} ki payment clearance reject ho gayi hai.`, requests[index].userId);
    await sendPushToUser(requests[index].userId, '❌ Payment Clear Nahi Hua', `Aapki ₹${(requests[index].amount || 0).toFixed(2)} ki payment clearance reject ho gayi hai.`, { type: 'payment', link: '/profile' });
  }

  writeDB('payment-requests.json', requests);
  return success(res, requests[index], `Request ${action}d`);
}

async function handlePaymentClearRequestsList(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const requests = readDB('payment-requests.json');
  requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return success(res, requests);
}

// All payment history (admin - all customers combined)
async function handleAllPaymentHistory(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const history = readDB('payment-history.json');
  const users = readDB('users.json');
  const orders = readDB('orders.json');

  const result = history.map(h => {
    const user = users.find(u => u.id === h.userId);
    const order = h.orderId ? orders.find(o => o.id === h.orderId) : null;
    return {
      id: h.id,
      customerName: user?.name || 'Unknown',
      customerPhone: user?.phone || '',
      type: h.type,
      amount: h.amount,
      method: h.method || null,
      description: h.description,
      orderId: h.orderId,
      orderNumber: order?.orderNumber || null,
      createdAt: h.createdAt
    };
  });

  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return success(res, result);
}

// ─── SLIDERS ──────────────────────────────────────────────────────────────────

async function handleSliders(req, res) {
  const sliders = readDB('sliders.json');
  // Only return active sliders for non-admin
  const user = getAuthUser(req);
  if (user && user.role === 'admin') {
    return success(res, sliders);
  }
  return success(res, sliders.filter(s => s.active !== false));
}

async function handleSlidersAdd(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  if (!body.image) return error(res, 'Image is required');

  const sliders = readDB('sliders.json');

  const maxId = sliders.reduce((max, s) => {
    const num = parseInt(s.id.replace('SLD-', ''));
    return num > max ? num : max;
  }, 0);

  const newSlider = {
    id: `SLD-${String(maxId + 1).padStart(3, '0')}`,
    image: body.image,
    title: body.title || '',
    subtitle: body.subtitle || '',
    link: body.link || '',
    active: body.active !== false,
    order: body.order || sliders.length,
    createdAt: new Date().toISOString()
  };

  sliders.push(newSlider);
  writeDB('sliders.json', sliders);
  return success(res, newSlider, 'Slider added successfully', 201);
}

async function handleSliderUpdate(req, res, sliderId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const sliders = readDB('sliders.json');
  const index = sliders.findIndex(s => s.id === sliderId);
  if (index === -1) return error(res, 'Slider not found', 404);

  const { id, ...updates } = body;
  sliders[index] = { ...sliders[index], ...updates };
  writeDB('sliders.json', sliders);
  return success(res, sliders[index], 'Slider updated');
}

async function handleSliderDelete(req, res, sliderId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const sliders = readDB('sliders.json');
  const index = sliders.findIndex(s => s.id === sliderId);
  if (index === -1) return error(res, 'Slider not found', 404);

  const removed = sliders.splice(index, 1)[0];
  writeDB('sliders.json', sliders);
  return success(res, removed, 'Slider deleted');
}

// ─── SETTINGS ───────────────────────────────────────────────────────────────

async function handleSettingsGet(req, res) {
  const settings = readSettings();
  return success(res, settings);
}

async function handleSettingsUpdate(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const current = readSettings();

  // Deep merge
  function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
          && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  const merged = deepMerge(current, body);
  writeSettings(merged);
  return success(res, merged, 'Settings updated');
}

// ─── CATEGORIES ─────────────────────────────────────────────────────────────

async function handleCategoriesList(req, res) {
  const categories = readDB('categories.json');
  return success(res, categories);
}

async function handleCategoriesCreate(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  if (!body.name) return error(res, 'Category name is required');

  const categories = readDB('categories.json');

  const maxId = categories.reduce((max, c) => {
    const num = parseInt(c.id.replace('CAT-', ''));
    return num > max ? num : max;
  }, 0);

  const newCategory = {
    id: `CAT-${String(maxId + 1).padStart(3, '0')}`,
    name: body.name,
    status: body.status || 'active',
    createdAt: new Date().toISOString()
  };

  categories.push(newCategory);
  writeDB('categories.json', categories);
  return success(res, newCategory, 'Category created', 201);
}

async function handleCategoriesUpdate(req, res, catId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const categories = readDB('categories.json');
  const index = categories.findIndex(c => c.id === catId);
  if (index === -1) return error(res, 'Category not found', 404);

  if (body.name) categories[index].name = body.name;
  if (body.status) categories[index].status = body.status;

  writeDB('categories.json', categories);
  return success(res, categories[index], 'Category updated');
}

async function handleCategoriesDelete(req, res, catId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const categories = readDB('categories.json');
  const index = categories.findIndex(c => c.id === catId);
  if (index === -1) return error(res, 'Category not found', 404);

  const removed = categories.splice(index, 1)[0];
  writeDB('categories.json', categories);
  return success(res, removed, 'Category deleted');
}

// ─── WISHLIST ────────────────────────────────────────────────────────────────

async function handleWishlistGet(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const wishlist = readDB('wishlist.json');
  const products = readDB('products.json');
  const userWishlist = wishlist
    .filter(w => w.userId === user.id)
    .map(w => {
      const product = products.find(p => p.id === w.productId);
      return {
        ...w,
        productName: product?.name || w.productName || 'Cold Drink',
        productImage: product?.image || w.productImage || '',
        productPrice: product?.pricePerBox || product?.price || w.productPrice || 0,
        productStock: product?.stockQuantity ?? product?.stock ?? w.productStock ?? 0
      };
    });
  return success(res, userWishlist);
}

async function handleWishlistToggle(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const body = await parseBody(req);
  const { productId } = body;

  if (!productId) return error(res, 'Product ID is required');

  const products = readDB('products.json');
  const product = products.find(p => p.id === productId);
  if (!product) return error(res, 'Product not found', 404);

  const wishlist = readDB('wishlist.json');
  const existingIndex = wishlist.findIndex(w => w.userId === user.id && w.productId === productId);

  if (existingIndex !== -1) {
    // Remove from wishlist (toggle off)
    wishlist.splice(existingIndex, 1);
    writeDB('wishlist.json', wishlist);
    return success(res, { inWishlist: false }, 'Product removed from wishlist');
  }

  // Add to wishlist (toggle on)
  const maxId = wishlist.reduce((max, w) => {
    const num = parseInt(w.id.replace('WL-', ''));
    return num > max ? num : max;
  }, 0);

  const newItem = {
    id: `WL-${String(maxId + 1).padStart(3, '0')}`,
    userId: user.id,
    productId,
    addedAt: new Date().toISOString()
  };

  wishlist.push(newItem);
  writeDB('wishlist.json', wishlist);
  return success(res, { inWishlist: true }, 'Product added to wishlist');
}

async function handleWishlistCheck(req, res, productId) {
  const user = requireAuth(req, res);
  if (!user) return;

  const wishlist = readDB('wishlist.json');
  const exists = wishlist.some(w => w.userId === user.id && w.productId === productId);
  return success(res, { inWishlist: exists });
}

// ─── SUPPLIERS (Khata Book) ──────────────────────────────────────────────────

async function handleSuppliersGet(req, res) {
  const admin = requireAdmin(req, res); if (!admin) return;
  const suppliers = readDB('suppliers.json');
  const purchases = readDB('supplier-purchases.json');
  const payments = readDB('supplier-payments.json');
  const result = suppliers.map(s => {
    const totalPurchased = purchases.filter(p => p.supplierId === s.id).reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPaid = payments.filter(p => p.supplierId === s.id).reduce((sum, p) => sum + (p.amount || 0), 0);
    return { ...s, totalPurchased, totalPaid, pending: Math.round((totalPurchased - totalPaid) * 100) / 100 };
  });
  return success(res, result);
}

async function handleSupplierAdd(req, res) {
  const admin = requireAdmin(req, res); if (!admin) return;
  const body = await parseBody(req);
  if (!body.name) return error(res, 'Supplier name is required');
  const suppliers = readDB('suppliers.json');
  const maxId = suppliers.reduce((max, s) => { const n = parseInt(s.id.replace('SUP-', '')); return n > max ? n : max; }, 0);
  const supplier = { id: `SUP-${String(maxId + 1).padStart(3, '0')}`, name: body.name, phone: body.phone || '', address: body.address || '', createdAt: new Date().toISOString() };
  suppliers.push(supplier);
  writeDB('suppliers.json', suppliers);
  return success(res, supplier, 'Supplier added', 201);
}

async function handleSupplierUpdate(req, res, id) {
  const admin = requireAdmin(req, res); if (!admin) return;
  const body = await parseBody(req);
  const suppliers = readDB('suppliers.json');
  const idx = suppliers.findIndex(s => s.id === id);
  if (idx === -1) return error(res, 'Supplier not found', 404);
  suppliers[idx] = { ...suppliers[idx], ...body, id };
  writeDB('suppliers.json', suppliers);
  return success(res, suppliers[idx]);
}

async function handleSupplierDelete(req, res, id) {
  const admin = requireAdmin(req, res); if (!admin) return;
  const suppliers = readDB('suppliers.json');
  const idx = suppliers.findIndex(s => s.id === id);
  if (idx === -1) return error(res, 'Supplier not found', 404);
  suppliers.splice(idx, 1);
  writeDB('suppliers.json', suppliers);
  return success(res, null, 'Supplier deleted');
}

async function handleSupplierPurchasesGet(req, res, supplierId) {
  const admin = requireAdmin(req, res); if (!admin) return;
  const purchases = readDB('supplier-purchases.json');
  return success(res, purchases.filter(p => p.supplierId === supplierId));
}

async function handleSupplierPurchaseAdd(req, res, supplierId) {
  const admin = requireAdmin(req, res); if (!admin) return;
  const body = await parseBody(req);
  if (!body.amount) return error(res, 'Amount is required');
  const purchases = readDB('supplier-purchases.json');
  const products = readDB('products.json');
  const product = body.productId ? products.find(p => p.id === body.productId) : null;
  const maxId = purchases.reduce((max, p) => { const n = parseInt(p.id.replace('SPUR-', '')); return n > max ? n : max; }, 0);
  const qty = Number(body.quantity) || 0;
  const unit = body.unit || 'box';
  const entry = {
    id: `SPUR-${String(maxId + 1).padStart(4, '0')}`, supplierId,
    productId: body.productId || '', productName: product?.name || body.productName || '',
    quantity: qty, unit, amount: Number(body.amount) || 0,
    date: body.date || new Date().toISOString().split('T')[0],
    notes: body.notes || '', createdAt: new Date().toISOString()
  };
  purchases.push(entry);
  writeDB('supplier-purchases.json', purchases);

  // Auto update stock + product details
  if (product) {
    if (qty > 0) {
      const boxQty = Number(product.boxQuantity) || 24;
      const stockAdd = unit === 'piece' ? qty / boxQty : qty;
      product.stockQuantity = Math.round(((Number(product.stockQuantity) || 0) + stockAdd) * 100) / 100;
    }
    // Update product details (price, mrp, selling options)
    if (body.productUpdate) {
      const u = body.productUpdate;
      if (u.pricePerBox !== undefined) product.pricePerBox = Number(u.pricePerBox) || 0;
      if (u.costPricePerBox !== undefined) product.costPricePerBox = Number(u.costPricePerBox) || 0;
      if (u.mrp !== undefined) product.mrp = Number(u.mrp) || 0;
      if (u.boxQuantity !== undefined) product.boxQuantity = Number(u.boxQuantity) || 24;
      if (u.allowPiecePurchase !== undefined) product.allowPiecePurchase = Boolean(u.allowPiecePurchase);
      if (u.allowHalfBox !== undefined) product.allowHalfBox = Boolean(u.allowHalfBox);
    }
    writeDB('products.json', products);
  }

  return success(res, entry, 'Purchase added', 201);
}

async function handleSupplierPaymentsGet(req, res, supplierId) {
  const admin = requireAdmin(req, res); if (!admin) return;
  const payments = readDB('supplier-payments.json');
  return success(res, payments.filter(p => p.supplierId === supplierId));
}

async function handleSupplierPaymentAdd(req, res, supplierId) {
  const admin = requireAdmin(req, res); if (!admin) return;
  const body = await parseBody(req);
  if (!body.amount) return error(res, 'Amount is required');
  const payments = readDB('supplier-payments.json');
  const maxId = payments.reduce((max, p) => { const n = parseInt(p.id.replace('SPAY-', '')); return n > max ? n : max; }, 0);
  const entry = {
    id: `SPAY-${String(maxId + 1).padStart(4, '0')}`, supplierId,
    amount: Number(body.amount) || 0, method: body.method || 'cash',
    date: body.date || new Date().toISOString().split('T')[0],
    notes: body.notes || '', createdAt: new Date().toISOString()
  };
  payments.push(entry);
  writeDB('supplier-payments.json', payments);
  return success(res, entry, 'Payment added', 201);
}

async function handleSupplierSummary(req, res) {
  const admin = requireAdmin(req, res); if (!admin) return;
  const purchases = readDB('supplier-purchases.json');
  const payments = readDB('supplier-payments.json');
  const totalPurchased = purchases.reduce((s, p) => s + (p.amount || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  return success(res, { totalPurchased: Math.round(totalPurchased * 100) / 100, totalPaid: Math.round(totalPaid * 100) / 100, totalPending: Math.round((totalPurchased - totalPaid) * 100) / 100 });
}

// ─── COUPONS ─────────────────────────────────────────────────────────────────

async function handleCouponsList(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  let coupons = readDB('coupons.json');

  if (user.role !== 'admin') {
    const now = new Date().toISOString();
    coupons = coupons.filter(c => c.active !== false && (!c.expiryDate || c.expiryDate >= now));
  }

  return success(res, coupons);
}

async function handleCouponsCreate(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const { code, discountType, discountValue, minOrderAmount, maxDiscount, expiryDate, usageLimit } = body;

  if (!code || !discountType || !discountValue) {
    return error(res, 'Code, discountType, and discountValue are required');
  }

  if (discountType !== 'percentage' && discountType !== 'flat') {
    return error(res, 'discountType must be "percentage" or "flat"');
  }

  const coupons = readDB('coupons.json');

  // Check for duplicate code
  if (coupons.find(c => c.code.toUpperCase() === code.toUpperCase())) {
    return error(res, 'Coupon code already exists');
  }

  const maxId = coupons.reduce((max, c) => {
    const num = parseInt(c.id.replace('CPN-', ''));
    return num > max ? num : max;
  }, 0);

  const newCoupon = {
    id: `CPN-${String(maxId + 1).padStart(3, '0')}`,
    code: code.toUpperCase(),
    discountType,
    discountValue: Number(discountValue),
    minOrderAmount: minOrderAmount ? Number(minOrderAmount) : 0,
    maxDiscount: maxDiscount ? Number(maxDiscount) : null,
    expiryDate: expiryDate || null,
    usageLimit: usageLimit ? Number(usageLimit) : null,
    usedCount: 0,
    active: true,
    createdAt: new Date().toISOString()
  };

  coupons.push(newCoupon);
  writeDB('coupons.json', coupons);
  return success(res, newCoupon, 'Coupon created successfully', 201);
}

async function handleCouponsUpdate(req, res, couponId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const body = await parseBody(req);
  const coupons = readDB('coupons.json');
  const index = coupons.findIndex(c => c.id === couponId);
  if (index === -1) return error(res, 'Coupon not found', 404);

  if (body.discountType && body.discountType !== 'percentage' && body.discountType !== 'flat') {
    return error(res, 'discountType must be "percentage" or "flat"');
  }

  // Check duplicate code if code is being changed
  if (body.code && body.code.toUpperCase() !== coupons[index].code) {
    if (coupons.find(c => c.code.toUpperCase() === body.code.toUpperCase())) {
      return error(res, 'Coupon code already exists');
    }
  }

  const { id, usedCount, ...updates } = body;
  if (updates.code) updates.code = updates.code.toUpperCase();
  if (updates.discountValue !== undefined) updates.discountValue = Number(updates.discountValue);
  if (updates.minOrderAmount !== undefined) updates.minOrderAmount = Number(updates.minOrderAmount);
  if (updates.maxDiscount !== undefined) updates.maxDiscount = updates.maxDiscount ? Number(updates.maxDiscount) : null;
  if (updates.usageLimit !== undefined) updates.usageLimit = updates.usageLimit ? Number(updates.usageLimit) : null;

  coupons[index] = { ...coupons[index], ...updates };
  writeDB('coupons.json', coupons);
  return success(res, coupons[index], 'Coupon updated successfully');
}

async function handleCouponsDelete(req, res, couponId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const coupons = readDB('coupons.json');
  const index = coupons.findIndex(c => c.id === couponId);
  if (index === -1) return error(res, 'Coupon not found', 404);

  const removed = coupons.splice(index, 1)[0];
  writeDB('coupons.json', coupons);
  return success(res, removed, 'Coupon deleted successfully');
}

async function handleCouponsApply(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const body = await parseBody(req);
  const { code, orderAmount } = body;

  if (!code || orderAmount === undefined) {
    return error(res, 'Coupon code and orderAmount are required');
  }

  const amount = Number(orderAmount);
  if (isNaN(amount) || amount <= 0) {
    return error(res, 'Invalid order amount');
  }

  const coupons = readDB('coupons.json');
  const coupon = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());

  if (!coupon) return error(res, 'Invalid coupon code', 404);
  if (coupon.active === false) return error(res, 'This coupon is no longer active');

  // Check expiry
  if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
    return error(res, 'This coupon has expired');
  }

  // Check usage limit
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return error(res, 'This coupon has reached its usage limit');
  }

  // Check minimum order amount
  if (coupon.minOrderAmount && amount < coupon.minOrderAmount) {
    return error(res, `Minimum order amount for this coupon is ₹${coupon.minOrderAmount}`);
  }

  // Calculate discount
  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = (amount * coupon.discountValue) / 100;
    if (coupon.maxDiscount !== null && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  } else {
    discount = coupon.discountValue;
  }

  // Ensure discount doesn't exceed order amount
  discount = Math.min(discount, amount);
  discount = Math.round(discount * 100) / 100;
  const finalAmount = Math.round((amount - discount) * 100) / 100;

  // Increment usage count
  const couponIndex = coupons.findIndex(c => c.id === coupon.id);
  coupons[couponIndex].usedCount = (coupons[couponIndex].usedCount || 0) + 1;
  writeDB('coupons.json', coupons);

  return success(res, { discount, finalAmount, couponId: coupon.id, code: coupon.code }, `Coupon applied! You saved ₹${discount.toFixed(2)}`);
}

// ─── ORDER RATING ────────────────────────────────────────────────────────────

async function handleOrderRate(req, res, orderId) {
  const user = requireAuth(req, res);
  if (!user) return;

  const body = await parseBody(req);
  const { rating, comment } = body;

  if (!rating || rating < 1 || rating > 5) {
    return error(res, 'Rating must be between 1 and 5');
  }

  const orders = readDB('orders.json');
  const index = orders.findIndex(o => o.id === orderId || o.orderNumber === orderId);
  if (index === -1) return error(res, 'Order not found', 404);

  const order = orders[index];

  // Verify order belongs to user (unless admin)
  if (user.role !== 'admin' && order.userId !== user.id) {
    return error(res, 'Access denied', 403);
  }

  // Only allow rating delivered orders
  const currentStatus = (order.orderStatus || '').toLowerCase();
  if (currentStatus !== 'delivered') {
    return error(res, 'Only delivered orders can be rated');
  }

  // Check if already rated
  if (order.rating) {
    return error(res, 'This order has already been rated');
  }

  orders[index].rating = {
    score: Number(rating),
    comment: comment || '',
    ratedAt: new Date().toISOString(),
    ratedBy: user.id
  };

  writeDB('orders.json', orders);
  return success(res, orders[index], 'Order rated successfully');
}

// ─── DYNAMIC ROUTER ─────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  const pathname = getPathname(req);
  const method = req.method;

  try {
    // ─── AUTH routes ───
    if (pathname === '/api/auth/register' && method === 'POST') return await handleAuthRegister(req, res);
    if (pathname === '/api/auth/login' && method === 'POST') return await handleAuthLogin(req, res);
    if (pathname === '/api/auth/verify' && method === 'GET') return await handleAuthVerify(req, res);
    if (pathname === '/api/auth/profile' && method === 'PUT') return await handleAuthProfile(req, res);
    if (pathname === '/api/auth/change-password' && method === 'PUT') return await handleAuthChangePassword(req, res);
    if (pathname === '/api/auth/forgot-password' && method === 'POST') return await handleForgotPassword(req, res);
    if (pathname === '/api/auth/forgot-password/verify' && method === 'GET') return await handleForgotPasswordVerify(req, res);
    if (pathname === '/api/auth/reset-password' && method === 'POST') return await handleResetPassword(req, res);
    if (pathname === '/api/auth/fcm-token' && method === 'POST') return await handleFCMTokenSave(req, res);

    // ─── USERS routes (admin) ───
    if (pathname === '/api/users' && method === 'GET') return await handleUsers(req, res);
    // /api/users/:userId/block or /api/users/:userId/unblock
    const userActionMatch = pathname.match(/^\/api\/users\/(USR-\d+)\/(block|unblock)$/);
    if (userActionMatch && method === 'PUT') return await handleUserAction(req, res, userActionMatch[1], userActionMatch[2]);

    // ─── PRODUCTS routes ───
    if (pathname === '/api/products' && method === 'GET') return await handleProducts(req, res);
    if (pathname === '/api/products' && method === 'POST') return await handleProductsAdd(req, res);
    if (pathname === '/api/products/add' && method === 'POST') return await handleProductsAdd(req, res);
    if (pathname === '/api/products/update' && method === 'PUT') return await handleProductsUpdate(req, res);
    if (pathname === '/api/products/delete' && method === 'DELETE') return await handleProductsDelete(req, res);
    // /api/products/:id/restock
    const restockMatch = pathname.match(/^\/api\/products\/(PRD-\d+)\/restock$/);
    if (restockMatch && method === 'PUT') return await handleProductRestock(req, res, restockMatch[1]);
    // /api/products/:id (GET, PUT, DELETE)
    const productIdMatch = pathname.match(/^\/api\/products\/(PRD-\d+)$/);
    if (productIdMatch) return await handleProductById(req, res, productIdMatch[1]);

    // ─── ORDERS routes ───
    if (pathname === '/api/orders' && method === 'GET') return await handleOrders(req, res);
    if (pathname === '/api/orders/create' && method === 'POST') return await handleOrdersCreate(req, res);
    if (pathname === '/api/orders/status' && method === 'PUT') return await handleOrdersStatus(req, res, null);
    // /api/orders/:id/cancel (must be before generic :id route)
    const orderCancelMatch = pathname.match(/^\/api\/orders\/(ORD-\d+)\/cancel$/);
    if (orderCancelMatch && method === 'PUT') return await handleOrderCancel(req, res, orderCancelMatch[1]);
    // /api/orders/:id/request-delivery-confirmation
    const orderReqDeliveryMatch = pathname.match(/^\/api\/orders\/(ORD-\d+)\/request-delivery-confirmation$/);
    if (orderReqDeliveryMatch && method === 'POST') return await handleOrderRequestDeliveryConfirmation(req, res, orderReqDeliveryMatch[1]);
    // /api/orders/:id/confirm-delivery
    const orderConfirmDeliveryMatch = pathname.match(/^\/api\/orders\/(ORD-\d+)\/confirm-delivery$/);
    if (orderConfirmDeliveryMatch && method === 'POST') return await handleOrderConfirmDelivery(req, res, orderConfirmDeliveryMatch[1]);
    // /api/orders/:id/status
    const orderStatusMatch = pathname.match(/^\/api\/orders\/(ORD-\d+)\/status$/);
    if (orderStatusMatch && method === 'PUT') return await handleOrdersStatus(req, res, orderStatusMatch[1]);
    // /api/orders/:id/rate
    const orderRateMatch = pathname.match(/^\/api\/orders\/(ORD-\d+)\/rate$/);
    if (orderRateMatch && method === 'POST') return await handleOrderRate(req, res, orderRateMatch[1]);
    // /api/orders/:id
    const orderIdMatch = pathname.match(/^\/api\/orders\/(ORD-\d+)$/);
    if (orderIdMatch && method === 'GET') return await handleOrderById(req, res, orderIdMatch[1]);

    // ─── OFFLINE SALES routes ───
    if (pathname === '/api/offline-sales' && method === 'GET') return await handleOfflineSalesList(req, res);
    if (pathname === '/api/offline-sales' && method === 'POST') return await handleOfflineSalesCreate(req, res);

    // ─── CART routes ───
    if ((pathname === '/api/cart' || pathname === '/api/cart/get') && method === 'GET') return await handleCartGet(req, res);
    if (pathname === '/api/cart/add' && method === 'POST') return await handleCartAdd(req, res);
    if (pathname === '/api/cart/sync' && method === 'POST') return await handleCartSync(req, res);
    if (pathname === '/api/cart/remove' && method === 'DELETE') return await handleCartRemove(req, res);
    if (pathname === '/api/cart' && method === 'DELETE') return await handleCartClear(req, res);

    // ─── BILLS routes ───
    if (pathname === '/api/bills' && method === 'GET') return await handleBills(req, res);
    if (pathname === '/api/bills/generate' && method === 'POST') return await handleBillsGenerate(req, res, null);
    if (pathname === '/api/bills/download' && method === 'GET') return await handleBillsDownload(req, res);
    // /api/bills/generate/:orderId
    const billGenMatch = pathname.match(/^\/api\/bills\/generate\/(ORD-\d+)$/);
    if (billGenMatch && method === 'POST') return await handleBillsGenerate(req, res, billGenMatch[1]);

    // ─── DASHBOARD routes ───
    if (pathname === '/api/dashboard/stats' && method === 'GET') return await handleDashboardStats(req, res);
    if (pathname === '/api/dashboard/charts' && method === 'GET') return await handleDashboardCharts(req, res);

    // ─── NOTIFICATIONS routes ───
    if ((pathname === '/api/notifications' || pathname === '/api/notifications/list') && method === 'GET') return await handleNotificationsList(req, res);
    if (pathname === '/api/notifications/send' && method === 'POST') return await handleNotificationsSend(req, res);
    if (pathname === '/api/notifications/markread' && method === 'POST') return await handleNotificationsMarkRead(req, res, null);
    if (pathname === '/api/notifications/read-all' && method === 'PUT') return await handleNotificationsReadAll(req, res);
    // /api/notifications/:id/read
    const notifReadMatch = pathname.match(/^\/api\/notifications\/(NOTIF-\d+)\/read$/);
    if (notifReadMatch && method === 'PUT') return await handleNotificationsMarkRead(req, res, notifReadMatch[1]);

    // ─── PAYMENTS routes ───
    if (pathname === '/api/payments/stats' && method === 'GET') return await handlePaymentsStats(req, res);
    if (pathname === '/api/payments/online-history' && method === 'GET') return await handleOnlinePaymentHistory(req, res);
    if (pathname === '/api/payments/record' && method === 'POST') return await handlePaymentsRecord(req, res);
    if (pathname === '/api/payments/my-summary' && method === 'GET') return await handlePaymentSummary(req, res);
    if (pathname === '/api/payments/clear-request' && method === 'POST') return await handlePaymentClearRequest(req, res);
    if (pathname === '/api/payments/clear-requests' && method === 'GET') return await handlePaymentClearRequestsList(req, res);
    if (pathname === '/api/payments/outstanding' && method === 'GET') return await handlePaymentOutstanding(req, res);
    if (pathname === '/api/payments/all-history' && method === 'GET') return await handleAllPaymentHistory(req, res);
    // /api/payments/clear-request/:id
    const clearReqMatch = pathname.match(/^\/api\/payments\/clear-request\/(PREQ-\d+)$/);
    if (clearReqMatch && method === 'PUT') return await handlePaymentClearRequestAction(req, res, clearReqMatch[1]);
    // /api/payments/history/:customerId
    const payHistMatch = pathname.match(/^\/api\/payments\/history\/(USR-\d+)$/);
    if (payHistMatch && method === 'GET') return await handlePaymentsHistory(req, res, payHistMatch[1]);

    // ─── SETTINGS routes ───
    if (pathname === '/api/settings' && method === 'GET') return await handleSettingsGet(req, res);
    if (pathname === '/api/settings' && method === 'PUT') return await handleSettingsUpdate(req, res);

    // ─── CATEGORIES routes ───
    if (pathname === '/api/categories' && method === 'GET') return await handleCategoriesList(req, res);
    if (pathname === '/api/categories' && method === 'POST') return await handleCategoriesCreate(req, res);
    const catIdMatch = pathname.match(/^\/api\/categories\/(CAT-\d+)$/);
    if (catIdMatch && method === 'PUT') return await handleCategoriesUpdate(req, res, catIdMatch[1]);
    if (catIdMatch && method === 'DELETE') return await handleCategoriesDelete(req, res, catIdMatch[1]);

    // ─── SLIDERS routes ───
    if (pathname === '/api/sliders' && method === 'GET') return await handleSliders(req, res);
    if (pathname === '/api/sliders' && method === 'POST') return await handleSlidersAdd(req, res);
    const sliderIdMatch = pathname.match(/^\/api\/sliders\/(SLD-\d+)$/);
    if (sliderIdMatch && method === 'PUT') return await handleSliderUpdate(req, res, sliderIdMatch[1]);
    if (sliderIdMatch && method === 'DELETE') return await handleSliderDelete(req, res, sliderIdMatch[1]);

    // ─── WISHLIST routes ───
    if (pathname === '/api/wishlist' && method === 'GET') return await handleWishlistGet(req, res);
    if (pathname === '/api/wishlist/toggle' && method === 'POST') return await handleWishlistToggle(req, res);
    // /api/wishlist/check/:productId
    const wishlistCheckMatch = pathname.match(/^\/api\/wishlist\/check\/(.+)$/);
    if (wishlistCheckMatch && method === 'GET') return await handleWishlistCheck(req, res, wishlistCheckMatch[1]);

    // ─── SUPPLIERS routes ───
    if (pathname === '/api/suppliers' && method === 'GET') return await handleSuppliersGet(req, res);
    if (pathname === '/api/suppliers' && method === 'POST') return await handleSupplierAdd(req, res);
    if (pathname === '/api/suppliers/summary' && method === 'GET') return await handleSupplierSummary(req, res);
    const supMatch = pathname.match(/^\/api\/suppliers\/(SUP-\d+)$/);
    if (supMatch && method === 'PUT') return await handleSupplierUpdate(req, res, supMatch[1]);
    if (supMatch && method === 'DELETE') return await handleSupplierDelete(req, res, supMatch[1]);
    const supPurchMatch = pathname.match(/^\/api\/suppliers\/(SUP-\d+)\/purchases$/);
    if (supPurchMatch && method === 'GET') return await handleSupplierPurchasesGet(req, res, supPurchMatch[1]);
    if (supPurchMatch && method === 'POST') return await handleSupplierPurchaseAdd(req, res, supPurchMatch[1]);
    const supPayMatch = pathname.match(/^\/api\/suppliers\/(SUP-\d+)\/payments$/);
    if (supPayMatch && method === 'GET') return await handleSupplierPaymentsGet(req, res, supPayMatch[1]);
    if (supPayMatch && method === 'POST') return await handleSupplierPaymentAdd(req, res, supPayMatch[1]);

    // ─── COUPONS routes ───
    if (pathname === '/api/coupons' && method === 'GET') return await handleCouponsList(req, res);
    if (pathname === '/api/coupons' && method === 'POST') return await handleCouponsCreate(req, res);
    if (pathname === '/api/coupons/apply' && method === 'POST') return await handleCouponsApply(req, res);
    // /api/coupons/:id
    const couponIdMatch = pathname.match(/^\/api\/coupons\/(CPN-\d+)$/);
    if (couponIdMatch && method === 'PUT') return await handleCouponsUpdate(req, res, couponIdMatch[1]);
    if (couponIdMatch && method === 'DELETE') return await handleCouponsDelete(req, res, couponIdMatch[1]);

    // ─── API root ───
    if (pathname === '/api' || pathname === '/' || pathname === '') {
      return success(res, { name: 'Cold Drinks Shop API', version: '2.0.0' }, 'Cold Drinks Shop API is running');
    }

    // 404
    error(res, `Endpoint not found: ${pathname}`, 404);
  } catch (e) {
    console.error(`Error handling ${method} ${pathname}:`, e);
    error(res, 'Internal server error', 500);
  }
});

// ─── Start Server (load Firestore first) ────────────────────────────────────

preloadJSONFallbackCache();

withTimeout(initFirestore(), 5000, 'Firestore init').then(() => {
  server.listen(PORT, () => {
    console.log(`Cold Drinks Shop API Server running on http://localhost:${PORT}`);
    console.log(`Database: Firestore (noor-coldrinks) | Cache: in-memory`);
  });
}).catch(err => {
  console.error('Firestore init failed:', err.message);
  console.log('Starting with JSON fallback...');
  server.listen(PORT, () => {
    console.log(`Cold Drinks Shop API Server running on http://localhost:${PORT}`);
    console.log(`Database: JSON files (Firestore unavailable)`);
    console.log(`Database directory: ${DB_DIR}`);
  });
});
