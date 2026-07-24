# OPUS — MVP & Complete Workflows (all four portals)

Everything below is verified against the code in this project. Sidebar items,
routes, buttons, and redirects match exactly what is implemented.

**Contents**
1. [Login page — the entry point for everyone](#1-login-page)
2. [USER MVP](#2-user-mvp)
3. [RECRUITER MVP](#3-recruiter-mvp)
4. [ADMIN MVP](#4-admin-mvp)
5. [SUPER ADMIN MVP](#5-super-admin-mvp)
6. [How the four roles connect](#6-how-the-four-roles-connect)
7. [Rules enforced in the backend](#7-rules-enforced-in-the-backend)

---

# 1. Login page

**Route: `/login` — ONE page for all four roles.**

| You do | What happens |
|---|---|
| Enter email + password → **Sign In** | Backend checks password → email verified? → account active? → reads role |
| | Then redirects by role: |
| | `user` → `/dashboard` |
| | `recruiter` → `/recruiter/dashboard` |
| | `admin` → `/admin/dashboard` |
| | `super_admin` → `/super-admin/dashboard` |
| **Looking for a job? Create an account** | → `/register` — job seeker signup → verification email |
| **Hiring? Register as a recruiter** | → `/staff/register` — recruiter signup → **pending admin approval** |
| **Forgot password?** | → `/forgot-password` → reset email → set new password → back to `/login` |

**Blocked sign-ins**

| Situation | Message |
|---|---|
| Email not verified | "Verify your email address before signing in." |
| Recruiter not yet approved | Pending-approval message; cannot enter the portal |
| Account inactive / declined | Status-specific message |

**Security behaviour (all roles)**
- Old `/staff/login` URL → redirects to `/login`
- Visiting another role's portal URL → redirected to your own portal
- Browser **Back** while signed in → signs you out
- Idle timeout: **user 60 min**, **staff 10 min**
- **Sign Out** (bottom of every sidebar) → session cleared → `/login`

---

# 2. USER MVP

**Sidebar:** Dashboard · Job Search · My Applications · My Resumes · Calendar · Profile & Resume · Settings · Help & Support · Sign Out

### 2.1 Dashboard — `/dashboard`

**Shows:** three tiles — **Applied**, **Interviews**, **Saved Jobs** — plus *Recent Applications* (newest **6**, saved and applied mixed) and Gmail response detection.

| Click | Result |
|---|---|
| **View all (n) →** | Redirects to **My Applications** |
| **Rewrite** *(saved entries only)* | Generates a tailored resume PDF → toast confirms → file appears in **My Resumes** |
| **×** | Removes that entry from your list |
| Connect Gmail / Check Email Responses | Optional recruiter-reply detection |

> **Applied** and **Saved Jobs** are separate counts. Saving never changes the Applied number.

### 2.2 Job Search — `/dashboard/jobs`

**Shows:** filters (role, location, work mode, salary, work authorisation), then results scraped live from **RemoteOK, Remotive, Arbeitnow, Jobicy, Greenhouse, Lever, Ashby, Workday** plus internal platform postings. Every row leads with an **ATS %**.

| Click | Result |
|---|---|
| **Search** | Fetches jobs; each gets an ATS % scored against your profile |
| **ATS % badge** | Green ≥80 · blue ≥60 · amber ≥45 · red below. Hover shows why |
| **View JD** | Opens detail dialog: full description + **ATS match panel** ("Skills you have" / "Skills to add") |
| **Save** | Adds to your list as **Saved** → Saved count +1 |
| **Apply** | **Redirects to the real job portal first.** Nothing is recorded yet |
| ↳ *when you return to the tab* | Asks **"Did you apply?"** |
| ↳ **Yes, I applied** | Status becomes **Applied** → Applied count +1 |
| ↳ **Not yet** | Nothing recorded |

> ATS shows **"n/a"** until you fill in skills + target role on Profile & Resume.

### 2.3 My Applications — `/dashboard/applications`

**Shows:** tiles for Applied / Saved / Total, a filter (All · Saved only · Applied only), and **everything** you saved or applied to — **20 at a time**.

| Click | Result |
|---|---|
| **Rewrite** *(saved only)* | Tailored resume → My Resumes |
| **Apply** *(saved only)* | Opens the posting → asks "Did you apply?" → moves Saved → Applied |
| **Status dropdown** *(applied only)* | Applied → Under Review → Online Assessment → Technical Interview → Final Interview → Offer / Rejected |
| **Delete** | Removes the entry from your list |
| **View all (next 20)** | Loads the next 20 |

> **Applied entries have no Rewrite button** — the application is already submitted.

### 2.4 My Resumes — `/dashboard/resumes`

| Click | Result |
|---|---|
| **Upload / Replace resume** | Stores your base resume (PDF/DOC/DOCX, ≤5 MB) |
| **Download** (base) | Downloads it |
| **Download** (tailored) | Downloads that job-specific version |
| **Delete** (tailored) | Removes only that version |

Tailored resumes show their match score, job title and company. Re-running Rewrite for the same job **replaces** the old file.

### 2.5 Calendar — `/dashboard/calendar`
Month grid; days with recruiter-scheduled interviews highlighted violet, with time and mode.

### 2.6 Profile & Resume — `/dashboard/profile`
Name, phone, location, **target role**, **experience years**, **skills**, resume upload → **Save**.
> **This page powers the ATS score.** Without skills and target role, no scores appear.

### 2.7 Settings — `/dashboard/settings`

| Click | Result |
|---|---|
| **Send verification** | Verification email to the new address |
| **Change password** | Requires current password; signs you out afterwards |
| Notification checkboxes | Interview emails, application updates, weekly alerts |

---

# 3. RECRUITER MVP

**Sidebar:** Dashboard · My Job Postings · Create Job Posting · Assigned Applications · Interview Calendar · Recruiter Profile · Settings · Help & Support · Sign Out

> **Before approval:** a recruiter can register but cannot enter the portal until an Admin approves them.

### 3.1 Dashboard — `/recruiter/dashboard`
Tiles: My postings · Active postings · Assigned candidates · Interviews, plus an assigned-candidate preview.

| Click | Result |
|---|---|
| **View all →** | Opens Assigned Applications |

### 3.2 My Job Postings — `/recruiter/jobs`

| Click | Result |
|---|---|
| **Close** | Posting closed — disappears from job search |
| **Reopen** | Back to open |

> Recruiters **cannot delete** postings. Only Admins can.

### 3.3 Create Job Posting — `/recruiter/jobs/create`
Title*, location*, work mode, employment type, department, salary range, experience, description.

| Click | Result |
|---|---|
| **Publish posting** | Posting goes live in your list **and** in every job seeker's Job Search |

### 3.4 Assigned Applications — `/recruiter/applications`
Only candidates an Admin assigned to you.

| Click | Result |
|---|---|
| **Status dropdown** | Updates the candidate's stage |
| **Note field** (on blur) | Saves a recruiter note |
| **Schedule interview** → date/time → **Confirm** | Creates the interview, **emails the candidate**, appears on the candidate's, your, and the Admin's calendars |

### 3.5 Interview Calendar — `/recruiter/calendar`
Month grid with scheduled days highlighted + upcoming interviews list.

### 3.6 Profile / Settings — `/recruiter/profile`, `/recruiter/settings`
Read-only profile (name, company, email) + **Change password**.

---

# 4. ADMIN MVP

**Sidebar:** Dashboard · Recruiter Approvals · Applications · Job Postings · Job Sources · Calendar & Interviews · Reports · User Management · Settings · Help & Support · Sign Out

### 4.1 Dashboard — `/admin/dashboard`
Tiles: Recruiters · Pending approvals · Job postings · Applications.

| Click | Result |
|---|---|
| **View all →** (Recruiters awaiting approval) | Opens Recruiter Approvals |
| **Assign →** (Unassigned applications) | Opens Applications |

### 4.2 Recruiter Approvals — `/admin/recruiters`

| Click | Result |
|---|---|
| **Approve** | Account activated + **approval email sent** → recruiter can now sign in and post jobs |
| **Reject** | Account declined + notification email |

### 4.3 Applications — `/admin/applications`

| Click | Result |
|---|---|
| **Assign to recruiter** dropdown | Application appears instantly in that recruiter's Assigned Applications |

### 4.4 Job Postings — `/admin/jobs`

| Click | Result |
|---|---|
| **Close / Reopen** | Changes any posting platform-wide |
| **Delete** | Permanently removes any posting *(admin-only power)* |
| **Export CSV** | Downloads all postings |

### 4.5 Job Sources — `/admin/job-sources`

| Click | Result |
|---|---|
| **Probe now** | Live-checks every scraping source; Healthy/Failing pills update |

### 4.6 Calendar & Interviews — `/admin/calendar`
Month grid + every interview across all recruiters.

| Click | Result |
|---|---|
| **Cancel** | Cancels that interview |
| **Export .ics** | Calendar file of all interviews |

### 4.7 Reports — `/admin/reports`

| Click | Result |
|---|---|
| **CSV** (applications) | Every application with status and recruiter |
| **CSV** (job postings) | All postings, owners, statuses |
| **.ics** (interviews) | All scheduled interviews |
| **PDF** (platform summary) | High-level metrics |

### 4.8 User Management — `/admin/users`

| Click | Result |
|---|---|
| **Role dropdown** | Change any user's role |
| **Status dropdown** | Activate / deactivate |
| **Delete** | Remove the user |

### 4.9 Settings — `/admin/settings`
Platform name, support email, recruiter self-registration toggle, maintenance mode, own password change.

---

# 5. SUPER ADMIN MVP

**Sidebar:** Dashboard · Admin Invitations · Account Oversight · Role Permissions · Audit Logs · System Health · System Settings · Help & Support · Sign Out

> **Exactly one Super Admin exists.** It is seeded at setup and cannot be deleted or duplicated.

### 5.1 Dashboard — `/super-admin/dashboard`
Tiles: Admins · Pending invites · Total accounts · System health, plus Admin team and Recent activity.

| Click | Result |
|---|---|
| **Manage →** | Opens Admin Invitations |
| **View logs →** | Opens Audit Logs |

### 5.2 Admin Invitations — `/super-admin/admins`

| Click | Result |
|---|---|
| **Send invitation** | Emails a secure link → invitee sets their own password → becomes an Admin |

> Only a Super Admin can create Admins.

### 5.3 Account Oversight — `/super-admin/accounts`
Read-only. Counts per role (Super Admins / Admins / Recruiters / Users) + full account table.

### 5.4 Role Permissions — `/super-admin/permissions`

| Click | Result |
|---|---|
| **Toggle a permission** | Grants/revokes that capability for Admin or Recruiter |
| **Save changes** | Written to the database; **affected staff must sign in again** |

Mandatory permissions are **locked on**. User and Super Admin permissions are fixed.

### 5.5 Audit Logs — `/super-admin/audit-logs`
Every sensitive action, newest first — approvals, deletions, permission changes, interview scheduling, resume tailoring.

| Click | Result |
|---|---|
| **Export CSV** | Downloads the audit trail |

### 5.6 System Health — `/super-admin/system-health`
Database connection · SMTP/email status · job-source health.

### 5.7 System Settings — `/super-admin/settings`
Session timeouts, self-registration policy, own password change.

---

# 6. How the four roles connect

```
 SUPER ADMIN ──invites──► ADMIN
                            │
 RECRUITER ──registers──────►│ approves (email sent)
      │◄─────────────────────┘
      │ publishes job
      ▼
 USER sees the job with an ATS % in Job Search
      │
      ├─ high score ──► APPLY ──► employer portal ──► return ──► "Did you apply?" ──► Applied
      │
      └─ mid score ───► SAVE ──► My Applications ──► REWRITE ──► tailored resume ──► APPLY
                                                          │
 ADMIN assigns the application ──────────────────────────►│
      │
      ▼
 RECRUITER updates status, adds notes, schedules interview
      │
      ├──► candidate emailed + interview on USER's calendar
      └──► interview visible on ADMIN's calendar
      │
      ▼
 Every sensitive action ──────► AUDIT LOG (Super Admin)
```

---

# 7. Rules enforced in the backend

Not just hidden in the UI — the server rejects these:

| Rule | Enforcement |
|---|---|
| Rewrite works on **saved** jobs only | `POST /api/documents/rewrite` rejects applied jobs |
| Rewriting the same job replaces the old file | Previous tailored doc for that job is deleted |
| Applied count only moves on a confirmed apply | Counted from application records only |
| A job saved *and* applied appears once, as applied | De-duplicated by job ID |
| Recruiters see only assigned candidates | Permission middleware |
| Recruiters cannot delete postings | Admin-only permission |
| Only Super Admin invites admins / edits permissions | Super-admin-only routes |
| Each role reaches only its own portal | Route guards + role checks |
| Documents download only by owner, assigned recruiter, or admin | Permission check per download |

---

## Verified so far
- **25 unit tests pass** (`npm run test:unit --prefix backend`) — ATS scoring, saved/applied merge, resume generation, Workday parsing
- Frontend production build passes
- All backend modules import cleanly

## Still needs your local run
- Live job scraping (blocked from the build sandbox)
- Anything touching MongoDB, including the full e2e suite (`npm test --prefix backend`)
