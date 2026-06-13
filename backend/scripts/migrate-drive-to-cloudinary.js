/**
 * One-time migration: Google Drive → Cloudinary.
 *
 * Scans products, sliders, settings (and order/bill snapshots if --snapshots),
 * downloads each Drive-hosted image, re-uploads to Cloudinary, updates the
 * DB reference, and logs the mapping.
 *
 * Usage:
 *   node backend/scripts/migrate-drive-to-cloudinary.js --dry-run
 *   node backend/scripts/migrate-drive-to-cloudinary.js          # real run
 *   node backend/scripts/migrate-drive-to-cloudinary.js --snapshots  # also rewrite order/bill snapshots
 *
 * Safety:
 *   - Resumable: per-image DB write so a crash leaves remaining work for next run
 *   - Idempotent: skips images already migrated (public_id starts with colddrinks/)
 *   - Failure log: backend/migration-failures.json — failed items can be retried
 *   - Pre-flight: backups database/ to database.backup-pre-migration/ before any write
 *
 * Pre-requisites:
 *   - Drive credentials must still be valid (the script downloads from Drive)
 *   - Cloudinary credentials must be set in .env
 *
 * IMPORTANT: This script is NOT auto-run during deploy. It's manual after CL-5
 * verification window (per plan). Run during off-peak hours.
 */

const fs = require('fs');
const path = require('path');

// Load env first
(function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!k || process.env[k] !== undefined) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
})();

const driveHelper = require('../helpers/drive');
const cloudinaryHelper = require('../helpers/cloudinary');
const https = require('https');
const http = require('http');

// Firestore Admin SDK — writes products/sliders/settings back to Firestore so
// the running backend (which reads Firestore on boot) picks up migrated URLs.
const admin = require('firebase-admin');
let fsDb = null;
try {
  let svcAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    svcAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else if (fs.existsSync(path.join(__dirname, '..', 'service-account.json'))) {
    svcAccount = require(path.join(__dirname, '..', 'service-account.json'));
  }
  if (svcAccount) {
    admin.initializeApp({ credential: admin.credential.cert(svcAccount) });
    fsDb = admin.firestore();
    console.log('Firestore admin initialized — migrations will sync to Firestore');
  } else {
    console.warn('Firestore service account missing — migrations will only update JSON files');
  }
} catch (e) {
  console.warn('Firestore init failed:', e.message);
}

async function syncDocToFirestore(collection, docId, data) {
  if (!fsDb || DRY_RUN) return;
  try {
    await fsDb.collection(collection).doc(docId).set(data, { merge: true });
  } catch (err) {
    console.warn(`[firestore] sync failed ${collection}/${docId}:`, err.message);
  }
}

// Fallback HTTP fetcher — works when Drive OAuth is dead but files are public.
// Returns { buffer, contentType } or throws.
function httpFetch(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https://') ? https : http;
    lib.get(url, (res) => {
      // Handle redirects (lh3 sometimes redirects)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectCount < 5) {
        return resolve(httpFetch(res.headers.location, redirectCount + 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: res.headers['content-type'] || 'application/octet-stream',
      }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const DB_DIR = path.join(__dirname, '..', 'database');
const BACKUP_DIR = path.join(__dirname, '..', `database.backup-pre-migration-${new Date().toISOString().slice(0, 10)}`);
const FAILURE_LOG = path.join(__dirname, '..', 'migration-failures.json');
const MAPPING_LOG = path.join(__dirname, '..', 'migration-mapping.json');

const DRY_RUN = process.argv.includes('--dry-run');
const INCLUDE_SNAPSHOTS = process.argv.includes('--snapshots');

const driveIdRegex = /^[A-Za-z0-9_\-]{20,}$/;

function extractFileId(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const proxy = ref.match(/\/api\/drive\/files\/([A-Za-z0-9_\-]+)/i);
  if (proxy) return proxy[1];
  const lh3 = ref.match(/lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_\-]+)/i);
  if (lh3) return lh3[1];
  if (driveIdRegex.test(ref) && !ref.includes('/') && !ref.includes(':')) return ref;
  return null;
}

function isAlreadyCloudinary(ref) {
  if (!ref || typeof ref !== 'string') return false;
  return ref.startsWith('colddrinks/') || ref.includes('res.cloudinary.com');
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function fetchSourceImage(ref, fileId) {
  // Strategy 1: Drive OAuth (if token valid)
  try {
    const dl = await driveHelper.downloadFile(fileId);
    const buffer = await streamToBuffer(dl.stream);
    return { buffer, contentType: dl.contentType || 'image/jpeg', source: 'drive-oauth' };
  } catch (oauthErr) {
    // Fall through to public URL fetch
  }
  // Try multiple public Google URL formats; reject HTML responses.
  const candidateUrls = [
    `https://lh3.googleusercontent.com/d/${fileId}=s2048`,                     // explicit large size
    `https://lh3.googleusercontent.com/d/${fileId}`,                            // default
    `https://drive.google.com/uc?export=view&id=${fileId}`,                     // alternate viewer
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w2048`,                 // thumbnail w/ size hint
  ];
  if (ref.startsWith('http') && !candidateUrls.includes(ref)) candidateUrls.unshift(ref);

  let lastErr;
  for (const url of candidateUrls) {
    try {
      const result = await httpFetch(url);
      if (result.contentType && result.contentType.startsWith('text/')) {
        lastErr = new Error(`${url} returned HTML (${result.contentType})`);
        continue;
      }
      return { ...result, source: `public:${url.substring(0, 60)}` };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`all fetch strategies failed for ${fileId}: ${lastErr && lastErr.message}`);
}

async function migrateOne(ref, folderName, filenameHint) {
  if (!ref) return ref;
  if (isAlreadyCloudinary(ref)) return ref;
  const fileId = extractFileId(ref);
  if (!fileId) return ref;

  if (DRY_RUN) {
    console.log(`  [dry-run] would migrate ${fileId} → ${folderName}/${filenameHint}`);
    return `colddrinks/${folderName}/${filenameHint}-<dryrun>`;
  }

  const src = await fetchSourceImage(ref, fileId);
  console.log(`  [${src.source}] fetched ${src.buffer.length}B for ${fileId}`);
  const uploaded = await cloudinaryHelper.uploadBuffer({
    buffer: src.buffer,
    mimeType: src.contentType,
    filename: filenameHint,
    folderName,
  });
  return uploaded.id;
}

function readJson(file) {
  const p = path.join(DB_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(file, data) {
  if (DRY_RUN) return;
  const p = path.join(DB_DIR, file);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function backupDb() {
  if (DRY_RUN) return;
  if (fs.existsSync(BACKUP_DIR)) {
    console.log(`Backup already exists at ${BACKUP_DIR}`);
    return;
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  for (const f of fs.readdirSync(DB_DIR)) {
    fs.copyFileSync(path.join(DB_DIR, f), path.join(BACKUP_DIR, f));
  }
  console.log(`Backup → ${BACKUP_DIR}`);
}

async function migrateProducts() {
  const products = readJson('products.json') || [];
  let migrated = 0;
  const failures = [];
  const mapping = {};

  // Dedup cache: same source fileId → reuse same Cloudinary public_id instead
  // of re-uploading. Prevents the bug that left 6 duplicate assets pre-F8 fix.
  const sourceToPublicId = new Map();
  async function migrateRef(ref, folderName, filenameHint) {
    const fileId = extractFileId(ref);
    if (fileId && sourceToPublicId.has(fileId)) {
      const cached = sourceToPublicId.get(fileId);
      console.log(`  [dedup] reusing ${cached} for ${fileId}`);
      return cached;
    }
    const newRef = await migrateOne(ref, folderName, filenameHint);
    if (fileId && newRef && newRef !== ref) sourceToPublicId.set(fileId, newRef);
    return newRef;
  }

  for (const product of products) {
    const slug = (product.id || product.name || 'product').toString().replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    try {
      if (product.image && !isAlreadyCloudinary(product.image)) {
        const newRef = await migrateRef(product.image, 'products', `${slug}-main`);
        mapping[product.image] = newRef;
        product.image = newRef;
        migrated++;
      }
      if (Array.isArray(product.images)) {
        for (let i = 0; i < product.images.length; i++) {
          if (!isAlreadyCloudinary(product.images[i])) {
            const newRef = await migrateRef(product.images[i], 'products', `${slug}-gallery-${i + 1}`);
            mapping[product.images[i]] = newRef;
            product.images[i] = newRef;
            migrated++;
          }
        }
      }
      if (Array.isArray(product.variants)) {
        for (const v of product.variants) {
          if (v.image && !isAlreadyCloudinary(v.image)) {
            const fSlug = (v.flavor || v.variantId || '').toString().replace(/[^a-z0-9]+/gi, '-').toLowerCase();
            const newRef = await migrateRef(v.image, 'products', `${slug}-variant-${v.variantId || 'x'}-${fSlug}`);
            mapping[v.image] = newRef;
            v.image = newRef;
            migrated++;
          }
          // F9: variant gallery array (formerly skipped — added 2026-06-13)
          if (Array.isArray(v.images)) {
            const fSlug = (v.flavor || v.variantId || '').toString().replace(/[^a-z0-9]+/gi, '-').toLowerCase();
            for (let j = 0; j < v.images.length; j++) {
              if (!isAlreadyCloudinary(v.images[j])) {
                const newRef = await migrateRef(v.images[j], 'products', `${slug}-variant-${v.variantId || 'x'}-${fSlug}-gallery-${j + 1}`);
                mapping[v.images[j]] = newRef;
                v.images[j] = newRef;
                migrated++;
              }
            }
          }
        }
      }
      // Persist after each product so a crash leaves us resumable
      writeJson('products.json', products);
      await syncDocToFirestore('products', product.id, product);
      console.log(`✓ ${product.id} migrated`);
    } catch (err) {
      console.error(`✗ ${product.id} failed:`, err.message);
      failures.push({ collection: 'products', id: product.id, error: err.message });
    }
  }
  return { migrated, failures, mapping };
}

async function migrateSliders() {
  const sliders = readJson('sliders.json') || [];
  let migrated = 0;
  const failures = [];
  const mapping = {};
  for (const s of sliders) {
    try {
      if (s.image && !isAlreadyCloudinary(s.image)) {
        const slug = (s.title || s.id || 'slider').toString().replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const newRef = await migrateOne(s.image, 'sliders', slug);
        mapping[s.image] = newRef;
        s.image = newRef;
        migrated++;
      }
      writeJson('sliders.json', sliders);
      await syncDocToFirestore('sliders', s.id, s);
      console.log(`✓ slider ${s.id} migrated`);
    } catch (err) {
      console.error(`✗ slider ${s.id} failed:`, err.message);
      failures.push({ collection: 'sliders', id: s.id, error: err.message });
    }
  }
  return { migrated, failures, mapping };
}

async function migrateSettings() {
  const settings = readJson('settings.json');
  if (!settings) return { migrated: 0, failures: [], mapping: {} };
  const mapping = {};
  let migrated = 0;
  const failures = [];
  for (const field of ['logo', 'favicon', 'paymentQr']) {
    try {
      if (settings[field] && !isAlreadyCloudinary(settings[field])) {
        const folder = field === 'paymentQr' ? 'payment-qr' : (field === 'favicon' ? 'favicons' : 'logos');
        const newRef = await migrateOne(settings[field], folder, `site-${field}`);
        mapping[settings[field]] = newRef;
        settings[field] = newRef;
        migrated++;
        console.log(`✓ settings.${field} migrated`);
      }
    } catch (err) {
      console.error(`✗ settings.${field} failed:`, err.message);
      failures.push({ collection: 'settings', field, error: err.message });
    }
  }
  writeJson('settings.json', settings);
  if (fsDb && !DRY_RUN) {
    try { await fsDb.collection('settings').doc('app').set(settings, { merge: true }); }
    catch (e) { console.warn('[firestore] settings sync failed:', e.message); }
  }
  return { migrated, failures, mapping };
}

async function rewriteSnapshots(mapping) {
  if (!INCLUDE_SNAPSHOTS) return { rewritten: 0 };
  console.log('\nRewriting snapshot URLs in orders/bills/cart/inventoryMovements...');
  // Merge in the persistent mapping log from prior runs so snapshots can be
  // rewritten even when products were already migrated (current run's `mapping`
  // would otherwise be empty for already-migrated assets).
  if (fs.existsSync(MAPPING_LOG)) {
    try {
      const prior = JSON.parse(fs.readFileSync(MAPPING_LOG, 'utf8'));
      for (const [k, v] of Object.entries(prior)) {
        if (!mapping[k]) mapping[k] = v;
      }
      console.log(`  [snapshot] merged ${Object.keys(prior).length} entries from prior mapping log`);
    } catch (e) {
      console.warn('  [snapshot] failed to load prior mapping log:', e.message);
    }
  }
  let rewritten = 0;
  // File → (Firestore collection, doc-id field). Snapshot collections need
  // per-record sync so the rewrite survives backend boot (otherwise Firestore
  // would overwrite the rewritten JSON on next load — F10 fix).
  const SNAPSHOT_COLLECTIONS = {
    'orders.json':             { collection: 'orders',             idField: 'id' },
    'bills.json':              { collection: 'bills',              idField: 'id' },
    'cart.json':               { collection: 'cart',               idField: 'userId' },
    'inventoryMovements.json': { collection: 'inventoryMovements', idField: 'id' },
  };
  for (const file of Object.keys(SNAPSHOT_COLLECTIONS)) {
    const data = readJson(file);
    if (!data) continue;
    const list = Array.isArray(data) ? data : (data.items || []);
    const touched = new Set();
    for (let r = 0; r < list.length; r++) {
      const record = list[r];
      const items = record.items || [];
      let recordChanged = false;
      for (const item of items) {
        if (item.image && mapping[item.image]) {
          item.image = mapping[item.image];
          rewritten++;
          recordChanged = true;
        }
      }
      if (recordChanged) touched.add(r);
    }
    writeJson(file, data);
    // F10: sync touched records to Firestore so the rewrite persists on next boot.
    if (fsDb && !DRY_RUN && touched.size > 0) {
      const { collection, idField } = SNAPSHOT_COLLECTIONS[file];
      for (const idx of touched) {
        const record = list[idx];
        const docId = record[idField] || record.id || record.userId;
        if (docId) {
          try { await fsDb.collection(collection).doc(String(docId)).set(record, { merge: true }); }
          catch (e) { console.warn(`[firestore] ${collection}/${docId} sync failed:`, e.message); }
        }
      }
    }
  }
  console.log(`✓ ${rewritten} snapshot URLs rewritten`);
  return { rewritten };
}

async function main() {
  console.log(`\n=== Drive → Cloudinary Migration ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'REAL RUN'}`);
  console.log(`Snapshots: ${INCLUDE_SNAPSHOTS ? 'YES (orders/bills/cart)' : 'NO (products/sliders/settings only)'}`);
  console.log('');

  // Pre-flight: backup
  backupDb();

  // Drive health check — soft check, script falls back to public lh3 URLs if OAuth dead
  const driveHealth = await driveHelper.health();
  if (driveHealth.ok) {
    console.log(`Drive auth OK (${driveHealth.account})`);
  } else {
    console.warn(`Drive OAuth FAILED (${driveHealth.error}) — will fall back to public lh3 URL fetch`);
  }

  // Cloudinary health check
  const cloudHealth = await cloudinaryHelper.health();
  if (!cloudHealth.ok) {
    console.error('Cloudinary auth failed:', cloudHealth.error);
    process.exit(1);
  }
  console.log(`Cloudinary auth OK (cloud: ${cloudHealth.cloudName})`);

  console.log('\n--- Migrating products ---');
  const products = await migrateProducts();
  console.log('\n--- Migrating sliders ---');
  const sliders = await migrateSliders();
  console.log('\n--- Migrating settings ---');
  const settings = await migrateSettings();

  const allMapping = { ...products.mapping, ...sliders.mapping, ...settings.mapping };
  const allFailures = [...products.failures, ...sliders.failures, ...settings.failures];

  const snapshots = await rewriteSnapshots(allMapping);

  // Persist mapping + failures
  if (!DRY_RUN) {
    fs.writeFileSync(MAPPING_LOG, JSON.stringify(allMapping, null, 2));
    if (allFailures.length > 0) fs.writeFileSync(FAILURE_LOG, JSON.stringify(allFailures, null, 2));
  }

  console.log('\n=== Summary ===');
  console.log(`Products: ${products.migrated} migrated, ${products.failures.length} failures`);
  console.log(`Sliders:  ${sliders.migrated} migrated, ${sliders.failures.length} failures`);
  console.log(`Settings: ${settings.migrated} migrated, ${settings.failures.length} failures`);
  if (INCLUDE_SNAPSHOTS) console.log(`Snapshots rewritten: ${snapshots.rewritten}`);
  console.log(`\nMapping log: ${MAPPING_LOG}`);
  if (allFailures.length > 0) console.log(`Failure log: ${FAILURE_LOG} — investigate + re-run`);
  console.log(DRY_RUN ? '\n(DRY RUN — no DB modifications written)' : '\nMigration complete.');
  process.exit(allFailures.length > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error('Migration crashed:', err);
  process.exit(1);
});
