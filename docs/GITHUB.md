# Pushing OPUS to GitHub safely

## 1. Confirm secrets are ignored
`.gitignore` already excludes `.env`, `backend/db.json`, and `backend/uploads/`. Verify nothing sensitive is staged:
```bash
git init
git add -A
git status                       # confirm NO .env, db.json, or uploads/ appear
git ls-files | grep -E '\.env$|db\.json' && echo "STOP: secret staged" || echo "clean"
```

## 2. First commit and push
```bash
git commit -m "OPUS: initial import"
git branch -M main
git remote add origin https://github.com/<you>/opus.git
git push -u origin main
```

## 3. Never commit
- `backend/.env` (real secrets) — only `.env.example` is committed.
- `backend/db.json` (real personal data).
- `backend/uploads/` (candidate files).
- Real API keys, passwords, or the Gmail App Password.

## 4. If a secret is ever pushed
Rotate it immediately (it's compromised the moment it's on GitHub), then purge history with `git filter-repo` or the GitHub secret-scanning remediation flow. Rotating is mandatory; scrubbing history alone is not enough.

## 5. Recommended repo hygiene
- Enable GitHub secret scanning and Dependabot (Settings > Security).
- Protect `main` (require PR review) once you have collaborators.
- Add CI that runs `npm test --prefix backend` on pull requests.
