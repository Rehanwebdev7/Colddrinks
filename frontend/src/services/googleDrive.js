/**
 * Google Drive client — backend-proxied uploads.
 *
 * Backend stores files in Google Drive and serves them back through its own
 * `/api/drive/files/:fileId` proxy so the UI never depends on Google's public
 * `lh3` endpoint for rendering.
 *
 * All callers keep working:
 *   uploadImage(file, folderName, fileName?) -> returns Drive fileId (string)
 *   getImageUrl(fileIdOrUrl) -> returns backend proxy URL
 *   deleteImage(fileId) -> deletes from Drive
 *
 * Backward-compat stubs (initGoogleAuth / authorizeAndGetRefreshToken /
 * silentAuth / isReady) remain exported so useDrive.js doesn't break, but
 * are no-ops because auth lives on the backend now.
 */

import API from '../config/api';

const DRIVE_FILE_ID_REGEX = /\/d\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/i;

const getApiBaseUrl = () => API.defaults?.baseURL || '/api';

const resolveDriveImageUrl = (value) => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('/api/drive/files/')) return trimmed;
  if (/^[A-Za-z0-9_-]{20,}$/.test(trimmed) && !trimmed.includes('/') && !trimmed.includes(':')) {
    return `${getApiBaseUrl()}/drive/files/${encodeURIComponent(trimmed)}`;
  }
  const match = trimmed.match(DRIVE_FILE_ID_REGEX);
  if (match?.[1]) {
    return `${getApiBaseUrl()}/drive/files/${encodeURIComponent(match[1])}`;
  }
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
  return resolveDriveImageUrl(fileId);
};

// ─── Backward-compat stubs (no-op) ──────────────────────────────────────────
// useDrive.js still imports these names. Service-account flow makes them
// unnecessary, but exports stay so existing imports don't break.

export const initGoogleAuth = async () => {};
export const authorizeAndGetRefreshToken = async () => '';
export const silentAuth = async () => '';
export const isReady = () => true;

export { resolveDriveImageUrl };
