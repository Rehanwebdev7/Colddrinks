/**
 * Wipe contents of Drive subfolders (products/, sliders/, logos/).
 * Subfolders themselves are preserved so structure stays intact.
 *
 * Uses the same drive-credentials.json (Spring Boot SA model) as the
 * runtime helper. The folder must be shared with that SA's email as
 * Editor.
 *
 * Usage:
 *   cd backend && node scripts/wipe-drive-folders.js
 */

const path = require('path');
const { google } = require('googleapis');
const driveHelper = require(path.join(__dirname, '..', 'helpers', 'drive'));

const SUBFOLDERS = ['products', 'sliders', 'logos'];

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, '..', 'drive-credentials.json'),
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

async function listAllInFolder(folderId) {
  const all = [];
  let pageToken = undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name)',
      pageSize: 1000,
      pageToken,
    });
    if (res.data.files) all.push(...res.data.files);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return all;
}

async function countdown(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\rDeleting in ${i}s ... press Ctrl+C to cancel  `);
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write('\rStarting deletion...                          \n');
}

(async () => {
  console.log('\n=== Drive Folder Wipe ===\n');

  const h = await driveHelper.health();
  if (!h.ok) {
    console.error('Drive auth failed:', h.error);
    process.exit(1);
  }
  console.log('Connected as:', h.account);
  console.log('');

  const plan = [];
  for (const name of SUBFOLDERS) {
    const folderId = await driveHelper.ensureSubfolder(name);
    const files = await listAllInFolder(folderId);
    plan.push({ name, folderId, files });
    console.log(`  ${name}/  (id=${folderId})  →  ${files.length} files`);
  }

  const totalFiles = plan.reduce((acc, p) => acc + p.files.length, 0);
  if (totalFiles === 0) {
    console.log('\nNothing to delete. Exiting.');
    process.exit(0);
  }

  console.log(`\n⚠️  About to permanently delete ${totalFiles} files from Drive.`);
  console.log('Subfolders will be kept — only contents removed.\n');
  await countdown(5);

  let deleted = 0, failed = 0;
  for (const { name, files } of plan) {
    if (files.length === 0) continue;
    console.log(`\n--- ${name}/ ---`);
    for (const f of files) {
      try {
        await drive.files.delete({ fileId: f.id });
        deleted++;
        process.stdout.write(`  deleted: ${f.name}  (${deleted}/${totalFiles})\n`);
      } catch (err) {
        failed++;
        console.error(`  FAIL: ${f.name} — ${err.message}`);
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Deleted: ${deleted}/${totalFiles}`);
  if (failed > 0) console.log(`Failed:  ${failed}`);
  process.exit(failed > 0 ? 2 : 0);
})().catch((err) => {
  console.error('\nWipe failed:', err.message);
  process.exit(1);
});
