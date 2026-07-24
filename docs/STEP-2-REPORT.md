# OPUS — Step 2 Delivery Report: Backend modular split

Date: 2026-07-15
Scope: structural refactor of `backend/server.js` (5,141 lines) into modules. **Zero route, behavior, or API changes** — code was moved with an AST-based script (byte-identical function bodies), not retyped.

## New backend structure

```
backend/
├── server.js              (95 lines — entry: app wiring, middleware order, route registration, static serve, listen)
├── jobSources.js          (unchanged)
├── src/
│   ├── config.js          env constants + production safety checks
│   ├── store.js           db.json read/write, per-user data helpers, getDashboard
│   ├── security.js        cookies, JWT, CSRF, rate limiters, ROLE_PERMISSIONS, requireAuth/requireRole/requirePermission
│   ├── audit.js           addAuditLog
│   ├── email.js           SMTP transport + all email templates/senders
│   ├── authFlows.js       processLogin, registerAccount, approval-request helpers
│   ├── gmailUtil.js       Gmail OAuth + message parsing helpers
│   ├── internal.js        internal-application helpers shared by Admin and Recruiter routes
│   ├── jobsLegacy.js      the OLD in-file job pipeline (see note below)
│   └── routes/
│       ├── auth.js  account.js  superAdmin.js  admin.js
│       ├── recruiter.js  user.js  gmail.js  health.js
```

## Deliberate changes (the only ones)
1. `DB_FILE` path in `src/store.js` adjusted to `../db.json` so the database stays at `backend/db.json`.
2. Middleware order preserved exactly: trust proxy → CORS → JSON parser → no-store headers → CSRF → routes → static → SPA fallback → listen.
3. Route registration is grouped by domain; all 58 paths are distinct, so match behavior is unchanged (verified below).

## Finding logged for your decision (no action taken)
`src/jobsLegacy.js` (1,110 lines) contains an older duplicate job pipeline (`fetchLiveJobs`, `filterJobs`, six inline source fetchers). The live search route uses only `fetchAllowedJobs` from `jobSources.js`. The legacy module is currently dead weight kept byte-for-byte per the no-silent-deletion rule. Recommendation: delete it in a later step after you approve.

## Verification performed (all on the refactored code)
- `node --check` on all 19 files: pass.
- Static undefined-identifier scan (AST): clean (caught and fixed one missing `fsSync` import in the entry file).
- Route inventory before vs after: **58/58 identical** (method + path diff).
- Boot: clean.
- Smoke tests, identical results to the pre-refactor baseline run:
  - staff login 200 with correct role/redirect; `/api/auth/me` restore 200
  - 8 staff/admin/super-admin GET endpoints 200; recruiter-only and user-only endpoints correctly 403 for a super admin
  - logout without CSRF token 403; with token 200; `/me` after logout 401
  - wrong password 401 with generic message
- Full lifecycle E2E on refactored code: user registration → email-verification link (302) → login blocked with "awaiting Admin approval" (403) → Super Admin approves via PATCH → user login 200 (user portal, 12 h session) → `/api/dashboard` 200 → `/api/admin/users` as user 403.
- Test accounts were created only in my sandbox copy; **your `backend/db.json` was not modified.**

## Dependencies / migrations / env changes
None. (`acorn` was used only as a dev-time script in the sandbox; it is not added to package.json.)

## How to run (unchanged)
`npm run install:all` → `npm run seed:super-admin` → `npm run dev`

## Next step (awaiting go-ahead)
Step 3 — MongoDB: Mongoose models, a repository-based data-access layer, a one-time `db.json` importer, and Docker Compose for local MongoDB.