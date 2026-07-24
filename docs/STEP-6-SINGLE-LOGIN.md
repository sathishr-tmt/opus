# Step 6 — Unified single login page

## Goal
OPUS previously had two login pages: `/login` (job seekers) and `/staff/login`
(recruiter, admin, super admin). The specification calls for **one login page for
every role**, with the portal chosen from the account's role after sign-in.

## What changed

### Backend
| File | Change |
|---|---|
| `src/authFlows.js` | `processLogin()` gained an `allowAllRoles` option. When set, the entry-point role checks are skipped, so User, Recruiter, Admin, and Super Admin all authenticate through the same endpoint. `rememberMe` is now derived after the account loads and stays disabled for staff roles. The audit entry records `entryPoint: 'unified'`. |
| `src/routes/auth.js` | `POST /api/auth/login` now runs in unified mode. `POST /api/staff/auth/login` is kept as a backward-compatible alias with identical behaviour. |
| `src/routes/auth.js` | **Bug fix:** `import bcrypt from 'bcryptjs'` was commented out while `bcrypt.hash()` was still called in password reset and admin-invitation acceptance. Both endpoints would have thrown `ReferenceError: bcrypt is not defined`. The import is restored. |
| `src/email.js`, `src/routes/account.js`, `src/routes/auth.js` | Every generated login link (verification, approval, email change, password reset/change) now points at `/login` instead of `/staff/login`. |

The response shape is unchanged. `/api/auth/login` still returns
`{ message, portal, redirectPath, sessionExpiresInMs, user }`, and `redirectPath`
is the role's portal home:

| Role | redirectPath |
|---|---|
| `user` | `/dashboard` |
| `recruiter` | `/recruiter/dashboard` |
| `admin` | `/admin/dashboard` |
| `super_admin` | `/super-admin/dashboard` |

### Frontend
| File | Change |
|---|---|
| `src/lib/router.js` | Added `LOGIN_PATH = '/login'`. All four entries of `ROLE_LOGIN_PATHS` now resolve to it. |
| `src/App.jsx` | Removed the `/staff/login` branch and the `StaffLoginPage` import. `/staff/login` now redirects to `/login`. Protected routes, cross-tab logout, admin-invitation completion, and forgot-password all return to the single login page. |
| `src/pages/Login.jsx` | Now the login page for every role. Subtitle explains it serves job seekers, recruiters, and administrators. Added a "Register as a recruiter" link beside "Create an account". Footer explains recruiter accounts need approval and admin accounts are invitation-only. |
| `src/pages/VerifyEmail.jsx` | "Continue to Login" always goes to `/login`. |
| `src/portals/staff/RecruiterRegisterPage.jsx` | All "back to login" links point to `/login`. |
| `src/portals/staff/StaffLoginPage.jsx` | Reduced to a deprecated stub that redirects to `/login`; kept only so older imports do not break. |

## Security behaviour preserved
- Password verification, email-verification gate, and account-status gate are unchanged and still run for every role.
- Failed logins are still rate limited and audit logged.
- "Remember me" remains a job-seeker-only convenience; staff sessions stay short.
- Role guarding on portal routes is unchanged — each role can only reach its own portal.
- All RBAC enforcement remains in the backend middleware.

## Verification
- Frontend production build: **passes** (`vite build`, 1798 modules).
- Backend module load: **passes** (`src/routes/auth.js` imports cleanly).
- The full e2e suite (`npm test` in `backend/`) needs to run on your machine —
  `mongodb-memory-server` cannot download its MongoDB binary in this sandbox.

## Manual test checklist
1. Sign in as the seeded Super Admin → lands on `/super-admin/dashboard`.
2. Sign in as an Admin → lands on `/admin/dashboard`.
3. Sign in as an approved Recruiter → lands on `/recruiter/dashboard`.
4. Sign in as a job seeker → lands on `/dashboard`.
5. A pending (unapproved) recruiter is refused with the approval message.
6. An unverified user is refused with the verification message.
7. Visiting `/staff/login` redirects to `/login`.
8. Signing out from any portal returns to `/login`.
9. Password reset and admin-invitation acceptance both complete (these were broken by the missing `bcrypt` import).
