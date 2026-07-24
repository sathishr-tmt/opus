# OPUS — Start Here

## 1. Prerequisites
- **Node.js 20.19+**
- **MongoDB Community Server** running locally (`mongodb://localhost:27017`)

**No API keys are required.** Eight job sources work out of the box — including
**Workday** with full job descriptions. See `docs/JOB-SOURCES-AND-API-KEYS.md`.

## 2. Install
```bash
npm run install:all
```

## 3. Configure
Create `backend/.env` (copy from `backend/.env.example`):
```
MONGODB_URI=mongodb://localhost:27017/opus
JWT_SECRET=<paste random value>
APPROVAL_TOKEN_SECRET=<paste a DIFFERENT random value>
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5000
PRIMARY_ADMIN_NAME=Your Name
PRIMARY_ADMIN_EMAIL=you@example.com
PRIMARY_ADMIN_PASSWORD=YourStrongPassword123!
```

Generate each secret with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create `frontend/.env`:
```
VITE_API_BASE=http://localhost:5000
```

## 4. Prepare the database and Super Admin
```bash
npm run db:migrate --prefix backend
npm run seed:super-admin
```

## 5. Run
```bash
npm run dev
```
Open **http://localhost:5173** → sign in at `/login` with your
PRIMARY_ADMIN_EMAIL / PRIMARY_ADMIN_PASSWORD.

## 6. Tests
```bash
npm run test:unit --prefix backend   # 25 tests, no database needed
npm test --prefix backend            # full e2e suite (downloads a Mongo test binary)
```

---

## Try the main flow
1. Sign in as Super Admin → invite an Admin
2. Register a recruiter at "Register as a recruiter" → Admin approves them
3. Register a job seeker → verify email → **fill in Profile & Resume (skills + target role)**
   *(ATS scores only appear once skills are filled in)*
4. Job Search → search → each result shows an **ATS %**
5. High score → **Apply** (opens the real posting; when you come back it asks "Did you apply?")
   Lower score → **Save**
6. Dashboard → Recent applications shows the newest 6 (saved + applied)
7. Click **Rewrite** on a saved one → tailored PDF appears in **My Resumes**
8. **View all** → My Applications → 20 at a time, delete any entry

## Documentation
| File | Contents |
|---|---|
| `docs/OPUS_WORKFLOW_AND_STATUS.md` | Full click-by-click workflow for all 4 roles + deployment |
| `docs/JOB-SOURCES-AND-API-KEYS.md` | Which sources need keys (almost none) + how Workday works |
| `docs/STEP-9-SAVE-APPLY-REWRITE.md` | Save/Apply flow, unified list, Resume Rewrite |
| `docs/STEP-8-ATS-SCORING.md` | How the ATS score is calculated |
| `docs/STEP-7-MY-RESUMES.md` | My Resumes page |
| `docs/STEP-6-SINGLE-LOGIN.md` | Single login page + bcrypt bug fix |
| `docs/ROADMAP.md` | What is done and what remains |

## Notes
- **MongoDB is the only database.**
- One login page (`/login`) serves all four roles.
- Only one Super Admin exists; it is seeded and cannot be deleted.
- Rewrite works on **saved** jobs only — enforced in the backend.
- Without SMTP configured, emails are skipped and links print to the backend console.
- Workday: browsing and reading descriptions is public; submitting an
  application requires the candidate to sign in on the employer's own site.
