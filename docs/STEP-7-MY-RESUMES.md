# Step 7 — My Resumes page

## Goal
The user prototype has a **My Resumes** screen listing the base resume plus
AI-tailored versions (for example "Java_Developer_Acme_95pct.docx — 95% match").
The app had resume upload inside Profile & Resume, but no list screen, no nav
item, and no way to store or show tailored versions. This step adds the page and
the storage those later features need.

## What changed

### Backend
| File | Change |
|---|---|
| `src/models.js` | The document schema gained optional metadata for tailored resumes: `label`, `matchScore`, `jobTitle`, `company`, `sourceJobId`. All default to `null`, so existing documents are unaffected and no migration is required. `kind` now formally means `'resume'` (the single base resume) or `'tailored'` (generated for one job). |
| `src/repos.js` | `insertDocument()` persists the new fields and `rowToDocument()` returns them. |
| `src/routes/documents.js` | **New** `GET /api/documents` — returns every document the signed-in user owns, split into `baseResume` and `tailored`, newest first. |
| `src/routes/documents.js` | **New** `DELETE /api/documents/:documentId` — deletes one of the user's own documents (file + database row) and writes a `DOCUMENT_DELETED` audit entry. Ownership is checked; another user's document returns 404. |

Existing behaviour is untouched: uploading a base resume still replaces only
documents of kind `resume`, so tailored versions survive a base-resume replacement.
Downloads still go through the existing permission-checked
`GET /api/documents/:documentId/download`.

### Frontend
| File | Change |
|---|---|
| `src/lib/constants.js` | Added the **My Resumes** sidebar item (between My Applications and Calendar). |
| `src/lib/router.js` | Added the `resumes` → `/dashboard/resumes` route. |
| `src/portals/user/MyResumesPage.jsx` | **New page.** Base resume card with upload/replace and download, plus a tailored-resumes card showing each version's match-score pill, job title, company, download, and delete. Includes loading and empty states. |
| `src/App.jsx` | Renders `MyResumesPage` for the `resumes` page. |

## Why this came first
The tailored-resume list is where the **Resume Rewrite** feature has to save its
output, and the match-score field is what **ATS scoring** fills in. Building the
storage and the screen first means those two features have somewhere to write to
and something to display, instead of being bolted on later.

## Verification
- Frontend production build: **passes** (`vite build`).
- Backend modules (`documents.js`, `models.js`, `repos.js`) load cleanly.
- Endpoints were **not** exercised at runtime — MongoDB cannot run in the build
  sandbox. Please verify locally (see below).

## Manual test checklist
1. Sign in as a job seeker → **My Resumes** appears in the sidebar.
2. With no resume uploaded, the base card shows the upload prompt.
3. Upload a PDF/DOC/DOCX → it appears as the base resume with size and age.
4. Download it → the correct file downloads.
5. Replace it → the old file is removed and the new one shows.
6. Tailored card shows the empty-state message (Rewrite does not exist yet).
7. `GET /api/documents` returns `{ documents, baseResume, tailored }`.
8. `DELETE /api/documents/:id` on another user's document returns 404.

## Next
- **ATS match score** — fills `matchScore` per job in Job Search.
- **Resume Rewrite** — writes a `kind: 'tailored'` document with `label`,
  `matchScore`, `jobTitle`, `company`, and `sourceJobId`, which this page already
  knows how to display.
