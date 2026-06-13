/**
 * One-shot: rebuild the migration mapping by diffing the pre-migration backup
 * against the current DB, then rewrite snapshots (cart/orders/bills/inventoryMovements)
 * using that reconstructed mapping. Idempotent + Firestore-aware.
 *
 * Usage:
 *   node backend/scripts/rewrite-snapshots-from-backup.js --dry-run
 *   node backend/scripts/rewrite-snapshots-from-backup.js
 *
 * Why this exists: the original migration-mapping.json was overwritten by a
 * later script run, so the on-disk mapping no longer contains the old-fileId →
 * new-public_id pairs needed to fix legacy cart/orders/bills snapshot URLs.
 */

const fs = require('fs');
const path = require('path');

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

const admin = require('firebase-admin');
let fsDb = null;
try {
  let svc;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  else if (fs.existsSync(path.join(__dirname, '..', 'service-account.json'))) svc = require(path.join(__dirname, '..', 'service-account.json'));
  if (svc) {
    admin.initializeApp({ credential: admin.credential.cert(svc) });
    fsDb = admin.firestore();
    console.log('Firestore initialized');
  }
} catch (e) { console.warn('Firestore init failed:', e.message); }

const DRY_RUN = process.argv.includes('--dry-run');
const DB_DIR = path.join(__dirname, '..', 'database');
const BACKUP_DIR = path.join(__dirname, '..', 'database.backup-pre-migration-2026-06-13');

function readJson(dir, file) {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(dir, file, data) {
  if (DRY_RUN) return;
  fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

function isDriveUrl(s) {
  return typeof s === 'string' && (s.includes('lh3.googleusercontent.com') || s.startsWith('/api/drive/files/'));
}

// Build mapping by walking backup+current side by side.
function buildMapping() {
  const mapping = {};
  // products
  const oldP = readJson(BACKUP_DIR, 'products.json') || [];
  const newP = readJson(DB_DIR, 'products.json') || [];
  const newById = new Map(newP.map(p => [p.id, p]));
  for (const oldProd of oldP) {
    const cur = newById.get(oldProd.id);
    if (!cur) continue;
    if (oldProd.image && isDriveUrl(oldProd.image) && cur.image && !isDriveUrl(cur.image)) {
      mapping[oldProd.image] = cur.image;
    }
    if (Array.isArray(oldProd.images) && Array.isArray(cur.images)) {
      for (let i = 0; i < Math.min(oldProd.images.length, cur.images.length); i++) {
        // Prefer `image` field (main) when the same Drive URL exists in both —
        // it's the semantically canonical asset (gallery-N is the dedup duplicate).
        if (isDriveUrl(oldProd.images[i]) && !isDriveUrl(cur.images[i]) && !mapping[oldProd.images[i]]) {
          mapping[oldProd.images[i]] = cur.images[i];
        }
      }
    }
    if (Array.isArray(oldProd.variants) && Array.isArray(cur.variants)) {
      for (let v = 0; v < Math.min(oldProd.variants.length, cur.variants.length); v++) {
        const ov = oldProd.variants[v], cv = cur.variants[v];
        if (ov?.image && isDriveUrl(ov.image) && cv?.image && !isDriveUrl(cv.image)) {
          mapping[ov.image] = cv.image;
        }
      }
    }
  }
  // sliders
  const oldS = readJson(BACKUP_DIR, 'sliders.json') || [];
  const newS = readJson(DB_DIR, 'sliders.json') || [];
  const newSliderById = new Map(newS.map(s => [s.id, s]));
  for (const old of oldS) {
    const cur = newSliderById.get(old.id);
    if (cur && old.image && isDriveUrl(old.image) && cur.image && !isDriveUrl(cur.image)) {
      mapping[old.image] = cur.image;
    }
  }
  // settings
  const oldSet = readJson(BACKUP_DIR, 'settings.json') || {};
  const newSet = readJson(DB_DIR, 'settings.json') || {};
  for (const field of ['logo', 'favicon', 'paymentQr']) {
    if (oldSet[field] && isDriveUrl(oldSet[field]) && newSet[field] && !isDriveUrl(newSet[field])) {
      mapping[oldSet[field]] = newSet[field];
    }
  }
  return mapping;
}

async function rewriteSnapshotFile(file, mapping, collection, idField) {
  const data = readJson(DB_DIR, file);
  if (!Array.isArray(data)) return { rewritten: 0, recordsTouched: 0 };
  let rewritten = 0;
  const touched = [];
  for (const record of data) {
    const items = record.items || [];
    let changed = false;
    for (const item of items) {
      if (item.image && mapping[item.image]) {
        item.image = mapping[item.image];
        rewritten++;
        changed = true;
      }
    }
    if (changed) touched.push(record);
  }
  writeJson(DB_DIR, file, data);
  if (fsDb && !DRY_RUN) {
    for (const record of touched) {
      const docId = record[idField] || record.id || record.userId;
      if (!docId) continue;
      try { await fsDb.collection(collection).doc(String(docId)).set(record, { merge: true }); }
      catch (e) { console.warn(`[firestore] ${collection}/${docId} failed:`, e.message); }
    }
  }
  return { rewritten, recordsTouched: touched.length };
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  if (!fs.existsSync(BACKUP_DIR)) {
    console.error(`Backup dir not found: ${BACKUP_DIR}`);
    process.exit(1);
  }
  const mapping = buildMapping();
  console.log(`\nReconstructed mapping (${Object.keys(mapping).length} entries):`);
  for (const [k, v] of Object.entries(mapping)) {
    console.log(`  ${k.substring(0, 70)}${k.length > 70 ? '...' : ''} → ${v}`);
  }
  if (Object.keys(mapping).length === 0) {
    console.log('No mappings to apply. Exiting.');
    return;
  }

  console.log('\nRewriting snapshots:');
  const targets = [
    ['orders.json',             'orders',             'id'],
    ['bills.json',              'bills',              'id'],
    ['cart.json',               'cart',               'userId'],
    ['inventoryMovements.json', 'inventoryMovements', 'id'],
  ];
  let totalRewritten = 0, totalRecords = 0;
  for (const [file, coll, idField] of targets) {
    const { rewritten, recordsTouched } = await rewriteSnapshotFile(file, mapping, coll, idField);
    console.log(`  ${file}: ${rewritten} URLs rewritten across ${recordsTouched} records`);
    totalRewritten += rewritten;
    totalRecords += recordsTouched;
  }
  console.log(`\n=== ${totalRewritten} URLs rewritten across ${totalRecords} records ===`);
  if (DRY_RUN) console.log('(DRY-RUN — no writes performed)');
}

main().catch(e => { console.error('crashed:', e); process.exit(1); });
