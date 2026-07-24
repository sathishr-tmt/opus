# OPUS — Development Roadmap

Where the project stands after reading the full codebase, and the order I would
build the remaining work as a professional engineer.

## Current state (strong)
The project is far more complete than a typical MVP:

- **Backend:** modular Express app, Mongoose models, ~70 API endpoints across auth, account, user, recruiter, admin, super-admin, documents, exports, gmail, and health.
- **Security:** bcrypt hashing, JWT in httpOnly cookies, CSRF tokens, rate limiting, session-version revocation, Helmet, and RBAC enforced in backend middleware (not just the UI).
- **RBAC:** dynamic, database-backed permissions with mandatory permissions locked on; super-admin-only editing.
- **Features working end to end:** registration + email verification, recruiter approval, application assignment, interview scheduling, audit logging, job-source health, CSV/PDF/ICS exports, resume upload and permission-checked download.
- **Deployment:** Render blueprint, multi-stage Dockerfile, docker-compose, and a documented Atlas setup.

## Gaps against the prototype specification

| # | Gap | Impact | Effort |
|---|---|---|---|
| 1 | ~~Two login pages~~ | **Done — Step 6** | — |
| 2 | `bcrypt` import commented out while still used | ~~Password reset and admin invitation returned 500~~ **Fixed in Step 6** | — |
| 3 | ~~No **ATS match score** per job~~ | **Done — Step 8** | — |
| 4 | No **Resume Rewrite** (AI tailoring + download) | A headline feature of the user prototype is entirely absent | Large |
| 5 | ~~No **My Resumes** page~~ | **Done — Step 7** | — |
| 6 | Recruiter/Admin **profile fields not editable** | Prototype allows editing department/company; current forms are read-only | Small |
| 7 | **Notification preferences** not wired | Settings checkboxes exist in the prototype; no persistence or effect | Small |
| 8 | Test suite is a **single file** and cannot run in CI without Mongo binaries | Regression risk as features grow | Medium |

## Recommended build order

### Phase 1 — Correctness and foundations ✅ (done)
1. Merge the two logins into one role-routing login page.
2. Fix the `bcrypt` import bug blocking password reset and admin invitations.

**Why first:** authentication is the entry point for every role. A broken reset
flow and a split login are the two things that would embarrass you in a demo,
and both are small, low-risk changes.

### Phase 2 — Close the user-facing feature gaps (highest visible value)
3. **My Resumes page** — new `GET /api/documents` list endpoint, sidebar item, route, and page showing base + tailored resumes with upload and download. Reuses the existing document model and permission-checked download route.
4. **ATS match score** — compute a real percentage by comparing the user's resume text against the job description (keyword/skill overlap, title match, seniority). Store it on the job result so the table can show `88%` like the prototype.
5. **Resume Rewrite** — generate a tailored resume for a specific job, save it as a document linked to that job, return the new match score, and let the user download it. This is the most complex item: it needs resume text extraction, a rewrite step, and .docx generation.

**Why this order:** items 3 and 4 are prerequisites for 5. Building the resume
list and scoring first means the rewrite feature has somewhere to store its
output and a number to improve.

### Phase 3 — Polish the staff experience
6. Editable recruiter and admin profile fields (department, company) with a `PUT /api/profile` extension for staff roles.
7. Persist notification preferences and honour them when sending interview and application emails.

### Phase 4 — Hardening before launch
8. Split the e2e suite into per-domain files (auth, user, recruiter, admin, super-admin) and pin the `mongodb-memory-server` binary version so tests run offline and in CI.
9. Add a GitHub Actions workflow: install → build frontend → run backend tests.
10. Production checklist: real SMTP credentials, Atlas IP allowlist, `COOKIE_SECURE=true`, rotated `JWT_SECRET`, and a first backup/restore rehearsal using the existing `BACKUP_RESTORE.md`.

## Suggested next step
Phase 2, item 3 (**My Resumes**) — it is self-contained, visible in the UI, and
unblocks the ATS and Rewrite features that follow.
