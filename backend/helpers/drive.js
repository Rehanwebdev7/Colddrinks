/**
 * Google Drive helper — uploads to a personal Drive folder.
 *
 * Supports two credential formats in backend/drive-credentials.json:
 *   1. { type: "oauth_user", client_id, client_secret, refresh_token }
 *      → uploads as the human user (15GB free Gmail quota). Recommended.
 *   2. { type: "service_account", ...standard SA JSON }
 *      → kept for backward-compat / debug. NOTE: SAs cannot upload to
 *        personal Drive folders due to Google's 2024 quota policy. Use
 *        oauth_user format for production.
 *
 * Setup (oauth_user, one-time):
 *   1. Create a Desktop OAuth client in Cloud Console
 *   2. Save the downloaded JSON as backend/oauth-client.json
 *   3. Run: node scripts/generate-drive-token.js (handles browser login)
 *   4. backend/drive-credentials.json is written automatically
 *
 * Refresh tokens for non-sensitive scopes (drive.file) do not expire.
 */

const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { google } = require('googleapis');

const KEY_FILE = path.join(__dirname, '..', 'drive-credentials.json');
const MAIN_FOLDER_ID = process.env.GOOGLE_DRIVE_MAIN_FOLDER_ID || '1Rw05a5FRqOkFqt4B0W9eIF8NMQ20jsLA';

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${name} is not valid JSON: ${err.message}`);
  }
}

function parseBase64JsonEnv(name) {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch (err) {
    throw new Error(`${name} is not valid base64 JSON: ${err.message}`);
  }
}

function loadDriveCredentials() {
  const inlineJson = parseJsonEnv('DRIVE_CREDENTIALS_JSON');
  if (inlineJson) return inlineJson;

  const base64Json = parseBase64JsonEnv('DRIVE_CREDENTIALS_B64');
  if (base64Json) return base64Json;

  if (!fs.existsSync(KEY_FILE)) return null;
  return require(KEY_FILE);
}

const cred = loadDriveCredentials();
const disabledError = `Google Drive credentials missing. Set DRIVE_CREDENTIALS_JSON/DRIVE_CREDENTIALS_B64 or provide ${KEY_FILE}`;

let auth;
if (cred) {
  if (cred.type === 'oauth_user') {
    const oauth2 = new google.auth.OAuth2(cred.client_id, cred.client_secret);
    oauth2.setCredentials({ refresh_token: cred.refresh_token });
    auth = oauth2;
  } else {
    auth = new google.auth.GoogleAuth({
      credentials: cred,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  }
}

const drive = auth ? google.drive({ version: 'v3', auth }) : null;

const folderCache = new Map();

function requireDrive() {
  if (!drive) {
    throw new Error(disabledError);
  }
}

async function ensureSubfolder(name) {
  requireDrive();
  if (folderCache.has(name)) return folderCache.get(name);

  const q = `name='${name.replace(/'/g, "\\'")}' and '${MAIN_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const search = await drive.files.list({
    q,
    fields: 'files(id,name)',
    pageSize: 1,
  });

  if (search.data.files && search.data.files.length > 0) {
    const id = search.data.files[0].id;
    folderCache.set(name, id);
    return id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [MAIN_FOLDER_ID],
    },
    fields: 'id',
  });
  const id = created.data.id;
  folderCache.set(name, id);
  return id;
}

async function uploadBuffer({ buffer, mimeType, filename, folderName }) {
  requireDrive();
  const folderId = await ensureSubfolder(folderName);

  const created = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id',
  });

  const fileId = created.data.id;

  // Public-read so https://lh3.googleusercontent.com/d/{id} renders in <img>.
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return { id: fileId };
}

async function downloadFile(id) {
  requireDrive();
  const response = await drive.files.get(
    { fileId: id, alt: 'media' },
    { responseType: 'stream' }
  );

  const headers = response.headers || {};
  return {
    stream: response.data,
    contentType: headers['content-type'] || 'application/octet-stream',
    contentLength: headers['content-length'] ? Number(headers['content-length']) : null,
  };
}

async function deleteFile(id) {
  requireDrive();
  try {
    await drive.files.delete({ fileId: id });
    return { ok: true };
  } catch (err) {
    if (err && err.code === 404) return { ok: true, notFound: true };
    throw err;
  }
}

async function health() {
  if (!drive) {
    return { ok: false, error: disabledError };
  }
  try {
    const about = await drive.about.get({ fields: 'user(emailAddress)' });
    return { ok: true, account: about.data.user && about.data.user.emailAddress };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Startup health log — non-blocking. Surfaces invalid_grant/missing-cred problems
// at boot so the admin sees them in the server console instead of mid-upload.
if (drive) {
  health()
    .then((h) => {
      if (h.ok) {
        console.log(`[Drive] Auth OK — uploads available as ${h.account || 'unknown'}`);
      } else {
        console.warn('[Drive] Auth FAILED —', h.error);
        if (h.error && h.error.toLowerCase().includes('invalid_grant')) {
          console.warn('[Drive] Token expired or revoked. Run: node scripts/generate-drive-token.js');
        }
      }
    })
    .catch((err) => {
      console.warn('[Drive] Startup health check threw:', err && err.message);
    });
} else {
  console.warn('[Drive] Disabled —', disabledError);
}

module.exports = {
  MAIN_FOLDER_ID,
  ensureSubfolder,
  uploadBuffer,
  downloadFile,
  deleteFile,
  health,
};
