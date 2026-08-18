// Export routes: CSV / PDF / ICS with backend-authorized access.
//
// Every export accepts an optional date range via ?from=YYYY-MM-DD&to=YYYY-MM-DD.
// The range is inclusive of both days, applied to whichever date field is
// meaningful for that record (applied date, posted date, interview start,
// audit timestamp). Omitting both returns everything, exactly as before.
import {
  listApplications, listAllInterviews, listPlatformJobs, listUsers,
  getReportsSummary, listEvents, addAuditLog
} from '../repos.js';
import { requireAuth, requireRole, requirePermission } from '../security.js';
import { toCsv, toIcs, toPdf, safeFilename } from '../exports.js';

/* ------------------------------------------------------------------ *
 * Date-range helpers
 * ------------------------------------------------------------------ */

// Read ?from / ?to. Returns nulls when absent so callers can skip filtering.
function readRange(req) {
  const parse = (value, endOfDay) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const date = new Date(endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const from = parse(req.query.from, false);
  const to = parse(req.query.to, true);

  return {
    from,
    to,
    active: Boolean(from || to),
    label:
      from || to
        ? `${from ? from.toISOString().slice(0, 10) : 'start'} to ${
            to ? to.toISOString().slice(0, 10) : 'today'
          }`
        : 'all time',
    // Appended to the download filename so saved files stay distinguishable.
    suffix:
      from || to
        ? `-${from ? from.toISOString().slice(0, 10) : 'start'}_${
            to ? to.toISOString().slice(0, 10) : 'today'
          }`
        : ''
  };
}

// Keep rows whose date field falls inside the range. Rows with no usable date
// are kept only when no range was requested, so a filtered export never
// silently includes undated records.
function withinRange(rows = [], range, ...fields) {
  if (!range.active) return rows;

  return rows.filter((row) => {
    let value = null;
    for (const field of fields) {
      if (row[field]) {
        value = row[field];
        break;
      }
    }
    if (!value) return false;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;

    if (range.from && date < range.from) return false;
    if (range.to && date > range.to) return false;
    return true;
  });
}

function sendCsv(res, filenameBase, rows, columns) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${safeFilename(filenameBase, 'csv')}"`
  );
  return res.send(toCsv(rows, columns));
}

export default function registerExportRoutes(app) {
  /* ---------------- user exports ---------------- */

  app.get(
    '/api/exports/my-applications.csv',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const range = readRange(req);
      const apps = withinRange(
        await listApplications({ userId: req.user.id }),
        range,
        'appliedAt',
        'createdAt'
      );

      return sendCsv(res, `my-applications${range.suffix}`, apps, [
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

  app.get(
    '/api/exports/my-interviews.ics',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const range = readRange(req);
      const apps = await listApplications({ userId: req.user.id, kind: 'internal' });
      const { attachInterviews } = await import('../repos.js');

      let events = [];
      for (const application of apps) {
        const withInterviews = await attachInterviews(application);
        for (const interview of withInterviews.interviews || []) {
          if (interview.status === 'cancelled') continue;
          events.push({
            id: interview.id,
            startsAt: interview.startsAt,
            title: `Interview — ${application.title} @ ${application.company}`,
            notes: interview.notes,
            location: interview.location
          });
        }
      }

      events = withinRange(events, range, 'startsAt');

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename(`my-interviews${range.suffix}`, 'ics')}"`
      );
      return res.send(toIcs(events, { calendarName: 'OPUS Interviews' }));
    }
  );

  app.get(
    '/api/exports/my-applications.pdf',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const range = readRange(req);
      const apps = withinRange(
        await listApplications({ userId: req.user.id }),
        range,
        'appliedAt',
        'createdAt'
      );

      const pdf = await toPdf({
        title: 'Application Summary',
        subtitle: `${req.user.name} — ${apps.length} application(s) — ${range.label}`,
        sections: [
          {
            heading: 'Applications',
            lines: apps.length
              ? apps.map(
                  (a) =>
                    `• ${a.title} @ ${a.company} — ${a.status} (${(a.appliedAt || '').slice(0, 10)})`
                )
              : ['No applications in this period.']
          }
        ]
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename(`application-summary${range.suffix}`, 'pdf')}"`
      );
      return res.send(pdf);
    }
  );

  /* ---------------- admin exports ---------------- */

  app.get(
    '/api/exports/admin/job-postings.csv',
    requireAuth,
    requirePermission('posting:all:manage'),
    async (req, res) => {
      const range = readRange(req);
      const jobs = withinRange(await listPlatformJobs(), range, 'postedAt', 'createdAt');

      return sendCsv(res, `opus-job-postings${range.suffix}`, jobs, [
        { label: 'Title', value: 'title' },
        { label: 'Company', value: 'company' },
        { label: 'Location', value: 'location' },
        { label: 'Status', value: 'status' },
        { label: 'Recruiter', value: 'recruiterId' },
        { label: 'Posted', value: (r) => (r.postedAt || '').slice(0, 10) }
      ]);
    }
  );

  app.get(
    '/api/exports/admin/applications.csv',
    requireAuth,
    requirePermission('application:all:view'),
    async (req, res) => {
      const range = readRange(req);
      const apps = withinRange(
        await listApplications({ kind: 'internal' }),
        range,
        'appliedAt',
        'createdAt'
      );

      return sendCsv(res, `opus-applications${range.suffix}`, apps, [
        { label: 'Candidate', value: 'userId' },
        { label: 'Title', value: 'title' },
        { label: 'Company', value: 'company' },
        { label: 'Status', value: 'status' },
        { label: 'Assigned Recruiter', value: 'assignedRecruiterId' },
        { label: 'Applied', value: (r) => (r.appliedAt || '').slice(0, 10) }
      ]);
    }
  );

  app.get(
    '/api/exports/admin/interviews.ics',
    requireAuth,
    requirePermission('interview:all:manage'),
    async (req, res) => {
      const range = readRange(req);
      const interviews = withinRange(
        (await listAllInterviews()).filter((i) => i.status !== 'cancelled'),
        range,
        'startsAt'
      );

      const events = interviews.map((i) => ({
        id: i.id,
        startsAt: i.startsAt,
        title: `Interview — ${i.title || 'Candidate'} @ ${i.company || 'OPUS'}`,
        notes: i.notes,
        location: i.location
      }));

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename(`opus-interviews${range.suffix}`, 'ics')}"`
      );
      return res.send(toIcs(events, { calendarName: 'OPUS Interviews' }));
    }
  );

  app.get(
    '/api/exports/admin/report.pdf',
    requireAuth,
    requirePermission('report:view'),
    async (req, res) => {
      const range = readRange(req);

      const format = (rows, keys) =>
        rows.length
          ? rows.map((r) => '• ' + keys.map((k) => `${k}: ${r[k]}`).join(', '))
          : ['None'];

      // Group an array into "• key: n" lines for the period report.
      const tally = (rows, keyFn) => {
        const counts = {};
        for (const row of rows) {
          const key = keyFn(row) || 'Unspecified';
          counts[key] = (counts[key] || 0) + 1;
        }
        const entries = Object.entries(counts);
        return entries.length
          ? entries.map(([key, count]) => `• ${key}: ${count}`)
          : ['None'];
      };

      let sections;

      if (range.active) {
        // Period report: counted from records inside the requested window.
        const [applications, jobs, interviews] = await Promise.all([
          listApplications({ kind: 'internal' }),
          listPlatformJobs(),
          listAllInterviews()
        ]);

        const periodApps = withinRange(applications, range, 'appliedAt', 'createdAt');
        const periodJobs = withinRange(jobs, range, 'postedAt', 'createdAt');
        const periodInterviews = withinRange(interviews, range, 'startsAt');

        sections = [
          {
            heading: `Applications in period (${periodApps.length})`,
            lines: tally(periodApps, (r) => r.status)
          },
          {
            heading: `Job postings in period (${periodJobs.length})`,
            lines: tally(periodJobs, (r) => r.status)
          },
          {
            heading: `Interviews in period (${periodInterviews.length})`,
            lines: tally(periodInterviews, (r) => r.status)
          }
        ];
      } else {
        const summary = await getReportsSummary();
        sections = [
          { heading: 'Users (role / status)', lines: format(summary.users, ['role', 'status', 'c']) },
          { heading: 'Job Postings (status)', lines: format(summary.jobs, ['status', 'c']) },
          { heading: 'Applications (kind / status)', lines: format(summary.applications, ['kind', 'status', 'c']) },
          { heading: 'Interviews (status)', lines: format(summary.interviews, ['status', 'c']) }
        ];
      }

      const pdf = await toPdf({
        title: 'Platform Report',
        subtitle: `Generated for ${req.user.name} — ${range.label}`,
        sections
      });

      await addAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'REPORT_EXPORTED',
        metadata: { format: 'pdf', range: range.label }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename(`opus-report${range.suffix}`, 'pdf')}"`
      );
      return res.send(pdf);
    }
  );


  /* ---------------- recruiter exports ---------------- */

  // A recruiter's own assigned candidates. Scoped to req.user.id, so a
  // recruiter can never export someone else's pipeline.
  app.get(
    '/api/exports/recruiter/assigned-applications.csv',
    requireAuth,
    requireRole('recruiter'),
    async (req, res) => {
      const range = readRange(req);
      const apps = withinRange(
        await listApplications({ recruiterId: req.user.id, kind: 'internal' }),
        range,
        'appliedAt',
        'createdAt'
      );

      return sendCsv(res, `assigned-candidates${range.suffix}`, apps, [
        { label: 'Candidate', value: (r) => r.candidate?.name || r.userId },
        { label: 'Email', value: (r) => r.candidate?.email || '' },
        { label: 'Role', value: 'title' },
        { label: 'Company', value: 'company' },
        { label: 'Status', value: 'status' },
        { label: 'Applied', value: (r) => (r.appliedAt || '').slice(0, 10) }
      ]);
    }
  );

  // A recruiter's interview schedule as a calendar file.
  app.get(
    '/api/exports/recruiter/interviews.ics',
    requireAuth,
    requireRole('recruiter'),
    async (req, res) => {
      const range = readRange(req);
      const apps = await listApplications({ recruiterId: req.user.id, kind: 'internal' });
      const { attachInterviews } = await import('../repos.js');

      let events = [];
      for (const application of apps) {
        const withInterviews = await attachInterviews(application);
        for (const interview of withInterviews.interviews || []) {
          if (interview.status === 'cancelled') continue;
          events.push({
            id: interview.id,
            startsAt: interview.startsAt,
            title: `Interview — ${application.candidate?.name || 'Candidate'} (${application.title})`,
            notes: interview.notes,
            location: interview.location
          });
        }
      }

      events = withinRange(events, range, 'startsAt');

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename(`recruiter-interviews${range.suffix}`, 'ics')}"`
      );
      return res.send(toIcs(events, { calendarName: 'OPUS Interviews' }));
    }
  );

  /* ---------------- super admin exports ---------------- */

  app.get(
    '/api/exports/super-admin/audit-logs.csv',
    requireAuth,
    requireRole('super_admin'),
    async (req, res) => {
      const range = readRange(req);
      const { listAuditLogs } = await import('../repos.js');
      const logs = withinRange(await listAuditLogs(5000), range, 'createdAt');

      return sendCsv(res, `opus-audit-logs${range.suffix}`, logs, [
        { label: 'Time', value: (r) => r.createdAt },
        { label: 'Action', value: 'action' },
        { label: 'Actor', value: 'actorId' },
        { label: 'Actor Role', value: 'actorRole' },
        { label: 'Target', value: 'targetUserId' }
      ]);
    }
  );
}
