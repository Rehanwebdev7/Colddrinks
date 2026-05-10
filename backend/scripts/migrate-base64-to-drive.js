/**
 * One-shot migration: scan Firestore products + sliders + settings for
 * `data:image/...` base64 image data and re-upload to Drive, replacing
 * the field with the public lh3 URL.
 *
 * Idempotent — re-running is safe; it only touches docs that still have
 * base64 content.
 *
 * Run from repo root:
 *   cd backend && node scripts/migrate-base64-to-drive.js
 */

const path = require('path');
const admin = require('firebase-admin');
const sa = require(path.join(__dirname, '..', 'service-account.json'));
const driveHelper = require(path.join(__dirname, '..', 'helpers', 'drive'));

admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'noor-coldrinks' });
const db = admin.firestore();

function isBase64Image(s) {
  return typeof s === 'string' && s.startsWith('data:image/');
}

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

async function uploadOne({ dataUrl, folderName, baseName }) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error('Invalid data URL');
  const ext = (parsed.mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const filename = `${baseName}_${Date.now()}.${ext}`;
  const { id } = await driveHelper.uploadBuffer({
    buffer: parsed.buffer,
    mimeType: parsed.mimeType,
    filename,
    folderName,
  });
  return `https://lh3.googleusercontent.com/d/${id}`;
}

async function migrateProducts() {
  const snap = await db.collection('products').get();
  let touched = 0, scanned = 0;

  for (const doc of snap.docs) {
    scanned++;
    const data = doc.data();
    const update = {};

    // Single `image` field
    if (isBase64Image(data.image)) {
      const url = await uploadOne({
        dataUrl: data.image,
        folderName: 'products',
        baseName: `product_${(data.name || doc.id).replace(/\s+/g, '_')}_main`,
      });
      update.image = url;
      console.log(`  [${doc.id}] image -> ${url}`);
    }

    // `images` array
    if (Array.isArray(data.images)) {
      const newImages = [];
      let arrChanged = false;
      for (let i = 0; i < data.images.length; i++) {
        const img = data.images[i];
        if (isBase64Image(img)) {
          const url = await uploadOne({
            dataUrl: img,
            folderName: 'products',
            baseName: `product_${(data.name || doc.id).replace(/\s+/g, '_')}_${i}`,
          });
          newImages.push(url);
          arrChanged = true;
          console.log(`  [${doc.id}] images[${i}] -> ${url}`);
        } else {
          newImages.push(img);
        }
      }
      if (arrChanged) update.images = newImages;
    }

    // If single image was empty but we now have a primary image in array, sync it
    if (update.images && update.images.length > 0 && !data.image && !update.image) {
      update.image = update.images[0];
    }

    if (Object.keys(update).length > 0) {
      await doc.ref.update(update);
      touched++;
      console.log(`  [${doc.id}] saved (${Object.keys(update).join(', ')})`);
    }
  }

  console.log(`\nProducts: scanned=${scanned}, migrated=${touched}`);
}

async function migrateSliders() {
  const snap = await db.collection('sliders').get();
  let touched = 0, scanned = 0;
  for (const doc of snap.docs) {
    scanned++;
    const data = doc.data();
    if (isBase64Image(data.image)) {
      const url = await uploadOne({
        dataUrl: data.image,
        folderName: 'sliders',
        baseName: `slider_${doc.id}`,
      });
      await doc.ref.update({ image: url });
      touched++;
      console.log(`  [${doc.id}] image -> ${url}`);
    }
  }
  console.log(`\nSliders: scanned=${scanned}, migrated=${touched}`);
}

async function migrateSettings() {
  const docRef = db.collection('settings').doc('app');
  const doc = await docRef.get();
  if (!doc.exists) { console.log('\nSettings: no app doc'); return; }
  const data = doc.data();
  const update = {};
  for (const field of ['logo', 'paymentQR']) {
    if (isBase64Image(data[field])) {
      const url = await uploadOne({
        dataUrl: data[field],
        folderName: field === 'logo' ? 'logos' : 'payment-qr',
        baseName: field,
      });
      update[field] = url;
      console.log(`  [settings/app] ${field} -> ${url}`);
    }
  }
  if (Object.keys(update).length > 0) {
    await docRef.update(update);
    console.log(`\nSettings: migrated fields ${Object.keys(update).join(', ')}`);
  } else {
    console.log('\nSettings: nothing to migrate');
  }
}

(async () => {
  console.log('=== Drive migration starting ===\n');
  console.log('--- Products ---');
  await migrateProducts();
  console.log('\n--- Sliders ---');
  await migrateSliders();
  console.log('\n--- Settings ---');
  await migrateSettings();
  console.log('\n=== Migration complete ===');
  process.exit(0);
})().catch(err => {
  console.error('\nMigration FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
