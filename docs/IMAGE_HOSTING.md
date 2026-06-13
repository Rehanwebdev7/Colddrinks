# Image Hosting — Cloudinary (with Drive rollback)

**As of 2026-06-13:** Cloudinary is the primary image hosting backend. Google Drive code is preserved in the tree (with `=== DRIVE_LEGACY_BEGIN/END ===` markers) for one-command rollback if needed.

## Quick reference

| Action | Command |
|--------|---------|
| Verify Cloudinary works | `node backend/scripts/test-cloudinary.js` |
| Migrate existing Drive images | `node backend/scripts/migrate-drive-to-cloudinary.js --dry-run` then without `--dry-run` |
| Rollback to Drive | `node backend/scripts/toggle-drive-backend.js enable` + restart server |
| Switch back to Cloudinary | `node backend/scripts/toggle-drive-backend.js disable` + restart server |
| Find orphan images monthly | `node backend/scripts/cleanup-orphan-cloudinary.js` (dry-run) then `--apply` |

## Setup for new developer

1. Get Cloudinary credentials from team lead OR sign up at https://cloudinary.com (free)
2. Copy `backend/.env.example` to `backend/.env`
3. Fill in `CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME`
4. (Optional) Set `CLOUDINARY_ROOT_FOLDER=colddrinks-dev` for personal sandbox cloud
5. Run `node backend/scripts/test-cloudinary.js` — must show "6 PASS / 0 FAIL"

## Architecture

- **Storage:** `public_id` (e.g., `colddrinks/products/coke-cherry-abc123`) stored in DB
- **Delivery:** Server normalizer (`normalizeDriveImageUrl` in `server.js`) detects Cloudinary public_ids by `colddrinks/` prefix and builds full CDN URLs with `f_auto,q_auto` transformations
- **Folder hierarchy:** `colddrinks/<folder>/<filename>-<auto-suffix>` (flat per folder, e.g., `colddrinks/products/coke-main-abc123`)
- **Compression:** Frontend compresses images to ~500 KB before upload (uses `browser-image-compression` library, GIFs skipped)
- **Cleanup:** Atomic upsert — when admin replaces an image, server diffs old vs new and deletes removed assets via backend factory pattern

## Endpoint mapping

| Drive (legacy) | Cloudinary (active) |
|----------------|---------------------|
| `POST /api/drive/upload` | `POST /api/images/upload` |
| `DELETE /api/drive/files/:id` | `DELETE /api/images/:publicId` |
| `GET /api/drive/health` | `GET /api/images/health` |
| `GET /api/drive/files/:id` (proxy, kept for legacy URLs) | N/A — Cloudinary URLs render directly from CDN |

Both Drive endpoints stay active for the transition period to keep snapshot URLs in legacy orders/bills rendering. After CL-8 commenting, only `/api/drive/files/:id` stays alive (with placeholder fallback on auth failure).

## Detection rules (for code review)

- Cloudinary public_id: starts with `colddrinks/` (root folder)
- Drive proxy URL: starts with `/api/drive/files/`
- Drive raw fileId: 20+ char alphanumeric, no slashes or colons
- Full HTTPS URL: starts with `http://` or `https://`

The `imageBackend.js` factory's `detectImageBackend()` function is the authoritative detector — use it in any new code that handles references.

## Pre-deploy checklist

Before deploying Cloudinary-related changes to Render:
- [ ] Render dashboard → Environment → `CLOUDINARY_URL` set (sync: false, don't store in render.yaml)
- [ ] Render dashboard → Environment → `CLOUDINARY_ROOT_FOLDER=colddrinks`
- [ ] Smoke test: `node backend/scripts/test-cloudinary.js` passes locally
- [ ] Admin UI quick check: upload new product image, verify it appears in Cloudinary dashboard at `colddrinks/products/`

## Rollback procedure (Drive recovery)

If Cloudinary becomes unusable (account issues, outage > 30 min):

1. **Refresh Drive token** (it likely expired during the Cloudinary period):
   ```bash
   node backend/scripts/generate-drive-token.js
   ```
2. **Uncomment Drive code** via toggle script:
   ```bash
   node backend/scripts/toggle-drive-backend.js enable
   ```
3. **Restart server:**
   - Local: `node backend/server.js`
   - Render: dashboard → "Manual Deploy" or env-var change auto-restarts
4. **Verify in logs:** `[Drive] Auth OK — uploads available as <account>`
5. **(Optional) Run reverse migration:** for any new Cloudinary uploads that happened during the Cloudinary period, you'd need to download from Cloudinary and re-upload to Drive — that script is NOT included by default; ask if you need it.

To switch back to Cloudinary after the issue resolves:
```bash
node backend/scripts/toggle-drive-backend.js disable
# restart server
```

## Free-tier credit budget (Cloudinary)

- **25 credits/month** = 25 GB storage OR 25 GB bandwidth OR 25,000 transformations (mix as needed)
- Current scale (~50 products, ~150 images): uses ~1.7 credits/month → 15x headroom
- Alerts: dashboard → Settings → Notifications → set 80% threshold
- Monitor monthly via dashboard → Usage tab

## Files involved

| File | Purpose |
|------|---------|
| `backend/helpers/cloudinary.js` | Cloudinary SDK wrapper (upload, delete, URL builder) |
| `backend/helpers/imageBackend.js` | Factory — detects backend by ref shape, routes operations |
| `backend/helpers/drive.js` | Legacy Drive helper (kept for rollback) |
| `backend/server.js` | `/api/images/*` endpoints + `/api/drive/*` legacy endpoints, normalizers, cleanup |
| `backend/scripts/test-cloudinary.js` | Smoke test (run after credential changes) |
| `backend/scripts/migrate-drive-to-cloudinary.js` | One-time migration script |
| `backend/scripts/cleanup-orphan-cloudinary.js` | Monthly orphan asset cleanup |
| `backend/scripts/toggle-drive-backend.js` | Enable/disable Drive code via marker-based comment toggle |
| `frontend/src/services/googleDrive.js` | Upload service (talks to `/api/images/upload`) |
| `frontend/src/utils/imageCompression.js` | Client-side compression hook |

## Known limitations

- Cloudinary outage = images broken (no SLA on free tier; >99.9% historical uptime)
- Free-tier credit limit is a soft cap (account stays alive past it)
- Rollback to Drive requires Drive token still being valid — refresh proactively before rollback

## Known unmigrated assets (action required by admin)

During the 2026-06-13 cutover the migration script failed to fetch 3 assets — Google returned an HTML error page instead of the image bytes (public access was blocked mid-run, likely throttle/quota). These records still point at `https://lh3.googleusercontent.com/d/<fileId>` URLs which the backend now serves as a grey "Image unavailable" placeholder SVG via the legacy fallback route.

**Affected records:**

| Where | Record | What admin does |
|-------|--------|-----------------|
| `backend/database/sliders.json` | SLD-001 (hero slider) | Admin → `/admin/sliders` → edit SLD-001 → upload image → save |
| `backend/database/settings.json` | `logo` | Admin → `/admin/theme` → upload Logo → save |
| `backend/database/settings.json` | `favicon` | Admin → `/admin/theme` → upload Favicon → save |

Each new upload goes through the Cloudinary flow automatically (no special steps). Verify success by reloading the customer-facing site — the slider, header logo, and browser-tab icon should render normally.

## Snapshot URLs in historical orders / cart / offline-sales

Some legacy order, bill, cart, and offline-sale records still carry snapshot image URLs pointing at `lh3.googleusercontent.com/d/<fileId>` for the 3 unmigrated assets above. These render as placeholder SVGs in customer order history.

**Why we left it:** Historical snapshots are read-only data — they aren't blocking new business. Rewriting them is purely cosmetic, and the placeholder degrades gracefully.

**If you ever want to clean them up:** re-run the migration script (`migrate-drive-to-cloudinary.js --snapshots`) after the 3 affected products / sliders / settings have been re-uploaded — the new Cloudinary URLs will then exist in the mapping table and snapshots will be rewritten on the next pass.

## Historical artifact: duplicate Cloudinary uploads (PRD-002/003/004)

During the first migration run (2026-06-13), the script processed `product.image` (main) and `product.images[0]` (gallery) as independent uploads even when both fields referenced the SAME source Drive fileId. Each of those 3 products has 2 Cloudinary assets storing identical bytes:

- `colddrinks/products/prd-002-main` ≈ `colddrinks/products/prd-002-gallery-1`
- `colddrinks/products/prd-003-main` ≈ `colddrinks/products/prd-003-gallery-1`
- `colddrinks/products/prd-004-main` ≈ `colddrinks/products/prd-004-gallery-1`

Storage waste: roughly 30-100 KB total (negligible against the 25 GB free quota), so we left it in place rather than risk a destructive cleanup. **No customer impact** — both copies render correctly via the Cloudinary CDN.

The migration script was patched (F8 fix) to add a `migrateRef()` wrapper that caches `fileId → public_id` and reuses prior uploads. Future migrations will not create these duplicates.

If you ever want to reclaim the storage:
1. Pick a canonical public_id per product (e.g. `prd-002-main`)
2. Edit `backend/database/products.json` so `images[0]` matches `image`
3. Sync to Firestore (admin script or hand-set via console)
4. Run `node backend/scripts/cleanup-orphan-cloudinary.js --apply` — the now-unreferenced `gallery-1` assets get pruned

## Operational scripts (cheat sheet)

- `test-cloudinary.js` — verify credentials + smoke test upload/delete
- `migrate-drive-to-cloudinary.js` — main one-time migration; safe to re-run (idempotent)
- `migrate-drive-to-cloudinary.js --snapshots` — also rewrite cart / orders / bills / inventoryMovements URLs
- `rewrite-snapshots-from-backup.js` — emergency: rebuild fileId→public_id mapping from `database.backup-pre-migration-YYYY-MM-DD` and rewrite snapshots (use when `migration-mapping.json` was lost / overwritten)
- `cleanup-orphan-cloudinary.js` — list Cloudinary assets not referenced in DB (dry-run); add `--apply` to delete
- `toggle-drive-backend.js disable` / `enable` — comment / uncomment Drive code blocks (rollback tool; not always lossless — verify manually after running)
