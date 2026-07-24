# OPUS — Step 3b Delivery Report: Full MongoDB cutover

Date: 2026-07-17

The OPUS backend now uses MongoDB through Mongoose. The legacy `db.json` runtime path has been removed. The JSON file remains supported only as an optional one-time import source.

## What changed

| Area | Change |
|---|---|
| `src/mongo.js` | Establishes and monitors the MongoDB connection using `MONGODB_URI`. |
| `src/models.js` | Defines the Mongoose models used for accounts, invitations, approvals, audit logs, jobs, applications, interviews, calendar events, saved jobs, job statuses, settings, email changes, Gmail accounts, permissions, documents, and job-source health. |
| `src/repos.js` | Provides repository functions for every database entity. Records are mapped to the camelCase response structures expected by the existing frontend, so frontend API usage does not need to change. |
| `src/security.js` | `requireAuth` loads the authenticated account through the MongoDB repository layer and continues to enforce account status and `sessionVersion`. |
| `src/audit.js` and `src/authFlows.js` | Audit logging and authentication/registration flows now read and write through MongoDB repositories. |
| All backend route files | Replaced legacy whole-file JSON mutations with repository calls while preserving routes, validation messages, status codes, permissions, and response structures. |
| `src/jobCache.js` | Maintains a bounded in-memory cache for temporary external-job results instead of writing short-lived search results into the primary database. Its interface can be moved to Redis later for multi-instance deployment. |
| `seedAdmin.js` | Creates or updates the configured Super Admin through MongoDB. It refuses unsafe role escalation and rejects placeholder credentials. |
| `src/store.js` | Deleted because the JSON runtime store is no longer used. |
| `db/import-db-json.js` | Provides the optional one-time migration of existing `db.json` accounts and records into MongoDB. |
| `tests/e2e.test.mjs` | Uses `mongodb-memory-server` to run isolated end-to-end tests without modifying the developer’s normal database. |
| `backend/package.json` | Uses Mongoose for runtime database access and includes the MongoDB test dependency and database scripts. |
| `backend/server.js` | Connects to MongoDB during startup and reports database health through the readiness endpoint. |

## Preserved application behavior

- The frontend continues to receive the same camelCase API structures.
- Authentication cookies, JWT validation, CSRF protection, session restoration, and logout revocation remain enforced.
- User and staff login entry points remain separate.
- Recruiters continue to see only applications assigned by an Admin.
- Admin and Super Admin permissions continue to be enforced by the backend.
- Refreshing the page keeps the account signed in while its session remains valid.
- Protected pages cannot be reopened after logout or session expiry.
- External job-source failures remain isolated so one failing source does not break the complete search.

## Deliberate improvements

1. Temporary external job-search results are no longer written into the primary database after every search.
2. Admin job totals count OPUS platform postings instead of temporary cached external results.
3. Pending email changes use their own MongoDB model instead of temporary fields on the account.
4. Interviews use their own MongoDB model, enabling controlled rescheduling and cancellation.
5. The fragile legacy single-user runtime handling has been removed. Record ownership is resolved during import.
6. Database operations are centralized in repositories instead of being spread across route handlers.

## Import behavior

- Existing accounts, roles, application data, settings, password hashes, and audit information can be brought into MongoDB with the optional importer.
- Password hashes are preserved and are not converted back into plain text.
- Temporary external-job cache records do not need to be imported.
- The importer is designed to avoid duplicate records when it is run again.
- After a successful import and verification, OPUS does not use `db.json` as its runtime database.

## Test coverage

The end-to-end suite covers:

- Generic authentication failures and staff/user entry-point separation.
- Session restoration, CSRF rejection, logout, and session invalidation.
- User, Recruiter, and Admin registration and approval workflows.
- Super Admin invitation and approval controls.
- Recruiter job-posting creation and management.
- Internal application assignment and candidate-status updates.
- Interview scheduling, rescheduling, and cancellation.
- Role-based access restrictions.
- Saved jobs, calendars, settings, profiles, and resumes.
- Password-reset, password-change, and verified email-change workflows.
- Permission-controlled downloads and exports.
- Database readiness and failure handling.

The final 87-test run will be performed after all obsolete documentation references are removed.

## Honest limitations

- A reachable MongoDB service is required when running OPUS normally.
- Automated tests use an isolated in-memory MongoDB instance. A final run against the configured local or cloud database is still required before deployment.
- The in-memory external-job cache and rate limits are per application instance. Redis remains the future upgrade for multi-instance deployment.
- Gmail OAuth requires valid Google credentials and must be verified separately with the configured account.
- Uploaded documents currently use local disk storage. A cloud object-storage provider is required for a multi-instance production deployment.

## Final verification remaining

1. Confirm no obsolete database references remain in the project.
2. Run all 87 backend tests.
3. Build the frontend.
4. Start MongoDB and OPUS.
5. Confirm `/api/ready` reports a healthy database connection.
6. Verify User and Staff authentication.
7. Verify core Admin, Recruiter, Super Admin, and User workflows.

## Next step

Step 4 — preserve and verify the frontend module split, protected navigation behavior, session restoration, and browser-history security.