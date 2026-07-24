# OPUS — Step 5 Delivery Report: Feature completion

Date: 2026-07-17

All nine previously stubbed portal pages are functional. Dynamic role permissions, resume upload with permission-controlled download, interview management, and CSV/PDF/ICS exports are included.

## Dynamic RBAC

The Super Admin can manage allowed Admin and Recruiter permissions.

- `src/permissions.js` defines editable permissions for `admin` and `recruiter`.
- Role permissions are stored through the MongoDB repository layer.
- `user` and `super_admin` permissions remain fixed and cannot be edited.
- Only permissions from the approved allow-list can be granted.
- Mandatory permissions such as `staff:portal` and `profile:self` cannot be removed.
- Effective permissions are attached to authenticated requests and enforced by backend authorization middleware.
- Permission changes are enforced by the backend and reflected in the staff interface after the affected account signs in again.
- Endpoints: `GET/PUT /api/super-admin/permissions[/:role]`.
- The endpoints require `permissions:manage`, which is available only to the Super Admin.
- The frontend includes a Role Permissions page with per-capability controls.

## Nine functional pages

Admin pages:

- Job Postings: list, close, reopen, delete, and CSV export.
- Job Sources: source-health monitoring and live probes.
- Calendar & Interviews: view, manage, cancel, and export to ICS.
- Reports: live summary and PDF export.
- Admin Settings: platform preferences.

Super Admin pages:

- Account Oversight.
- Platform Management.
- Job Sources & System Health.
- System Settings.
- Role Permissions.

## Interview management

Recruiters can manage interviews connected to applications assigned to them. Admins can manage all authorized interviews.

Endpoints:

- `PATCH/DELETE /api/recruiter/interviews/:id`
- `PATCH/DELETE /api/admin/interviews/:id`

Interviews use a dedicated MongoDB/Mongoose model, allowing controlled scheduling, rescheduling, and cancellation.

## Resume upload and permission-controlled download

- `multer` handles PDF, DOC, and DOCX uploads with a 5 MB limit.
- Document metadata is stored through the MongoDB document model.
- Uploaded files are stored under `backend/uploads/`, which is excluded from Git.
- Upload and retrieval endpoints: `POST/GET /api/profile/resume`.
- Download endpoint: `GET /api/documents/:id/download`.

Download authorization is enforced by the backend:

- The document owner can download their own resume.
- Admin and Super Admin access requires `application:all:view`.
- A Recruiter can download a candidate’s resume only when that candidate’s application is assigned to the Recruiter.
- Every authorized download is recorded in the audit log.
- The Profile & Resume page provides working upload and download actions.

## Exports

Exports use professional filenames and backend authorization.

User exports:

- Applications CSV/PDF.
- Interviews ICS.

Admin exports:

- Job postings CSV.
- Applications CSV.
- Interviews ICS.
- Reports PDF.

Super Admin exports:

- Audit logs CSV.

`src/exports.js` generates CSV and ICS content and uses `pdfkit` for PDF files. Every export endpoint is permission-protected. Unauthorized roles receive a `403` response.

## New and changed files

Backend:

- `src/permissions.js`
- `src/exports.js`
- `src/routes/documents.js`
- `src/routes/exports.js`
- `src/models.js`
- `src/repos.js`
- `src/security.js`
- `src/routes/admin.js`
- `src/routes/superAdmin.js`
- `src/routes/recruiter.js`
- `jobSources.js`
- `server.js`

Backend dependencies:

- `multer`
- `pdfkit`
- `mongoose`
- `mongodb-memory-server` for isolated automated tests

Frontend:

- `AdminPortalSection.jsx`
- `SuperAdminPortalSection.jsx`
- `ProfileResumePage.jsx`
- `MyApplicationsPage.jsx`
- `lib/constants.js`
- `lib/router.js`

## Verification coverage

The MongoDB end-to-end test suite covers:

- Role-permission enforcement.
- Rejection of permissions outside the allow-list.
- Rejection of attempts to edit Super Admin permissions.
- Blocking a Recruiter after a required permission is revoked.
- Admin and Super Admin endpoints.
- Interview scheduling, rescheduling, and cancellation.
- Resume upload.
- Owner, Admin, Super Admin, and assigned-Recruiter download authorization.
- Rejection of unauthorized document downloads.
- CSV, PDF, and ICS exports.
- Negative access tests for every protected export.
- MongoDB connection and readiness behavior.

The final 87-test run will be performed after documentation cleanup.

Frontend verification:

- The production build previously completed successfully.
- The final production build will be rerun after database cleanup.
- The built application must render without console errors.

## Known limitations

- Uploaded files currently use local disk storage. Multi-instance production deployment requires an S3-compatible object-storage provider.
- Automated tests use an isolated in-memory MongoDB environment. A final run with the configured local or cloud MongoDB connection is still required.
- Frontend menus refresh after the affected staff member signs in again following a permission change. Backend permission checks remain authoritative.
- Multi-instance deployment will eventually require shared caching and rate limiting through a service such as Redis.

## Next step

Step 6 — production hardening, pagination, health and readiness verification, Docker configuration, deployment, and backup/restore documentation.

Step 7 — final packaging, validation, and creation of the deployable OPUS ZIP.