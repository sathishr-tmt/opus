# OPUS Change Log

This document records the major OPUS changes and their verification status.

## Security hygiene

- Removed real credentials from committed configuration examples.
- Kept private credentials only in ignored environment files.
- Added environment files, local data files, uploads, logs, and generated builds to `.gitignore`.
- Preserved bcrypt password hashing, JWT httpOnly cookies, CSRF protection, rate limiting, session-version revocation, and backend-enforced role permissions.
- Removed hardcoded personal credentials and unused authentication code.

## Backend modularization

- Split the original large backend entry file into focused modules.
- Organized routes by authentication, account, User, Recruiter, Admin, Super Admin, Gmail, and health responsibilities.
- Centralized persistent data access in `backend/src/repos.js`.
- Preserved the existing route URLs, API response shapes, and authentication behavior.

## MongoDB persistence

- Added `backend/src/mongo.js` for connection management using `MONGODB_URI`.
- Added `backend/src/models.js` with Mongoose schemas, validation, indexes, and collection names.
- Reimplemented `backend/src/repos.js` using Mongoose while preserving exported function names and return shapes.
- Added MongoDB collections for users, invitations, approvals, audit logs, jobs, applications, interviews, calendar events, saved jobs, job statuses, settings, email changes, Gmail accounts, permissions, source health, platform settings, and documents.
- Added an idempotent MongoDB setup command for collections, indexes, and default permissions.
- Added an idempotent legacy `db.json` importer.
- Updated Super Admin seeding to create or update the account in MongoDB.
- Updated health and readiness checks to verify the MongoDB connection.
- Added local MongoDB Community Server and production MongoDB Atlas configuration through `MONGODB_URI`.

## Frontend modularization

- Organized frontend code into reusable libraries, shared components, User portal pages, and staff portal pages.
- Preserved the shared staff shell for Recruiter, Admin, and Super Admin.
- Kept the User portal separate.
- Preserved protected navigation, session restoration, and logout behavior.

## Role-based access control

- Kept all permission enforcement on the backend.
- Preserved fixed User and Super Admin permissions.
- Preserved guarded Admin and Recruiter permission editing.
- Kept mandatory permissions protected from removal.
- Kept Recruiters restricted to their own postings and Admin-assigned applications.
- Kept Admins blocked from Super Admin-only functionality.

## Feature completion

- User job search, saved jobs, applications, resume upload, calendar, profile, settings, and exports.
- Recruiter posting management, assigned applications, candidate notes, status updates, and interview scheduling.
- Admin account approvals, posting management, application assignment, interviews, job sources, reports, and settings.
- Super Admin invitations, Admin approvals, account oversight, audit logs, role permissions, system health, and system settings.
- CSV, PDF, and calendar exports with backend permission checks.
- Permission-checked and audit-logged resume downloads.

## Deployment hardening

- Added Helmet security headers.
- Added structured request logging without secrets.
- Added graceful shutdown and MongoDB disconnection.
- Added health and readiness endpoints.
- Added pagination metadata for administrative listings.
- Added Docker and Render configuration using MongoDB.
- Added deployment, monitoring, backup, restore, and source-control documentation.

## Testing

- Replaced the backend test database with `mongodb-memory-server`.
- Preserved all existing end-to-end test cases.
- The test database is isolated from the local `opus` database.
- Backend verification result: `87 passed, 0 failed`.
- Frontend production build completed successfully.

## Current architecture

- Frontend: React, Vite, and Tailwind CSS
- Backend: Node.js and Express
- Database: MongoDB with Mongoose
- Local database: MongoDB Community Server
- Production database: MongoDB Atlas
- Testing database: isolated in-memory MongoDB
- Authentication: JWT httpOnly cookies with CSRF protection
- Authorization: backend-enforced RBAC

## Operational notes

- `backend/db.json` is optional import input and is not a runtime database.
- Changing `JWT_SECRET` invalidates existing sessions.
- Uploaded resumes should move to S3-compatible storage before multi-instance deployment.
- Rate-limit state and the external-job cache should move to Redis before horizontal scaling.