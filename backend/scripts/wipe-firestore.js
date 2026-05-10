/**
 * Selective Firestore wipe.
 *
 * Deletes ALL documents from every data collection EXCEPT:
 *   - settings (entire collection preserved — site config, theme, payment QR)
 *   - users: keeps only the admin doc (USR-001)
 *
 * Also resets the corresponding backend/database/*.json fallback files so
 * the JSON cache stays consistent with Firestore.
 *
 * Usage:
 *   cd backend && node scripts/wipe-firestore.js
 *
 * Safety: prints audit + 5-second countdown (Ctrl+C aborts).
 */

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const sa = require(path.join(__dirname, '..', 'service-account.json'));

admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'noor-coldrinks' });
const db = admin.firestore();

const ADMIN_USER_ID = 'USR-001';
const PRESERVE_COLLECTIONS = new Set(['settings']);

const ALL_COLLECTIONS = [
  'users',
  'products',
  'orders',
  'cart',
  'bills',
  'categories',
  'coupons',
  'paymentHistory',
  'paymentRequests',
  'sliders',
  'wishlist',
  'offlineSales',
  'inventoryMovements',
  'notifications',
  'suppliers',
  'supplierPurchases',
  'supplierPayments',
  'settings',
];

const DB_DIR = path.join(__dirname, '..', 'database');

function jsonFilenameFor(coll) {
  // Match the snake-cased filenames already in backend/database/
  const map = {
    paymentHistory: 'payment-history.json',
    paymentRequests: 'payment-requests.json',
    offlineSales: 'offline-sales.json',
    inventoryMovements: 'inventory-movements.json',
    supplierPurchases: 'supplier-purchases.json',
    supplierPayments: 'supplier-payments.json',
  };
  return map[coll] || `${coll}.json`;
}

async function deleteCollectionExcept(coll, keepDocId) {
  const collRef = db.collection(coll);
  let deleted = 0;
  while (true) {
    const snap = await collRef.limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    let batchHadWork = false;
    for (const doc of snap.docs) {
      if (keepDocId && doc.id === keepDocId) continue;
      batch.delete(doc.ref);
      batchHadWork = true;
    }
    if (!batchHadWork) break; // remaining docs are all keep-docs
    await batch.commit();
    deleted += snap.docs.filter((d) => d.id !== keepDocId).length;
    if (snap.size < 500) break;
  }
  return deleted;
}

async function audit() {
  const out = [];
  for (const c of ALL_COLLECTIONS) {
    const snap = await db.collection(c).get();
    const keep = (c === 'users') ? snap.docs.filter((d) => d.id === ADMIN_USER_ID).length : 0;
    const willDelete = PRESERVE_COLLECTIONS.has(c) ? 0 : (snap.size - keep);
    out.push({ name: c, total: snap.size, willDelete, keep, preserved: PRESERVE_COLLECTIONS.has(c) });
  }
  return out;
}

function countdown(sec) {
  return new Promise((resolve) => {
    let i = sec;
    const tick = () => {
      if (i <= 0) { process.stdout.write('\rStarting deletion...        \n'); resolve(); return; }
      process.stdout.write(`\rDeleting in ${i}s ... press Ctrl+C to cancel `);
      i--;
      setTimeout(tick, 1000);
    };
    tick();
  });
}

(async () => {
  console.log('\n=== Firestore Selective Wipe ===\n');

  const plan = await audit();

  console.log('Collection              Total    Delete    Keep    Note');
  console.log('---------------------- ------- --------- ------- ------------------');
  let totalToDelete = 0;
  for (const p of plan) {
    const note = p.preserved ? '(preserved)' : (p.name === 'users' ? '(keep admin USR-001)' : '');
    console.log(
      p.name.padEnd(22),
      String(p.total).padStart(6),
      String(p.willDelete).padStart(9),
      String(p.keep).padStart(7),
      ' ' + note
    );
    totalToDelete += p.willDelete;
  }

  if (totalToDelete === 0) {
    console.log('\nNothing to delete. Exiting.');
    process.exit(0);
  }

  console.log(`\n⚠️  About to permanently delete ${totalToDelete} Firestore documents.`);
  console.log('Admin user (USR-001) and settings/app will be preserved.');
  console.log('Local JSON fallback caches will be reset to match.\n');
  await countdown(5);

  let totalDeleted = 0;
  for (const p of plan) {
    if (p.preserved) continue;
    if (p.willDelete === 0) {
      console.log(`  ${p.name}: nothing to delete`);
      continue;
    }
    const keepId = (p.name === 'users') ? ADMIN_USER_ID : null;
    const deleted = await deleteCollectionExcept(p.name, keepId);
    totalDeleted += deleted;
    console.log(`  ${p.name}: deleted ${deleted}`);

    // Reset local JSON fallback cache
    const jsonFile = path.join(DB_DIR, jsonFilenameFor(p.name));
    if (fs.existsSync(jsonFile)) {
      try {
        if (p.name === 'users') {
          // Keep just the admin doc in the JSON cache
          const adminDoc = await db.collection('users').doc(ADMIN_USER_ID).get();
          if (adminDoc.exists) {
            fs.writeFileSync(jsonFile, JSON.stringify([adminDoc.data()], null, 2));
            console.log(`     local cache: ${path.basename(jsonFile)} reset (kept admin)`);
          }
        } else {
          fs.writeFileSync(jsonFile, '[]');
          console.log(`     local cache: ${path.basename(jsonFile)} reset to []`);
        }
      } catch (err) {
        console.warn(`     local cache write failed: ${err.message}`);
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Total Firestore docs deleted: ${totalDeleted}`);
  console.log('settings/app preserved.');
  console.log('users/USR-001 (admin) preserved.\n');
  console.log('Restart the backend so it reloads the JSON cache:');
  console.log('  npm start');
  process.exit(0);
})().catch((err) => {
  console.error('\nWipe failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
