// Audit logging uses the MongoDB-backed repository layer.
// Signature changed from addAuditLog(db, entry) to: await addAuditLog(entry).
export { addAuditLog, listAuditLogs } from './repos.js';
