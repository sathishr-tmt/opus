// Super Admin routes using MongoDB-backed repositories.
import crypto from 'crypto';
import { FRONTEND_URL, IS_PRODUCTION, ADMIN_INVITATION_TTL_MS } from '../config.js';
import {
  findUserByEmail, insertInvitation, listInvitations, deleteInvitation, addAuditLog, listAuditLogs,
  listUsers, countPlatformJobs, countApplications, getReportsSummary,
  listSourceHealth, getSetting
} from '../repos.js';
import { getSourceHealthSnapshot } from '../../jobSources.js';
import { sanitizeUser } from '../security.js';
import { sendAdminInvitationEmail } from '../email.js';
import { hashSecurityToken, requirePermission, requireAuth, requireRole } from '../security.js';
import { getPermissionsCatalogue, setRolePermissions } from '../permissions.js';
import { parsePagination } from '../repos.js';

export default function registerSuperAdminRoutes(app) {
  app.post(
    '/api/super-admin/admin-invitations',
    requireAuth,
    requirePermission('account:admin:manage'),
    async (req, res) => {
      try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {
          return res.status(400).json({ message: 'Enter a valid Admin email address.' });
        }

        const existingAccount = await findUserByEmail(email);

        if (existingAccount) {
          return res.status(400).json({
            message: 'An OPUS account already uses this email address.'
          });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const now = new Date();
        const invitation = {
          id: `admin-invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          email,
          status: 'pending',
          tokenHash: hashSecurityToken(rawToken),
          invitedBy: req.user.id,
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + ADMIN_INVITATION_TTL_MS).toISOString()
        };

        await insertInvitation(invitation);

        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'ADMIN_INVITATION_SENT',
          metadata: { email }
        });

        const invitationUrl = `${FRONTEND_URL}/admin-invite?token=${encodeURIComponent(rawToken)}`;
        const emailNotificationSent = await sendAdminInvitationEmail(invitation, invitationUrl);

        return res.status(201).json({
          message: 'Admin invitation sent.',
          emailNotificationSent,
          invitation: {
            id: invitation.id,
            email: invitation.email,
            status: invitation.status,
            createdAt: invitation.createdAt,
            expiresAt: invitation.expiresAt
          },
          ...(!IS_PRODUCTION ? { invitationUrl } : {})
        });
      } catch (error) {
        console.error('Admin invitation failed:', error);
        return res.status(500).json({ message: 'Unable to send the Admin invitation.' });
      }
    }
  );

  app.get(
    '/api/super-admin/admin-invitations',
    requireAuth,
    requirePermission('account:admin:manage'),
    async (req, res) => {
      const invitations = await listInvitations();
      return res.json({
        invitations: invitations.map(({ tokenHash, ...invitation }) => invitation)
      });
    }
  );

  app.delete(
    '/api/super-admin/admin-invitations/:id',
    requireAuth,
    requirePermission('account:admin:manage'),
    async (req, res) => {
      try {
        const invitations = await listInvitations();
        const invitation = invitations.find((i) => i.id === String(req.params.id));

        if (!invitation) {
          return res.status(404).json({ message: 'Invitation not found.' });
        }

        if (invitation.status !== 'pending') {
          return res.status(400).json({ message: 'Only pending invitations can be removed.' });
        }

        await deleteInvitation(invitation.id);

        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'ADMIN_INVITATION_DELETED',
          metadata: { email: invitation.email }
        });

        return res.json({ message: 'Invitation removed.' });
      } catch (error) {
        console.error('Admin invitation delete failed:', error);
        return res.status(500).json({ message: 'Unable to remove the invitation.' });
      }
    }
  );

  app.get(
    '/api/super-admin/audit-logs',
    requireAuth,
    requireRole('super_admin'),
    async (req, res) => {
      const { pageSize } = parsePagination(req.query);
      const limit = Math.min(500, pageSize * 4);
      return res.json({ auditLogs: await listAuditLogs(limit) });
    }
  );

  /* ---- Account Oversight (read-only across all roles) ---- */
  app.get(
    '/api/super-admin/accounts',
    requireAuth,
    requireRole('super_admin'),
    async (req, res) => {
      const users = await listUsers();
      const byRole = { super_admin: [], admin: [], recruiter: [], user: [] };
      for (const u of users) (byRole[u.role] || (byRole[u.role] = [])).push(sanitizeUser(u));
      return res.json({
        totals: {
          super_admin: byRole.super_admin.length,
          admin: byRole.admin.length,
          recruiter: byRole.recruiter.length,
          user: byRole.user.length
        },
        accounts: users.map(sanitizeUser)
      });
    }
  );

  /* ---- Platform Management (platform-wide operational stats) ---- */
  app.get(
    '/api/super-admin/platform',
    requireAuth,
    requireRole('super_admin'),
    async (req, res) => {
      return res.json({
        totalJobs: await countPlatformJobs(),
        totalApplications: await countApplications(),
        reports: await getReportsSummary()
      });
    }
  );

  /* ---- System Health (sources, db, email config) ---- */
  app.get(
    '/api/super-admin/system-health',
    requireAuth,
    requireRole('super_admin'),
    async (req, res) => {
      const live = getSourceHealthSnapshot();
      const persisted = await listSourceHealth();
      return res.json({
        database: { connected: true },
        email: {
          configured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS)
        },
        sources: persisted.length ? persisted : live,
        checkedAt: new Date().toISOString()
      });
    }
  );

  /* ---- System Settings ---- */
  app.get(
    '/api/super-admin/settings',
    requireAuth,
    requireRole('super_admin'),
    async (req, res) => {
      const settings = await getSetting('system', {
        sessionPolicy: {
          staffInactivityMinutes: 10,
          userInactivityMinutes: 60
        },
        allowRecruiterSelfRegistration: true
      });
      return res.json({ settings });
    }
  );

  // Dynamic RBAC: view the editable permission catalogue.
  app.get(
    '/api/super-admin/permissions',
    requireAuth,
    requirePermission('permissions:manage'),
    async (req, res) => {
      return res.json({ roles: await getPermissionsCatalogue() });
    }
  );

  // Dynamic RBAC: update an editable role's permissions (admin or recruiter).
  app.put(
    '/api/super-admin/permissions/:role',
    requireAuth,
    requirePermission('permissions:manage'),
    async (req, res) => {
      try {
        const role = String(req.params.role);
        const permissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];
        const saved = await setRolePermissions(role, permissions, req.user.id);

        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'ROLE_PERMISSIONS_UPDATED',
          metadata: { role, permissions: saved }
        });

        return res.json({
          message: `Permissions for ${role} updated.`,
          role,
          permissions: saved
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({
          message: error.message || 'Unable to update permissions.'
        });
      }
    }
  );
}
