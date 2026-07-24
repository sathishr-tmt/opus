# Step 8 — ATS match scoring

## Goal
The user prototype shows an **ATS %** against every job in Job Search. The app
previously showed only a coarse label ("Exact match", "Strong match", "Nearby
match") derived from search relevance, not from how well the user actually fits
the job. This step adds a real, per-user match score.

## What it does
For each job, the score answers: *how well does this user's profile match this
posting?* It also returns the skills that matched and the ones that are missing,
so the user knows what to fix.

### Scoring model (deterministic, offline, no API key)
| Weight | Factor |
|---|---|
| 60% | Overlap between the skills the posting asks for and the user's skills |
| 20% | How closely the job title matches the user's target role |
| 10% | Years of experience versus what the posting requires |
| 10% | Work-mode / location fit |

The result is clamped to **25–99%** so the number stays believable.

Skills are detected with a dictionary of ~75 technologies, each with aliases
(`k8s` → Kubernetes, `postgres` → PostgreSQL, `reactjs` → React). Matching is on
word boundaries, so "reactive" does not count as "React".

If the posting lists no recognisable skills, the score leans on job-title
relevance instead of a flat neutral value — otherwise an unrelated job (e.g.
"Office Coordinator") would outrank a technical job the user simply lacks the
stack for. This was caught during testing and fixed.

If the user has not filled in skills or a target role, the score is returned as
`null` and the UI shows "ATS n/a" with a prompt to complete their profile,
rather than a misleading number.

## What changed
| File | Change |
|---|---|
| `backend/src/ats.js` | **New.** `scoreJob()`, `attachAtsScores()`, plus `extractSkills()`, `requiredYears()`, `titleOverlap()` helpers and the skill dictionary. |
| `backend/src/routes/user.js` | `/api/jobs`, `/api/jobs/fetch`, and `/api/saved` now attach `atsScore`, `atsMatched`, `atsMissing`, and `atsReasons` to every job using the signed-in user's saved profile. |
| `frontend/src/portals/user/JobSearchPage.jsx` | Results table leads with the ATS percentage in a colour band (green ≥80, blue ≥60, amber ≥45, red below), lists missing skills underneath, and keeps the old relevance label as secondary context. The job-detail dialog gains an "ATS match" panel explaining the score with "Skills you have" and "Skills to add". |
| `backend/tests/ats.test.mjs` | **New.** 9 unit tests, no database required. |
| `backend/package.json` | Added `npm run test:unit`. |

## Verification
- **9/9 unit tests pass** (`npm run test:unit` in `backend/`) covering skill
  extraction, false positives, year parsing, relative ranking, score bounds,
  the empty-profile case, and determinism.
- Frontend production build passes.
- `routes/user.js` loads cleanly.

Sample output for a profile of *Java Backend Developer, 4 years, remote,
Java/Spring Boot/Hibernate/REST/MySQL/Git/Docker*:

| Score | Job | Missing |
|---|---|---|
| 91% | Java Developer | Agile |
| 74% | Senior Java Developer (5+ yrs) | Kafka, Kubernetes |
| 31% | Office Coordinator | — |
| 25% | Frontend Developer | TypeScript, React, CSS, Redux, Next.js |
| 25% | Machine Learning Engineer | Python, TensorFlow, PyTorch, Pandas, Spark |

## Swapping in AI later
`scoreJob()` is the single entry point. An AI-backed scorer (Gemini free tier,
Groq, or OpenRouter) can be added behind the same signature without changing any
caller. The recommended pattern is to keep this rule-based scorer as the
fallback so the app still works when no API key is set, the quota is exhausted,
or the network call fails.

## Next
**Resume Rewrite** — generate a job-tailored resume, save it as a
`kind: 'tailored'` document with its `matchScore`, and surface it on the My
Resumes page built in Step 7.
