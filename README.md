# OPUS — Job Portal

OPUS is a secure job portal with four roles: User, Recruiter, Admin, and Super Admin. It provides backend-enforced role permissions, public job search, recruiter-managed postings, application assignment, interview scheduling, account approvals, audit logging, and account-security workflows.

## Technology stack

- Frontend: React, Vite, and Tailwind CSS
- Backend: Node.js and Express
- Database: MongoDB with Mongoose
- Local database: MongoDB Community Server
- Production database: MongoDB Atlas
- Authentication: JWT in an httpOnly cookie
- Security: bcrypt, CSRF protection, rate limiting, session-version revocation, Helmet, and backend-enforced RBAC
- Testing: 87 end-to-end tests using an isolated in-memory MongoDB database

## Local setup

### 1. Start MongoDB

If MongoDB Community Server is installed, make sure its Windows service is running.

The local connection is:

```text
mongodb://localhost:27017/opus