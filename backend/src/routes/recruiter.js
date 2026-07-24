// Recruiter routes using MongoDB-backed repositories.
import {
  listPlatformJobs, insertPlatformJob, findPlatformJobById, updatePlatformJob,
  listApplications, findApplicationById, updateApplication, attachInterviews,
  insertInterview, listInterviews, findInterviewById, updateInterview, addAuditLog, newId
} from '../repos.js';
import { requirePermission, requireAuth, requireRole } from '../security.js';
import { enrichInternalApplication } from '../internal.js';

export default function registerRecruiterRoutes(app) {
  app.get(
    '/api/recruiter/overview',
    requireAuth,
    requirePermission('staff:portal'),
    requireRole('recruiter'),
    async (req, res) => {
      const jobs = await listPlatformJobs({ recruiterId: req.user.id });
      const assigned = await listApplications({ recruiterId: req.user.id, kind: 'internal' });
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

      return res.json({
        counts: {
          postings: jobs.length,
          activePostings: jobs.filter((job) => job.status === 'open').length,
          assignedApplications: assigned.length,
          upcomingInterviews: interviews.filter(
            (interview) => new Date(interview.startsAt || 0).getTime() >= Date.now()
          ).length
        },
        recentApplications,
        upcomingInterviews: interviews.slice(0, 5)
      });
    }
  );

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

      const now = new Date().toISOString();
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
        'experienceRequirement', 'minSalary', 'maxSalary', 'description', 'status'
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

  app.get(
    '/api/recruiter/applications',
    requireAuth,
    requirePermission('application:assigned:view'),
    async (req, res) => {
      const assigned = await listApplications({ recruiterId: req.user.id, kind: 'internal' });
      const applications = await Promise.all(
        assigned.map(async (application) =>
          enrichInternalApplication(await attachInterviews(application))
        )
      );
      return res.json({ applications });
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
        application.assignedRecruiterId !== req.user.id
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

  app.post(
    '/api/recruiter/applications/:applicationId/interviews',
    requireAuth,
    requirePermission('interview:assigned:manage'),
    async (req, res) => {
      const application = await findApplicationById(String(req.params.applicationId));

      if (
        !application ||
        application.applicationType !== 'internal' ||
        application.assignedRecruiterId !== req.user.id
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

  app.patch(
    '/api/recruiter/interviews/:interviewId',
    requireAuth,
    requirePermission('interview:assigned:manage'),
    async (req, res) => {
      const interview = await findInterviewById(String(req.params.interviewId));
      if (!interview || interview.recruiterId !== req.user.id) {
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
      if (!interview || interview.recruiterId !== req.user.id) {
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
