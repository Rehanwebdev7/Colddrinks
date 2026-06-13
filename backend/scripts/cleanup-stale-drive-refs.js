const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const DB_DIR = path.join(__dirname, '..', 'database');
const DRIVE_CHECK_BASE_URL = process.env.DRIVE_CHECK_BASE_URL || 'http://localhost:8000';

const IMAGE_ARRAY_KEYS = new Set(['images', 'gallery', 'thumbnails']);
const IMAGE_SCALAR_KEYS = new Set(['image', 'logo', 'favicon', 'avatar', 'banner', 'picture', 'qr', 'paymentQr']);

function extractDriveFileId(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();

  const proxyMatch = trimmed.match(/\/api\/drive\/files\/([A-Za-z0-9_\-]+)/i);
  if (proxyMatch) return proxyMatch[1];

  const publicMatch = trimmed.match(/lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_\-]+)/i);
  if (publicMatch) return publicMatch[1];

  if (/^[A-Za-z0-9_\-]{20,}$/.test(trimmed) && !trimmed.includes('/') && !trimmed.includes(':')) {
    return trimmed;
  }

  return null;
}

const existsCache = new Map();
async function driveFileExists(fileId) {
  if (existsCache.has(fileId)) return existsCache.get(fileId);
  try {
    const url = `${DRIVE_CHECK_BASE_URL.replace(/\/+$/, '')}/api/drive/files/${encodeURIComponent(fileId)}`;
    const status = String(execFileSync('curl', [
      '--max-time', '10',
      '-s',
      '-o', '/dev/null',
      '-w', '%{http_code}',
      '-I',
      url,
    ], { encoding: 'utf8' })).trim();

    if (status === '200') {
      existsCache.set(fileId, true);
      return true;
    }
    if (status === '404') {
      existsCache.set(fileId, false);
      return false;
    }
    throw new Error(`Drive check failed for ${fileId}: HTTP ${status || 'unknown'}`);
  } catch (err) {
    if (/404/.test(String(err?.message || '')) || /not found/i.test(String(err?.message || ''))) {
      existsCache.set(fileId, false);
      return false;
    }
    throw err;
  }
}

function canonicalDriveUrl(fileId) {
  return `/api/drive/files/${encodeURIComponent(fileId)}`;
}

async function sanitizeValue(value, key) {
  if (Array.isArray(value)) {
    const cleaned = [];
    for (const item of value) {
      const next = await sanitizeValue(item, key);
      if (next === null || next === undefined || next === '') continue;
      cleaned.push(next);
    }
    return cleaned;
  }

  if (value && typeof value === 'object') {
    const out = Array.isArray(value) ? [] : {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const next = await sanitizeValue(childValue, childKey);
      if (next === undefined) continue;
      out[childKey] = next;
    }
    return out;
  }

  if (typeof value === 'string') {
    const fileId = extractDriveFileId(value);
    if (!fileId) return value;

    const exists = await driveFileExists(fileId);
    if (exists) return canonicalDriveUrl(fileId);

    return IMAGE_SCALAR_KEYS.has(key) ? '' : null;
  }

  return value;
}

async function sanitizeRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const out = Array.isArray(record) ? [] : {};

  for (const [key, value] of Object.entries(record)) {
    const next = await sanitizeValue(value, key);
    if (next === undefined) continue;
    out[key] = next;
  }

  // Clean up common product/slider shapes explicitly.
  if (Array.isArray(out.images)) {
    out.images = out.images.filter(Boolean);
  }
  if (Array.isArray(out.variants)) {
    out.variants = out.variants.map(v => (v && typeof v === 'object' ? v : v)).filter(Boolean);
  }

  return out;
}

async function main() {
  const files = fs.readdirSync(DB_DIR).filter((name) => name.endsWith('.json'));
  let changedFiles = 0;
  let changedRefs = 0;

  for (const file of files) {
    const fullPath = path.join(DB_DIR, file);
    const original = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const sanitized = await sanitizeValue(original, file);
    const before = JSON.stringify(original, null, 2);
    const after = JSON.stringify(sanitized, null, 2);
    if (before !== after) {
      fs.writeFileSync(fullPath, `${after}\n`);
      changedFiles++;
    }
  }

  for (const [fileId, ok] of existsCache.entries()) {
    if (!ok) changedRefs++;
  }

  console.log(`Cleaned ${changedFiles} file(s). Removed ${changedRefs} missing Drive ref(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
