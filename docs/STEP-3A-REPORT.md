# OPUS — Step 3a Delivery Report: Dead-code removal + MongoDB foundation

Date: 2026-07-17
Scope: remove the unused job pipeline and establish the MongoDB/Mongoose database foundation.

## Part 1 — Dead job pipeline removed

- Deleted `src/jobsLegacy.js` (approximately 1,100 lines): the unused duplicate job-search pipeline containing `fetchLiveJobs`, `filterJobs`, inline source fetchers, and matcher functions.
- The live job search continues to use `fetchAllowedJobs` from `jobSources.js`.
- The six helpers that were still required were moved into `src/jobsUtil.js`: `JOB_STATUS_OPTIONS`, `normalizeJobStatus`, `getStoredJobStatus`, `attachJobStatuses`, `mergeUniqueJobs`, and the internal `normalizeValue` helper.
- Syntax and undefined-identifier checks passed.
- The server booted successfully.
- The authenticated `/api/jobs?search=java+developer` endpoint returned the expected response structure.
- Individual source failures remained isolated and did not break the complete job search.

## Part 2 — MongoDB foundation

| File | Purpose |
|---|---|
| `backend/src/mongo.js` | Manages the Mongoose connection using `MONGODB_URI` and exposes database connection status. |
| `backend/src/models.js` | Defines the MongoDB/Mongoose models required by OPUS accounts, approvals, audit logs, jobs, applications, interviews, settings, permissions, and source-health features. |
| `backend/src/repos.js` | Provides repository functions used by routes and services so database operations remain centralized. |
| `backend/db/migrate.js` | Connects to MongoDB and prepares the required collections and indexes. |
| `backend/db/import-db-json.js` | Provides an optional one-time importer from the legacy `db.json` file into MongoDB. The importer is designed to be safe to run again and preserves existing password hashes. |
| `backend/seedAdmin.js` | Creates or updates the configured Super Admin through the MongoDB repository layer. |
| `docker-compose.yml` | Provides an optional local MongoDB 8 service with persistent storage on port `27017`. |
| `backend/.env` and `backend/.env.example` | Use `MONGODB_URI` for database configuration. |
| `backend/package.json` | Includes Mongoose for the application runtime and `mongodb-memory-server` for isolated automated tests. |
| `backend/tests/e2e.test.mjs` | Runs database-dependent tests against an isolated in-memory MongoDB instance. |
| `backend/server.js` | Connects to MongoDB before serving requests and reports database readiness through the readiness endpoint. |

## Data-import behavior

- Existing `db.json` information can be imported into MongoDB through the one-time import command.
- Existing account roles and password hashes are preserved during import.
- Obsolete cached external-job results are not required for the new database.
- The importer is designed to avoid creating duplicate records when it is run again.
- After successful import and verification, `db.json` is no longer used as the application’s runtime database.

## Runtime configuration

For local development:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/opus