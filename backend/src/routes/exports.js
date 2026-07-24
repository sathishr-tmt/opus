// Export routes (Step 5c): CSV / PDF / ICS with backend-authorized access.
import {
  listApplications, listAllInterviews, listPlatformJobs, listUsers,
  getReportsSummary, listEvents, addAuditLog
} from '../repos.js';
import { requireAuth, requireRole, requirePermission } from '../security.js';
import { toCsv, toIcs, toPdf, safeFilename } from '../exports.js';

function sendCsv(res, filenameBase, rows, columns) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(filenameBase, 'csv')}"`);
  return res.send(toCsv(rows, columns));
}

export default function registerExportRoutes(app) {
  // A user's own applications as CSV.
  app.get(
    '/api/exports/my-applications.csv',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const apps = await listApplications({ userId: req.user.id });
      return sendCsv(res, 'my-applications', apps, [
        { label: 'Title', value: 'title' },
        { label: 'Company', value: 'company' },
        { label: 'Location', value: 'location' },
        { label: 'Status', value: 'status' },
        { label: 'Type', value: 'applicationType' },
        { label: 'Source', value: 'source' },
        { label: 'Applied', value: (r) => (r.appliedAt || '').slice(0, 10) }
      ]);
    }
  );

  // A user's interviews as an ICS calendar file.
  app.get(
    '/api/exports/my-interviews.ics',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const apps = await listApplications({ userId: req.user.id, kind: 'internal' });
      const events = [];
      const { attachInterviews } = await import('../repos.js');
      for (const app of apps) {
        const withI = await attachInterviews(app);
        for (const iv of withI.interviews || []) {
          if (iv.status === 'cancelled') continue;
          events.push({
            id: iv.id, startsAt: iv.startsAt,
            title: `Interview — ${app.title} @ ${app.company}`,
            notes: iv.notes, location: iv.location
          });
        }
      }
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename('my-interviews', 'ics')}"`);
      return res.send(toIcs(events, { calendarName: 'OPUS Interviews' }));
    }
  );

  // A user's application summary as a PDF.
  app.get(
    '/api/exports/my-applications.pdf',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const apps = await listApplications({ userId: req.user.id });
      const pdf = await toPdf({
        title: 'Application Summary',
        subtitle: `${req.user.name} — ${apps.length} application(s)`,
        sections: [{
          heading: 'Applications',
          lines: apps.length
            ? apps.map((a) => `• ${a.title} @ ${a.company} — ${a.status} (${(a.appliedAt || '').slice(0, 10)})`)
            : ['No applications yet.']
        }]
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename('application-summary', 'pdf')}"`);
      return res.send(pdf);
    }
  );

  // Admin: all platform postings as CSV.
  app.get(
    '/api/exports/admin/job-postings.csv',
    requireAuth,
    requirePermission('posting:all:manage'),
    async (req, res) => {
      const jobs = await listPlatformJobs();
      return sendCsv(res, 'opus-job-postings', jobs, [
        { label: 'Title', value: 'title' },
        { label: 'Company', value: 'company' },
        { label: 'Location', value: 'location' },
        { label: 'Status', value: 'status' },
        { label: 'Recruiter', value: 'recruiterId' },
        { label: 'Posted', value: (r) => (r.postedAt || '').slice(0, 10) }
      ]);
    }
  );

  // Admin: candidate applications as CSV.
  app.get(
    '/api/exports/admin/applications.csv',
    requireAuth,
    requirePermission('application:all:view'),
    async (req, res) => {
      const apps = await listApplications({ kind: 'internal' });
      return sendCsv(res, 'opus-applications', apps, [
        { label: 'Candidate', value: 'userId' },
        { label: 'Title', value: 'title' },
        { label: 'Company', value: 'company' },
        { label: 'Status', value: 'status' },
        { label: 'Assigned Recruiter', value: 'assignedRecruiterId' },
        { label: 'Applied', value: (r) => (r.appliedAt || '').slice(0, 10) }
      ]);
    }
  );

  // Admin: interview schedule as ICS.
  app.get(
    '/api/exports/admin/interviews.ics',
    requireAuth,
    requirePermission('interview:all:manage'),
    async (req, res) => {
      const interviews = (await listAllInterviews()).filter((i) => i.status !== 'cancelled');
      const events = interviews.map((i) => ({
        id: i.id, startsAt: i.startsAt,
        title: `Interview — ${i.title || 'Candidate'} @ ${i.company || 'OPUS'}`,
        notes: i.notes, location: i.location
      }));
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename('opus-interviews', 'ics')}"`);
      return res.send(toIcs(events, { calendarName: 'OPUS Interviews' }));
    }
  );

  // Admin/Super Admin: reports as PDF.
  app.get(
    '/api/exports/admin/report.pdf',
    requireAuth,
    requirePermission('report:view'),
    async (req, res) => {
      const s = await getReportsSummary();
      const fmt = (rows, keys) => rows.length
        ? rows.map((r) => '• ' + keys.map((k) => `${k}: ${r[k]}`).join(', ')) : ['None'];
      const pdf = await toPdf({
        title: 'Platform Report',
        subtitle: `Generated for ${req.user.name}`,
        sections: [
          { heading: 'Users (role / status)', lines: fmt(s.users, ['role', 'status', 'c']) },
          { heading: 'Job Postings (status)', lines: fmt(s.jobs, ['status', 'c']) },
          { heading: 'Applications (kind / status)', lines: fmt(s.applications, ['kind', 'status', 'c']) },
          { heading: 'Interviews (status)', lines: fmt(s.interviews, ['status', 'c']) }
        ]
      });
      await addAuditLog({
        actorId: req.user.id, actorRole: req.user.role,
        action: 'REPORT_EXPORTED', metadata: { format: 'pdf' }
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename('opus-report', 'pdf')}"`);
      return res.send(pdf);
    }
  );

  // Super Admin: audit logs as CSV.
  app.get(
    '/api/exports/super-admin/audit-logs.csv',
    requireAuth,
    requireRole('super_admin'),
    async (req, res) => {
      const { listAuditLogs } = await import('../repos.js');
      const logs = await listAuditLogs(2000);
      return sendCsv(res, 'opus-audit-logs', logs, [
        { label: 'Time', value: (r) => r.createdAt },
        { label: 'Action', value: 'action' },
        { label: 'Actor', value: 'actorId' },
        { label: 'Actor Role', value: 'actorRole' },
        { label: 'Target', value: 'targetUserId' }
      ]);
    }
  );
}
