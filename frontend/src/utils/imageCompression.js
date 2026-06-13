/**
 * Client-side image compression wrapper.
 *
 * Strategy:
 *   - Resize to max 1600px on longer edge (mobile + desktop both covered)
 *   - Target file size ~500 KB
 *   - Convert to WebP when browser supports it (smaller than JPEG)
 *   - Use Web Worker (default) for non-blocking UI
 *   - GIFs are SKIPPED to preserve animation
 *   - SVGs are SKIPPED (vector, no compression needed)
 *
 * Why: Cloudinary free tier counts storage + bandwidth. Smaller files at
 * upload time = more headroom. A 5 MB photo compresses to ~400 KB without
 * visible quality loss for ecommerce product imagery.
 *
 * Usage:
 *   import { compressImage } from '../utils/imageCompression';
 *   const compressed = await compressImage(file);
 *   uploadImage(compressed, 'products');
 */

import imageCompression from 'browser-image-compression';

const DEFAULT_OPTIONS = {
  maxSizeMB: 0.5,                  // target output ~500 KB
  maxWidthOrHeight: 1600,          // resize longest edge
  useWebWorker: true,              // non-blocking
  initialQuality: 0.8,             // 80% quality starting point
  fileType: 'image/webp',          // smaller than JPEG; browser falls back if unsupported
  alwaysKeepResolution: false,
};

const SKIP_MIME_TYPES = new Set([
  'image/gif',                     // preserve animation
  'image/svg+xml',                 // vector, don't rasterize
]);

/**
 * Compress an image file. Returns compressed File (or original if compression skipped/failed).
 * Never throws — falls back to original file on error so upload doesn't break.
 *
 * @param {File} file - original file from <input type="file">
 * @param {Object} options - override DEFAULT_OPTIONS
 * @returns {Promise<File>}
 */
export async function compressImage(file, options = {}) {
  if (!file) throw new Error('compressImage: file is required');
  if (!(file instanceof Blob)) throw new Error('compressImage: file must be a Blob/File');

  // Skip unsupported / lossless types
  if (SKIP_MIME_TYPES.has(file.type)) return file;
  // Already small files — skip compression overhead
  if (file.size < 100 * 1024) return file;

  const config = { ...DEFAULT_OPTIONS, ...options };

  try {
    const compressed = await imageCompression(file, config);
    // If compression made it bigger somehow (edge case for already-optimized inputs), keep original
    if (compressed.size >= file.size) return file;
    return compressed;
  } catch (err) {
    console.warn('[imageCompression] failed, using original:', err && err.message);
    return file;
  }
}

/**
 * Get a humanized compression report — useful for admin UI tooltips/logs.
 * @returns {{originalKB: number, compressedKB: number, ratio: string}}
 */
export function getCompressionStats(original, compressed) {
  const oKB = Math.round(original.size / 1024);
  const cKB = Math.round(compressed.size / 1024);
  const ratio = original.size === compressed.size
    ? '1.0x'
    : `${(original.size / compressed.size).toFixed(1)}x`;
  return { originalKB: oKB, compressedKB: cKB, ratio };
}
