/**
 * Google Drive client — backend-proxied uploads.
 *
 * Backend uses a service account (no OAuth). All callers keep working:
 *   uploadImage(file, folderName, fileName?) -> returns Drive fileId (string)
 *   getImageUrl(fileId) -> returns public lh3 URL (unchanged format)
 *   deleteImage(fileId) -> deletes from Drive
 *
 * Backward-compat stubs (initGoogleAuth / authorizeAndGetRefreshToken /
 * silentAuth / isReady) remain exported so useDrive.js doesn't break, but
 * are no-ops because auth lives on the backend now.
 */

import API from '../config/api';

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

export const uploadImage = async (file, folderName = 'products', fileName) => {
  if (!file) throw new Error('No file provided');

  const dataB64 = await fileToBase64(file);
  const filename = fileName || file.name || `${folderName}_${Date.now()}.jpg`;
  const mimeType = file.type || 'image/jpeg';

  const res = await API.post('/drive/upload', {
    filename,
    mimeType,
    dataB64,
    folder: folderName,
  });

  // API response interceptor unwraps { success, data, message } -> data
  // After unwrap: res.data === { id, url }
  const fileId = res?.data?.id;
  if (!fileId) throw new Error('Upload failed: no file id returned');
  return fileId;
};

export const deleteImage = async (fileId) => {
  if (!fileId) return true;
  try {
    await API.delete(`/drive/files/${encodeURIComponent(fileId)}`);
    return true;
  } catch (err) {
    // 404 already gone — treat as success
    if (err?.response?.status === 404) return true;
    throw err;
  }
};

export const getImageUrl = (fileId) => {
  if (!fileId) return '';
  return `https://lh3.googleusercontent.com/d/${fileId}`;
};

// ─── Backward-compat stubs (no-op) ──────────────────────────────────────────
// useDrive.js still imports these names. Service-account flow makes them
// unnecessary, but exports stay so existing imports don't break.

export const initGoogleAuth = async () => {};
export const authorizeAndGetRefreshToken = async () => '';
export const silentAuth = async () => '';
export const isReady = () => true;
