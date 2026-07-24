# OPUS — Workflow Diagrams (all four portals)

Every diagram matches the implemented code: sidebar items, routes, buttons and
redirects are exactly what is in the ZIP.

---

## 1. LOGIN — one page for all four roles

```
/login   (ONE page — user, recruiter, admin, super admin)
   |
   ├── Sign In ──→ password ✓ ──→ email verified ✓ ──→ account active ✓ ──→ read role
   |                                                                          |
   |                    ┌──────────────┬──────────────┬──────────────────────┤
   |                    ▼              ▼              ▼                      ▼
   |               role=user     role=recruiter   role=admin        role=super_admin
   |              /dashboard  /recruiter/dashboard /admin/dashboard  /super-admin/dashboard
   |
   ├── blocked ──┬── email not verified ──→ "Verify your email first"
   |             ├── recruiter not approved ─→ "Pending admin approval"
   |             └── inactive / declined ───→ status message
   |
   ├── "Create an account" ──────→ /register ──────→ verification email ──→ /login
   ├── "Register as a recruiter" ─→ /staff/register ─→ PENDING admin approval
   └── "Forgot password?" ───────→ /forgot-password ─→ reset email ──→ /login

   old /staff/login ──→ redirects to /login
   Sign Out (any portal) ──→ /login
   Browser Back while signed in ──→ signed out
   Idle: user 60 min · staff 10 min ──→ signed out
```

---

## 2. USER portal — `/dashboard`

```
USER SIDEBAR
   |
   ├── Dashboard ──→ /dashboard
   |      |
   |      ├── tiles: Applied | Interviews | Saved Jobs      (Applied ≠ Saved)
   |      ├── Recent applications = newest 6 (saved + applied mixed)
   |      |      ├── Rewrite  (saved entries only) ──→ tailored resume ──→ My Resumes
   |      |      └── ×        ──→ removes the entry
   |      └── "View all (n) →" ──→ My Applications
   |
   ├── Job Search ──→ /dashboard/jobs
   |      |
   |      └── Search ──→ scrapes RemoteOK · Remotive · Arbeitnow · Jobicy
   |                     Greenhouse · Lever · Ashby · Workday · internal postings
   |                            |
   |                     each result shows ATS %
   |                     (green ≥80 · blue ≥60 · amber ≥45 · red below)
   |                            |
   |          ┌─────────────────┼──────────────────┬──────────────────┐
   |          ▼                 ▼                  ▼                  ▼
   |      View JD            ATS badge           SAVE               APPLY
   |          |                 |                  |                  |
   |    full description   hover = why       Saved (+1)     external portal opens
   |    + ATS panel:                          nothing        (nothing recorded yet)
   |    skills you have /                      applied              |
   |    skills to add                                          user returns
   |                                                                |
   |                                                    "Did you apply?"
   |                                                     ├── Yes ──→ Applied (+1)
   |                                                     └── No ───→ unchanged
   |
   ├── My Applications ──→ /dashboard/applications
   |      |
   |      ├── tiles: Applied | Saved | Total
   |      ├── filter: All · Saved only · Applied only
   |      ├── shows 20 at a time
   |      |     ├── SAVED entry ──┬── Rewrite ──→ tailored resume ──→ My Resumes
   |      |     |                 ├── Apply ───→ portal ──→ "Did you apply?" ──→ Applied
   |      |     |                 └── Delete ──→ removed
   |      |     └── APPLIED entry ┬── status dropdown (Applied → … → Offer / Rejected)
   |      |                       └── Delete ──→ removed
   |      |                       (NO Rewrite — already submitted)
   |      └── "View all (next 20)" ──→ loads next 20
   |
   ├── My Resumes ──→ /dashboard/resumes
   |      ├── Upload / Replace resume ──→ base resume (PDF/DOC/DOCX ≤5 MB)
   |      ├── Download (base)
   |      └── tailored versions ──┬── shows match % · job title · company
   |                              ├── Download
   |                              └── Delete
   |                       (re-running Rewrite REPLACES that job's file)
   |
   ├── Calendar ──→ /dashboard/calendar
   |      └── month grid ──→ recruiter-scheduled interview days highlighted violet
   |
   ├── Profile & Resume ──→ /dashboard/profile
   |      └── name · phone · location · TARGET ROLE · EXPERIENCE · SKILLS · resume
   |             |
   |             └──→ POWERS THE ATS SCORE
   |                  (empty skills/role ⇒ Job Search shows "ATS n/a")
   |
   ├── Settings ──→ /dashboard/settings
   |      ├── Send verification ──→ email to new address
   |      ├── Change password ──→ requires current password ──→ signs you out
   |      └── notification toggles
   |
   ├── Help & Support
   └── Sign Out ──→ /login
```

---

## 3. RECRUITER portal — `/recruiter/dashboard`

```
   registers at /staff/register ──→ PENDING ──→ admin approves ──→ can sign in
                                                      |
RECRUITER SIDEBAR  ◄──────────────────────────────────┘
   |
   ├── Dashboard ──→ /recruiter/dashboard
   |      ├── tiles: My postings | Active | Assigned candidates | Interviews
   |      └── "View all →" ──→ Assigned Applications
   |
   ├── My Job Postings ──→ /recruiter/jobs
   |      ├── Close  ──→ posting closed ──→ disappears from job seekers' search
   |      └── Reopen ──→ posting live again
   |            (NO delete — admin-only power)
   |
   ├── Create Job Posting ──→ /recruiter/jobs/create
   |      └── title* · location* · work mode · type · department · salary · description
   |             |
   |             └── Publish posting ──→ appears in My Job Postings
   |                                 └─→ appears in every USER's Job Search
   |
   ├── Assigned Applications ──→ /recruiter/applications
   |      (only candidates an ADMIN assigned to you)
   |      ├── status dropdown ──→ Applied → Under Review → Online Assessment
   |      |                        → Technical Interview → Final Interview → Offer/Rejected
   |      ├── note field ──→ saved on blur
   |      └── Schedule interview ──→ pick date/time ──→ Confirm
   |                                        |
   |                         ┌──────────────┼──────────────┐
   |                         ▼              ▼              ▼
   |                 candidate emailed  your calendar  admin calendar
   |
   ├── Interview Calendar ──→ /recruiter/calendar
   |      └── month grid + upcoming interviews list
   |
   ├── Recruiter Profile ──→ /recruiter/profile   (name · company · email, read-only)
   ├── Settings ──→ /recruiter/settings ──→ Change password
   ├── Help & Support
   └── Sign Out ──→ /login
```

---

## 4. ADMIN portal — `/admin/dashboard`

```
   created ONLY by Super Admin invitation
   |
ADMIN SIDEBAR
   |
   ├── Dashboard ──→ /admin/dashboard
   |      ├── tiles: Recruiters | Pending approvals | Job postings | Applications
   |      ├── "View all →"  (recruiters awaiting approval) ──→ Recruiter Approvals
   |      └── "Assign →"    (unassigned applications)      ──→ Applications
   |
   ├── Recruiter Approvals ──→ /admin/recruiters
   |      ├── Approve ──→ account activated ──→ approval email sent
   |      |                  └──→ recruiter can now sign in + post jobs
   |      └── Reject  ──→ declined ──→ notification email
   |
   ├── Applications ──→ /admin/applications
   |      └── "Assign to recruiter" dropdown
   |             └──→ appears instantly in that recruiter's Assigned Applications
   |
   ├── Job Postings ──→ /admin/jobs
   |      ├── Close / Reopen ──→ any posting, platform-wide
   |      ├── Delete ──→ permanently removed   (ADMIN-ONLY POWER)
   |      └── Export CSV
   |
   ├── Job Sources ──→ /admin/job-sources
   |      └── Probe now ──→ live-checks every scraper ──→ Healthy / Failing pills
   |
   ├── Calendar & Interviews ──→ /admin/calendar
   |      ├── month grid + EVERY interview across ALL recruiters
   |      ├── Cancel ──→ interview cancelled
   |      └── Export .ics
   |
   ├── Reports ──→ /admin/reports
   |      ├── CSV  ──→ applications (status + assigned recruiter)
   |      ├── CSV  ──→ job postings (owners + statuses)
   |      ├── .ics ──→ all interviews
   |      └── PDF  ──→ platform summary
   |
   ├── User Management ──→ /admin/users
   |      ├── role dropdown ──→ change any user's role
   |      ├── status dropdown ──→ activate / deactivate
   |      └── Delete ──→ remove user
   |
   ├── Settings ──→ /admin/settings
   |      └── platform name · support email · self-registration toggle
   |          maintenance mode · own password change
   |
   ├── Help & Support
   └── Sign Out ──→ /login
```

---

## 5. SUPER ADMIN portal — `/super-admin/dashboard`

```
   EXACTLY ONE Super Admin — seeded at setup, cannot be deleted or duplicated
   |
SUPER ADMIN SIDEBAR
   |
   ├── Dashboard ──→ /super-admin/dashboard
   |      ├── tiles: Admins | Pending invites | Total accounts | System health
   |      ├── "Manage →"    ──→ Admin Invitations
   |      └── "View logs →" ──→ Audit Logs
   |
   ├── Admin Invitations ──→ /super-admin/admins
   |      └── Send invitation ──→ secure email link
   |                 └──→ invitee sets own password ──→ becomes ADMIN
   |            (only a Super Admin can create admins)
   |
   ├── Account Oversight ──→ /super-admin/accounts     [READ-ONLY]
   |      └── counts: Super Admins | Admins | Recruiters | Users
   |          + full account table
   |
   ├── Role Permissions ──→ /super-admin/permissions
   |      ├── toggle a permission (Admin or Recruiter)
   |      |      └── mandatory permissions are LOCKED ON
   |      |      └── User + Super Admin permissions are FIXED
   |      └── Save changes ──→ written to database
   |                 └──→ affected staff must SIGN IN AGAIN
   |
   ├── Audit Logs ──→ /super-admin/audit-logs
   |      ├── every sensitive action, newest first
   |      |    (approvals · deletions · permission changes · interviews · rewrites)
   |      └── Export CSV
   |
   ├── System Health ──→ /super-admin/system-health
   |      └── database connection · SMTP status · job-source health
   |
   ├── System Settings ──→ /super-admin/settings
   |      └── session timeouts · self-registration policy · own password
   |
   ├── Help & Support
   └── Sign Out ──→ /login
```

---

## 6. How the four roles connect

```
SUPER ADMIN ──invites──→ ADMIN
                           |
RECRUITER ──registers──────→| approves (email sent)
     |◄─────────────────────┘
     |
     └── publishes job
              |
              ▼
        USER sees it in Job Search with an ATS %
              |
              ├── high score ──→ APPLY ──→ employer portal ──→ return
              |                                    └──→ "Did you apply?" ──→ Applied
              |
              └── mid score ───→ SAVE ──→ My Applications
                                           └──→ REWRITE ──→ tailored resume
                                                    └──→ then APPLY
              |
              ▼
        application arrives ──→ ADMIN assigns it to a RECRUITER
                                        |
                                        ▼
                        RECRUITER updates status · adds notes · schedules interview
                                        |
                        ┌───────────────┼───────────────┐
                        ▼               ▼               ▼
                candidate emailed   USER calendar   ADMIN calendar

        every sensitive action ──────→ AUDIT LOG ──→ visible to SUPER ADMIN
```

---

## 7. Enforced in the backend (server rejects, not just hidden)

```
Rewrite on an APPLIED job        ──→ 400 rejected
Rewrite without saving first     ──→ 400 rejected
Rewrite without a profile        ──→ 400 rejected
Rewrite same job twice           ──→ old file replaced, not duplicated
Recruiter deleting a posting     ──→ blocked (admin-only)
Recruiter viewing unassigned     ──→ blocked (only assigned candidates)
Admin doing super-admin actions  ──→ blocked
Second Super Admin               ──→ impossible
Wrong portal URL for your role   ──→ redirected to your own portal
Downloading someone's resume     ──→ blocked unless owner / assigned recruiter / admin
```
