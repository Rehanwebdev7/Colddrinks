/**
 * Monthly cleanup: find Cloudinary assets not referenced in DB, optionally delete them.
 *
 * Usage:
 *   node backend/scripts/cleanup-orphan-cloudinary.js           # dry-run (list only)
 *   node backend/scripts/cleanup-orphan-cloudinary.js --apply   # actually delete
 *
 * What's an orphan?
 *   - Cloudinary asset under `colddrinks/` root folder
 *   - public_id NOT found in any product/slider/settings record
 *   - Typically caused by:
 *     - Admin uploaded image then cancelled form (no save)
 *     - Server crash between Cloudinary upload and DB write
 *     - Manual asset upload via Cloudinary dashboard
 *
 * Safety:
 *   - Default is dry-run (list only)
 *   - --apply requires explicit flag
 *   - 7-day age filter: only deletes assets older than 7 days (protects in-flight uploads)
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

const cloudinary = require('cloudinary').v2;
const cloudinaryHelper = require('../helpers/cloudinary');

const APPLY = process.argv.includes('--apply');
const ROOT_FOLDER = cloudinaryHelper.ROOT_FOLDER || 'colddrinks';
const MIN_AGE_DAYS = 7;
const DB_DIR = path.join(__dirname, '..', 'database');

function readJson(file) {
  const p = path.join(DB_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function collectAllPublicIdsInUse() {
  const inUse = new Set();
  const add = (ref) => {
    if (!ref || typeof ref !== 'string') return;
    if (ref.startsWith(`${ROOT_FOLDER}/`)) inUse.add(ref);
    // Also handle URL form
    const extracted = cloudinaryHelper.extractPublicId(ref);
    if (extracted) inUse.add(extracted);
  };

  // Products
  const products = readJson('products.json') || [];
  for (const p of products) {
    add(p.image);
    if (Array.isArray(p.images)) p.images.forEach(add);
    if (Array.isArray(p.variants)) {
      for (const v of p.variants) {
        add(v.image);
        if (Array.isArray(v.images)) v.images.forEach(add);
      }
    }
  }
  // Sliders
  const sliders = readJson('sliders.json') || [];
  for (const s of sliders) add(s.image);
  // Settings
  const settings = readJson('settings.json');
  if (settings) {
    add(settings.logo);
    add(settings.favicon);
    add(settings.paymentQr);
  }
  // Snapshots in orders/bills (optional — keeps snapshot integrity)
  for (const f of ['orders.json', 'bills.json', 'cart.json']) {
    const data = readJson(f);
    if (!Array.isArray(data)) continue;
    for (const rec of data) {
      const items = rec.items || [];
      for (const it of items) add(it.image);
    }
  }
  return inUse;
}

async function listAllCloudinaryAssets() {
  const all = [];
  let nextCursor;
  do {
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: ROOT_FOLDER + '/',
      max_results: 500,
      next_cursor: nextCursor,
    });
    all.push(...result.resources);
    nextCursor = result.next_cursor;
  } while (nextCursor);
  return all;
}

async function main() {
  console.log(`=== Cloudinary Orphan Cleanup ===`);
  console.log(`Mode: ${APPLY ? 'APPLY (DELETE)' : 'DRY-RUN (list only)'}`);
  console.log(`Root folder: ${ROOT_FOLDER}/`);
  console.log(`Min age: ${MIN_AGE_DAYS} days\n`);

  const inUse = collectAllPublicIdsInUse();
  console.log(`References in DB: ${inUse.size} public_ids`);

  const all = await listAllCloudinaryAssets();
  console.log(`Assets in Cloudinary: ${all.length}\n`);

  const ageCutoff = Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
  const orphans = [];

  for (const asset of all) {
    if (inUse.has(asset.public_id)) continue;
    const createdAt = new Date(asset.created_at).getTime();
    if (createdAt > ageCutoff) {
      console.log(`· skip (too new): ${asset.public_id} (created ${asset.created_at})`);
      continue;
    }
    orphans.push(asset);
    console.log(`· orphan: ${asset.public_id} (${Math.round(asset.bytes/1024)}KB, created ${asset.created_at})`);
  }

  console.log(`\n=== ${orphans.length} orphans found ===`);

  if (!APPLY) {
    console.log('Dry-run: nothing deleted. Re-run with --apply to delete.');
    return;
  }

  if (orphans.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  const ids = orphans.map(o => o.public_id);
  console.log(`\nDeleting ${ids.length} orphans...`);
  const result = await cloudinaryHelper.deleteFiles(ids);
  console.log('Result:', result);
  console.log('\nCleanup complete.');
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
