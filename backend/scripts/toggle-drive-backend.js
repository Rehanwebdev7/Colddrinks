/**
 * Toggle Drive backend code between commented (default) and active states.
 *
 * Usage:
 *   node backend/scripts/toggle-drive-backend.js disable  # comment Drive code (Cloudinary only)
 *   node backend/scripts/toggle-drive-backend.js enable   # uncomment Drive code (rollback)
 *
 * What it does:
 *   - Scans target files for blocks bounded by `=== DRIVE_LEGACY_BEGIN ===` and
 *     `=== DRIVE_LEGACY_END ===` markers.
 *   - 'disable' adds `// ` prefix to every line inside (skipping already-commented lines)
 *   - 'enable' removes `// ` prefix from every line inside
 *   - Inverse operation on `=== CLOUDINARY_ACTIVE_BEGIN ===` blocks
 *   - Idempotent — safe to run twice with same arg
 *   - In-place edit with .bak backup file
 *
 * Files affected:
 *   - backend/server.js
 *   - backend/helpers/imageBackend.js
 *   - frontend/src/services/googleDrive.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TARGETS = [
  path.join(ROOT, 'backend', 'server.js'),
  path.join(ROOT, 'backend', 'helpers', 'imageBackend.js'),
  path.join(ROOT, 'frontend', 'src', 'services', 'googleDrive.js'),
];

const BEGIN_DRIVE = '=== DRIVE_LEGACY_BEGIN ===';
const END_DRIVE = '=== DRIVE_LEGACY_END ===';
const BEGIN_CLOUD = '=== CLOUDINARY_ACTIVE_BEGIN ===';
const END_CLOUD = '=== CLOUDINARY_ACTIVE_END ===';

function processFile(filePath, mode) {
  if (!fs.existsSync(filePath)) {
    console.warn(`✗ skip (missing): ${filePath}`);
    return { changed: 0 };
  }
  const original = fs.readFileSync(filePath, 'utf8');
  const lines = original.split(/\r?\n/);

  // We process two block kinds:
  //   DRIVE block:     mode 'enable' = uncomment; mode 'disable' = comment
  //   CLOUDINARY block: opposite (so only one backend is active at a time)
  let inDriveBlock = false;
  let inCloudBlock = false;
  let changedLines = 0;

  const processed = lines.map((line) => {
    if (line.includes(BEGIN_DRIVE)) { inDriveBlock = true; return line; }
    if (line.includes(END_DRIVE))   { inDriveBlock = false; return line; }
    if (line.includes(BEGIN_CLOUD)) { inCloudBlock = true; return line; }
    if (line.includes(END_CLOUD))   { inCloudBlock = false; return line; }

    if (!inDriveBlock && !inCloudBlock) return line;
    // Skip the marker lines themselves (they have the markers in them)
    // Marker lines are typically wrapped in `// ` or `=` separators — we identify them by
    // having the bare marker text. Any non-marker line inside the block toggles.

    // Determine target state for this line based on block + mode
    let shouldBeCommented;
    if (inDriveBlock) {
      shouldBeCommented = mode === 'disable';
    } else if (inCloudBlock) {
      shouldBeCommented = mode === 'enable'; // when enabling Drive, disable Cloudinary
    } else {
      return line;
    }

    const isCurrentlyCommented = /^\s*\/\//.test(line) || /^\s*$/.test(line) || /^\s*#/.test(line);
    // Detect a "structural" comment line we wrote intentionally (separator bars, marker context)
    const isStructural = /^\s*\/\/\s*=+\s*$/.test(line) || /^\s*\/\/\s*={3,}/.test(line) ||
                         /^\s*\/\/\s*$/.test(line) || /^#/.test(line);

    if (isStructural) return line; // never modify separator/comment scaffolding

    if (shouldBeCommented) {
      // Add `// ` prefix if not already
      if (/^\s*\/\//.test(line)) return line; // already commented
      if (/^\s*$/.test(line)) return line;
      const indent = line.match(/^(\s*)/)[1];
      changedLines++;
      return `${indent}// ${line.slice(indent.length)}`;
    } else {
      // Remove `// ` prefix if present
      const match = line.match(/^(\s*)\/\/\s?(.*)$/);
      if (match) {
        changedLines++;
        return `${match[1]}${match[2]}`;
      }
      return line;
    }
  });

  const updated = processed.join('\n');
  if (updated === original) {
    console.log(`· ${path.relative(ROOT, filePath)} — no changes (already in target state)`);
    return { changed: 0 };
  }

  // Backup before write
  fs.writeFileSync(`${filePath}.bak`, original);
  fs.writeFileSync(filePath, updated);
  console.log(`✓ ${path.relative(ROOT, filePath)} — ${changedLines} lines changed`);
  return { changed: changedLines };
}

function main() {
  const mode = (process.argv[2] || '').toLowerCase();
  if (!['enable', 'disable'].includes(mode)) {
    console.error('Usage: node backend/scripts/toggle-drive-backend.js enable|disable');
    console.error('  enable  = uncomment DRIVE_LEGACY blocks (rollback to Drive)');
    console.error('  disable = comment DRIVE_LEGACY blocks (Cloudinary only)');
    process.exit(1);
  }

  console.log(`Toggling Drive backend → ${mode.toUpperCase()}`);
  console.log('Backup files (.bak) will be created for each modified file.\n');

  let totalChanged = 0;
  for (const file of TARGETS) {
    const result = processFile(file, mode);
    totalChanged += result.changed;
  }

  console.log(`\n=== Total ${totalChanged} lines modified across ${TARGETS.length} files ===`);
  console.log('\nNext steps:');
  console.log('  1. Restart backend server');
  if (mode === 'enable') {
    console.log('  2. Verify Drive credentials are valid (re-generate token if needed)');
    console.log('  3. Check logs: should see "[Drive] Auth OK ..." instead of "FAILED"');
  } else {
    console.log('  2. Verify Cloudinary credentials in env');
    console.log('  3. Check logs: should see "[Cloudinary] Auth OK ..."');
  }
  console.log('  4. To revert: run this script with the opposite argument');
}

main();
