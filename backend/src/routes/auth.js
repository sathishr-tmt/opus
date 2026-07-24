// Authentication routes using MongoDB-backed repositories.
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { FRONTEND_URL, BACKEND_URL, IS_PRODUCTION, EMAIL_VERIFICATION_TTL_MS, PASSWORD_RESET_TTL_MS } from '../config.js';
import {
  findUserByEmail, findUserById, findUserByColumn, insertUser, updateUser,
  addAuditLog, ensureApprovalRequest, findPendingInvitationByTokenHash, updateInvitation
} from '../repos.js';
import { sendApprovalQueueNotification, sendRegistrationVerificationEmail, sendPasswordResetEmail } from '../email.js';
import { validatePasswordStrength, hashSecurityToken, clearSessionCookies, loginRateLimit, registrationRateLimit, dailySignupLimit, recoveryRateLimit, requirePermission, requireAuth } from '../security.js';
import { getRoleHomePath, processLogin, registerAccount } from '../authFlows.js';

export default function registerAuthRoutes(app) {
  app.post('/api/auth/register', dailySignupLimit, registrationRateLimit, async (req, res) => {
    return registerAccount(req, res, 'user');
  });

  app.post(
    ['/api/auth/recruiter-register', '/api/staff/register'],
    dailySignupLimit,
    registrationRateLimit,
    async (req, res) => registerAccount(req, res, 'recruiter')
  );

  app.get('/api/auth/verify-email', async (req, res) => {
    try {
      const rawToken = String(req.query.token || '');
      const tokenHash = hashSecurityToken(rawToken);
      const user = rawToken
        ? await findUserByColumn('email_verification_token_hash', tokenHash)
        : null;

      if (!user) {
        return res.redirect(302, `${FRONTEND_URL}/verify-email?status=invalid`);
      }

      const expiresAt = new Date(user.emailVerificationExpiresAt || 0).getTime();

      if (!expiresAt || expiresAt < Date.now()) {
        return res.redirect(
          302,
          `${FRONTEND_URL}/verify-email?status=expired&email=${encodeURIComponent(user.email)}`
        );
      }

      const updated = await updateUser(user.id, {
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        updatedAt: new Date().toISOString()
      });
      await ensureApprovalRequest(updated);

      await addAuditLog({
        actorId: user.id,
        actorRole: user.role,
        action: 'EMAIL_VERIFIED',
        targetUserId: user.id,
        metadata: { email: user.email }
      });

      await sendApprovalQueueNotification(updated);

      const entry = user.role === 'user' ? 'user' : 'staff';
      return res.redirect(302, `${FRONTEND_URL}/verify-email?status=verified&entry=${entry}`);
    } catch (error) {
      console.error('Email verification failed:', error);
      return res.redirect(302, `${FRONTEND_URL}/verify-email?status=error`);
    }
  });

  app.post(
    '/api/auth/resend-verification',
    recoveryRateLimit,
    async (req, res) => {
      const genericMessage =
        'If that account exists and still requires verification, a new link has been sent.';

      try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const user = await findUserByEmail(email);

        if (!user || user.emailVerified) {
          return res.json({ message: genericMessage });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const now = new Date();
        const updated = await updateUser(user.id, {
          emailVerificationTokenHash: hashSecurityToken(rawToken),
          emailVerificationExpiresAt: new Date(
            now.getTime() + EMAIL_VERIFICATION_TTL_MS
          ).toISOString(),
          updatedAt: now.toISOString()
        });

        await addAuditLog({
          actorId: user.id,
          actorRole: user.role,
          action: 'EMAIL_VERIFICATION_RESENT',
          targetUserId: user.id
        });

        const verificationUrl = `${BACKEND_URL}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
        await sendRegistrationVerificationEmail(updated, verificationUrl);

        return res.json({
          message: genericMessage,
          ...(!IS_PRODUCTION ? { verificationUrl } : {})
        });
      } catch (error) {
        console.error('Resend verification failed:', error);
        return res.json({ message: genericMessage });
      }
    }
  );

  app.post('/api/auth/forgot-password', recoveryRateLimit, async (req, res) => {
    const genericMessage = 'If that email exists, we sent a password-reset link.';

    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const user = await findUserByEmail(email);

      if (!user) {
        return res.json({ message: genericMessage });
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      const now = new Date();
      const updated = await updateUser(user.id, {
        passwordResetTokenHash: hashSecurityToken(rawToken),
        passwordResetExpiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS).toISOString(),
        updatedAt: now.toISOString()
      });

      await addAuditLog({
        actorId: user.id,
        actorRole: user.role,
        action: 'PASSWORD_RESET_REQUESTED',
        targetUserId: user.id,
        metadata: { selfService: true }
      });

      const resetUrl = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
      await sendPasswordResetEmail(updated, resetUrl);

      return res.json({
        message: genericMessage,
        ...(!IS_PRODUCTION ? { resetUrl } : {})
      });
    } catch (error) {
      console.error('Forgot password failed:', error);
      return res.json({ message: genericMessage });
    }
  });

  app.post('/api/auth/reset-password', recoveryRateLimit, async (req, res) => {
    try {
      const rawToken = String(req.body.token || '');
      const newPassword = String(req.body.newPassword || '');
      const confirmPassword = String(req.body.confirmPassword || '');

      if (!rawToken || !newPassword || !confirmPassword) {
        return res.status(400).json({
          message: 'Reset token, new password, and confirmation are required.'
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          message: 'New password and confirmation do not match.'
        });
      }

      const passwordError = validatePasswordStrength(newPassword);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }

      const tokenHash = hashSecurityToken(rawToken);
      const user = await findUserByColumn('password_reset_token_hash', tokenHash);

      if (!user) {
        return res.status(400).json({
          message: 'This password-reset link is invalid or has already been used.'
        });
      }

      const expiresAt = new Date(user.passwordResetExpiresAt || 0).getTime();

      if (!expiresAt || expiresAt < Date.now()) {
        return res.status(400).json({ message: 'This password-reset link has expired.' });
      }

      await updateUser(user.id, {
        password: await bcrypt.hash(newPassword, 12),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        sessionVersion: Number(user.sessionVersion || 1) + 1,
        updatedAt: new Date().toISOString()
      });

      await addAuditLog({
        actorId: user.id,
        actorRole: user.role,
        action: 'PASSWORD_RESET_COMPLETED',
        targetUserId: user.id
      });

      clearSessionCookies(res);

      return res.json({
        message: 'Password updated successfully. Sign in using your new password.',
        loginPath: '/login'
      });
    } catch (error) {
      console.error('Reset password failed:', error);
      return res.status(500).json({ message: 'Unable to reset the password right now.' });
    }
  });

  // SINGLE login endpoint for every role (User, Recruiter, Admin, Super Admin).
  // The response includes `redirectPath`, which the frontend uses to open the
  // portal that matches the account's role.
  app.post('/api/auth/login', loginRateLimit, async (req, res) => {
    return processLogin(req, res, { allowAllRoles: true });
  });

  // Backward-compatible alias for older clients; behaves identically.
  app.post('/api/staff/auth/login', loginRateLimit, async (req, res) => {
    return processLogin(req, res, { allowAllRoles: true });
  });

  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
      const user = await findUserById(req.user.id);

      if (user) {
        await updateUser(user.id, {
          sessionVersion: Number(user.sessionVersion || 1) + 1,
          updatedAt: new Date().toISOString()
        });

        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'ACCOUNT_LOGOUT',
          targetUserId: req.user.id
        });
      }

      clearSessionCookies(res);
      return res.json({ message: 'Signed out successfully.' });
    } catch (error) {
      clearSessionCookies(res);
      return res.status(500).json({
        message: 'The browser session was cleared, but server logout could not be recorded.'
      });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    return res.json({
      user: req.user,
      redirectPath: getRoleHomePath(req.user.role)
    });
  });

  app.get(
    '/api/staff/auth/me',
    requireAuth,
    requirePermission('staff:portal'),
    async (req, res) => {
      return res.json({
        user: req.user,
        redirectPath: getRoleHomePath(req.user.role)
      });
    }
  );

  app.post(
    '/api/auth/accept-admin-invitation',
    registrationRateLimit,
    async (req, res) => {
      try {
        const rawToken = String(req.body.token || '');
        const name = String(req.body.name || '').trim();
        const password = String(req.body.password || '');
        const confirmPassword = String(req.body.confirmPassword || '');
        const passwordError = validatePasswordStrength(password);

        if (!rawToken || !name || !password || !confirmPassword) {
          return res.status(400).json({
            message: 'Invitation token, name, password, and confirmation are required.'
          });
        }

        if (password !== confirmPassword) {
          return res.status(400).json({ message: 'Password and confirmation do not match.' });
        }

        if (passwordError) {
          return res.status(400).json({ message: passwordError });
        }

        const tokenHash = hashSecurityToken(rawToken);
        const invitation = await findPendingInvitationByTokenHash(tokenHash);

        if (!invitation) {
          return res.status(400).json({
            message: 'This Admin invitation is invalid or has already been used.'
          });
        }

        const expiresAt = new Date(invitation.expiresAt || 0).getTime();

        if (!expiresAt || expiresAt < Date.now()) {
          return res.status(400).json({ message: 'This Admin invitation has expired.' });
        }

        const accountExists = await findUserByEmail(invitation.email);

        if (accountExists) {
          return res.status(400).json({ message: 'Unable to complete this invitation.' });
        }

        const now = new Date().toISOString();
        const user = {
          id: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          email: String(invitation.email).toLowerCase(),
          password: await bcrypt.hash(password, 12),
          role: 'admin',
          status: 'pending_super_admin_approval',
          emailVerified: true,
          sessionVersion: 1,
          createdAt: now,
          updatedAt: now
        };

        const created = await insertUser(user);
        await ensureApprovalRequest(created);
        await updateInvitation(invitation.id, {
          status: 'accepted',
          acceptedAt: now,
          tokenHash: null,
          userId: created.id
        });

        await addAuditLog({
          actorId: user.id,
          actorRole: user.role,
          action: 'ADMIN_REGISTRATION_SUBMITTED',
          targetUserId: user.id,
          metadata: { invitedBy: invitation.invitedBy }
        });

        return res.status(201).json({
          message:
            'Admin registration completed. Your account is waiting for Super Admin approval.'
        });
      } catch (error) {
        console.error('Admin invitation acceptance failed:', error);
        return res.status(500).json({ message: 'Unable to complete the Admin registration.' });
      }
    }
  );
}
