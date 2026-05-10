# Google Drive Integration Setup Guide

Complete guide to add silent Google Drive image uploads to a **React + Firebase + Node.js** project, using a free-tier OAuth refresh token (no Workspace, no service account quota walls).

> **Outcome:** Admin/customer can upload images. Behind the scenes, files are stored in your personal Google Drive (15 GB free). The end user never sees Google login or any "Drive" UI.

---

## 1. Why OAuth Refresh Token (and not Service Account)?

Google's 2024 policy: **Service Accounts cannot upload to a personal Gmail Drive folder.** Every SA upload fails with `storageQuotaExceeded`, regardless of how the SA was created (Firebase-managed or standalone GCP project). The only free-tier mechanisms are:

| Approach | Free? | Works? | Notes |
|---|---|---|---|
| Service Account → personal Drive | ✅ | ❌ | Blocked by Google quota policy |
| Service Account → Workspace Shared Drive | ❌ | ✅ | Requires Google Workspace ($) |
| **OAuth Refresh Token (this guide)** | ✅ | ✅ | Files owned by your Gmail (15 GB free) |
| OAuth per-user runtime | ✅ | ✅ | Overkill — every customer would need to log in |

**This guide uses the OAuth refresh token pattern:** one-time browser login by the developer generates a token that the backend uses forever. The end user never touches OAuth.

---

## 2. Prerequisites

- A Google account that owns the target Drive folder (your personal Gmail)
- Node.js 16+ on the development machine
- An existing React + Node backend
- A Firebase project (only used for Firestore, not for Drive)
- ~10 minutes for the one-time Cloud Console setup

---

## 3. One-Time GCP Console Setup

### 3.1 Create a dedicated GCP project

> **Important:** Do **not** use the same Google Cloud project that Firebase auto-created. Create a fresh standalone project. (Firebase-managed projects have stricter SA quotas, and we want the OAuth client to be cleanly isolated.)

1. Open https://console.cloud.google.com/projectcreate
2. **Project name:** something descriptive, e.g. `myapp-drive`
3. **Organisation:** No organisation
4. Click **CREATE**, wait ~15 sec
5. Top bar → project picker → select the new project

### 3.2 Enable the Drive API

1. With the new project selected: https://console.cloud.google.com/apis/library/drive.googleapis.com
2. Click **ENABLE**

### 3.3 Configure OAuth Consent Screen

1. Open https://console.cloud.google.com/apis/credentials/consent (project = your new one)
2. Click **Get Started** (new UI) — or **CREATE** with **External** user type (classic UI)
3. **App information:**
   - App name: `<your app> Drive Backend`
   - User support email: *your Gmail* (folder owner)
   - Developer contact email: *your Gmail*
4. **Audience:** **External**
5. **Data access / Scopes:**
   - Click **ADD OR REMOVE SCOPES**
   - Filter: `drive.file`
   - ✅ Select `.../auth/drive.file` ("See, edit, create, and delete only the specific Google Drive files you use with this app")
   - **UPDATE** → **SAVE AND CONTINUE**
6. **Test users:**
   - Click **+ ADD USERS**
   - Add the Drive folder owner's Gmail address
7. **DO NOT click "Publish App".** Keep status as **Testing**.

#### Why Testing mode is fine for production

- `drive.file` is a **non-sensitive** scope → refresh tokens never expire in Testing mode (unlike sensitive scopes which expire in 7 days).
- The OAuth flow runs only on the developer's machine, once. End users never see the consent screen.
- No verification ever required for `drive.file`.
- The deployed production app uses the saved refresh token, not the OAuth flow.

### 3.4 Create a Desktop OAuth Client

1. Open https://console.cloud.google.com/apis/credentials
2. **+ CREATE CREDENTIALS** → **OAuth client ID**
3. **Application type:** **Desktop app**
4. **Name:** `<your app>-cli`
5. Click **CREATE**
6. Click **DOWNLOAD JSON** in the popup
7. Save the downloaded file as `backend/oauth-client.json` (gitignored, see below)

### 3.5 Identify your target Drive folder

- Open the destination folder in Drive (e.g. https://drive.google.com/drive/folders/YOUR_FOLDER_ID)
- The URL ends with the folder ID (long alphanumeric string)
- Save this ID — the backend helper uses it as `MAIN_FOLDER_ID`

---

## 4. Backend Setup

### 4.1 Install dependencies

```bash
cd backend
npm install googleapis
```

### 4.2 Update `.gitignore`

Add to `.gitignore` (project root):

```
# Drive credentials — never commit
drive-credentials.json
oauth-client.json
```

### 4.3 Create `backend/helpers/drive.js`

```js
/**
 * Google Drive helper — uploads to a personal Drive folder.
 * Reads backend/drive-credentials.json (oauth_user format).
 */

const path = require('path');
const { Readable } = require('stream');
const { google } = require('googleapis');

const KEY_FILE = path.join(__dirname, '..', 'drive-credentials.json');
const MAIN_FOLDER_ID = process.env.GOOGLE_DRIVE_MAIN_FOLDER_ID || 'YOUR_FOLDER_ID_HERE';

const cred = require(KEY_FILE);

let auth;
if (cred.type === 'oauth_user') {
  const oauth2 = new google.auth.OAuth2(cred.client_id, cred.client_secret);
  oauth2.setCredentials({ refresh_token: cred.refresh_token });
  auth = oauth2;
} else {
  auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

const drive = google.drive({ version: 'v3', auth });
const folderCache = new Map();

async function ensureSubfolder(name) {
  if (folderCache.has(name)) return folderCache.get(name);

  const q = `name='${name.replace(/'/g, "\\'")}' and '${MAIN_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const search = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 1 });

  if (search.data.files && search.data.files.length > 0) {
    const id = search.data.files[0].id;
    folderCache.set(name, id);
    return id;
  }

  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [MAIN_FOLDER_ID] },
    fields: 'id',
  });
  folderCache.set(name, created.data.id);
  return created.data.id;
}

async function uploadBuffer({ buffer, mimeType, filename, folderName }) {
  const folderId = await ensureSubfolder(folderName);
  const created = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id',
  });
  const fileId = created.data.id;
  await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
  return { id: fileId };
}

async function deleteFile(id) {
  try {
    await drive.files.delete({ fileId: id });
    return { ok: true };
  } catch (err) {
    if (err && err.code === 404) return { ok: true, notFound: true };
    throw err;
  }
}

async function health() {
  try {
    const about = await drive.about.get({ fields: 'user(emailAddress)' });
    return { ok: true, account: about.data.user && about.data.user.emailAddress };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { MAIN_FOLDER_ID, ensureSubfolder, uploadBuffer, deleteFile, health };
```

> Replace `YOUR_FOLDER_ID_HERE` with the folder ID from step 3.5.

### 4.4 Create `backend/scripts/generate-drive-token.js`

```js
/**
 * One-time CLI: generates the Drive OAuth refresh token.
 * Prereq: backend/oauth-client.json (downloaded in step 3.4).
 * Run: node scripts/generate-drive-token.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { exec } = require('child_process');
const { google } = require('googleapis');

const PORT = 54321;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const OAUTH_CLIENT_FILE = path.join(__dirname, '..', 'oauth-client.json');
const CRED_OUT_FILE = path.join(__dirname, '..', 'drive-credentials.json');

if (!fs.existsSync(OAUTH_CLIENT_FILE)) {
  console.error('\n[X] Missing backend/oauth-client.json\n');
  process.exit(1);
}

const clientFile = JSON.parse(fs.readFileSync(OAUTH_CLIENT_FILE, 'utf8'));
const installed = clientFile.installed || clientFile.web || clientFile;
const CLIENT_ID = installed.client_id;
const CLIENT_SECRET = installed.client_secret;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\nOpening browser for consent...');
console.log('(If it does not open, paste this URL manually):\n');
console.log(authUrl);
console.log(`\nWaiting for callback on ${REDIRECT_URI} ...\n`);

const opener =
  process.platform === 'win32' ? `start "" "${authUrl}"` :
  process.platform === 'darwin' ? `open "${authUrl}"` :
  `xdg-open "${authUrl}"`;
exec(opener, () => {});

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/oauth2callback') {
    res.writeHead(404); res.end(); return;
  }
  const code = parsed.query.code;
  if (!code) { res.writeHead(400); res.end('Missing ?code'); return; }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      res.writeHead(500); res.end('No refresh_token. Revoke at https://myaccount.google.com/permissions and retry.');
      process.exit(2);
    }
    fs.writeFileSync(CRED_OUT_FILE, JSON.stringify({
      type: 'oauth_user',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
    }, null, 2) + '\n');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1 style="color:#16a34a">Drive token saved</h1><p>Close this tab.</p>');
    console.log('\n[OK] Token saved to', CRED_OUT_FILE);
    setTimeout(() => { server.close(); process.exit(0); }, 500);
  } catch (err) {
    res.writeHead(500); res.end('Error: ' + err.message);
    process.exit(2);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} in use. Close it and retry.`);
  }
  process.exit(2);
});

server.listen(PORT);
```

### 4.5 Add Drive routes to your server

In your main server file (e.g. `server.js`), import the helper and add three routes:

```js
const driveHelper = require('./helpers/drive');

const ALLOWED_DRIVE_FOLDERS = new Set(['products', 'sliders', 'logos', 'misc']);
const MAX_DRIVE_B64_LEN = 14 * 1024 * 1024; // ≈ 10 MB

// Parse Drive file ID from the public URL we generate at upload time
function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_\-]+)/);
  return m ? m[1] : null;
}

async function deleteDriveFilesFromUrls(urls) {
  const list = Array.isArray(urls) ? urls : (urls ? [urls] : []);
  const ids = list.map(extractDriveFileId).filter(Boolean);
  await Promise.all(ids.map(async (id) => {
    try { await driveHelper.deleteFile(id); }
    catch (err) { console.warn(`[drive] cleanup failed for ${id}:`, err.message); }
  }));
}

function diffRemovedImageUrls(oldImages, newImages) {
  const toArr = (v) => (Array.isArray(v) ? v : (v ? [v] : [])).filter(Boolean);
  const newSet = new Set(toArr(newImages));
  return toArr(oldImages).filter((u) => !newSet.has(u));
}

// Routes (assuming the standard handler signatures shown in this guide)
async function handleDriveHealth(req, res) {
  // requireAdmin middleware here
  const result = await driveHelper.health();
  res.json({ success: true, data: result });
}

async function handleDriveUpload(req, res) {
  // requireAdmin middleware here
  const { filename, mimeType, dataB64, folder } = req.body;
  if (!filename || !mimeType || !mimeType.startsWith('image/') || !dataB64) {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }
  if (dataB64.length > MAX_DRIVE_B64_LEN) {
    return res.status(413).json({ success: false, message: 'File too large' });
  }
  const folderName = ALLOWED_DRIVE_FOLDERS.has(folder) ? folder : 'misc';
  const buffer = Buffer.from(dataB64, 'base64');
  try {
    const { id } = await driveHelper.uploadBuffer({ buffer, mimeType, filename, folderName });
    res.json({ success: true, data: { id, url: `https://lh3.googleusercontent.com/d/${id}` } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function handleDriveDelete(req, res, fileId) {
  // requireAdmin middleware here
  try {
    const result = await driveHelper.deleteFile(fileId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
```

Wire these to:
- `GET /api/drive/health` → `handleDriveHealth`
- `POST /api/drive/upload` → `handleDriveUpload`
- `DELETE /api/drive/files/:id` → `handleDriveDelete`

### 4.6 Wire Drive cleanup into your DELETE/UPDATE handlers

For every entity that stores image URLs (products, sliders, settings), add Drive cleanup so old files don't orphan when records are deleted or images are replaced.

**Example — Product update + delete:**

```js
async function handleProductUpdate(req, res, productId) {
  const products = readDB('products.json');
  const index = products.findIndex(p => p.id === productId);
  const oldProduct = products[index];

  const { id, _id, ...updates } = req.body;
  products[index] = { ...oldProduct, ...updates };
  writeDB('products.json', products);

  // Cleanup any old image URLs that are no longer referenced
  const removedUrls = diffRemovedImageUrls(
    [...(oldProduct.images || []), oldProduct.image],
    [...(products[index].images || []), products[index].image]
  );
  await deleteDriveFilesFromUrls(removedUrls);

  res.json({ success: true, data: products[index] });
}

async function handleProductDelete(req, res, productId) {
  const products = readDB('products.json');
  const index = products.findIndex(p => p.id === productId);
  const removed = products.splice(index, 1)[0];
  writeDB('products.json', products);

  // Cleanup all images attached to this product
  await deleteDriveFilesFromUrls([...(removed.images || []), removed.image]);

  res.json({ success: true, data: removed });
}
```

Apply the same pattern to sliders, settings (logo, paymentQr fields), and any other entity with image URLs.

### 4.7 Run the token generator (one-time)

```bash
cd backend
node scripts/generate-drive-token.js
```

What happens:
1. Browser opens to Google's OAuth consent screen
2. **Login as the Drive folder owner Gmail** (critical — must be the same account that owns the target folder)
3. You'll see "Google hasn't verified this app" warning → click **Advanced** → **Go to {app} (unsafe)** (this is normal for Testing-mode apps)
4. Consent screen: click **Continue** / **Allow**
5. Browser shows "Drive token saved" → close tab
6. CLI exits, `backend/drive-credentials.json` is now populated

### 4.8 Verify backend

Quick CLI test:

```bash
cd backend
node -e "
const drive = require('./helpers/drive');
(async () => {
  console.log(await drive.health());
  const r = await drive.uploadBuffer({
    buffer: Buffer.from('test'),
    mimeType: 'text/plain',
    filename: 'test.txt',
    folderName: 'misc'
  });
  console.log('id:', r.id, 'url: https://lh3.googleusercontent.com/d/' + r.id);
  console.log(await drive.deleteFile(r.id));
})();
"
```

Expected:
```
{ ok: true, account: 'youremail@gmail.com' }
id: 1AbCd...  url: https://lh3.googleusercontent.com/d/1AbCd...
{ ok: true }
```

If health says `service-account@...iam.gserviceaccount.com` instead of your Gmail, the credentials file has the wrong format. Re-run the token generator.

---

## 5. Frontend Setup

### 5.1 Create `src/services/googleDrive.js`

```js
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

export const uploadImage = async (file, folderName = 'misc', fileName) => {
  if (!file) throw new Error('No file provided');
  const dataB64 = await fileToBase64(file);
  const filename = fileName || file.name || `${folderName}_${Date.now()}.jpg`;
  const mimeType = file.type || 'image/jpeg';
  const res = await API.post('/drive/upload', { filename, mimeType, dataB64, folder: folderName });
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
    if (err?.response?.status === 404) return true;
    throw err;
  }
};

export const getImageUrl = (fileId) => fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : '';
```

### 5.2 (Optional) Create silent `src/services/useDrive.js`

If your project previously had a Drive setup hook, replace it with a silent stub so existing imports don't break:

```js
const useDrive = () => ({
  driveReady: true,
  needsSetup: false,
  driveLoading: false,
  setupDrive: async () => true,
  isReady: () => true,
});
export default useDrive;
```

### 5.3 Use in admin upload flow

```js
import { uploadImage, deleteImage, getImageUrl } from '../services/googleDrive';

const handleSave = async () => {
  const fileId = await uploadImage(imageFile, 'products', `product_${Date.now()}.jpg`);
  const imageUrl = getImageUrl(fileId);
  await API.post('/products', { name, image: imageUrl, ... });
};
```

**Defensive check (recommended):** before saving to Firestore, verify the URL is not still a base64 string (catches a class of bugs where Drive upload silently failed but UI proceeded):

```js
if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
  toast.error('Image upload incomplete. Please retry.');
  return;
}
```

---

## 6. Production Deployment

### 6.1 Vercel / Render / similar

`backend/drive-credentials.json` and `backend/oauth-client.json` are gitignored, so they're not in your repo. For production:

**Option A (recommended): Environment variable**

Convert the credentials JSON to a single-line string, set as `DRIVE_CREDENTIALS_JSON` env var. Update `helpers/drive.js`:

```js
const cred = process.env.DRIVE_CREDENTIALS_JSON
  ? JSON.parse(process.env.DRIVE_CREDENTIALS_JSON)
  : require(KEY_FILE);
```

**Option B: Upload via host's secret-files mechanism**

Some hosts allow you to upload "secret files" alongside your build. If yours does, drop `drive-credentials.json` into `backend/` at deploy time.

### 6.2 Folder ID per environment

Use `GOOGLE_DRIVE_MAIN_FOLDER_ID` env var to target different Drive folders for dev/staging/prod.

---

## 7. Token Lifecycle

| Event | Effect | What to do |
|---|---|---|
| Normal use | Refresh token auto-refreshes access tokens silently | Nothing |
| App revoked at https://myaccount.google.com/permissions | Refresh token invalidated | Re-run token generator |
| Account password changed | Refresh token still valid (per Google docs) | Nothing |
| 6 months without app usage | Refresh token expires | Re-run token generator |
| OAuth Consent app deleted | Refresh token invalidated | Re-create OAuth client + run token generator |

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `storageQuotaExceeded` on upload | Credentials file is a service account JSON, not OAuth | Re-run `generate-drive-token.js` and confirm the file starts with `"type": "oauth_user"` |
| `invalid_grant` on every request | Refresh token revoked or expired | Revoke at https://myaccount.google.com/permissions, then re-run token generator |
| `No refresh_token in token response` from generator | App was previously authorized — Google won't return a new refresh token | Revoke at https://myaccount.google.com/permissions, then re-run |
| `Port 54321 in use` from generator | Previous run still hanging, or some other process using the port | Kill process holding it, or change `PORT` constant in the script |
| Upload returns 500 from backend even though CLI test works | Backend started before credentials file was updated; Node cached the old `require()` of `drive-credentials.json` | Restart the backend process |
| Image deleted from app but file remains in Drive | DELETE/UPDATE handler doesn't call `deleteDriveFilesFromUrls` | Add the cleanup call as shown in section 4.6 |
| Browser shows "Google hasn't verified this app" | Normal — app is in Testing mode | Click **Advanced → Go to {app} (unsafe)**. Safe because it's your own app. |
| `health()` returns SA email, not your Gmail | Old service-account file still in place | Replace `drive-credentials.json` with the OAuth output |

---

## 9. Security Notes

- **Never commit** `drive-credentials.json` or `oauth-client.json` — both contain secrets that allow uploading/deleting files in your Drive.
- The `drive.file` scope is the **least-privilege** Drive scope: the app can only see/edit/delete files **it created**. Other files in your Drive are invisible to the app.
- The public-read permission set on uploaded files (`role: 'reader', type: 'anyone'`) means **anyone with the URL can view** the image. This is the same security model as a public website — file IDs are random and unguessable, but if the URL is leaked, the image is exposed. For private user content, omit the public-read permission and serve images via a signed URL endpoint instead.
- Backend admin routes (`/api/drive/upload`, `/api/drive/files/:id`) **must** be guarded by an admin auth check (`requireAdmin`-style middleware). Otherwise any authenticated user could spam your Drive.

---

## 10. Reference URLs

| Page | URL |
|---|---|
| Create GCP project | https://console.cloud.google.com/projectcreate |
| Enable Drive API | https://console.cloud.google.com/apis/library/drive.googleapis.com |
| OAuth Consent Screen | https://console.cloud.google.com/apis/credentials/consent |
| OAuth Credentials | https://console.cloud.google.com/apis/credentials |
| Revoke app access | https://myaccount.google.com/permissions |
| Drive folder (yours) | https://drive.google.com/drive/folders/YOUR_FOLDER_ID |
| googleapis Node docs | https://github.com/googleapis/google-api-nodejs-client |
