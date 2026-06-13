/**
 * Image hosting client — backend-proxied uploads.
 *
 * As of 2026-06-13 cutover, primary backend is Cloudinary; Drive code remains
 * commented in the backend for rollback (see backend/scripts/toggle-drive-backend.js).
 *
 * The filename stays `googleDrive.js` to avoid ripple-renaming 20+ admin imports.
 * Use the named exports (uploadImage, deleteImage, getImageUrl) — they now
 * transparently work with Cloudinary URLs while preserving legacy Drive URL
 * rendering for any not-yet-migrated images.
 *
 * Public API (unchanged signatures):
 *   uploadImage(file, folderName, fileName?) → string (Cloudinary public_id or legacy Drive fileId)
 *   getImageUrl(refOrUrl) → string (full URL safe for <img src>)
 *   deleteImage(ref) → Promise<boolean>
 *
 * Storage shape change:
 *   Old (Drive era):  raw fileId stored ("1A2B3C4D5E6F...")
 *   New (Cloudinary): public_id stored ("colddrinks/products/coke-abc123")
 *   Both shapes coexist during transition; resolver handles both.
 */

import API from '../config/api';
import { compressImage, getCompressionStats } from '../utils/imageCompression';

// === DRIVE_LEGACY_BEGIN === legacy Drive fileId extraction
const DRIVE_FILE_ID_REGEX = /\/d\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/i;
// === DRIVE_LEGACY_END ===

const CLOUDINARY_ROOT = 'colddrinks';

const getApiBaseUrl = () => API.defaults?.baseURL || '/api';

/**
 * Resolve any image reference to a renderable URL.
 * Handles 4 shapes:
 *   - Full URL (data:, http(s)://res.cloudinary.com/..., other)  → return as-is
 *   - Cloudinary public_id ("colddrinks/...")                   → expect backend to have normalized
 *   - Drive proxy URL ("/api/drive/files/...")                  → return as-is
 *   - Raw Drive fileId                                          → build proxy URL
 */
const resolveImageRefUrl = (value) => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  // Data URI (admin preview before save)
  if (trimmed.startsWith('data:')) return trimmed;

  // Full URL (Cloudinary CDN, lh3, other) — return as-is
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;

  // Cloudinary public_id — backend response interceptor should have built a URL,
  // but in case raw public_id arrives at component, we build it here.
  if (trimmed.startsWith(`${CLOUDINARY_ROOT}/`)) {
    // Backend cloud name not available client-side; rely on server normalizer.
    // This is a safety net: render the public_id as a relative path (server will 404
    // but the broken-image is preferable to silently swallowing it).
    return trimmed;
  }

  // === DRIVE_LEGACY_BEGIN === Drive proxy URL / fileId resolution
  if (trimmed.startsWith('/api/drive/files/')) return trimmed;
  if (/^[A-Za-z0-9_-]{20,}$/.test(trimmed) && !trimmed.includes('/') && !trimmed.includes(':')) {
    return `${getApiBaseUrl()}/drive/files/${encodeURIComponent(trimmed)}`;
  }
  const match = trimmed.match(DRIVE_FILE_ID_REGEX);
  if (match?.[1]) {
    return `${getApiBaseUrl()}/drive/files/${encodeURIComponent(match[1])}`;
  }
  // === DRIVE_LEGACY_END ===

  return trimmed;
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    const commaIdx = result.indexOf(',');
    resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

/**
 * Upload an image. Compresses before sending, posts to Cloudinary backend.
 * Returns the storage identifier (public_id) — store this in DB.
 */
export const uploadImage = async (file, folderName = 'products', fileName) => {
  if (!file) throw new Error('No file provided');

  // === CLOUDINARY_ACTIVE_BEGIN === client-side compression + upload to /api/images
  const original = file;
  const compressed = await compressImage(file);
  if (compressed !== original) {
    const stats = getCompressionStats(original, compressed);
    console.log(`[upload] compressed ${stats.originalKB}KB → ${stats.compressedKB}KB (${stats.ratio})`);
  }

  const dataB64 = await fileToBase64(compressed);
  const filename = fileName || compressed.name || file.name || `${folderName}_${Date.now()}`;
  const mimeType = compressed.type || file.type || 'image/jpeg';

  const res = await API.post('/images/upload', {
    filename,
    mimeType,
    dataB64,
    folder: folderName,
  });
  // Response interceptor unwraps { success, data, message } → data
  // res.data === { id: public_id, url: cdn_url, width, height, bytes, format }
  const publicId = res?.data?.id;
  if (!publicId) throw new Error('Upload failed: no public_id returned');
  return publicId;
  // === CLOUDINARY_ACTIVE_END ===
};

/**
 * Delete an image by its storage identifier (public_id or legacy Drive fileId).
 * Idempotent — 404 treated as success.
 */
export const deleteImage = async (ref) => {
  if (!ref) return true;
  try {
    // === CLOUDINARY_ACTIVE_BEGIN === Cloudinary delete via /api/images/:publicId
    if (typeof ref === 'string' && ref.startsWith(`${CLOUDINARY_ROOT}/`)) {
      await API.delete(`/images/${encodeURIComponent(ref)}`);
      return true;
    }
    // === CLOUDINARY_ACTIVE_END ===
    // === DRIVE_LEGACY_BEGIN === legacy Drive delete
    await API.delete(`/drive/files/${encodeURIComponent(ref)}`);
    return true;
    // === DRIVE_LEGACY_END ===
  } catch (err) {
    if (err?.response?.status === 404) return true;
    throw err;
  }
};

export const getImageUrl = (ref) => {
  if (!ref) return '';
  return resolveImageRefUrl(ref);
};

// ─── Backward-compat stubs (no-op) ──────────────────────────────────────────
// useDrive.js still imports these names. They stay exported so existing imports don't break.

export const initGoogleAuth = async () => {};
export const authorizeAndGetRefreshToken = async () => '';
export const silentAuth = async () => '';
export const isReady = () => true;

export { resolveImageRefUrl, resolveImageRefUrl as resolveDriveImageUrl };
