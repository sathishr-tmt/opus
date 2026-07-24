// User portal routes using MongoDB-backed repositories.
// External job results are no longer persisted in the database; a bounded
// in-memory cache (src/jobCache.js) resolves save/apply lookups instead.
import {
  getDashboard, listPlatformJobs, findPlatformJobById,
  listSavedJobs, isJobSaved, saveJob, unsaveJob,
  getJobStatuses, setJobStatus, deleteJobStatus,
  listApplications, findApplicationById, insertApplication, updateApplication, deleteApplication,
  listEvents, findEventById, insertEvent, updateEvent, deleteEvent,
  getUserSettingsRow, upsertUserSettings, updateUser, findUserById,
  addAuditLog
} from '../repos.js';
import { mergeUniqueJobs, normalizeJobStatus } from '../jobsUtil.js';
import { attachAtsScores } from '../ats.js';
import { getMyJobs } from '../myJobs.js';
import { requireAuth, requireRole } from '../security.js';
import { isInternalJob } from '../internal.js';
import { rememberJobs, getJob } from '../jobCache.js';
import { fetchAllowedJobs } from '../../jobSources.js';

const DEFAULT_SETTINGS = {
  name: '',
  email: '',
  phone: '',
  location: 'United States',
  about: '',
  notifications: { email: true, interviews: true, jobAlerts: true }
};

async function getSettingsFor(user) {
  const stored = await getUserSettingsRow(user.id);
  return {
    ...DEFAULT_SETTINGS,
    name: user.name || DEFAULT_SETTINGS.name,
    ...stored,
    email: user.email || stored.email || '',
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...(stored.notifications || {})
    }
  };
}

async function saveSettingsFor(user, updates = {}) {
  const current = await getSettingsFor(user);
  const safeUpdates = { ...updates };
  // Email changes must use the verified account-security workflow.
  delete safeUpdates.email;
  delete safeUpdates.dashboard;

  const next = {
    ...current,
    ...safeUpdates,
    email: user.email,
    notifications: {
      ...current.notifications,
      ...(safeUpdates.notifications || {})
    }
  };
  await upsertUserSettings(user.id, next);
  return next;
}

async function attachStatuses(userId, jobs = []) {
  const statuses = await getJobStatuses(userId);
  return jobs.map((job) => {
    const status = normalizeJobStatus(statuses[String(job.id)] || 'Not Applied');
    return { ...job, applicationStatus: status, status: job.source === 'Platform' ? job.status : status };
  });
}

async function handleJobSearch(req, res, query) {
  try {
    const result = await fetchAllowedJobs(query);
    const platformJobs = await listPlatformJobs({ status: 'open' });
    const visibleJobs = mergeUniqueJobs([...platformJobs, ...result.jobs]);

    rememberJobs(visibleJobs);

    const statuses = await getJobStatuses(req.user.id);
    const jobsWithStatuses = visibleJobs.map((job) => {
      const status = normalizeJobStatus(statuses[String(job.id)] || 'Not Applied');
      return { ...job, applicationStatus: status, status };
    });

    // ATS match score for each result, based on the user's saved profile.
    const profile = await getSettingsFor(req.user);
    const scoredJobs = attachAtsScores(profile, jobsWithStatuses);

    const saved = await listSavedJobs(req.user.id);

    return res.json({
      jobs: scoredJobs,
      top10: scoredJobs.slice(0, 10),
      total: scoredJobs.length,
      hasMore: scoredJobs.length > 10,
      warnings: result.warnings || [],
      sources: result.sources || [],
      filters: result.filters || query,
      matchSummary: result.matchSummary || {},
      savedJobIds: saved.map((s) => s.jobId)
    });
  } catch (error) {
    console.error('Job search failed:', error);
    return res.status(500).json({
      message: error.message || 'Failed to fetch job opportunities.'
    });
  }
}

export default function registerUserRoutes(app) {
  app.get(
    '/api/dashboard',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      return res.json({
        ...(await getDashboard(req.user.id)),
        settings: await getSettingsFor(req.user)
      });
    }
  );

  app.get(
    '/api/jobs',
    requireAuth,
    requireRole('user'),
    async (req, res) => handleJobSearch(req, res, req.query || {})
  );

  app.post(
    '/api/jobs/fetch',
    requireAuth,
    requireRole('user'),
    async (req, res) => handleJobSearch(req, res, req.body || {})
  );

  // Unified saved + applied list.
  // Dashboard uses limit=6; My Applications pages through in blocks of 20.
  app.get(
    '/api/my-jobs',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const profile = await getSettingsFor(req.user);

      return res.json(
        await getMyJobs(req.user.id, profile, {
          offset: req.query.offset,
          limit: req.query.limit
        })
      );
    }
  );

  // Remove one entry from the unified list.
  // kind = 'saved'   -> id is the jobId
  // kind = 'applied' -> id is the applicationId
  app.delete(
    '/api/my-jobs/:kind/:id',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const kind = String(req.params.kind);
      const id = String(req.params.id);

      if (kind === 'saved') {
        await unsaveJob(req.user.id, id);
      } else if (kind === 'applied') {
        const application = await findApplicationById(id);

        if (!application || application.userId !== req.user.id) {
          return res.status(404).json({ message: 'Application not found.' });
        }

        await deleteApplication(id);
        await deleteJobStatus(req.user.id, application.jobId);
      } else {
        return res.status(400).json({ message: 'Unknown entry type.' });
      }

      const profile = await getSettingsFor(req.user);

      return res.json({
        message: 'Removed.',
        ...(await getMyJobs(req.user.id, profile, { limit: req.query.limit || 20 })),
        dashboard: await getDashboard(req.user.id)
      });
    }
  );

  app.get(
    '/api/saved',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const saved = await listSavedJobs(req.user.id);
      const jobs = saved
        .map((item) => item.snapshot || getJob(item.jobId))
        .filter(Boolean);

      const profile = await getSettingsFor(req.user);

      return res.json({
        savedJobIds: saved.map((s) => s.jobId),
        jobs: attachAtsScores(profile, await attachStatuses(req.user.id, jobs))
      });
    }
  );

  app.post(
    '/api/saved/:jobId',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const jobId = String(req.params.jobId);
      const alreadySaved = await isJobSaved(req.user.id, jobId);

      if (alreadySaved) {
        await unsaveJob(req.user.id, jobId);
      } else {
        const snapshot =
          (await findPlatformJobById(jobId)) || getJob(jobId) || req.body?.job || null;
        await saveJob(req.user.id, jobId, snapshot);
      }

      const saved = await listSavedJobs(req.user.id);

      return res.json({
        savedJobIds: saved.map((s) => s.jobId),
        dashboard: await getDashboard(req.user.id)
      });
    }
  );

  app.get(
    '/api/applications',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      return res.json({
        applications: await listApplications({ userId: req.user.id }),
        dashboard: await getDashboard(req.user.id)
      });
    }
  );

  app.post(
    '/api/applications/:jobId',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const jobId = String(req.params.jobId);
      const userApplications = await listApplications({ userId: req.user.id });

      const existingApplication = userApplications.find(
        (application) =>
          String(application.id) === jobId || String(application.jobId) === jobId
      );

      if (existingApplication) {
        return res.json({
          application: existingApplication,
          applications: userApplications,
          dashboard: await getDashboard(req.user.id)
        });
      }

      const job =
        (await findPlatformJobById(jobId)) || getJob(jobId) || req.body?.job;

      if (!job) {
        return res.status(404).json({
          message:
            'Job not found in the OPUS cache. Search again and then mark it as applied.'
        });
      }

      const now = new Date().toISOString();
      const internalApplication = isInternalJob(job);

      const application = await insertApplication({
        id: internalApplication
          ? `internal-application-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          : String(job.id),
        jobId: String(job.id),
        userId: req.user.id,
        title: job.title || 'Job Opening',
        company: job.company || 'Company',
        location: job.location || 'Not listed',
        status: 'Applied',
        appliedAt: now,
        updatedAt: now,
        source: internalApplication ? 'Platform' : job.source || 'Public Job Feed',
        url: internalApplication ? '' : job.url || '',
        applicationType: internalApplication ? 'internal' : 'external',
        recruiterNotes: ''
      });

      await setJobStatus(req.user.id, job.id, 'Applied');

      if (internalApplication) {
        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'INTERNAL_APPLICATION_SUBMITTED',
          targetUserId: req.user.id,
          metadata: { applicationId: application.id, jobId: application.jobId }
        });
      }

      return res.status(201).json({
        application,
        applications: await listApplications({ userId: req.user.id }),
        dashboard: await getDashboard(req.user.id)
      });
    }
  );

  app.put(
    '/api/applications/:applicationId',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const applicationId = String(req.params.applicationId);
      const status = normalizeJobStatus(req.body.status || '');

      if (status === 'Not Applied') {
        return res.status(400).json({ message: 'Invalid application status.' });
      }

      const userApplications = await listApplications({ userId: req.user.id });
      const application = userApplications.find(
        (item) =>
          String(item.id) === applicationId || String(item.jobId) === applicationId
      );

      if (!application) {
        return res.status(404).json({ message: 'Application not found.' });
      }

      const updated = await updateApplication(application.id, { status });
      await setJobStatus(req.user.id, applicationId, status);

      return res.json({
        message: 'Application status updated successfully.',
        application: updated,
        applications: await listApplications({ userId: req.user.id }),
        dashboard: await getDashboard(req.user.id)
      });
    }
  );

  app.delete(
    '/api/applications/:applicationId',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const applicationId = String(req.params.applicationId);
      const userApplications = await listApplications({ userId: req.user.id });
      const application = userApplications.find(
        (item) =>
          String(item.id) === applicationId || String(item.jobId) === applicationId
      );

      if (application) {
        await deleteApplication(application.id);
      }

      await deleteJobStatus(req.user.id, applicationId);

      return res.json({
        applications: await listApplications({ userId: req.user.id }),
        dashboard: await getDashboard(req.user.id)
      });
    }
  );

  app.get(
    '/api/calendar',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      return res.json({ events: await listEvents(req.user.id) });
    }
  );

  app.post(
    '/api/calendar',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      if (!String(req.body.title || '').trim() || !String(req.body.date || '').trim()) {
        return res.status(400).json({ message: 'Event title and date are required.' });
      }

      const event = await insertEvent({
        id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: req.user.id,
        title: String(req.body.title).trim(),
        date: String(req.body.date).trim(),
        time: String(req.body.time || '').trim(),
        notes: String(req.body.notes || '').trim()
      });

      return res.status(201).json({
        event,
        events: await listEvents(req.user.id),
        dashboard: await getDashboard(req.user.id)
      });
    }
  );

  app.put(
    '/api/calendar/:eventId',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const event = await findEventById(String(req.params.eventId));

      if (!event || event.userId !== req.user.id) {
        return res.status(404).json({ message: 'Event not found.' });
      }

      const updated = await updateEvent(event.id, {
        title: req.body.title ?? event.title,
        date: req.body.date ?? event.date,
        time: req.body.time ?? event.time,
        notes: req.body.notes ?? event.notes
      });

      return res.json({
        event: updated,
        events: await listEvents(req.user.id),
        dashboard: await getDashboard(req.user.id)
      });
    }
  );

  app.delete(
    '/api/calendar/:eventId',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const event = await findEventById(String(req.params.eventId));

      if (event && event.userId === req.user.id) {
        await deleteEvent(event.id);
      }

      return res.json({
        events: await listEvents(req.user.id),
        dashboard: await getDashboard(req.user.id)
      });
    }
  );

  app.get(
    '/api/settings',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      return res.json({ settings: await getSettingsFor(req.user) });
    }
  );

  app.put(
    '/api/settings',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      let user = await findUserById(req.user.id);

      if (!user) {
        return res.status(404).json({ message: 'Account not found.' });
      }

      if (req.body.name && String(req.body.name).trim().length >= 2) {
        user = await updateUser(user.id, {
          name: String(req.body.name).trim(),
          updatedAt: new Date().toISOString()
        });
      }

      const settings = await saveSettingsFor(user, req.body || {});

      return res.json({
        settings,
        dashboard: await getDashboard(req.user.id)
      });
    }
  );

  app.get(
    '/api/profile',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const profile = await getSettingsFor(req.user);
      return res.json({ profile, settings: profile });
    }
  );

  app.put(
    '/api/profile',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      let user = await findUserById(req.user.id);

      if (!user) {
        return res.status(404).json({ message: 'Account not found.' });
      }

      if (req.body.name && String(req.body.name).trim().length >= 2) {
        user = await updateUser(user.id, {
          name: String(req.body.name).trim(),
          updatedAt: new Date().toISOString()
        });
      }

      const profile = await saveSettingsFor(user, req.body || {});

      return res.json({
        profile,
        settings: profile,
        dashboard: await getDashboard(req.user.id)
      });
    }
  );
}
