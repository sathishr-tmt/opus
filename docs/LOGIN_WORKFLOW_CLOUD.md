# OPUS — Single Login Workflow (cloud deployment)

One login page. Four roles. Role decided by the server, never by the client.

---

## 1. Architecture

```
                      ┌──────────────────────────────┐
                      │      BROWSER  /login         │
                      │   email + password (one form)│
                      └───────────────┬──────────────┘
                                      │ HTTPS  POST /api/auth/login
                                      ▼
              ┌────────────────────────────────────────────┐
              │  CLOUD LOAD BALANCER / TLS TERMINATION     │
              │  (Render · AWS ALB · Azure App GW · GCP LB)│
              └───────────────┬────────────────────────────┘
                              │  X-Forwarded-For / Proto
                              ▼
              ┌────────────────────────────────────────────┐
              │  NODE / EXPRESS  (app.set('trust proxy',1))│
              │                                            │
              │  rate limit → bcrypt compare → status gate │
              │  → issue JWT (httpOnly cookie) + CSRF token│
              │  → read role → return redirectPath         │
              └───────────────┬────────────────────────────┘
                              ▼
                    ┌───────────────────┐
                    │  MongoDB Atlas    │
                    │  users · sessions │
                    │  audit logs       │
                    └───────────────────┘
```

**Single service:** Express serves both the API and the built React app, so the
browser and API share one origin. This keeps cookies first-party — the simplest
and safest cloud setup.

---

## 2. The one login page — decision flow

```
                          /login
                             │
                    email + password
                             │
                             ▼
                   ┌──── rate limit ────┐
                   │  too many tries?   │──yes──► 429 "Try again later"
                   └─────────┬──────────┘
                             │ no
                             ▼
                      user exists?  ──no──► 401 "Invalid email or password"
                             │ yes                    (same message — no
                             ▼                         account enumeration)
                    bcrypt password ok? ──no──► 401 (identical message)
                             │ yes                 + audit: LOGIN_FAILED
                             ▼
                    email verified? ──no──► 403 "Verify your email first"
                             │ yes
                             ▼
                    status == active? ──no──► 403 status-specific message
                             │ yes             ├─ pending_admin_approval
                             │                 ├─ declined
                             ▼                 └─ inactive
                 ┌─────────────────────────┐
                 │ ISSUE SESSION           │
                 │  • JWT in httpOnly      │
                 │    cookie (Secure,      │
                 │    SameSite)            │
                 │  • CSRF token cookie    │
                 │  • sessionVersion       │
                 │ AUDIT: ACCOUNT_LOGIN    │
                 └───────────┬─────────────┘
                             │ server returns redirectPath
        ┌──────────────┬─────┴────────┬──────────────────┐
        ▼              ▼              ▼                  ▼
    role=user    role=recruiter   role=admin      role=super_admin
   /dashboard  /recruiter/...   /admin/...      /super-admin/...
```

> The **client never chooses** the portal. It follows `redirectPath` returned by
> the server, and every subsequent API call is re-authorised server-side.

---

## 3. Per-role journeys — account creation to portal

### 3.1 USER (job seeker) — self-service

```
/register ──► create account ──► status: pending_email_verification
                                        │
                            verification email (SMTP)
                                        │
                              click link ──► verified + active
                                        │
                                     /login ──► /dashboard
```

### 3.2 RECRUITER — self-service + approval gate

```
/staff/register ──► create account ──► verify email
                                             │
                                             ▼
                                  status: pending_admin_approval
                                             │
                        ┌────────────────────┴────────────────────┐
                        ▼                                         ▼
                 ADMIN approves                            ADMIN rejects
                 approval email sent                       decline email
                        │                                         │
                     /login                                    /login
                        │                                         │
              ──► /recruiter/dashboard                  403 "declined"

   Before approval: /login returns 403 "Pending admin approval"
```

### 3.3 ADMIN — invitation only

```
SUPER ADMIN ──► Admin Invitations ──► enter email
                        │
              single-use token (hashed in DB, TTL-limited)
                        │
                 invitation email
                        │
        invitee opens /admin-invite?token=… ──► sets own password
                        │
                 account created as ADMIN, active
                        │
                     /login ──► /admin/dashboard

   Alternate path (Super Admin only):
        promote an existing account's role to admin
        └─ backend: "Only the Super Admin may change account roles."
```

### 3.4 SUPER ADMIN — seeded once

```
deployment ──► npm run seed:super-admin
                        │
        reads PRIMARY_ADMIN_EMAIL / _PASSWORD from secrets
                        │
                exactly ONE super admin exists
                (cannot be deleted or duplicated)
                        │
                     /login ──► /super-admin/dashboard
```

---

## 4. Session lifecycle after login

```
  every API request
        │
        ├─ httpOnly cookie sent automatically (first-party)
        ├─ non-GET also sends X-CSRF-Token header
        │
        ▼
  verify JWT signature ──► expired? ──► 401 ──► client redirects to /login
        │
        ▼
  sessionVersion in token == sessionVersion in DB?
        │  no ──► 401  (password change / permission change / forced logout)
        │ yes
        ▼
  role + permission check for this route
        │  fail ──► 403
        │ pass
        ▼
  handler runs ──► sensitive actions written to AUDIT LOG
```

**Session ends when:**

| Trigger | Behaviour |
|---|---|
| Sign Out | Cookie cleared, `sessionVersion` incremented → all devices logged out |
| Idle timeout | User 60 min · Staff 10 min |
| Password change | `sessionVersion` bumped → every existing session invalid |
| Role/permission change | Affected staff must sign in again |
| Browser Back while signed in | Signed out (protected content never re-exposed from history) |
| Another tab signs out | Cross-tab sync signs this tab out too |

---

## 5. Cloud deployment settings that matter for login

### 5.1 Same-origin (recommended — one service)
```
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
FRONTEND_URL=https://opus.example.com
BACKEND_URL=https://opus.example.com
```

### 5.2 Split origins (frontend and API on different domains)
```
COOKIE_SECURE=true
COOKIE_SAME_SITE=none          ← required for cross-site cookies
CORS_ORIGINS=https://app.example.com
```
> The app refuses to boot with `SameSite=none` unless `Secure=true`, and refuses
> to boot in production with `COOKIE_SECURE=false`. These are guard rails, not
> suggestions.

### 5.3 Behind a load balancer
`app.set('trust proxy', 1)` is already configured. Without it, every request
appears to come from the balancer's IP and rate limiting would throttle all
users together.

### 5.4 Secrets — never in the repo
| Secret | Source |
|---|---|
| `JWT_SECRET` | Generated per environment, 32+ chars |
| `APPROVAL_TOKEN_SECRET` | Different value from JWT_SECRET |
| `MONGODB_URI` | Atlas connection string |
| `SMTP_USER` / `SMTP_PASS` | Mail provider app password |
| `PRIMARY_ADMIN_*` | Super Admin seed, used once |

Store in the platform's secret manager (Render env vars, AWS Secrets Manager,
Azure Key Vault, GCP Secret Manager). Rotating `JWT_SECRET` invalidates all
sessions — a deliberate emergency lever.

### 5.5 Email must work before go-live
Verification, recruiter approval and admin invitations are all email-gated. If
SMTP is unset, **no one can complete signup or accept an invitation** in
production. Configure SMTP and send one real test to each flow.

### 5.6 Other cloud requirements
| Item | Why |
|---|---|
| HTTPS everywhere | `Secure` cookies will not transmit over HTTP |
| Persistent volume at `backend/uploads` | Résumés must survive restarts |
| Health check `/api/ready` | Verifies the MongoDB connection, not just the process |
| Run `db:migrate` on deploy | Idempotent; creates collections and indexes |
| Run `seed:super-admin` once | Creates the single Super Admin |

---

## 6. Security properties

| Property | Implementation |
|---|---|
| Passwords never stored | bcrypt hash, cost 12 |
| Tokens not readable by JavaScript | httpOnly cookie (XSS cannot steal the session) |
| Cross-site request forgery | CSRF token required on every non-GET |
| Brute force | Rate limiting on login, registration and recovery |
| Account enumeration | Identical 401 for unknown email and wrong password |
| Stolen token after password change | `sessionVersion` check invalidates it |
| Privilege escalation | Role changes are Super-Admin-only, enforced server-side |
| Invitation replay | Tokens are hashed in the DB, single-use, time-limited |
| Forensics | Every login, failure, approval and role change is audit-logged |

---

## 7. Go-live checklist

```
[ ] HTTPS active on the domain
[ ] COOKIE_SECURE=true, COOKIE_SAME_SITE correct for your topology
[ ] JWT_SECRET and APPROVAL_TOKEN_SECRET are fresh, unique, 32+ chars
[ ] MONGODB_URI points at Atlas; network access restricted to the app
[ ] SMTP configured and a test email received
[ ] db:migrate run
[ ] seed:super-admin run once, credentials stored securely
[ ] /api/ready returns healthy
[ ] Verified end to end:
      user registers → verifies → logs in → /dashboard
      recruiter registers → admin approves → logs in → /recruiter/dashboard
      super admin invites admin → admin sets password → /admin/dashboard
      wrong-portal URL redirects to the caller's own portal
      sign out returns to /login
```
