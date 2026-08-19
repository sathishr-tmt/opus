// Recruiter routes using MongoDB-backed repositories.
//
// ACCESS MODEL
// An admin assigns each job seeker to a recruiter (user.assignedRecruiterId).
// A recruiter may only ever see and act on:
//   - the candidates assigned to them, and everything those people do
//   - applications explicitly assigned to them
//   - job postings they created themselves
//
// Every handler below derives that list from the database on each request and
// refuses anything outside it. Nothing here relies on the UI hiding things:
// guessing an id in the URL returns "not found", not someone else's candidate.
import {
  listPlatformJobs, insertPlatformJob, findPlatformJobById, updatePlatformJob,
  listApplications, findApplicationById, updateApplication, attachInterviews,
  insertInterview, listInterviews, findInterviewById, updateInterview, addAuditLog,
  listUsers, findUserById, getUserSettingsRow, listDocuments, newId
} from '../repos.js';
import { requirePermission, requireAuth, requireRole } from '../security.js';
import { enrichInternalApplication } from '../internal.js';

/* ------------------------------------------------------------------ *
 * Scoping helpers
 * ------------------------------------------------------------------ */

// The job seekers an admin has put under this recruiter.
async function myCandidates(recruiterId) {
  return listUsers({
    roles: ['user'],
    assignedRecruiterId: recruiterId
  });
}

async function myCandidateIds(recruiterId) {
  return (await myCandidates(recruiterId)).map((candidate) => candidate.id);
}

// Every application this recruiter may see: their assigned candidates'
// applications, plus any application handed to them directly.
async function myApplications(recruiterId, { kind = null } = {}) {
  const candidateIds = await myCandidateIds(recruiterId);

  const [byCandidate, byAssignment] = await Promise.all([
    candidateIds.length
      ? listApplications({ userIds: candidateIds, ...(kind ? { kind } : {}) })
      : [],
    listApplications({ recruiterId, ...(kind ? { kind } : {}) })
  ]);

  // Both lists can contain the same record; de-duplicate by id.
  const byId = new Map();
  for (const application of [...byCandidate, ...byAssignment]) {
    byId.set(application.id, application);
  }

  return [...byId.values()];
}

// True when this recruiter is allowed to touch this application.
async function ownsApplication(application, recruiterId) {
  if (!application) return false;
  if (application.assignedRecruiterId === recruiterId) return true;

  const candidate = await findUserById(application.userId);
  return Boolean(candidate && candidate.assignedRecruiterId === recruiterId);
}

export default function registerRecruiterRoutes(app) {
  /* ---------------- overview ---------------- */

  app.get(
    '/api/recruiter/overview',
    requireAuth,
    requirePermission('staff:portal'),
    requireRole('recruiter'),
    async (req, res) => {
      const [jobs, candidates, everything] = await Promise.all([
        listPlatformJobs({ recruiterId: req.user.id }),
        myCandidates(req.user.id),
        // Everything their candidates have done, external feeds included.
        // A recruiter looking after someone should see the whole picture,
        // not just the jobs that happen to be posted on OPUS.
        myApplications(req.user.id)
      ]);

      // Only OPUS postings can actually be worked — an application made on
      // another company's site is context, not a task.
      const assigned = everything.filter(
        (application) => application.applicationType === 'internal'
      );

      const interviews = [];

      for (const application of assigned) {
        const enriched = await enrichInternalApplication(application);
        const applicationInterviews = await listInterviews({ applicationId: application.id });

        for (const interview of applicationInterviews) {
          interviews.push({
            ...interview,
            applicationId: application.id,
            candidateName: enriched.candidate?.name || 'Candidate'
          });
        }
      }

      const recentApplications = await Promise.all(
        assigned.slice(0, 5).map((item) => enrichInternalApplication(item))
      );

      const actionableStatuses = ['Applied', 'Under Review'];

      return res.json({
        counts: {
          postings: jobs.length,
          activePostings: jobs.filter((job) => job.status === 'open').length,
          myCandidates: candidates.length,
          // Everything their candidates have applied to, anywhere.
          totalApplications: everything.length,
          // The subset a recruiter can actually progress.
          assignedApplications: assigned.length,
          needsAction: assigned.filter((application) =>
            actionableStatuses.includes(application.status)
          ).length,
          upcomingInterviews: interviews.filter(
            (interview) => new Date(interview.startsAt || 0).getTime() >= Date.now()
          ).length
        },
        recentApplications,
        upcomingInterviews: interviews.slice(0, 5)
      });
    }
  );

  /* ---------------- my candidates ---------------- */

  // The people an admin assigned to this recruiter, with enough detail to be
  // useful without a second request per person.
  app.get(
    '/api/recruiter/candidates',
    requireAuth,
    requireRole('recruiter'),
    requirePermission('application:assigned:view'),
    async (req, res) => {
      const candidates = await myCandidates(req.user.id);

      const detailed = await Promise.all(
        candidates.map(async (candidate) => {
          const [settings, applications, documents] = await Promise.all([
            getUserSettingsRow(candidate.id).catch(() => ({})),
            listApplications({ userId: candidate.id }),
            listDocuments(candidate.id, 'resume').catch(() => [])
          ]);

          const active = applications.filter(
            (application) => !['Rejected', 'Withdrawn'].includes(application.status)
          );

          const latest = [...applications].sort(
            (left, right) =>
              new Date(right.appliedAt || 0).getTime() -
              new Date(left.appliedAt || 0).getTime()
          )[0];

          return {
            id: candidate.id,
            name: candidate.name,
            email: candidate.email,
            status: candidate.status,
            createdAt: candidate.createdAt,
            professionalTitle: settings.professionalTitle || null,
            location: settings.location || null,
            phone: settings.phone || null,
            skills: settings.skills || '',
            experienceYears: settings.experienceYears ?? null,
            resumeDocumentId: documents[0]?.id || null,
            resumeName: documents[0]?.originalName || null,
            applicationCount: applications.length,
            activeApplicationCount: active.length,
            latestApplication: latest
              ? {
                  title: latest.title,
                  company: latest.company,
                  status: latest.status,
                  appliedAt: latest.appliedAt
                }
              : null
          };
        })
      );

      return res.json({ candidates: detailed });
    }
  );

  // Everything one candidate has done. Refuses anyone not assigned to you.
  app.get(
    '/api/recruiter/candidates/:userId',
    requireAuth,
    requireRole('recruiter'),
    requirePermission('application:assigned:view'),
    async (req, res) => {
      const candidate = await findUserById(String(req.params.userId));

      if (
        !candidate ||
        candidate.role !== 'user' ||
        candidate.assignedRecruiterId !== req.user.id
      ) {
        return res.status(404).json({ message: 'Candidate not found.' });
      }

      const [settings, applications, documents, interviews] = await Promise.all([
        getUserSettingsRow(candidate.id).catch(() => ({})),
        listApplications({ userId: candidate.id }),
        listDocuments(candidate.id).catch(() => []),
        listInterviews({ userId: candidate.id })
      ]);

      return res.json({
        candidate: {
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
          status: candidate.status,
          createdAt: candidate.createdAt,
          professionalTitle: settings.professionalTitle || null,
          location: settings.location || null,
          phone: settings.phone || null,
          skills: settings.skills || '',
          about: settings.about || '',
          experienceYears: settings.experienceYears ?? null,
          workAuthorization: settings.workAuthorization || null,
          preferredWorkMode: settings.preferredWorkMode || null
        },
        documents: documents.map((document) => ({
          id: document.id,
          kind: document.kind,
          originalName: document.originalName,
          matchScore: document.matchScore,
          jobTitle: document.jobTitle,
          company: document.company,
          createdAt: document.createdAt
        })),
        applications,
        interviews
      });
    }
  );

  /* ---------------- job postings ---------------- */

  app.get(
    '/api/recruiter/jobs',
    requireAuth,
    requirePermission('posting:own:manage'),
    async (req, res) => {
      const jobs = await listPlatformJobs({ recruiterId: req.user.id });
      return res.json({ jobs });
    }
  );

  app.post(
    '/api/recruiter/jobs',
    requireAuth,
    requirePermission('posting:own:manage'),
    async (req, res) => {
      const title = String(req.body.title || '').trim();
      const location = String(req.body.location || '').trim();

      if (!title || !location) {
        return res.status(400).json({ message: 'Job title and location are required.' });
      }

      const job = await insertPlatformJob({
        id: `platform-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        company: req.body.company || req.user.company || 'OPUS Platform Employer',
        department: String(req.body.department || '').trim(),
        location,
        workMode: String(req.body.workMode || '').trim() || 'Not listed',
        jobType: String(req.body.employmentType || '').trim() || 'Full-time',
        experienceRequirement: String(req.body.experienceRequirement || '').trim(),
        minSalary: Number(req.body.minSalary || 0),
        maxSalary: Number(req.body.maxSalary || 0),
        description: String(req.body.description || '').trim(),
        // Optional contact details shown to candidates on the posting.
        // Falls back to the recruiter's account email when left blank.
        recruiterEmail:
          String(req.body.recruiterEmail || '').trim() || req.user.email || '',
        recruiterPhone: String(req.body.recruiterPhone || '').trim(),
        status: 'open',
        createdBy: req.user.id,
        url: ''
      });

      await addAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'PLATFORM_POSTING_CREATED',
        metadata: { jobId: job.id }
      });

      return res.status(201).json({ message: 'Job posting created successfully.', job });
    }
  );

  app.patch(
    '/api/recruiter/jobs/:jobId',
    requireAuth,
    requirePermission('posting:own:manage'),
    async (req, res) => {
      const job = await findPlatformJobById(String(req.params.jobId));

      if (!job || job.createdBy !== req.user.id) {
        return res.status(404).json({ message: 'Your job posting was not found.' });
      }

      const allowed = [
        'title', 'department', 'location', 'workMode', 'employmentType',
        'experienceRequirement', 'minSalary', 'maxSalary', 'description', 'status',
        'recruiterEmail', 'recruiterPhone'
      ];
      const updates = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          updates[key === 'employmentType' ? 'jobType' : key] = req.body[key];
        }
      }
      if (updates.status && !['open', 'closed'].includes(updates.status)) {
        return res.status(400).json({ message: 'Posting status must be open or closed.' });
      }

      const updated = await updatePlatformJob(job.id, updates);

      await addAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'PLATFORM_POSTING_UPDATED',
        metadata: { jobId: updated.id, status: updated.status }
      });

      return res.json({ message: 'Job posting updated.', job: updated });
    }
  );

  /* ---------------- applications ---------------- */

  app.get(
    '/api/recruiter/applications',
    requireAuth,
    requirePermission('application:assigned:view'),
    async (req, res) => {
      // Everything their candidates have applied to. Each record keeps its
      // applicationType so the UI can tell which ones are workable.
      const all = await myApplications(req.user.id);

      const applications = await Promise.all(
        all.map(async (application) =>
          enrichInternalApplication(await attachInterviews(application))
        )
      );

      return res.json({
        applications,
        counts: {
          total: applications.length,
          internal: applications.filter((a) => a.applicationType === 'internal').length,
          external: applications.filter((a) => a.applicationType !== 'internal').length
        }
      });
    }
  );

  app.patch(
    '/api/recruiter/applications/:applicationId',
    requireAuth,
    requirePermission('application:assigned:update'),
    async (req, res) => {
      const application = await findApplicationById(String(req.params.applicationId));

      if (
        !application ||
        application.applicationType !== 'internal' ||
        !(await ownsApplication(application, req.user.id))
      ) {
        return res.status(404).json({ message: 'Assigned application not found.' });
      }

      const allowedStatuses = [
        'Applied', 'Under Review', 'Online Assessment', 'Technical Interview',
        'Final Interview', 'Offer', 'Rejected', 'Withdrawn'
      ];
      const nextStatus = req.body.status ? String(req.body.status) : application.status;
      if (!allowedStatuses.includes(nextStatus)) {
        return res.status(400).json({ message: 'Invalid candidate status.' });
      }

      const updated = await updateApplication(application.id, {
        status: nextStatus,
        recruiterNotes: String(req.body.notes ?? application.recruiterNotes ?? '')
      });

      await addAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'ASSIGNED_APPLICATION_UPDATED',
        targetUserId: application.userId,
        metadata: { applicationId: application.id, status: nextStatus }
      });

      return res.json({
        application: await enrichInternalApplication(await attachInterviews(updated))
      });
    }
  );

  /* ---------------- interviews ---------------- */

  app.post(
    '/api/recruiter/applications/:applicationId/interviews',
    requireAuth,
    requirePermission('interview:assigned:manage'),
    async (req, res) => {
      const application = await findApplicationById(String(req.params.applicationId));

      if (
        !application ||
        application.applicationType !== 'internal' ||
        !(await ownsApplication(application, req.user.id))
      ) {
        return res.status(404).json({ message: 'Assigned application not found.' });
      }

      const startsAt = String(req.body.startsAt || '');
      if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
        return res.status(400).json({ message: 'A valid interview date and time is required.' });
      }

      const interview = await insertInterview({
        id: `interview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        applicationId: application.id,
        userId: application.userId,
        createdBy: req.user.id,
        startsAt,
        durationMinutes: Number(req.body.durationMinutes || 60),
        mode: String(req.body.mode || 'Video'),
        location: String(req.body.location || ''),
        notes: String(req.body.notes || '')
      });

      await updateApplication(application.id, {});

      await addAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'INTERVIEW_SCHEDULED',
        targetUserId: application.userId,
        metadata: { applicationId: application.id, interviewId: interview.id }
      });

      return res.status(201).json({ message: 'Interview scheduled.', interview });
    }
  );

  // Every interview belonging to this recruiter's candidates, for the calendar.
  app.get(
    '/api/recruiter/interviews',
    requireAuth,
    requirePermission('interview:assigned:manage'),
    async (req, res) => {
      const candidateIds = await myCandidateIds(req.user.id);

      const [byCandidate, byRecruiter] = await Promise.all([
        candidateIds.length ? listInterviews({ userIds: candidateIds }) : [],
        listInterviews({ recruiterId: req.user.id })
      ]);

      const byId = new Map();
      for (const interview of [...byCandidate, ...byRecruiter]) {
        byId.set(interview.id, interview);
      }

      return res.json({ interviews: [...byId.values()] });
    }
  );

  // An interview is yours if you created it, or if it belongs to one of your
  // candidates — an admin may have reassigned the person after it was booked.
  async function ownsInterview(interview, recruiterId) {
    if (!interview) return false;
    if (interview.recruiterId === recruiterId) return true;
    if (!interview.userId) return false;

    const candidate = await findUserById(interview.userId);
    return Boolean(candidate && candidate.assignedRecruiterId === recruiterId);
  }

  app.patch(
    '/api/recruiter/interviews/:interviewId',
    requireAuth,
    requirePermission('interview:assigned:manage'),
    async (req, res) => {
      const interview = await findInterviewById(String(req.params.interviewId));

      if (!(await ownsInterview(interview, req.user.id))) {
        return res.status(404).json({ message: 'Interview not found.' });
      }

      const patch = {};
      if (req.body.startsAt) {
        if (Number.isNaN(new Date(req.body.startsAt).getTime())) {
          return res.status(400).json({ message: 'A valid interview date and time is required.' });
        }
        patch.startsAt = req.body.startsAt;
        patch.status = 'rescheduled';
      }
      if (req.body.mode !== undefined) patch.mode = String(req.body.mode);
      if (req.body.location !== undefined) patch.location = String(req.body.location);
      if (req.body.notes !== undefined) patch.notes = String(req.body.notes);
      if (req.body.status === 'cancelled') patch.status = 'cancelled';

      const updated = await updateInterview(interview.id, patch);

      await addAuditLog({
        actorId: req.user.id, actorRole: req.user.role,
        action: patch.status === 'cancelled' ? 'INTERVIEW_CANCELLED' : 'INTERVIEW_RESCHEDULED',
        targetUserId: interview.userId,
        metadata: { interviewId: interview.id, status: updated.status }
      });

      return res.json({ message: 'Interview updated.', interview: updated });
    }
  );

  app.delete(
    '/api/recruiter/interviews/:interviewId',
    requireAuth,
    requirePermission('interview:assigned:manage'),
    async (req, res) => {
      const interview = await findInterviewById(String(req.params.interviewId));

      if (!(await ownsInterview(interview, req.user.id))) {
        return res.status(404).json({ message: 'Interview not found.' });
      }

      const updated = await updateInterview(interview.id, { status: 'cancelled' });

      await addAuditLog({
        actorId: req.user.id, actorRole: req.user.role,
        action: 'INTERVIEW_CANCELLED', targetUserId: interview.userId,
        metadata: { interviewId: interview.id }
      });

      return res.json({ message: 'Interview cancelled.', interview: updated });
    }
  );
}
