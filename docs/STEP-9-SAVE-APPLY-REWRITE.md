# Step 9 — Save / Apply flow, unified list, and Resume Rewrite

This step implements the workflow you specified.

## The flow

```
Job Search — every result shows its ATS %
        │
        ├── score good enough ──► APPLY
        │        └─ redirects to the real job portal FIRST
        │           └─ when you come back: "Did you apply?"
        │                ├─ Yes → status Applied → Applied count +1
        │                └─ No  → nothing recorded
        │
        └── score needs work ───► SAVE → status Saved → Saved count +1
                                   │
                    Dashboard → Recent applications (newest 6)
                                   │  View all →
                    My Applications (20 at a time)
                                   │
                              REWRITE (saved only)
                                   └─► tailored resume → My Resumes
```

## Rules enforced

| Rule | Where |
|---|---|
| Apply does not record anything until the user returns and confirms | `JobSearchPage.jsx` — the confirm fires on `visibilitychange`/`focus`, not on click |
| Saved jobs can be rewritten | `myJobs.js` sets `canRewrite: true` |
| **Applied jobs cannot be rewritten** | Enforced in the **backend** (`POST /api/documents/rewrite` rejects it), not just hidden in the UI |
| Applied count changes only on a confirmed apply | Counts come from `appliedCount`, which only counts application records |
| Saved count never affects the applied count | They are counted separately in `getMyJobs()` |
| A job saved *and* later applied to appears once, as applied | `myJobs.js` de-duplicates by `jobId` |
| Rewriting the same job twice replaces the file | `documents.js` deletes the previous tailored doc for that `sourceJobId` |

## What changed

### Backend
| File | Change |
|---|---|
| `src/myJobs.js` | **New.** Merges saved jobs and applications into one date-sorted list with `kind`, `status`, `canRewrite`, ATS scores, pagination, and separate `savedCount` / `appliedCount`. No schema change — MongoDB is untouched. |
| `src/resumeBuilder.js` | **New.** Generates the tailored resume PDF with **pdfkit (already installed)**. Promotes the skills the job asks for to the top, writes a role-specific summary, and footers the ATS score plus suggested additions. No new packages, no API key, no network call. |
| `src/routes/user.js` | **New** `GET /api/my-jobs` (paginated unified list) and `DELETE /api/my-jobs/:kind/:id` (remove a saved or applied entry). |
| `src/routes/documents.js` | **New** `POST /api/documents/rewrite`. Verifies the job is saved, rejects already-applied jobs, requires a profile, replaces any previous tailored resume for that job, and writes a `RESUME_TAILORED` audit entry. |

### Frontend
| File | Change |
|---|---|
| `portals/user/JobSearchPage.jsx` | Apply now redirects first and asks "Did you apply?" only when the user returns to the tab. |
| `portals/user/DashboardPage.jsx` | Stat tiles are now **Applied** and **Saved Jobs** (separate counts). Recent Applications shows the newest 6 saved+applied with status pills, ATS badge, **Rewrite on saved entries only**, delete, and **View all →** which opens My Applications. |
| `portals/user/MyApplicationsPage.jsx` | Rebuilt as the unified list: Applied/Saved/Total tiles, filter (All / Saved only / Applied only), 20 at a time with **View all (next 20)**, delete on every entry, Rewrite + Apply on saved entries, status dropdown on applied entries. |
| `App.jsx` | Passes `onViewAll` so the dashboard link opens My Applications. |

## Verification
- **20/20 unit tests pass** — `npm run test:unit` in `backend/`, no database needed:
  - `ats.test.mjs` (9) — scoring
  - `myjobs.test.mjs` (6) — merge, de-duplication, separate counts, rewrite eligibility, pagination without duplicates
  - `resume.test.mjs` (5) — valid PDF output, score/gaps, skill promotion, safe file names, sparse profiles
- Frontend production build passes.
- Generated PDF was extracted and read back to confirm the content is correct and job-relevant skills appear first.

Sample generated resume (Java developer applying to a Senior Java role):

```
Sathish Reddy
Senior Java Developer
sathish@example.com · +1 555 012 3456 · Dallas, TX

PROFESSIONAL SUMMARY
Java Backend Developer with 4+ years of experience, applying for Senior Java
Developer at Acme Corp. Strengths relevant to this role include Java, Spring
Boot, Hibernate, REST, MySQL, Docker.

SKILLS
Relevant to this role: Java, Spring Boot, Hibernate, REST, MySQL, Docker
Additional: Git, React

Tailored by OPUS · ATS match 74% · Consider adding: Kafka, Kubernetes
```

## Still to run on your machine
The full e2e suite (`npm test`) needs MongoDB, which cannot run in the build
sandbox. Run it locally to confirm the database-backed paths.
