/**
 * Cloudinary smoke test — verifies credentials and end-to-end flow.
 * Usage: node backend/scripts/test-cloudinary.js
 *
 * Tests:
 *   1. health()  — auth + connectivity
 *   2. uploadBuffer() — upload a tiny PNG, verify public_id + url
 *   3. buildUrl() — verify URL transformations applied
 *   4. downloadFile() — read back the uploaded asset
 *   5. deleteFile() — cleanup
 *
 * Exit codes: 0 = all pass, 1 = any failure.
 */

// Load backend/.env using the same parser as server.js (no dotenv dependency)
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const cloudinary = require('../helpers/cloudinary');

// 1x1 red PNG (smallest valid image)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

async function run() {
  const results = [];
  const log = (step, status, detail) => {
    const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '·';
    console.log(`${icon} [${step}] ${status} ${detail || ''}`);
    results.push({ step, status, detail });
  };

  // Step 1: Health check
  try {
    const h = await cloudinary.health();
    if (h.ok) log('health', 'PASS', `cloud="${h.cloudName}" status=${h.status}`);
    else { log('health', 'FAIL', h.error); return cleanup(results); }
  } catch (e) {
    log('health', 'FAIL', e.message); return cleanup(results);
  }

  // Step 2: Upload
  let uploaded;
  try {
    uploaded = await cloudinary.uploadBuffer({
      buffer: TINY_PNG,
      mimeType: 'image/png',
      filename: `smoke-test-${Date.now()}`,
      folderName: 'test',
    });
    log('upload', 'PASS', `id=${uploaded.id}  ${uploaded.width}x${uploaded.height} ${uploaded.bytes}B`);
  } catch (e) {
    log('upload', 'FAIL', e.message); return cleanup(results);
  }

  // Step 3: URL builder
  const optimizedUrl = cloudinary.buildUrl(uploaded.id);
  const customSizeUrl = cloudinary.buildUrl(uploaded.id, 'f_auto,q_auto,w_300,h_300,c_fill');
  if (optimizedUrl && optimizedUrl.includes('f_auto,q_auto')) {
    log('buildUrl', 'PASS', `default: ${optimizedUrl.substring(0, 80)}...`);
  } else {
    log('buildUrl', 'FAIL', 'URL missing transforms');
  }
  log('buildUrl', 'INFO', `300x300: ${customSizeUrl.substring(0, 80)}...`);

  // Step 4: extractPublicId roundtrip
  const extracted = cloudinary.extractPublicId(optimizedUrl);
  if (extracted === uploaded.id) {
    log('extractPublicId', 'PASS', `roundtrip → ${extracted}`);
  } else {
    log('extractPublicId', 'FAIL', `expected ${uploaded.id} got ${extracted}`);
  }

  // Step 5: Download
  try {
    const dl = await cloudinary.downloadFile(uploaded.id);
    log('download', 'PASS', `content-type=${dl.contentType} length=${dl.contentLength}`);
    dl.stream.resume(); // drain to avoid hanging
  } catch (e) {
    log('download', 'FAIL', e.message);
  }

  // Step 6: Delete
  try {
    const del = await cloudinary.deleteFile(uploaded.id);
    log('delete', del.ok ? 'PASS' : 'FAIL', `result=${JSON.stringify(del)}`);
  } catch (e) {
    log('delete', 'FAIL', e.message);
  }

  return cleanup(results);
}

function cleanup(results) {
  const failed = results.filter(r => r.status === 'FAIL').length;
  const passed = results.filter(r => r.status === 'PASS').length;
  console.log(`\n=== Summary: ${passed} PASS / ${failed} FAIL ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
