// Global search + notifications for the top header bar.
//
// Both endpoints are ROLE-SCOPED: they only ever return records the signed-in
// user could already reach through the normal pages. Nothing here widens
// access — permissions are re-checked, not assumed.
import {
  listUsers, listApplications, listPlatformJobs, listSavedJobs,
  listInterviews, countUsers
} from '../repos.js';
import { requireAuth } from '../security.js';

const MAX_PER_GROUP = 5;

function matches(haystack, needle) {
  return String(haystack || '').toLowerCase().includes(needle);
}

export default function registerSearchRoutes(app) {
  /* ------------------------------------------------------------------ *
   * GET /api/search?q=...
   * Returns { groups: [{ label, items: [{ id, title, meta, page }] }] }
   * `page` is the sidebar page id the UI should open when clicked.
   * ------------------------------------------------------------------ */
  app.get('/api/search', requireAuth, async (req, res) => {
    const query = String(req.query.q || '').trim().toLowerCase();

    if (query.length < 2) {
      return res.json({ groups: [] });
    }

    const groups = [];
    const role = req.user.role;

    try {
      /* ---------------- candidate (user) ---------------- */
      if (role === 'user') {
        const [applications, saved] = await Promise.all([
          listApplications({ userId: req.user.id }),
          listSavedJobs(req.user.id)
        ]);

        const appHits = applications
          .filter(
            (a) =>
              matches(a.title, query) ||
              matches(a.company, query) ||
              matches(a.status, query)
          )
          .slice(0, MAX_PER_GROUP)
          .map((a) => ({
            id: a.id,
            title: a.title || 'Application',
            meta: [a.company, a.status].filter(Boolean).join(' · '),
            page: 'applications'
          }));

        if (appHits.length) groups.push({ label: 'My applications', items: appHits });

        const savedHits = saved
          .filter((s) => {
            const job = s.snapshot || {};
            return matches(job.title, query) || matches(job.company, query);
          })
          .slice(0, MAX_PER_GROUP)
          .map((s) => ({
            id: s.jobId,
            title: s.snapshot?.title || 'Saved job',
            meta: [s.snapshot?.company, s.snapshot?.location].filter(Boolean).join(' · '),
            page: 'applications'
          }));

        if (savedHits.length) groups.push({ label: 'Saved jobs', items: savedHits });
      }

      /* ---------------- recruiter ---------------- */
      if (role === 'recruiter') {
        const [assigned, postings] = await Promise.all([
          listApplications({ recruiterId: req.user.id, kind: 'internal' }),
          listPlatformJobs({ createdBy: req.user.id })
        ]);

        const candidateHits = assigned
          .filter(
            (a) =>
              matches(a.candidate?.name, query) ||
              matches(a.candidate?.email, query) ||
              matches(a.title, query)
          )
          .slice(0, MAX_PER_GROUP)
          .map((a) => ({
            id: a.id,
            title: a.candidate?.name || 'Candidate',
            meta: [a.title, a.status].filter(Boolean).join(' · '),
            page: 'recruiter-applications'
          }));

        if (candidateHits.length) {
          groups.push({ label: 'Assigned candidates', items: candidateHits });
        }

        const postingHits = (postings.jobs || postings || [])
          .filter((j) => matches(j.title, query) || matches(j.location, query))
          .slice(0, MAX_PER_GROUP)
          .map((j) => ({
            id: j.id,
            title: j.title,
            meta: [j.location, j.workMode].filter(Boolean).join(' · '),
            page: 'recruiter-jobs'
          }));

        if (postingHits.length) groups.push({ label: 'My job postings', items: postingHits });
      }

      /* ---------------- admin / super admin ---------------- */
      if (role === 'admin' || role === 'super_admin') {
        const [users, applications, postings] = await Promise.all([
          listUsers({}),
          listApplications({ kind: 'internal' }),
          listPlatformJobs({})
        ]);

        const userList = users.users || users || [];

        const userHits = userList
          .filter(
            (u) =>
              matches(u.name, query) ||
              matches(u.email, query) ||
              matches(u.company, query)
          )
          .slice(0, MAX_PER_GROUP)
          .map((u) => ({
            id: u.id,
            title: u.name || u.email,
            meta: [u.email, u.role, u.status].filter(Boolean).join(' · '),
            page: role === 'super_admin' ? 'super-accounts' : 'admin-users'
          }));

        if (userHits.length) groups.push({ label: 'People', items: userHits });

        const appHits = applications
          .filter(
            (a) =>
              matches(a.candidate?.name, query) ||
              matches(a.title, query) ||
              matches(a.status, query)
          )
          .slice(0, MAX_PER_GROUP)
          .map((a) => ({
            id: a.id,
            title: a.candidate?.name || a.title || 'Application',
            meta: [a.title, a.status].filter(Boolean).join(' · '),
            page: 'admin-applications'
          }));

        if (appHits.length) groups.push({ label: 'Applications', items: appHits });

        const postingHits = (postings.jobs || postings || [])
          .filter((j) => matches(j.title, query) || matches(j.location, query))
          .slice(0, MAX_PER_GROUP)
          .map((j) => ({
            id: j.id,
            title: j.title,
            meta: [j.location, j.workMode].filter(Boolean).join(' · '),
            page: 'admin-jobs'
          }));

        if (postingHits.length) groups.push({ label: 'Job postings', items: postingHits });
      }

      return res.json({ groups });
    } catch (error) {
      console.error('Search failed:', error);
      return res.json({ groups: [] });
    }
  });

  /* ------------------------------------------------------------------ *
   * GET /api/notifications
   * Returns { count, items: [{ id, title, meta, tone, page }] }
   * Derived from real records — no separate notifications table needed.
   * ------------------------------------------------------------------ */
  app.get('/api/notifications', requireAuth, async (req, res) => {
    const items = [];
    // Counts shown as small badges on sidebar items.
    const badges = {};
    const role = req.user.role;

    try {
      if (role === 'user') {
        const [applications, interviews] = await Promise.all([
          listApplications({ userId: req.user.id }),
          listInterviews({ userId: req.user.id })
        ]);

        // Applications that moved beyond "Applied" are worth surfacing.
        for (const application of applications) {
          if (application.status && application.status !== 'Applied') {
            items.push({
              id: `app-${application.id}`,
              title: `${application.title || 'Application'} — ${application.status}`,
              meta: application.company || '',
              tone:
                application.status === 'Rejected'
                  ? 'red'
                  : application.status === 'Offer'
                  ? 'green'
                  : 'blue',
              page: 'applications'
            });
          }
        }

        const upcoming = (interviews || []).filter((interview) => {
          const when = new Date(interview.scheduledAt || interview.date);
          return !Number.isNaN(when.getTime()) && when.getTime() > Date.now();
        });

        for (const interview of upcoming.slice(0, 5)) {
          items.push({
            id: `int-${interview.id}`,
            title: `Interview — ${interview.title || interview.jobTitle || 'Scheduled'}`,
            meta: new Date(interview.scheduledAt || interview.date).toLocaleString(),
            tone: 'violet',
            page: 'calendar'
          });
        }
      }

      if (role === 'recruiter') {
        const assigned = await listApplications({
          recruiterId: req.user.id,
          kind: 'internal'
        });

        const needsAction = assigned.filter(
          (a) => !a.status || a.status === 'Assigned' || a.status === 'Applied'
        );

        if (needsAction.length) badges['recruiter-applications'] = needsAction.length;

        for (const application of needsAction.slice(0, 8)) {
          items.push({
            id: `assigned-${application.id}`,
            title: `New candidate — ${application.candidate?.name || 'Candidate'}`,
            meta: application.title || '',
            tone: 'amber',
            page: 'recruiter-applications'
          });
        }
      }

      if (role === 'admin' || role === 'super_admin') {
        const [pendingUsers, applications] = await Promise.all([
          countUsers({
  statuses: [
    role === 'super_admin'
      ? 'pending_super_admin_approval'
      : 'pending_admin_approval'
  ]
}).catch(() => 0),
          listApplications({ kind: 'internal' })
        ]);

        const pendingCount = Number(pendingUsers) || 0;
        if (pendingCount > 0) {
          badges[role === 'super_admin' ? 'super-approvals' : 'admin-recruiters'] =
            pendingCount;
        }
        if (pendingCount > 0) {
          items.push({
            id: 'pending-approvals',
            title: `${pendingCount} account${pendingCount > 1 ? 's' : ''} awaiting approval`,
            meta: 'Requires your review',
            tone: 'amber',
            page: role === 'super_admin' ? 'super-approvals' : 'admin-recruiters'
          });
        }

        const unassigned = applications.filter((a) => !a.assignedRecruiterId);
        if (unassigned.length) badges['admin-applications'] = unassigned.length;
        if (unassigned.length) {
          items.push({
            id: 'unassigned-apps',
            title: `${unassigned.length} unassigned application${
              unassigned.length > 1 ? 's' : ''
            }`,
            meta: 'Waiting for a recruiter',
            tone: 'blue',
            page: 'admin-applications'
          });
        }
      }

      return res.json({ count: items.length, items: items.slice(0, 12), badges });
    } catch (error) {
      console.error('Notifications failed:', error);
      return res.json({ count: 0, items: [], badges: {} });
    }
  });
}
