# OPUS — Setup After Extracting the ZIP

Everything the application needs is inside the ZIP. The steps below are the
things **only you can do** — install tools, create accounts on outside services,
and paste secret values. No code changes are required.

If you want help with any single step, copy that step's block into ChatGPT or
ask me. Each block is written to be self-contained.

---

## STEP 0 — Install the tools (one time on your computer)

You need two things installed:

1. **Node.js 20.19 or newer** — https://nodejs.org (download the LTS version)
2. **MongoDB Community Server** — https://www.mongodb.com/try/download/community

After installing, open a terminal and confirm:
```bash
node --version      # should print v20.19 or higher
mongod --version    # should print a version number
```
Make sure the MongoDB service is running (on Windows it installs as a service
that starts automatically).

---

## STEP 1 — Install the project

Open the extracted `OPUS` folder in VS Code, then in its terminal:
```bash
npm run install:all
```
This installs the root, backend, and frontend packages. Wait for it to finish.

---

## STEP 2 — Create the backend secrets file

Create a file named `.env` inside the `backend` folder. Copy the block below
into it, then replace the CHANGE_ME values.

```
PORT=5000
NODE_ENV=development

FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5000

# Paste TWO different random strings here (see the command below to generate them)
JWT_SECRET=CHANGE_ME_RANDOM_1
APPROVAL_TOKEN_SECRET=CHANGE_ME_RANDOM_2

COOKIE_SECURE=false
COOKIE_SAME_SITE=lax

MONGODB_URI=mongodb://localhost:27017/opus

# This becomes your one Super Admin login
PRIMARY_ADMIN_NAME=Your Full Name
PRIMARY_ADMIN_EMAIL=you@example.com
PRIMARY_ADMIN_PASSWORD=ChooseAStrongPassword123!
ADMIN_NOTIFICATION_EMAIL=you@example.com
```

Generate each random secret by running this twice and pasting the results:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## STEP 3 — Create the frontend config file

Create a file named `.env` inside the `frontend` folder with one line:
```
VITE_API_BASE=http://localhost:5000
```

---

## STEP 4 — Prepare the database and your Super Admin

```bash
npm run db:migrate --prefix backend
npm run seed:super-admin
```
The first command creates the database structure. The second creates your single
Super Admin from the PRIMARY_ADMIN values you set in Step 2.

---

## STEP 5 — Run it

```bash
npm run dev
```
Open **http://localhost:5173** and sign in at the login page with your
PRIMARY_ADMIN_EMAIL and PRIMARY_ADMIN_PASSWORD.

---

## OPTIONAL — Email (needed for real signups)

Job-seeker verification, recruiter approval, and admin invitations all send
email. **Without this, you can still test as the Super Admin**, and in
development the email links are printed in the backend terminal so you can copy
them manually.

To send real emails with a Gmail account, add these to `backend/.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_16_char_app_password
EMAIL_FROM_NAME=OPUS
EMAIL_FROM_ADDRESS=your_gmail@gmail.com
```
Get the app password: Google Account → Security → turn on 2-Step Verification →
App passwords → create one → paste it as `SMTP_PASS` (not your normal password).

---

## OPTIONAL — More job sources

Job scraping works with **no keys** — eight sources run out of the box
(RemoteOK, Remotive, Arbeitnow, Jobicy, Greenhouse, Lever, Ashby, Workday).

To add specific employers, add any of these to `backend/.env`:
```
GREENHOUSE_COMPANIES=airbnb,stripe,databricks
LEVER_COMPANIES=netlify,postman
WORKDAY_SOURCES=[{"name":"Acme","url":"https://acme.wd5.myworkdayjobs.com/Careers"}]
```
Full details: `docs/JOB-SOURCES-AND-API-KEYS.md`.

---

## OPTIONAL — Gmail response detection

The user dashboard can scan Gmail for recruiter replies. This needs Google OAuth
credentials (free) from https://console.cloud.google.com. The rest of the app
works fine without it. See `backend/.env.example` for the variable names.

---

## When you deploy to the cloud (later)

Full deployment steps are in `docs/OPUS_WORKFLOW_AND_STATUS.md` (Part 6) and
`docs/LOGIN_WORKFLOW_CLOUD.md`. In short: MongoDB Atlas for the database, set the
same environment variables in your host's dashboard, switch `COOKIE_SECURE=true`,
add a persistent disk for `backend/uploads`, and run the migrate + seed commands
once.

---

## Quick test that everything works

```bash
npm run test:unit --prefix backend   # 30 tests — needs no database
```
If these pass, the core logic (scoring, resume generation, search rules,
Workday parsing, saved/applied lists) is working.

---

## What I could NOT test for you (please verify locally)
- **Live job scraping** — the build environment blocks outside job sites
- **Anything using MongoDB** — including the full `npm test` suite

These need your local machine with MongoDB running.
