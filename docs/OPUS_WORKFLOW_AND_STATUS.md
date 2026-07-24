# OPUS — Complete Workflow & Development Status

Everything in this document reflects the code as it stands in the **OPUS-dev**
folder, after the work done in this session.

---

# PART 1 — What I received and read

Your ZIP (`OPUS_Project_For_Sharing.zip`) contained the full project:

- **Backend:** Express + Mongoose, ~70 API endpoints across 10 route files
  (auth, account, user, recruiter, admin, superAdmin, documents, exports, gmail, health)
- **Frontend:** React + Vite + Tailwind, 4 portals, no router library
- **Database:** MongoDB only (Mongoose) — local Community Server for dev, Atlas for production
- **Security:** bcrypt, JWT in httpOnly cookies, CSRF tokens, rate limiting, session-version revocation, Helmet, backend-enforced RBAC
- **Deployment:** `render.yaml`, multi-stage `Dockerfile`, `docker-compose.yml`
- **Docs:** deployment, backup/restore, monitoring, changelog, step reports

---

# PART 2 — What we built in this session

| Step | What | Status |
|---|---|---|
| **Prototype conversion** | Rebuilt all 4 portals in React to match your 4 prototype HTML pages — compact sidebar, stat tiles, cards, status pills, month calendars, toasts. Wired to the real API. | Done |
| **Step 6 — Single login** | Merged `/login` and `/staff/login` into **one login page** for all 4 roles, routed by role after sign-in. | Done |
| **Step 6 — Bug fix** | `import bcrypt` was commented out but still called → **password reset and admin-invitation acceptance were crashing with 500**. Restored. | Done |
| **Step 7 — My Resumes** | New sidebar item, page, `GET /api/documents`, `DELETE /api/documents/:id`, and document fields for tailored resumes. | Done |
| **Step 8 — ATS scoring** | Real per-user match % on every job, with matched/missing skills and an explanation panel. 9 unit tests passing. | Done |
| **Resume Rewrite** | Generate a job-tailored resume, save it, show it in My Resumes. | **Next** |

Verified: frontend production build passes; backend modules load; 9/9 ATS unit
tests pass. The full e2e suite must run on your machine (MongoDB can't run in my
sandbox).

---

# PART 3 — Full workflows: click by click

## 3.1 — Single login (shared by all four roles)

```
                        ┌─────────────────────────┐
                        │   /login  (ONE page)    │
                        │  email + password       │
                        └───────────┬─────────────┘
                                    │ submit
                        ┌───────────▼─────────────┐
                        │ Backend checks:         │
                        │  1. password (bcrypt)   │
                        │  2. email verified?     │
                        │  3. account active?     │
                        │  4. reads role          │
                        └───────────┬─────────────┘
                                    │ returns redirectPath
        ┌───────────────┬───────────┼───────────────┬───────────────┐
        ▼               ▼           ▼               ▼               │
    role=user     role=recruiter  role=admin  role=super_admin      │
   /dashboard  /recruiter/dashboard /admin/... /super-admin/...     │
                                                                    │
   Blocked cases: unverified email → "verify first"                 │
                  recruiter not yet approved → "pending approval"   │
                  inactive/declined → status message ───────────────┘
```

| Click | Result |
|---|---|
| **Sign In** | Role detected → matching portal opens |
| **Forgot password?** | `/forgot-password` → email with reset link → set new password → back to `/login` |
| **Create an account** | `/register` → job-seeker signup → verification email |
| **Register as a recruiter** | `/staff/register` → recruiter signup → **pending admin approval** |
| **Old `/staff/login` URL** | Redirects to `/login` |
| **Sign Out** (any portal) | Session cleared → back to `/login` |
| **Browser Back while signed in** | Signs you out (security policy) |
| **Idle** | User 60 min / staff 10 min → auto sign-out |

---

## 3.2 — Side-by-side: the four portals

| | **USER** | **RECRUITER** | **ADMIN** | **SUPER ADMIN** |
|---|---|---|---|---|
| **How the account is created** | Self-register + verify email | Self-register → **admin approves** | **Invited by Super Admin** | Seeded once (only one exists) |
| **Sidebar** | Dashboard, Job Search, My Applications, My Resumes, Calendar, Profile & Resume, Settings | Dashboard, My Job Postings, Create Job Posting, Assigned Applications, Interview Calendar, Profile, Settings | Dashboard, Recruiter Approvals, Applications, Job Postings, Job Sources, Calendar & Interviews, Reports, User Management, Settings | Dashboard, Admin Invitations, Account Oversight, Role Permissions, Audit Logs, System Health, System Settings |
| **Dashboard shows** | Jobs applied, Interviews, recent applications | My postings, Active, Assigned candidates, Interviews | Recruiters, Pending approvals, Postings, Applications + 2 action cards | Admins, Pending invites, Total accounts, Health + admin team & recent activity |
| **Main job** | Find and apply to jobs | Post jobs, progress assigned candidates | Approve recruiters, assign applications | Govern access and audit everything |

---

## 3.3 — USER portal: click → result

| Screen | Click | What happens |
|---|---|---|
| **Dashboard** | "View all →" | Opens My Applications |
| **Job Search** | Set filters → **Search** | `POST /api/jobs/fetch` pulls from job sources + platform postings; each result gets an **ATS %** |
| | **View JD** | Opens detail dialog: full description + **ATS match panel** ("Skills you have" / "Skills to add") |
| | **ATS % badge** | Green ≥80, blue ≥60, amber ≥45, red below. Hover shows the reasons |
| | **Save Job** | Adds to saved list |
| | **Apply** | Opens the real job link in a new tab, then asks **"Did you apply?"** |
| | → **Yes, I applied** | Records it as `Applied` in My Applications; dashboard counts update |
| | → **Not yet** | Nothing recorded |
| | **Rewrite** *(next feature)* | Will generate a tailored resume and save it to My Resumes |
| **My Applications** | Status dropdown | Updates status (Applied → Under Review → Online Assessment → Technical Interview → Final Interview); dashboard recalculates |
| | Delete | Removes the tracked application |
| **My Resumes** | **Upload / Replace resume** | Stores the base resume (PDF/DOC/DOCX, ≤5 MB) |
| | **Download** | Permission-checked download |
| | **Delete** (tailored) | Removes that tailored version only |
| **Calendar** | Month grid | Days with recruiter-scheduled interviews are highlighted violet |
| **Profile & Resume** | Save | Stores name, phone, location, target role, experience, **skills** — *these feed the ATS score* |
| **Settings** | Change email | Sends verification to the new address |
| | Change password | Requires current password; signs you out afterwards |

> **Important:** ATS scores only appear once the user fills in **skills** and
> **target role** on Profile & Resume. Until then the column shows "ATS n/a".

---

## 3.4 — RECRUITER portal: click → result

| Screen | Click | What happens |
|---|---|---|
| **(before approval)** | Sign in | Refused with "pending approval" until an admin approves |
| **Dashboard** | "View all →" | Opens Assigned Applications |
| **My Job Postings** | **Close** | Posting becomes `closed` and stops appearing in job search |
| | **Reopen** | Back to `open`. *Recruiters cannot delete — only admins can* |
| **Create Job Posting** | **Publish posting** | `POST /api/recruiter/jobs`; appears in My Job Postings **and** in every user's Job Search |
| **Assigned Applications** | Status dropdown | Updates the candidate's stage |
| | Note field (on blur) | Saves a recruiter note against the candidate |
| | **Schedule interview** → pick date/time → **Confirm** | Creates the interview, **emails the candidate**, and it appears on the recruiter's, the candidate's, and the admin's calendars |
| **Interview Calendar** | Month grid | Scheduled days highlighted + upcoming interviews list |
| **Settings** | Change password | Requires current password |

---

## 3.5 — ADMIN portal: click → result

| Screen | Click | What happens |
|---|---|---|
| **Dashboard** | "View all →" | Opens Recruiter Approvals |
| | "Assign →" | Opens Applications |
| **Recruiter Approvals** | **Approve** | Account becomes active, **approval email sent** — recruiter can now sign in and post jobs |
| | **Reject** | Account declined, notification email sent |
| **Applications** | Recruiter dropdown | Assigns the application → it instantly appears in that recruiter's Assigned Applications |
| **Job Postings** | Close / Reopen | Changes any posting's status platform-wide |
| | **Delete** | Permanently removes any posting (admin-only power) |
| | Export CSV | Downloads all postings |
| **Job Sources** | **Probe now** | Live-checks each external feed; health pills update |
| **Calendar & Interviews** | Month grid + list | Every interview across all recruiters |
| | **Cancel** | Cancels an interview |
| | Export .ics | Calendar file of all interviews |
| **Reports** | CSV / PDF / .ics buttons | Downloads applications, postings, interviews, or platform summary |
| **User Management** | Role / status dropdowns | Changes any user's role or activates/deactivates them |
| | Delete | Removes a user |

---

## 3.6 — SUPER ADMIN portal: click → result

| Screen | Click | What happens |
|---|---|---|
| **Dashboard** | "Manage →" / "View logs →" | Opens Admin Invitations / Audit Logs |
| **Admin Invitations** | **Send invitation** | Emails a secure link; invitee sets their own password and becomes an admin |
| **Account Oversight** | — | Read-only view of every account with per-role counts |
| **Role Permissions** | Toggle a permission → **Save changes** | Updates RBAC in the database. **Mandatory permissions are locked on.** Affected staff must sign in again |
| **Audit Logs** | — | Every sensitive action, newest first |
| | Export CSV | Downloads the audit trail |
| **System Health** | — | Database connection, SMTP status, job-source health |
| **System Settings** | — | Session timeouts, self-registration policy; own password change |

> Only **one** Super Admin exists. It is seeded and cannot be deleted or duplicated.

---

## 3.7 — The end-to-end story (how the roles connect)

```
 USER                    RECRUITER               ADMIN               SUPER ADMIN
  │                          │                     │                      │
  │                          │                     │                 seeds/invites
  │                          │                     │◄─────────────────────┘
  │                          │  self-registers     │
  │                          ├────────────────────►│ approves recruiter
  │                          │◄────────────────────┤ (email sent)
  │                          │                     │
  │                          │ publishes job       │
  │◄─────────────────────────┤                     │
  │ sees job + ATS %         │                     │
  │ clicks Apply             │                     │
  ├──────────────────────────┼────────────────────►│ application arrives
  │                          │                     │ assigns to recruiter
  │                          │◄────────────────────┤
  │                          │ updates status,     │
  │                          │ adds notes,         │
  │                          │ schedules interview │
  │◄─────────────────────────┤                     │
  │ interview email +        │                     │
  │ calendar entry           │                     │ sees it on admin calendar
  │                          │                     │
  └──────────── every sensitive action ───────────►│─────► audit log (Super Admin)
```

---

# PART 4 — What is still to build

| Priority | Item | Notes |
|---|---|---|
| **1** | **Resume Rewrite** | Generate a job-tailored resume from profile data + job requirements, output PDF via **pdfkit (already installed)**, save as a tailored document, show on My Resumes. **Zero new dependencies. MongoDB stays the only database.** |
| 2 | Editable recruiter/admin profile fields | Department, company |
| 3 | Notification preferences honoured when sending email | Settings toggles currently display only |
| 4 | Split the e2e test suite + pin the Mongo test binary | So tests run offline and in CI |
| 5 | Optional: Gemini free-tier polish for Rewrite wording | Env-var controlled, falls back to rule-based |

---

# PART 5 — Running it in VS Code

**Prerequisites:** Node.js 20.19+, MongoDB Community Server running locally, VS Code.

```bash
# 1. Open the project folder in VS Code, then in the terminal:
npm run install:all

# 2. Create backend/.env from the example, and set at minimum:
#    MONGODB_URI=mongodb://localhost:27017/opus
#    JWT_SECRET=<random 32+ chars>
#    APPROVAL_TOKEN_SECRET=<different random 32+ chars>
#    COOKIE_SECURE=false
#    COOKIE_SAME_SITE=lax
#    PRIMARY_ADMIN_NAME / PRIMARY_ADMIN_EMAIL / PRIMARY_ADMIN_PASSWORD
#    (generate a secret:)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Create frontend/.env with:
#    VITE_API_BASE=http://localhost:5000

# 4. Prepare the database (idempotent — safe to re-run)
npm run db:migrate --prefix backend

# 5. Create the one Super Admin account
npm run seed:super-admin

# 6. Start both servers
npm run dev
```

Then open **http://localhost:5173** and sign in at `/login` with the
`PRIMARY_ADMIN_EMAIL` / `PRIMARY_ADMIN_PASSWORD` you set.

**Tests**
```bash
npm run test:unit --prefix backend   # ATS scoring — no database needed
npm test --prefix backend            # full e2e suite — downloads a Mongo test binary
```

**Without SMTP configured:** email sending is skipped and verification/reset
links are printed in the backend console in development, so you can still test
the flows.

---

# PART 6 — Deployment checklist

Your app deploys as **one web service**: Express serves the API *and* the built
React app.

### A. Database — MongoDB Atlas
1. Create a free M0 cluster.
2. Create a database user and password.
3. Network Access → allow your Render egress (or `0.0.0.0/0` to start).
4. Copy the connection string → this becomes `MONGODB_URI`.

### B. Email — SMTP
Gmail: enable 2-Step Verification → create an **App Password** → use it as
`SMTP_PASS`. Without this, no verification/approval/interview emails are sent.

### C. Deploy on Render (blueprint already in the repo)
1. Push the project to GitHub.
2. Render → **New → Blueprint** → select the repo (it reads `render.yaml`).
3. Build: installs backend + frontend, builds the frontend.
   Start: runs migrations, then `node backend/server.js`.
   Health check: `/api/ready`.
4. Set these environment variables in the Render dashboard (never in the repo):

| Variable | Value |
|---|---|
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | Random 32+ chars (Render can generate) |
| `APPROVAL_TOKEN_SECRET` | Different random 32+ chars |
| `NODE_ENV` | `production` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAME_SITE` | `lax` |
| `FRONTEND_URL` / `BACKEND_URL` | Your Render URL (same, single service) |
| `SMTP_HOST/PORT/SECURE/USER/PASS` | Your SMTP details |
| `EMAIL_FROM_NAME` / `EMAIL_FROM_ADDRESS` | Sender identity |
| `PRIMARY_ADMIN_*` | Super Admin seed credentials |
| `ADMIN_NOTIFICATION_EMAIL` | Where approval alerts go |

5. After the first deploy, run the seed command once to create the Super Admin.
6. Add a **persistent disk** mounted at `backend/uploads` so resumes survive restarts.

### D. Post-deploy verification
- `GET /api/ready` returns healthy
- Sign in as Super Admin at `/login`
- Invite an admin → the email arrives
- Register a recruiter → admin approves → recruiter signs in
- Register a user → verify email → search jobs → ATS % appears after filling in the profile
- Apply → confirm → admin assigns → recruiter schedules an interview → candidate gets the email

### E. Alternative: Docker
```bash
docker compose up --build
```
The `Dockerfile` builds the frontend, then serves it from the backend on port 5000.

### F. Before going live
- Rotate `JWT_SECRET` and `APPROVAL_TOKEN_SECRET` away from any dev values
- Confirm `.env` files are gitignored (they are)
- Restrict Atlas network access to Render's IPs
- Rehearse a backup and restore once (see `docs/BACKUP_RESTORE.md`)
