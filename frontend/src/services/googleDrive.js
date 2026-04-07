const CLIENT_ID = '90693111086-ugi7as27klhhmp7997di8peeuse8vh66.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const MAIN_FOLDER_ID = '1Rw05a5FRqOkFqt4B0W9eIF8NMQ20jsLA';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

let accessToken = null;
let codeClient = null;

// Cache for subfolder IDs so we don't query Drive every time
const folderCache = {};

// ─── Auth ───────────────────────────────────────────────────────────────────

export const initGoogleAuth = () => {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services not loaded'));
      return;
    }
    codeClient = window.google.accounts.oauth2.initCodeClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      ux_mode: 'popup',
      callback: () => {},
    });
    resolve();
  });
};

export const authorizeAndGetRefreshToken = () => {
  return new Promise((resolve, reject) => {
    if (!codeClient) {
      reject(new Error('Call initGoogleAuth() first'));
      return;
    }

    codeClient.callback = async (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      try {
        const tokenRes = await fetch(TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: response.code,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: window.location.origin,
            grant_type: 'authorization_code',
          }),
        });
        const data = await tokenRes.json();
        if (data.error) {
          reject(new Error(data.error_description || data.error));
          return;
        }
        accessToken = data.access_token;
        resolve(data.refresh_token);
      } catch (err) {
        reject(err);
      }
    };

    codeClient.error_callback = (err) => {
      reject(new Error(err.message || 'Google authorization failed'));
    };

    codeClient.requestCode();
  });
};

export const silentAuth = async (refreshToken) => {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  accessToken = data.access_token;
  return accessToken;
};

export const isReady = () => Boolean(accessToken);

// ─── Folder Management ──────────────────────────────────────────────────────

/**
 * Find or create a subfolder inside the main folder.
 * folderName: 'products', 'sliders', 'logos', etc.
 * Returns the folder ID.
 */
const getOrCreateFolder = async (folderName) => {
  if (!accessToken) throw new Error('Google Drive not authenticated');

  // Return from cache if available
  if (folderCache[folderName]) return folderCache[folderName];

  // Search for existing folder
  const query = `name='${folderName}' and '${MAIN_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    folderCache[folderName] = searchData.files[0].id;
    return searchData.files[0].id;
  }

  // Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [MAIN_FOLDER_ID],
    }),
  });
  const folder = await createRes.json();
  if (folder.error) throw new Error(folder.error.message || 'Failed to create folder');

  folderCache[folderName] = folder.id;
  return folder.id;
};

// ─── Upload / Delete ────────────────────────────────────────────────────────

/**
 * Upload an image to a specific subfolder in Google Drive.
 * @param {Blob|File} file - The image file
 * @param {string} folderName - Subfolder name: 'products', 'sliders', 'logos', etc.
 * @param {string} [fileName] - Optional file name
 * @returns {string} Drive file ID
 */
export const uploadImage = async (file, folderName, fileName) => {
  if (!accessToken) throw new Error('Google Drive not authenticated');

  const folderId = await getOrCreateFolder(folderName);

  const metadata = {
    name: fileName || file.name || `${folderName}_${Date.now()}.jpg`,
    mimeType: file.type || 'image/jpeg',
    parents: [folderId],
  };

  const boundary = '-------colddrinks';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const base64Data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${metadata.mimeType}\r\n` +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Data +
    closeDelimiter;

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Upload failed (${uploadRes.status})`);
  }

  const { id: fileId } = await uploadRes.json();

  // Set public permission
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }
  );

  return fileId;
};

/**
 * Delete a file from Google Drive.
 */
export const deleteImage = async (fileId) => {
  if (!accessToken) throw new Error('Google Drive not authenticated');
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Delete failed (${res.status})`);
  }
  return true;
};

/**
 * Get the public image URL for a Drive file ID.
 */
export const getImageUrl = (fileId) => {
  return `https://lh3.googleusercontent.com/d/${fileId}`;
};
