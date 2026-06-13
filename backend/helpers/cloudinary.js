/**
 * Cloudinary helper — uploads to Cloudinary cloud storage with CDN delivery.
 *
 * Configuration:
 *   - CLOUDINARY_URL env var (preferred, single string):
 *       cloudinary://API_KEY:API_SECRET@CLOUD_NAME
 *   - CLOUDINARY_ROOT_FOLDER env var (default: 'colddrinks') — all uploads
 *     nested under this folder for multi-project isolation
 *
 * Public API mirrors backend/helpers/drive.js so the imageBackend factory can
 * swap backends transparently:
 *   - uploadBuffer({ buffer, mimeType, filename, folderName }) → { id, url }
 *   - downloadFile(publicId) → { stream, contentType, contentLength }
 *   - deleteFile(publicId)
 *   - health()
 *
 * Differences from Drive:
 *   - `id` returned is the Cloudinary public_id (e.g., "colddrinks/products/coke-abc123"),
 *     NOT a Drive fileId. Prefix `colddrinks/` is the disambiguation token.
 *   - `url` is a permanent CDN URL with default optimization (f_auto,q_auto)
 *   - Upload eagerly generates 3 common sizes (300/400/800) so first customer
 *     load is instant and predictable on transformation credits.
 */

const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const https = require('https');

const ROOT_FOLDER = process.env.CLOUDINARY_ROOT_FOLDER || 'colddrinks';

// SDK auto-configures from CLOUDINARY_URL env var if present.
// Manual config fallback if individual vars set instead.
let configured = false;
if (process.env.CLOUDINARY_URL) {
  configured = true;
} else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

const disabledError = 'Cloudinary credentials missing. Set CLOUDINARY_URL env var.';

function requireConfigured() {
  if (!configured) throw new Error(disabledError);
}

function getCloudName() {
  return cloudinary.config().cloud_name;
}

/**
 * Build a public delivery URL for a stored public_id with optional transformations.
 * Pass-through for already-full URLs and Drive proxy URLs (legacy mixed-storage support).
 */
function buildUrl(publicId, transforms = 'f_auto,q_auto') {
  if (!publicId) return null;
  if (typeof publicId !== 'string') return null;
  if (publicId.startsWith('http://') || publicId.startsWith('https://')) return publicId;
  if (publicId.startsWith('/api/')) return publicId; // legacy Drive proxy URL
  if (publicId.startsWith('placeholder://')) return null;
  const cloudName = getCloudName();
  if (!cloudName) return null;
  const tx = transforms ? `${transforms}/` : '';
  return `https://res.cloudinary.com/${cloudName}/image/upload/${tx}${publicId}`;
}

/**
 * Extract a Cloudinary public_id from any image reference.
 * Handles: raw public_id, full secure_url, transformed URLs.
 * Returns null if input is not a Cloudinary reference.
 *
 * URL structure: https://res.cloudinary.com/<cloud>/image/upload/[<transformations>/][v<version>/]<public_id>.<ext>
 * Transformation segments look like "f_auto", "q_auto", "w_300,h_300,c_fill" — letter_value or comma list.
 */
function extractPublicId(input) {
  if (!input || typeof input !== 'string') return null;
  // Raw public_id (no protocol, starts with root folder)
  if (input.startsWith(`${ROOT_FOLDER}/`)) return input;
  // Full Cloudinary URL — extract public_id
  const match = input.match(/res\.cloudinary\.com\/[^/]+\/(?:image|video|raw)\/upload\/(.+)$/);
  if (!match) return null;
  let rest = match[1];
  // Strip query string / fragment
  rest = rest.replace(/[?#].*$/, '');
  const segments = rest.split('/');
  // Strip transformation segments — pattern: "<letter>_<value>" possibly comma-joined
  const TX_REGEX = /^([a-z]_[^,/]+)(,[a-z]_[^,/]+)*$/i;
  while (segments.length > 1 && TX_REGEX.test(segments[0])) {
    segments.shift();
  }
  // Strip version segment like 'v1234567890'
  if (segments[0] && /^v\d+$/.test(segments[0])) segments.shift();
  if (segments.length === 0) return null;
  // Strip extension from last segment
  segments[segments.length - 1] = segments[segments.length - 1].replace(/\.[^.]+$/, '');
  return segments.join('/');
}

/**
 * Sanitize a filename for use as Cloudinary public_id segment.
 * Strips extension, replaces special chars with hyphen.
 */
function sanitizeFilename(name) {
  if (!name) return 'image';
  return String(name)
    .replace(/\.[^.]+$/, '')          // strip extension
    .replace(/[^a-zA-Z0-9_-]/g, '-')  // non-alphanumeric → hyphen
    .replace(/-+/g, '-')              // collapse hyphens
    .replace(/^-+|-+$/g, '')          // trim hyphens
    .toLowerCase()
    .slice(0, 100) || 'image';
}

/**
 * Upload a buffer to Cloudinary.
 * @param {Object} args
 * @param {Buffer} args.buffer
 * @param {string} args.mimeType
 * @param {string} args.filename   - hint, suffix appended automatically for uniqueness
 * @param {string} args.folderName - subfolder under ROOT_FOLDER (e.g., 'products', 'sliders')
 * @returns {Promise<{id: string, url: string}>}
 *          id  = public_id like "colddrinks/products/coke-abc123"
 *          url = CDN URL with f_auto,q_auto transformations
 */
function uploadBuffer({ buffer, mimeType, filename, folderName }) {
  requireConfigured();
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return Promise.reject(new Error('uploadBuffer: buffer required'));
  }
  if (mimeType && !mimeType.startsWith('image/')) {
    return Promise.reject(new Error(`uploadBuffer: unsupported mimeType ${mimeType}`));
  }

  const folder = `${ROOT_FOLDER}/${folderName || 'misc'}`;
  const baseName = sanitizeFilename(filename);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: baseName,
        resource_type: 'image',
        overwrite: false,
        unique_filename: true,
        use_filename: true,
        // Eager transformations: pre-generate the 3 sizes the frontend uses
        // (mobile thumbnail, desktop card, detail page). First load free.
        eager: [
          { width: 300, height: 300, crop: 'fill', fetch_format: 'auto', quality: 'auto' },
          { width: 400, height: 400, crop: 'fill', fetch_format: 'auto', quality: 'auto' },
          { width: 800, crop: 'limit', fetch_format: 'auto', quality: 'auto' },
        ],
        eager_async: false,
      },
      (err, result) => {
        if (err) return reject(err);
        if (!result) return reject(new Error('uploadBuffer: empty result'));
        resolve({
          id: result.public_id,
          url: result.secure_url,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          format: result.format,
        });
      }
    );
    Readable.from(buffer).pipe(stream);
  });
}

/**
 * Download a Cloudinary asset by public_id.
 * Returns a stream so caller can pipe to response (mirrors drive.downloadFile shape).
 */
function downloadFile(publicId) {
  requireConfigured();
  const url = buildUrl(publicId, null); // no transforms — original
  if (!url) return Promise.reject(new Error('downloadFile: invalid publicId'));

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        const err = new Error(`Cloudinary download failed: ${res.statusCode}`);
        err.code = res.statusCode;
        return reject(err);
      }
      resolve({
        stream: res,
        contentType: res.headers['content-type'] || 'application/octet-stream',
        contentLength: res.headers['content-length'] ? Number(res.headers['content-length']) : null,
      });
    }).on('error', reject);
  });
}

/**
 * Delete an asset by public_id. Idempotent — returns ok:true even if not found.
 */
async function deleteFile(publicId) {
  requireConfigured();
  if (!publicId) return { ok: true, notFound: true };
  try {
    const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    if (result.result === 'ok') return { ok: true };
    if (result.result === 'not found') return { ok: true, notFound: true };
    return { ok: false, result: result.result };
  } catch (err) {
    if (err && (err.http_code === 404 || err.code === 404)) return { ok: true, notFound: true };
    throw err;
  }
}

/**
 * Batch delete up to 100 assets in one call (Admin API).
 */
async function deleteFiles(publicIds) {
  requireConfigured();
  if (!Array.isArray(publicIds) || publicIds.length === 0) return { ok: true, deleted: {} };
  // Cloudinary Admin API delete_resources accepts up to 100 per call
  const chunks = [];
  for (let i = 0; i < publicIds.length; i += 100) chunks.push(publicIds.slice(i, i + 100));
  const merged = {};
  for (const chunk of chunks) {
    const res = await cloudinary.api.delete_resources(chunk, { invalidate: true });
    Object.assign(merged, res.deleted || {});
  }
  return { ok: true, deleted: merged };
}

async function health() {
  if (!configured) return { ok: false, error: disabledError };
  try {
    // Ping API by listing root folder (cheap, no usage credit consumed)
    const result = await cloudinary.api.ping();
    return { ok: true, status: result.status, cloudName: getCloudName() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Startup health log — non-blocking, mirrors drive.js pattern
if (configured) {
  health()
    .then((h) => {
      if (h.ok) {
        console.log(`[Cloudinary] Auth OK — cloud "${h.cloudName}" status: ${h.status}`);
      } else {
        console.warn('[Cloudinary] Auth FAILED —', h.error);
      }
    })
    .catch((err) => {
      console.warn('[Cloudinary] Startup health check threw:', err && err.message);
    });
} else {
  console.warn('[Cloudinary] Disabled —', disabledError);
}

module.exports = {
  ROOT_FOLDER,
  buildUrl,
  extractPublicId,
  sanitizeFilename,
  uploadBuffer,
  downloadFile,
  deleteFile,
  deleteFiles,
  health,
  getCloudName,
};
