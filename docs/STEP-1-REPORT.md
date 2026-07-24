# OPUS — Step 1 Delivery Report: Secret scrubbing & hygiene

Date: 2026-07-15
Scope: security hygiene only. **Zero behavior, route, design, or feature changes.**
Working copy: `outputs/opus-project/` (node_modules and dist excluded; recreated by `npm run install:all`).

## Files changed

| File | Change | Reason |
|---|---|---|
| `backend/.env.example` | Rewritten. All real credentials removed (Gmail address, Gmail app password, admin password) and replaced with `CHANGE_ME_*` placeholders. Duplicate keys (`PORT`, `JWT_SECRET`, `FRONTEND_URL`, `BACKEND_URL`, `EMAIL_FROM_NAME`) removed — the old file defined them twice and dotenv silently used the first value. Added comments for cookie modes, secret generation, and Gmail App Password setup. | This file gets committed to GitHub; it contained live secrets. |
| `backend/.env` | Rewritten with the same placeholder structure. **You must fill in your values (see "What you must do" below).** | The old file contained the now-revoked app password and real personal data; it also had the duplicate-key bug that made the active `JWT_SECRET` the placeholder string `first-long-random-value`. |
| `.gitignore` | Added `backend/db.json` (real personal data + password hashes), `backend/uploads/`, `.env.local` variants, `*.log`, `logs/`, `Thumbs.db`. | Previously only `db.local.json` was ignored; a `git push` would have published your real user data. |
| `package.json` (root) | Removed `react-router-dom@^7.18.1`. | Unused — the frontend uses its own History-API router; the dependency was never imported. |
| `backend/server.js` | `defaultDb.settings` fallback: personal name/email/bio replaced with empty strings (lines ~124–129). | Hardcoded personal data in source. This default is only used when a profile has no stored values; real name/email always overrides it via `getUserSettings`, so behavior is unchanged. |
| `frontend/src/pages/AdminLogin.jsx` | Neutralized to a stub comment. Verified not imported anywhere (superseded by the in-App `/staff/login`). Physical deletion pending your file-delete approval. | Dead code. |

## Verification performed
- Secret scan across the whole working copy (excluding gitignored `db.json`): **no leaked credentials remain.**
- Duplicate-key scan on `backend/.env`: none.
- `node --check` on `server.js`, `jobSources.js`, `seedAdmin.js`: all pass.
- No dependencies added. No database changes. No migrations.

## What you must do (in `backend/.env` only — never in `.env.example`)
1. Generate two secrets: run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` twice; paste into `JWT_SECRET` and `APPROVAL_TOKEN_SECRET`.
2. Set `PRIMARY_ADMIN_NAME`, `PRIMARY_ADMIN_EMAIL`, and a **new** `PRIMARY_ADMIN_PASSWORD` (not the old exposed one).
3. Set `SMTP_USER`, `EMAIL_FROM_ADDRESS`, `ADMIN_NOTIFICATION_EMAIL` to your Gmail address and paste your **new** app password into `SMTP_PASS`.
4. Then `npm run seed:super-admin` recreates/updates your Super Admin with the new password.

## Known limitations
- `backend/db.json` still contains your existing accounts and data — intentionally kept as a temporary legacy-data source for the optional MongoDB import process and now gitignored.
- Changing `JWT_SECRET` invalidates all existing sessions — everyone signs in again. Expected and correct after a credential leak.
- Frontend production build not re-run in this step (no build-affecting frontend source changed); it will be exercised in Step 2 verification.

## Next step (awaiting your go-ahead)
Step 2 — split `backend/server.js` into modules (config / middleware / routes / services) with an identical route inventory, verified by before/after diff and runtime smoke tests.
