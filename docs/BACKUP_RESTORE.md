# OPUS Backup and Restore

OPUS stores persistent state in two locations:

1. MongoDB stores accounts, permissions, jobs, applications, interviews, settings, audit logs, and related records.
2. `backend/uploads/` stores locally uploaded resume files.

Both locations must be backed up.

## Required database tools

Install MongoDB Database Tools to use:

- `mongodump`
- `mongorestore`

Keep connection strings private. Do not save credentials in scripts, documentation, or source control.

## Local MongoDB backup

In PowerShell, set the connection variable for the current terminal:

```powershell
$env:MONGODB_URI="mongodb://localhost:27017/opus"