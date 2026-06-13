/**
 * Image backend factory — single point that decides which image hosting
 * backend is active. As of 2026-06-13 cutover, Cloudinary is the sole active
 * backend; Drive code remains in the tree for rollback.
 *
 * Rollback procedure:
 *   1. Run: node backend/scripts/toggle-drive-backend.js enable
 *      (uncomments Drive code blocks marked DRIVE_LEGACY_BEGIN/END)
 *   2. Restart server.
 *   3. Reverse via: ... disable
 *
 * Mixed-storage transition support:
 *   - Cloudinary public_ids start with the root folder prefix (e.g., "colddrinks/")
 *   - Legacy Drive proxy URLs start with "/api/drive/files/"
 *   - Legacy raw Drive fileIds (rare, normalizer-safe) match /^[A-Za-z0-9_-]{20,}$/
 *
 * Helpers:
 *   getImageBackend()           → active backend module (cloudinary)
 *   detectImageBackend(ref)     → 'cloudinary' | 'drive-proxy' | 'drive-fileid' | 'url' | 'unknown'
 *   buildDeliveryUrl(ref)       → resolves any ref to a customer-facing URL
 *   extractRefIdentifier(ref)   → returns the storage-backend-specific identifier (public_id or fileId)
 */

const cloudinaryHelper = require('./cloudinary');

// === DRIVE_LEGACY_BEGIN === uncomment require + remove the null below to rollback
// const driveHelper = require('./drive');
const driveHelper = null;
// === DRIVE_LEGACY_END ===

const CLOUDINARY_ROOT = cloudinaryHelper.ROOT_FOLDER || 'colddrinks';

function getImageBackend() {
  return cloudinaryHelper;
}

function detectImageBackend(ref) {
  if (!ref || typeof ref !== 'string') return 'unknown';
  if (ref.startsWith('placeholder://')) return 'mock';
  if (ref.startsWith(`${CLOUDINARY_ROOT}/`)) return 'cloudinary';
  if (ref.includes('res.cloudinary.com')) return 'cloudinary-url';
  if (ref.startsWith('/api/drive/files/')) return 'drive-proxy';
  if (ref.startsWith('http://') || ref.startsWith('https://')) return 'url';
  // Heuristic: bare Drive fileIds are 25-44 chars, alphanumeric + _ + -
  if (/^[A-Za-z0-9_-]{20,}$/.test(ref)) return 'drive-fileid';
  return 'unknown';
}

/**
 * Build a customer-facing delivery URL for ANY image reference shape.
 * Used by normalizers on the read path to render legacy + new uploads uniformly.
 */
function buildDeliveryUrl(ref, transforms) {
  if (!ref || typeof ref !== 'string') return null;
  const kind = detectImageBackend(ref);
  switch (kind) {
    case 'cloudinary':
      return cloudinaryHelper.buildUrl(ref, transforms);
    case 'cloudinary-url':
      return ref;
    case 'drive-proxy':
      return ref; // already a usable proxy URL
    case 'drive-fileid':
      return `/api/drive/files/${encodeURIComponent(ref)}`;
    case 'url':
      return ref;
    case 'mock':
    case 'unknown':
    default:
      return ref;
  }
}

/**
 * Extract the storage-backend-specific identifier for a reference.
 * Returns `{ backend, id }` or null if not extractable.
 */
function extractRefIdentifier(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const kind = detectImageBackend(ref);
  if (kind === 'cloudinary' || kind === 'cloudinary-url') {
    const publicId = kind === 'cloudinary' ? ref : cloudinaryHelper.extractPublicId(ref);
    if (publicId) return { backend: 'cloudinary', id: publicId };
  }
  if (kind === 'drive-fileid') return { backend: 'drive', id: ref };
  if (kind === 'drive-proxy') {
    const m = ref.match(/\/api\/drive\/files\/([^/?#]+)/);
    if (m) return { backend: 'drive', id: decodeURIComponent(m[1]) };
  }
  return null;
}

/**
 * Delete an asset using the correct backend based on its reference shape.
 * Best-effort — swallows errors so cleanup doesn't block primary writes.
 */
async function deleteImageRef(ref) {
  const extracted = extractRefIdentifier(ref);
  if (!extracted) return { ok: true, skipped: true };
  try {
    if (extracted.backend === 'cloudinary') {
      return await cloudinaryHelper.deleteFile(extracted.id);
    }
    // === DRIVE_LEGACY_BEGIN === uncomment via toggle-drive-backend.js to rollback
    if (extracted.backend === 'drive' && driveHelper) {
      return await driveHelper.deleteFile(extracted.id);
    }
    // === DRIVE_LEGACY_END ===
    return { ok: true, skipped: true, reason: `backend ${extracted.backend} disabled` };
  } catch (err) {
    console.warn(`[imageBackend] delete failed for ${ref}:`, err && err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getImageBackend,
  detectImageBackend,
  buildDeliveryUrl,
  extractRefIdentifier,
  deleteImageRef,
  cloudinaryHelper,
  // === DRIVE_LEGACY_BEGIN === uncomment via toggle-drive-backend.js to rollback
  driveHelper,
  // === DRIVE_LEGACY_END ===
};
