/**
 * One-time interactive script to generate a Drive OAuth refresh token.
 *
 * Prereqs:
 *   1. In Google Cloud Console (cold-drinks-drive project):
 *      - Configure OAuth Consent Screen (External, drive.file scope, add
 *        the Drive folder owner's email as a test user)
 *      - Create OAuth Client ID → Application type: Desktop app
 *      - Download the JSON, save as backend/oauth-client.json
 *   2. Run: node scripts/generate-drive-token.js
 *
 * Flow:
 *   - Reads client_id + client_secret from oauth-client.json
 *   - Spins up a local HTTP server on port 54321
 *   - Opens default browser to Google consent screen
 *   - User logs in as the folder owner (rehanwebdev7@gmail.com), clicks Allow
 *   - Browser redirects to localhost:54321/oauth2callback?code=...
 *   - Script exchanges code for tokens, writes drive-credentials.json
 *
 * Run once. Refresh token does not expire for non-sensitive scopes (drive.file).
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
  console.error('Steps:');
  console.error('  1. Google Cloud Console -> APIs & Services -> Credentials');
  console.error('  2. Create Credentials -> OAuth client ID -> Desktop app');
  console.error('  3. Download JSON, save as backend/oauth-client.json');
  console.error('  4. Re-run this script.\n');
  process.exit(1);
}

const clientFile = JSON.parse(fs.readFileSync(OAUTH_CLIENT_FILE, 'utf8'));
const installed = clientFile.installed || clientFile.web || clientFile;
const CLIENT_ID = installed.client_id;
const CLIENT_SECRET = installed.client_secret;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n[X] Could not find client_id/client_secret in oauth-client.json');
  console.error('Expected shape: { "installed": { "client_id": "...", "client_secret": "..." } }\n');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\n=== Drive OAuth Token Generator ===\n');
console.log('Client ID :', CLIENT_ID);
console.log('Scope     :', SCOPES.join(', '));
console.log('Redirect  :', REDIRECT_URI);
console.log('\nOpening browser for consent...');
console.log('(If it does not open, paste this URL manually):\n');
console.log(authUrl);
console.log(`\nWaiting for callback on ${REDIRECT_URI} ...\n`);

const platform = process.platform;
const opener =
  platform === 'win32' ? `start "" "${authUrl}"` :
  platform === 'darwin' ? `open "${authUrl}"` :
  `xdg-open "${authUrl}"`;
exec(opener, () => { /* silent — user can paste manually */ });

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/oauth2callback') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  if (parsed.query.error) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`OAuth error: ${parsed.query.error}`);
    console.error('\n[X] OAuth error from Google:', parsed.query.error);
    server.close();
    process.exit(2);
  }

  const code = parsed.query.code;
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing ?code in callback. Did you click Allow?');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <h1 style="color:#dc2626">No refresh_token returned</h1>
        <p>This usually means you previously authorized this app.</p>
        <p>Fix: revoke the app at
        <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>
        and re-run the script.</p>
      `);
      console.error('\n[X] No refresh_token in token response.');
      console.error('Fix: revoke the app at https://myaccount.google.com/permissions then rerun.\n');
      server.close();
      process.exit(2);
    }

    const cred = {
      type: 'oauth_user',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
    };
    fs.writeFileSync(CRED_OUT_FILE, JSON.stringify(cred, null, 2) + '\n');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!doctype html>
      <html><head><meta charset="utf-8"><title>Done</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding:60px; text-align:center; background:#f9fafb;">
        <div style="max-width:480px; margin:0 auto; background:white; padding:40px; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h1 style="color:#16a34a; margin:0 0 12px;">Drive token saved</h1>
          <p style="color:#374151; margin:0 0 20px;">You can close this tab. The CLI will exit automatically.</p>
          <p style="color:#6b7280; font-size:13px; margin:0;">Saved to <code>backend/drive-credentials.json</code></p>
        </div>
      </body></html>
    `);

    console.log('\n[OK] Token saved to', CRED_OUT_FILE);
    console.log('     Refresh token will not expire for drive.file scope.');
    console.log('     You will not need to re-run this script unless the app is revoked.\n');

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 500);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Token exchange failed: ' + err.message);
    console.error('\n[X] Token exchange failed:', err.message);
    server.close();
    process.exit(2);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[X] Port ${PORT} is in use. Close the process holding it and re-run.\n`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(2);
});

server.listen(PORT);
