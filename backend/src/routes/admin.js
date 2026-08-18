// Admin routes using MongoDB-backed repositories.
import crypto from 'crypto';
import { FRONTEND_URL, IS_PRODUCTION, PASSWORD_RESET_TTL_MS } from '../config.js';
import {
  findUserById, listUsers, updateUser, deleteUser, addAuditLog,
  resolveApprovalRequests, getDashboard, countPlatformJobs, countApplications, countEvents,
  listApplications, findApplicationById, updateApplication,
  findPlatformJobById, listPlatformJobs, updatePlatformJob, deletePlatformJob,
  listAllInterviews, findInterviewById, updateInterview,
  upsertSourceHealth, listSourceHealth, getReportsSummary,
  getSetting, setSetting, parsePagination, countUsers
} from '../repos.js';
import {
  platformGrowth, applicationsBySource, recruitmentPipeline, activityHeatmap
} from '../analytics.js';
import { getSourceHealthSnapshot, probeSources } from '../../jobSources.js';
import { sendPasswordResetEmail, sendAccountApprovedEmail, sendAccountDeclinedEmail } from '../email.js';
import { sanitizeUser, hashSecurityToken, requirePermission, requireAuth, requireRole, canManageAccount } from '../security.js';
import { enrichInternalApplication } from '../internal.js';

export default function registerAdminRoutes(app) {
  app.post(
    '/api/admin/users/:userId/send-password-reset',
    requireAuth,
    async (req, res) => {
      try {
        const targetUser = await findUserById(req.params.userId);

        if (!targetUser) {
          return res.status(404).json({ message: 'Account not found.' });
        }

        if (!canManageAccount(req.user.role, targetUser.role)) {
          return res.status(403).json({
            message: 'You cannot send a password-reset link for this account.'
          });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const now = new Date();
        const updated = await updateUser(targetUser.id, {
          passwordResetTokenHash: hashSecurityToken(rawToken),
          passwordResetExpiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS).toISOString(),
          updatedAt: now.toISOString()
        });

        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'PASSWORD_RESET_LINK_TRIGGERED',
          targetUserId: targetUser.id
        });

        const resetUrl = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
        const emailNotificationSent = await sendPasswordResetEmail(updated, resetUrl);

        return res.json({
          message: 'Password-reset link sent.',
          emailNotificationSent,
          ...(!IS_PRODUCTION ? { resetUrl } : {})
        });
      } catch (error) {
        console.error('Staff-triggered password reset failed:', error);
        return res.status(500).json({ message: 'Unable to send the password-reset link.' });
      }
    }
  );

  app.get(
    '/api/admin/overview',
    requireAuth,
    requireRole('super_admin', 'admin'),
    async (req, res) => {
      const visibleRoles =
        req.user.role === 'super_admin'
          ? ['super_admin', 'admin', 'recruiter', 'user']
          : ['user', 'recruiter'];
      const visibleUsers = await listUsers({ roles: visibleRoles });

      const pendingStatuses = ['pending_admin_approval', 'pending_super_admin_approval'];

      return res.json({
        dashboard: await getDashboard(null),
        totalUsers: visibleUsers.length,
        totalJobs: await countPlatformJobs(),
        totalApplications: await countApplications(),
        totalEvents: await countEvents(),
        pendingApprovals: visibleUsers.filter(
          (user) => pendingStatuses.includes(user.status) && user.emailVerified === true
        ).length,
        usersByRole: {
          super_admin: visibleUsers.filter((u) => u.role === 'super_admin').length,
          admin: visibleUsers.filter((u) => u.role === 'admin').length,
          recruiter: visibleUsers.filter((u) => u.role === 'recruiter').length,
          user: visibleUsers.filter((u) => u.role === 'user').length
        },
        usersByStatus: {
          pending: visibleUsers.filter((u) => pendingStatuses.includes(u.status)).length,
          active: visibleUsers.filter((u) => u.status === 'active').length,
          declined: visibleUsers.filter((u) => u.status === 'declined').length,
          suspended: visibleUsers.filter((u) => u.status === 'suspended').length
        }
      });
    }
  );

  app.get(
    '/api/admin/users',
    requireAuth,
    requireRole('super_admin', 'admin'),
    async (req, res) => {
      const roles =
        req.user.role === 'super_admin'
          ? ['super_admin', 'admin', 'recruiter', 'user']
          : ['user', 'recruiter'];
      const { page, pageSize, limit, offset } = parsePagination(req.query);
      const users = await listUsers({ roles, limit, offset });
      const total = await countUsers({ roles });
      return res.json({
        users: users.map(sanitizeUser),
        pagination: { page, pageSize, total, hasMore: offset + users.length < total }
      });
    }
  );

  app.get(
    '/api/admin/pending-approvals',
    requireAuth,
    requireRole('super_admin'),
    async (req, res) => {
      const allowedTargetRoles = ['admin', 'recruiter', 'user'];

      const users = (await listUsers({
        roles: allowedTargetRoles,
        statuses: ['pending_admin_approval', 'pending_super_admin_approval']
      })).filter((user) => user.emailVerified === true);

      return res.json({ users: users.map(sanitizeUser) });
    }
  );

  app.patch(
    '/api/admin/users/:userId/approve',
    requireAuth,
    requireRole('super_admin'),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const targetUser = await findUserById(userId);

        if (!targetUser) {
          return res.status(404).json({ message: 'User not found.' });
        }

        if (!canManageAccount(req.user.role, targetUser.role)) {
          return res.status(403).json({
            message: 'You do not have permission to approve this account.'
          });
        }

        // All new accounts (user, recruiter, admin) are approved by the Super Admin.
        const expectedStatus = 'pending_super_admin_approval';

        if (targetUser.emailVerified !== true) {
          return res.status(400).json({
            message: 'This account must verify its email address before approval.'
          });
        }

        if (targetUser.status !== expectedStatus) {
          return res.status(400).json({
            message: 'This account is not waiting for the required approval.'
          });
        }

        const now = new Date().toISOString();
        const updated = await updateUser(userId, {
          status: 'active',
          approvedBy: req.user.id,
          approvedAt: now,
          declinedBy: null,
          declinedAt: null,
          declineReason: '',
          updatedAt: now
        });
        await resolveApprovalRequests(userId, { status: 'approved', reviewedBy: req.user.id });

        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'ACCOUNT_APPROVED',
          targetUserId: userId,
          metadata: { targetRole: targetUser.role }
        });

        const emailNotificationSent = await sendAccountApprovedEmail(updated);

        return res.json({
          message: 'Account approved successfully.',
          emailNotificationSent,
          user: sanitizeUser(updated)
        });
      } catch (error) {
        console.error('Account approval failed:', error);
        return res.status(500).json({ message: error.message || 'Unable to approve account.' });
      }
    }
  );

  app.patch(
    '/api/admin/users/:userId/decline',
    requireAuth,
    requireRole('super_admin'),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const reason = String(req.body.reason || '').trim();
        const targetUser = await findUserById(userId);

        if (!targetUser) {
          return res.status(404).json({ message: 'User not found.' });
        }

        if (!canManageAccount(req.user.role, targetUser.role)) {
          return res.status(403).json({
            message: 'You do not have permission to decline this account.'
          });
        }

        if (
          !['pending_admin_approval', 'pending_super_admin_approval'].includes(targetUser.status)
        ) {
          return res.status(400).json({ message: 'This account is not waiting for approval.' });
        }

        const now = new Date().toISOString();
        const updated = await updateUser(userId, {
          status: 'declined',
          approvedBy: null,
          approvedAt: null,
          declinedBy: req.user.id,
          declinedAt: now,
          declineReason: reason,
          sessionVersion: Number(targetUser.sessionVersion || 1) + 1,
          updatedAt: now
        });
        await resolveApprovalRequests(userId, { status: 'declined', reviewedBy: req.user.id });

        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'ACCOUNT_DECLINED',
          targetUserId: userId,
          metadata: { targetRole: targetUser.role, reason }
        });

        const emailNotificationSent = await sendAccountDeclinedEmail(updated);

        return res.json({
          message: 'Account declined.',
          emailNotificationSent,
          user: sanitizeUser(updated)
        });
      } catch (error) {
        console.error('Account decline failed:', error);
        return res.status(500).json({ message: error.message || 'Unable to decline account.' });
      }
    }
  );

  app.put(
    '/api/admin/users/:userId',
    requireAuth,
    requireRole('super_admin', 'admin'),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const currentUser = await findUserById(userId);

        if (!currentUser) {
          return res.status(404).json({ message: 'User not found.' });
        }

        if (!canManageAccount(req.user.role, currentUser.role)) {
          return res.status(403).json({
            message: 'You do not have permission to update this account.'
          });
        }

        const allowedStatuses = [
          'pending_super_admin_approval',
          'pending_admin_approval',
          'active',
          'declined',
          'suspended',
          'disabled',
          'inactive'
        ];

        if (req.body.status && !allowedStatuses.includes(String(req.body.status))) {
          return res.status(400).json({ message: 'Invalid account status.' });
        }

        let nextRole = currentUser.role;

        if (req.body.role && req.body.role !== currentUser.role) {
          if (req.user.role !== 'super_admin') {
            return res.status(403).json({
              message: 'Only the Super Admin may change account roles.'
            });
          }

          const allowedRoles = ['admin', 'recruiter', 'user'];

          if (!allowedRoles.includes(req.body.role)) {
            return res.status(400).json({ message: 'Invalid role.' });
          }

          nextRole = req.body.role;
        }

        const previousStatus = currentUser.status;
        const nextStatus = req.body.status ?? currentUser.status;
        const now = new Date().toISOString();

        const patch = {
          name: req.body.name ?? currentUser.name,
          role: nextRole,
          status: nextStatus,
          updatedAt: now
        };

        const wasPending = ['pending_admin_approval', 'pending_super_admin_approval'].includes(previousStatus);

        if (nextStatus === 'active' && wasPending) {
          patch.approvedBy = req.user.id;
          patch.approvedAt = now;
          patch.emailVerified = true;
        }

        if (nextStatus === 'declined' && previousStatus !== 'declined') {
          patch.declinedBy = req.user.id;
          patch.declinedAt = now;
          patch.sessionVersion = Number(currentUser.sessionVersion || 1) + 1;
        }

        if (
          ['suspended', 'disabled', 'inactive'].includes(nextStatus) &&
          previousStatus !== nextStatus
        ) {
          patch.sessionVersion = Number(currentUser.sessionVersion || 1) + 1;
        }

        const updated = await updateUser(userId, patch);

        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'ACCOUNT_UPDATED',
          targetUserId: userId,
          metadata: {
            previousStatus,
            nextStatus,
            previousRole: currentUser.role,
            nextRole
          }
        });

        let emailNotificationSent = false;

        if (nextStatus === 'active' && wasPending) {
          emailNotificationSent = await sendAccountApprovedEmail(updated);
        }

        if (nextStatus === 'declined' && previousStatus !== 'declined') {
          emailNotificationSent = await sendAccountDeclinedEmail(updated);
        }

        const users = await listUsers();

        return res.json({
          message: 'User updated successfully.',
          emailNotificationSent,
          user: sanitizeUser(updated),
          users: users.map(sanitizeUser)
        });
      } catch (error) {
        console.error('User update failed:', error);
        return res.status(500).json({ message: error.message || 'Unable to update user.' });
      }
    }
  );

  app.delete(
    '/api/admin/users/:userId',
    requireAuth,
    requireRole('super_admin', 'admin'),
    async (req, res) => {
      const { userId } = req.params;

      if (req.user.id === userId) {
        return res.status(400).json({
          message: 'You cannot delete your own account while signed in.'
        });
      }

      const targetUser = await findUserById(userId);

      if (!targetUser) {
        return res.status(404).json({ message: 'User not found.' });
      }

      if (!canManageAccount(req.user.role, targetUser.role)) {
        return res.status(403).json({
          message: 'You do not have permission to delete this account.'
        });
      }

      await deleteUser(userId);

      await addAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'ACCOUNT_DELETED',
        targetUserId: userId,
        metadata: { targetRole: targetUser.role, targetEmail: targetUser.email }
      });

      const users = await listUsers();

      return res.json({
        message: 'User deleted successfully.',
        users: users.map(sanitizeUser)
      });
    }
  );


  // Dashboard analytics — all four charts, computed from existing records.
  app.get(
    '/api/admin/analytics',
    requireAuth,
    requirePermission('report:view'),
    async (req, res) => {
      try {
        const [usersResult, applications] = await Promise.all([
          listUsers({}),
          listApplications({ kind: 'internal' })
        ]);

        const users = usersResult.users || usersResult || [];

        return res.json({
          growth: platformGrowth(users, applications),
          bySource: applicationsBySource(applications),
          pipeline: recruitmentPipeline(applications),
          heatmap: activityHeatmap(applications),
          totals: {
            users: users.length,
            applications: applications.length
          }
        });
      } catch (error) {
        console.error('Admin analytics failed:', error);
        return res.status(500).json({ message: 'Unable to load analytics.' });
      }
    }
  );

  app.get(
    '/api/admin/internal-applications',
    requireAuth,
    requirePermission('application:all:view'),
    async (req, res) => {
      const internal = await listApplications({ kind: 'internal' });
      const applications = await Promise.all(
        internal.map((application) => enrichInternalApplication(application))
      );
      const recruiters = (await listUsers({ roles: ['recruiter'], statuses: ['active'] })).map(sanitizeUser);
      return res.json({ applications, recruiters });
    }
  );

  app.patch(
    '/api/admin/internal-applications/:applicationId/assign',
    requireAuth,
    requirePermission('application:assign'),
    async (req, res) => {
      const application = await findApplicationById(String(req.params.applicationId));

      if (!application || application.applicationType !== 'internal') {
        return res.status(404).json({ message: 'Internal application not found.' });
      }

      const recruiterId = String(req.body.recruiterId || '');
      const recruiter = await findUserById(recruiterId);

      if (!recruiter || recruiter.role !== 'recruiter' || recruiter.status !== 'active') {
        return res.status(400).json({ message: 'Select an active Recruiter.' });
      }

      const updated = await updateApplication(application.id, {
        assignedRecruiterId: recruiter.id,
        assignedBy: req.user.id,
        assignedAt: new Date().toISOString()
      });

      await addAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'APPLICATION_ASSIGNED',
        targetUserId: application.userId,
        metadata: { applicationId: application.id, recruiterId: recruiter.id }
      });

      return res.json({
        message: 'Application assigned.',
        application: await enrichInternalApplication(updated)
      });
    }
  );

  app.delete(
    '/api/admin/platform-jobs/:jobId',
    requireAuth,
    requirePermission('posting:delete'),
    async (req, res) => {
      const job = await findPlatformJobById(String(req.params.jobId));

      if (!job) {
        return res.status(404).json({ message: 'Platform posting not found.' });
      }

      await deletePlatformJob(job.id);

      await addAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'PLATFORM_POSTING_DELETED',
        metadata: { jobId: job.id, createdBy: job.recruiterId }
      });

      return res.json({ message: 'Platform posting deleted.' });
    }
  );

  /* ---- Job Postings management (all platform postings) ---- */
  app.get(
    '/api/admin/platform-jobs',
    requireAuth,
    requirePermission('posting:all:manage'),
    async (req, res) => {
      const { page, pageSize, limit, offset } = parsePagination(req.query);
      const filter = { limit, offset };
      if (req.query.status) filter.status = String(req.query.status);
      const jobs = await listPlatformJobs(filter);
      return res.json({
        jobs,
        pagination: { page, pageSize, hasMore: jobs.length === pageSize }
      });
    }
  );

  app.patch(
    '/api/admin/platform-jobs/:jobId',
    requireAuth,
    requirePermission('posting:all:manage'),
    async (req, res) => {
      const job = await findPlatformJobById(String(req.params.jobId));
      if (!job) return res.status(404).json({ message: 'Platform posting not found.' });

      const allowed = ['title', 'company', 'department', 'location', 'workMode',
        'jobType', 'minSalary', 'maxSalary', 'description', 'status'];
      const updates = {};
      for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
      if (updates.status && !['open', 'closed'].includes(updates.status)) {
        return res.status(400).json({ message: 'Posting status must be open or closed.' });
      }
      if (updates.status === 'closed') updates.closedAt = new Date().toISOString();

      const updated = await updatePlatformJob(job.id, updates);
      await addAuditLog({
        actorId: req.user.id, actorRole: req.user.role,
        action: 'PLATFORM_POSTING_MODERATED',
        metadata: { jobId: job.id, status: updated.status }
      });
      return res.json({ message: 'Posting updated.', job: updated });
    }
  );

  /* ---- Job Sources monitor ---- */
  app.get(
    '/api/admin/job-sources',
    requireAuth,
    requirePermission('job-source:manage'),
    async (req, res) => {
      const live = getSourceHealthSnapshot();
      if (live.length) await upsertSourceHealth(live);
      const persisted = await listSourceHealth();
      return res.json({ sources: persisted.length ? persisted : live });
    }
  );

  app.post(
    '/api/admin/job-sources/refresh',
    requireAuth,
    requirePermission('job-source:manage'),
    async (req, res) => {
      try {
        const snapshot = await probeSources(req.body || {});
        await upsertSourceHealth(snapshot);
        await addAuditLog({
          actorId: req.user.id, actorRole: req.user.role,
          action: 'JOB_SOURCES_PROBED',
          metadata: { count: snapshot.length }
        });
        return res.json({ sources: await listSourceHealth() });
      } catch (error) {
        return res.status(500).json({ message: error.message || 'Source probe failed.' });
      }
    }
  );

  /* ---- Calendar & Interviews (all internal interviews) ---- */
  app.get(
    '/api/admin/interviews',
    requireAuth,
    requirePermission('interview:all:manage'),
    async (req, res) => {
      return res.json({ interviews: await listAllInterviews() });
    }
  );

  app.patch(
    '/api/admin/interviews/:interviewId',
    requireAuth,
    requirePermission('interview:all:manage'),
    async (req, res) => {
      const interview = await findInterviewById(String(req.params.interviewId));
      if (!interview) return res.status(404).json({ message: 'Interview not found.' });

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
      if (req.body.status && ['scheduled', 'rescheduled', 'cancelled', 'completed'].includes(req.body.status)) {
        patch.status = req.body.status;
      }

      const updated = await updateInterview(interview.id, patch);
      await addAuditLog({
        actorId: req.user.id, actorRole: req.user.role,
        action: patch.status === 'cancelled' ? 'INTERVIEW_CANCELLED' : 'INTERVIEW_UPDATED',
        metadata: { interviewId: interview.id, status: updated.status }
      });
      return res.json({ message: 'Interview updated.', interview: updated });
    }
  );

  app.delete(
    '/api/admin/interviews/:interviewId',
    requireAuth,
    requirePermission('interview:all:manage'),
    async (req, res) => {
      const interview = await findInterviewById(String(req.params.interviewId));
      if (!interview) return res.status(404).json({ message: 'Interview not found.' });
      const updated = await updateInterview(interview.id, { status: 'cancelled' });
      await addAuditLog({
        actorId: req.user.id, actorRole: req.user.role,
        action: 'INTERVIEW_CANCELLED',
        metadata: { interviewId: interview.id }
      });
      return res.json({ message: 'Interview cancelled.', interview: updated });
    }
  );

  /* ---- Reports ---- */
  app.get(
    '/api/admin/reports',
    requireAuth,
    requirePermission('report:view'),
    async (req, res) => {
      return res.json({ summary: await getReportsSummary() });
    }
  );

  /* ---- Admin platform settings ---- */
  app.get(
    '/api/admin/settings',
    requireAuth,
    requireRole('super_admin', 'admin'),
    async (req, res) => {
      const settings = await getSetting('platform', {
        platformName: 'OPUS',
        supportEmail: '',
        allowRecruiterSelfRegistration: true,
        maintenanceMode: false
      });
      return res.json({ settings });
    }
  );

  app.put(
    '/api/admin/settings',
    requireAuth,
    requireRole('super_admin', 'admin'),
    async (req, res) => {
      const current = await getSetting('platform', {});
      const allowed = ['platformName', 'supportEmail', 'allowRecruiterSelfRegistration', 'maintenanceMode'];
      const updates = {};
      for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
      const next = { ...current, ...updates };
      await setSetting('platform', next, req.user.id);
      await addAuditLog({
        actorId: req.user.id, actorRole: req.user.role,
        action: 'PLATFORM_SETTINGS_UPDATED', metadata: { keys: Object.keys(updates) }
      });
      return res.json({ message: 'Settings saved.', settings: next });
    }
  );
}
