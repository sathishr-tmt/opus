// OPUS end-to-end API test suite.
// Runs against an isolated in-memory MongoDB database.
// It does not use or modify the local development database.
// Usage from the backend folder: npm test

import { readFileSync } from 'fs';
import {
  MongoMemoryServer
} from 'mongodb-memory-server';

// 1. Start MongoDB before importing application modules.
const mongoServer =
  await MongoMemoryServer.create();

process.env.MONGODB_URI =
  mongoServer.getUri('opus_test');

process.env.NODE_ENV = 'test';

const {
  connectMongo,
  disconnectMongo
} = await import('../src/mongo.js');

await connectMongo();

// 2. Create collections and indexes.
// Import legacy db.json only when it exists.
const {
  runMigrations
} = await import('../db/migrate.js');

await runMigrations();

try {
  const legacy = JSON.parse(
    readFileSync(
      new URL(
        '../db.json',
        import.meta.url
      ),
      'utf8'
    )
  );

  const {
    importDbJson
  } = await import(
    '../db/import-db-json.js'
  );

  await importDbJson(legacy);

  console.log(
    'Legacy db.json imported into the test database.'
  );
} catch {
  console.log(
    'No legacy db.json found; running tests on an empty database.'
  );
}

// 3. Seed the test Super Admin directly into MongoDB.
const bcrypt = (await import('bcryptjs')).default;
const repos = await import('../src/repos.js');
const superSeed = {
  name: 'Test Super', email: 'super@test.local',
  password: await bcrypt.hash('TestSuper#2026', 10), role: 'super_admin',
  status: 'active', emailVerified: true
};
const existingSuper = await repos.findUserByEmail(superSeed.email);
if (existingSuper) {
  await repos.updateUser(existingSuper.id, { ...superSeed, sessionVersion: Number(existingSuper.sessionVersion || 1) + 1 });
} else {
  await repos.insertUser({ id: 'admin-e2e-super', sessionVersion: 1, ...superSeed });
}

// 4. Boot app in-process
const app = (await import('../server.js')).default;
const server = app.listen(0);
const PORT = server.address().port;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const jars = {};
function jarFor(name) { return (jars[name] ||= {}); }
async function call(method, path, { body, jar, csrf } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (jar) headers.Cookie = Object.entries(jarFor(jar)).map(([k, v]) => `${k}=${v}`).join('; ');
  if (csrf && jar) headers['X-CSRF-Token'] = jarFor(jar).opus_csrf || '';
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  if (jar) for (const c of res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    const v = decodeURIComponent(pair.slice(i + 1));
    if (v) jarFor(jar)[pair.slice(0, i)] = v; else delete jarFor(jar)[pair.slice(0, i)];
  }
  const raw = await res.text();
let data = null;

try {
  data = raw ? JSON.parse(raw) : null;
} catch {}

if (res.status >= 500) {
  console.error('HTTP error response:', raw);
}

return {
  status: res.status,
  data,
  headers: res.headers,
  raw
};

}
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

/* ---- AUTH SUITE ---- */
let r = await call('POST', '/api/staff/auth/login', { body: { email: 'super@test.local', password: 'wrong' } });
check('bad password -> 401 generic', r.status === 401 && r.data.message === 'Invalid email or password.');
r = await call('POST', '/api/staff/auth/login', { body: { email: 'super@test.local', password: 'TestSuper#2026' }, jar: 'super' });
check('staff login -> 200 + role redirect', r.status === 200 && r.data.redirectPath === '/super-admin/dashboard');
r = await call('GET', '/api/auth/me', { jar: 'super' });
check('/me restores session', r.status === 200 && r.data.user.role === 'super_admin');
r = await call('POST', '/api/auth/login', { body: { email: 'super@test.local', password: 'TestSuper#2026' } });
check('staff at user login -> 403 wrong entry', r.status === 403);
r = await call('POST', '/api/auth/logout', { jar: 'super' });
check('logout without CSRF -> 403', r.status === 403);

/* ---- REGISTRATION -> VERIFY -> APPROVE -> LOGIN ---- */
r = await call('POST', '/api/auth/register', { body: { name: 'PG User', email: 'pguser@test.local', password: 'PgUser#2026', confirmPassword: 'PgUser#2026', careerGoal: 'Backend Developer', experienceYears: 3 } });
check('user register -> 201 + dev verify url', r.status === 201 && !!r.data.verificationUrl);
let token = new URL(r.data.verificationUrl).searchParams.get('token');
r = await call('GET', `/api/auth/verify-email?token=${token}`);
check('verify email -> 302', r.status === 302);
r = await call('POST', '/api/auth/login', { body: { email: 'pguser@test.local', password: 'PgUser#2026' } });
check('login pending -> 403 approval message', r.status === 403 && /Admin approval/.test(r.data.message));
r = await call('GET', '/api/admin/pending-approvals', { jar: 'super' });
const pending = r.data.users.find((u) => u.email === 'pguser@test.local');
check('user appears in pending queue', !!pending);
r = await call('PATCH', `/api/admin/users/${pending.id}/approve`, { jar: 'super', csrf: true });
check('approve -> 200', r.status === 200);
r = await call('POST', '/api/auth/login', { body: { email: 'pguser@test.local', password: 'PgUser#2026' }, jar: 'user' });
check('user login after approval -> 200', r.status === 200 && r.data.redirectPath === '/dashboard');
r = await call('GET', '/api/dashboard', { jar: 'user' });
check('user dashboard 200', r.status === 200 && typeof r.data.applications === 'number');
r = await call('GET', '/api/admin/users', { jar: 'user' });
check('user cannot access admin routes', r.status === 403);

/* ---- RECRUITER LIFECYCLE + WORKFLOW CHAIN ---- */
r = await call('POST', '/api/staff/register', { body: { name: 'PG Recruiter', email: 'pgrec@test.local', password: 'PgRec#2026', confirmPassword: 'PgRec#2026', company: 'Acme Corp' } });
token = new URL(r.data.verificationUrl).searchParams.get('token');
await call('GET', `/api/auth/verify-email?token=${token}`);
r = await call('GET', '/api/admin/pending-approvals', { jar: 'super' });
const recPending = r.data.users.find((u) => u.email === 'pgrec@test.local');
await call('PATCH', `/api/admin/users/${recPending.id}/approve`, { jar: 'super', csrf: true });
r = await call('POST', '/api/staff/auth/login', { body: { email: 'pgrec@test.local', password: 'PgRec#2026' }, jar: 'rec' });
check('recruiter staff login -> recruiter dashboard', r.status === 200 && r.data.redirectPath === '/recruiter/dashboard');

r = await call('POST', '/api/recruiter/jobs', { jar: 'rec', csrf: true, body: { title: 'Java Developer', location: 'Dallas, TX', employmentType: 'Full-time', minSalary: 120000, maxSalary: 150000, description: 'Spring Boot role' } });
check('recruiter creates platform job', r.status === 201 && r.data.job.source === 'Platform');
const jobId = r.data.job.id;
r = await call('GET', '/api/recruiter/jobs', { jar: 'rec' });
check('recruiter sees own posting', r.data.jobs.length === 1 && r.data.jobs[0].id === jobId);
r = await call('GET', '/api/recruiter/overview', { jar: 'rec' });
check('recruiter overview counts', r.status === 200 && r.data.counts.postings === 1);

r = await call('POST', `/api/applications/${jobId}`, { jar: 'user', csrf: true });
check('user applies to platform job -> internal application', r.status === 201 && r.data.application.applicationType === 'internal');
const appId = r.data.application.id;

r = await call('GET', '/api/recruiter/applications', { jar: 'rec' });
check('recruiter sees nothing before assignment', r.data.applications.length === 0);
r = await call('GET', '/api/admin/internal-applications', { jar: 'super' });
check('admin sees internal application + candidate', r.data.applications.length === 1 && !!r.data.applications[0].candidate);
const recruiterId = r.data.recruiters.find((x) => x.email === 'pgrec@test.local').id;
r = await call('PATCH', `/api/admin/internal-applications/${appId}/assign`, { jar: 'super', csrf: true, body: { recruiterId } });
check('admin assigns to recruiter', r.status === 200 && r.data.application.assignedRecruiterId === recruiterId);

r = await call('GET', '/api/recruiter/applications', { jar: 'rec' });
check('recruiter sees assigned application', r.data.applications.length === 1);
r = await call('PATCH', `/api/recruiter/applications/${appId}`, { jar: 'rec', csrf: true, body: { status: 'Technical Interview', notes: 'Strong Java skills' } });
check('recruiter updates status + notes', r.status === 200 && r.data.application.status === 'Technical Interview' && r.data.application.recruiterNotes === 'Strong Java skills');
r = await call('POST', `/api/recruiter/applications/${appId}/interviews`, { jar: 'rec', csrf: true, body: { startsAt: new Date(Date.now() + 86400000).toISOString(), mode: 'Video' } });
check('recruiter schedules interview', r.status === 201 && !!r.data.interview.id);
r = await call('GET', '/api/recruiter/overview', { jar: 'rec' });
check('interview counted in overview', r.data.counts.upcomingInterviews === 1);
r = await call('GET', '/api/applications', { jar: 'user' });
check('user sees updated status', r.data.applications[0].status === 'Technical Interview');

/* ---- USER FEATURES ---- */
r = await call('POST', `/api/saved/${jobId}`, { jar: 'user', csrf: true });
check('save job', r.data.savedJobIds.includes(jobId));
r = await call('GET', '/api/saved', { jar: 'user' });
check('saved list returns snapshot', r.data.jobs.length === 1 && r.data.jobs[0].title === 'Java Developer');
r = await call('POST', `/api/saved/${jobId}`, { jar: 'user', csrf: true });
check('unsave toggles', !r.data.savedJobIds.includes(jobId));
r = await call('POST', '/api/calendar', { jar: 'user', csrf: true, body: { title: 'Prep session', date: '2026-08-01', time: '10:00' } });
check('calendar create', r.status === 201);
const eventId = r.data.event.id;
r = await call('PUT', `/api/calendar/${eventId}`, { jar: 'user', csrf: true, body: { notes: 'bring resume' } });
check('calendar update', r.status === 200 && r.data.event.notes === 'bring resume');
r = await call('DELETE', `/api/calendar/${eventId}`, { jar: 'user', csrf: true });
check('calendar delete', r.status === 200 && r.data.events.length === 0);
r = await call('PUT', '/api/settings', { jar: 'user', csrf: true, body: { phone: '555-0100', notifications: { jobAlerts: false } } });
check('settings update', r.data.settings.phone === '555-0100' && r.data.settings.notifications.jobAlerts === false);
r = await call('PUT', '/api/profile', { jar: 'user', csrf: true, body: { name: 'PG User Renamed' } });
check('profile name update', r.status === 200);

/* ---- SUPER ADMIN: INVITATION + AUDIT ---- */
r = await call('POST', '/api/super-admin/admin-invitations', { jar: 'super', csrf: true, body: { email: 'pgadmin@test.local' } });
check('admin invitation created', r.status === 201 && !!r.data.invitationUrl);
token = new URL(r.data.invitationUrl).searchParams.get('token');
r = await call('POST', '/api/auth/accept-admin-invitation', { body: { token, name: 'PG Admin', password: 'PgAdmin#2026', confirmPassword: 'PgAdmin#2026' } });
check('invitation accepted -> pending super admin approval', r.status === 201);
r = await call('GET', '/api/admin/pending-approvals', { jar: 'super' });
const adminPending = r.data.users.find((u) => u.email === 'pgadmin@test.local');
check('admin in super-admin pending queue', !!adminPending && adminPending.status === 'pending_super_admin_approval');
await call('PATCH', `/api/admin/users/${adminPending.id}/approve`, { jar: 'super', csrf: true });
r = await call('POST', '/api/staff/auth/login', { body: { email: 'pgadmin@test.local', password: 'PgAdmin#2026' }, jar: 'admin' });
check('approved admin logs in', r.status === 200 && r.data.redirectPath === '/admin/dashboard');
r = await call('GET', '/api/admin/users', { jar: 'admin' });
check('admin sees only users+recruiters', r.status === 200 && r.data.users.every((u) => ['user', 'recruiter'].includes(u.role)));
r = await call('GET', '/api/super-admin/audit-logs', { jar: 'admin' });
check('admin blocked from audit logs', r.status === 403);
r = await call('GET', '/api/super-admin/audit-logs', { jar: 'super' });
check('super admin reads audit logs', r.status === 200 && r.data.auditLogs.length > 10 && r.data.auditLogs.some((l) => l.action === 'APPLICATION_ASSIGNED'));

/* ---- PASSWORD RESET + CHANGE FLOWS ---- */
r = await call('POST', '/api/auth/forgot-password', { body: { email: 'pguser@test.local' } });
check('forgot password -> dev reset url', !!r.data.resetUrl);
token = new URL(r.data.resetUrl).searchParams.get('token');
r = await call('POST', '/api/auth/reset-password', { body: { token, newPassword: 'PgUser#2027', confirmPassword: 'PgUser#2027' } });
check('reset password ok', r.status === 200);
r = await call('GET', '/api/auth/me', { jar: 'user' });
check('old session invalidated after reset', r.status === 401);
r = await call('POST', '/api/auth/reset-password', { body: { token, newPassword: 'PgUser#2028', confirmPassword: 'PgUser#2028' } });
check('reset link single-use', r.status === 400);
r = await call('POST', '/api/auth/login', { body: { email: 'pguser@test.local', password: 'PgUser#2027' }, jar: 'user2' });
check('login with new password', r.status === 200);
r = await call('POST', '/api/account/change-password', { jar: 'user2', csrf: true, body: { currentPassword: 'PgUser#2027', newPassword: 'PgUser#2029', confirmPassword: 'PgUser#2029' } });
check('change password ok + session cleared', r.status === 200);
r = await call('POST', '/api/auth/login', { body: { email: 'pguser@test.local', password: 'PgUser#2029' }, jar: 'user3' });
check('login with changed password', r.status === 200);
r = await call('POST', '/api/account/change-email/request', { jar: 'user3', csrf: true, body: { currentPassword: 'PgUser#2029', newEmail: 'pguser2@test.local' } });
check('email change requested', r.status === 200 && !!r.data.developmentVerificationUrl);
token = new URL(r.data.developmentVerificationUrl).searchParams.get('token');
r = await call('GET', `/api/account/change-email/verify?token=${token}`);
check('email change verified', r.status === 200);
r = await call('POST', '/api/auth/login', { body: { email: 'pguser2@test.local', password: 'PgUser#2029' } });
check('login with NEW email works', r.status === 200);

/* ---- ADMIN JOB DELETE + HEALTH ---- */
r = await call('DELETE', `/api/admin/platform-jobs/${jobId}`, { jar: 'super', csrf: true });
check('admin deletes platform job', r.status === 200);
r = await call('GET', '/api/health');
check('health endpoint', r.status === 200 && r.data.status === 'ok');


/* ---- STEP 5: DYNAMIC PERMISSIONS ---- */
r = await call('GET', '/api/super-admin/permissions', { jar: 'super' });
check('super admin reads permission catalogue', r.status === 200 && r.data.roles.some((x) => x.role === 'recruiter'));
r = await call('GET', '/api/super-admin/permissions', { jar: 'admin' });
check('admin cannot read permission catalogue', r.status === 403);
// grant recruiter an out-of-bounds permission -> rejected
r = await call('PUT', '/api/super-admin/permissions/recruiter', { jar: 'super', csrf: true, body: { permissions: ['staff:portal', 'system:manage'] } });
check('out-of-bounds permission rejected', r.status === 400);
// try to edit super_admin -> rejected
r = await call('PUT', '/api/super-admin/permissions/super_admin', { jar: 'super', csrf: true, body: { permissions: [] } });
check('editing super_admin permissions rejected', r.status === 400);
// remove posting:own:manage from recruiter, then confirm enforcement
r = await call('PUT', '/api/super-admin/permissions/recruiter', { jar: 'super', csrf: true, body: { permissions: ['application:assigned:view', 'application:assigned:update', 'interview:assigned:manage'] } });
check('valid permission change accepted + mandatory re-added', r.status === 200 && r.data.permissions.includes('staff:portal') && !r.data.permissions.includes('posting:own:manage'));
// recruiter must re-login for fresh permissions (attached at auth time)
r = await call('POST', '/api/staff/auth/login', { body: { email: 'pgrec@test.local', password: 'PgRec#2026' }, jar: 'rec' });
r = await call('POST', '/api/recruiter/jobs', { jar: 'rec', csrf: true, body: { title: 'X', location: 'Y' } });
check('recruiter now blocked from creating postings', r.status === 403);
// restore recruiter defaults
await call('PUT', '/api/super-admin/permissions/recruiter', { jar: 'super', csrf: true, body: { permissions: ['posting:own:manage', 'application:assigned:view', 'application:assigned:update', 'interview:assigned:manage'] } });
await call('POST', '/api/staff/auth/login', { body: { email: 'pgrec@test.local', password: 'PgRec#2026' }, jar: 'rec' });

/* ---- STEP 5: ADMIN JOB POSTINGS + SOURCES + REPORTS + SETTINGS ---- */
r = await call('POST', '/api/recruiter/jobs', { jar: 'rec', csrf: true, body: { title: 'Data Engineer', location: 'Austin, TX' } });
const job2 = r.data.job.id;
r = await call('GET', '/api/admin/platform-jobs', { jar: 'super' });
check('admin lists all platform postings', r.status === 200 && r.data.jobs.length >= 1);
r = await call('PATCH', `/api/admin/platform-jobs/${job2}`, { jar: 'super', csrf: true, body: { status: 'closed' } });
check('admin closes a posting', r.status === 200 && r.data.job.status === 'closed');
r = await call('GET', '/api/admin/job-sources', { jar: 'super' });
check('admin job-sources monitor returns array', r.status === 200 && Array.isArray(r.data.sources));
r = await call('GET', '/api/admin/reports', { jar: 'super' });
check('admin reports summary', r.status === 200 && !!r.data.summary.users);
r = await call('PUT', '/api/admin/settings', { jar: 'super', csrf: true, body: { platformName: 'OPUS Prod', maintenanceMode: false } });
check('admin settings save', r.status === 200 && r.data.settings.platformName === 'OPUS Prod');
r = await call('GET', '/api/admin/settings', { jar: 'admin' });
check('admin reads settings', r.status === 200 && r.data.settings.platformName === 'OPUS Prod');

/* ---- STEP 5: SUPER ADMIN OVERSIGHT ---- */
r = await call('GET', '/api/super-admin/accounts', { jar: 'super' });
check('super admin account oversight', r.status === 200 && r.data.totals.super_admin >= 1);
r = await call('GET', '/api/super-admin/platform', { jar: 'super' });
check('super admin platform stats', r.status === 200 && typeof r.data.totalApplications === 'number');
r = await call('GET', '/api/super-admin/system-health', { jar: 'super' });
check('super admin system health', r.status === 200 && r.data.database.connected === true);
r = await call('GET', '/api/super-admin/accounts', { jar: 'admin' });
check('admin blocked from account oversight', r.status === 403);

/* ---- STEP 5: fresh user login (earlier tests rotated the 'user' session) ---- */
r = await call('POST', '/api/auth/login', { body: { email: 'pguser2@test.local', password: 'PgUser#2029' }, jar: 'u5' });
check('user re-login for Step 5', r.status === 200);

/* ---- STEP 5: INTERVIEW RESCHEDULE / CANCEL ---- */
// re-apply + assign + interview a fresh application for interview tests
r = await call('POST', '/api/recruiter/jobs', { jar: 'rec', csrf: true, body: { title: 'QA Engineer', location: 'Remote' } });
const job3 = r.data.job.id;
r = await call('POST', `/api/applications/${job3}`, { jar: 'u5', csrf: true });
const app3 = r.data.application.id;
r = await call('GET', '/api/admin/internal-applications', { jar: 'super' });
const rid = r.data.recruiters.find((x) => x.email === 'pgrec@test.local').id;
await call('PATCH', `/api/admin/internal-applications/${app3}/assign`, { jar: 'super', csrf: true, body: { recruiterId: rid } });
r = await call('POST', `/api/recruiter/applications/${app3}/interviews`, { jar: 'rec', csrf: true, body: { startsAt: new Date(Date.now() + 172800000).toISOString(), mode: 'Video' } });
const iv2 = r.data.interview.id;
r = await call('PATCH', `/api/recruiter/interviews/${iv2}`, { jar: 'rec', csrf: true, body: { startsAt: new Date(Date.now() + 259200000).toISOString() } });
check('recruiter reschedules interview', r.status === 200 && r.data.interview.status === 'rescheduled');
r = await call('GET', '/api/admin/interviews', { jar: 'super' });
check('admin sees all interviews', r.status === 200 && r.data.interviews.length >= 1);
r = await call('DELETE', `/api/recruiter/interviews/${iv2}`, { jar: 'rec', csrf: true });
check('recruiter cancels interview', r.status === 200 && r.data.interview.status === 'cancelled');

/* ---- STEP 5: RESUME UPLOAD + PERMISSION-CHECKED DOWNLOAD ---- */
// multipart upload via fetch FormData
async function uploadResume(jar) {
  const form = new FormData();
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10]); // %PDF-1.4
  form.append('resume', new Blob([bytes], { type: 'application/pdf' }), 'my-resume.pdf');
  const headers = { Cookie: Object.entries(jarFor(jar)).map(([k, v]) => `${k}=${v}`).join('; '), 'X-CSRF-Token': jarFor(jar).opus_csrf || '' };
  const res = await fetch(BASE + '/api/profile/resume', { method: 'POST', headers, body: form });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
let up = await uploadResume('u5');
check('user uploads resume', up.status === 201 && !!up.data.document.id);
const docId = up.data.document?.id;
r = await call('GET', `/api/documents/${docId}/download`, { jar: 'u5' });
check('owner downloads own resume', r.status === 200);
// another user cannot download
r = await call('GET', `/api/documents/${docId}/download`, { jar: 'admin' });
check('admin (has application:all:view) can download candidate resume', r.status === 200);

/* ---- STEP 5: EXPORTS ---- */
async function raw(path, jar) {
  const headers = jar ? { Cookie: Object.entries(jarFor(jar)).map(([k, v]) => `${k}=${v}`).join('; ') } : {};
  const res = await fetch(BASE + path, { headers });
  const cd = res.headers.get('content-disposition') || '';
  const body = await res.text();
  return { status: res.status, cd, body };
}
let x = await raw('/api/exports/my-applications.csv', 'u5');
check('user CSV export', x.status === 200 && x.cd.includes('.csv') && x.body.includes('Title'));
x = await raw('/api/exports/my-interviews.ics', 'u5');
check('user ICS export', x.status === 200 && x.body.includes('BEGIN:VCALENDAR'));
x = await raw('/api/exports/my-applications.pdf', 'u5');
check('user PDF export', x.status === 200 && x.body.startsWith('%PDF'));
x = await raw('/api/exports/admin/report.pdf', 'super');
check('admin report PDF', x.status === 200 && x.body.startsWith('%PDF'));
x = await raw('/api/exports/admin/job-postings.csv', 'super');
check('admin postings CSV', x.status === 200 && x.body.includes('Title'));
x = await raw('/api/exports/super-admin/audit-logs.csv', 'super');
check('super admin audit CSV', x.status === 200 && x.body.includes('Action'));
x = await raw('/api/exports/admin/report.pdf', 'u5');
check('user blocked from admin report export', x.status === 403);

/* ---- STEP 6: HEALTH / READINESS / PAGINATION ---- */
r = await call('GET', '/api/ready');
check('readiness endpoint reports ready', r.status === 200 && r.data.database === 'connected');
r = await call('GET', '/api/health');
check('health endpoint has uptime', r.status === 200 && typeof r.data.uptime === 'number');
r = await call('GET', '/api/admin/users?page=1&pageSize=2', { jar: 'super' });
check('admin users pagination metadata', r.status === 200 && r.data.pagination && r.data.users.length <= 2 && typeof r.data.pagination.total === 'number');
r = await call('GET', '/api/admin/platform-jobs?page=1&pageSize=1', { jar: 'super' });
check('admin postings pagination metadata', r.status === 200 && !!r.data.pagination);

console.log(
  `\n${pass} passed, ${fail} failed`
);

await new Promise(
  (resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  }
);

await disconnectMongo();
await mongoServer.stop();

process.exitCode = fail ? 1 : 0;