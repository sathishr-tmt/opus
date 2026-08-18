// Account and Security routes using MongoDB-backed repositories.
// Pending email changes now use the pending_email_changes table instead of
// transient fields on the user record; behavior is identical.
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { FRONTEND_URL, BACKEND_URL } from '../config.js';
import {
  findUserById, findUserByEmail, updateUser, addAuditLog, newId,
  insertPendingEmailChange, findPendingEmailChangeByTokenHash, deletePendingEmailChanges,
  getUserSettingsRow, upsertUserSettings
} from '../repos.js';
import { escapeHtml, sendEmailChangeVerificationEmail } from '../email.js';
import { validatePasswordStrength, hashSecurityToken, clearSessionCookies, requireAuth, sanitizeUser } from '../security.js';

export default function registerAccountRoutes(app) {
  app.post(
    '/api/account/change-email/request',
    requireAuth,
    async (req, res) => {
      try {
        const currentPassword = String(req.body.currentPassword || '');
        const newEmail = String(req.body.newEmail || '').trim().toLowerCase();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!currentPassword || !newEmail) {
          return res.status(400).json({
            message: 'Current password and new email address are required.'
          });
        }

        if (!emailPattern.test(newEmail)) {
          return res.status(400).json({ message: 'Please enter a valid new email address.' });
        }

        const user = await findUserById(req.user.id);

        if (!user) {
          return res.status(404).json({ message: 'Account not found.' });
        }

        const passwordMatches = await bcrypt.compare(currentPassword, user.password);

        if (!passwordMatches) {
          return res.status(401).json({ message: 'The current password is incorrect.' });
        }

        if (newEmail === String(user.email || '').toLowerCase()) {
          return res.status(400).json({
            message: 'The new email address must be different from the current email.'
          });
        }

        const emailAlreadyUsed = await findUserByEmail(newEmail);

        if (emailAlreadyUsed && emailAlreadyUsed.id !== user.id) {
          return res.status(409).json({
            message: 'Another account already uses this email address.'
          });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashSecurityToken(rawToken);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const verificationUrl =
          `${BACKEND_URL}/api/account/change-email/verify?token=${encodeURIComponent(rawToken)}`;

        await insertPendingEmailChange({
          id: newId('emailchange'),
          userId: user.id,
          newEmail,
          tokenHash,
          expiresAt
        });

        await addAuditLog({
          actorId: user.id,
          actorRole: user.role,
          action: 'EMAIL_CHANGE_REQUESTED',
          targetUserId: user.id,
          metadata: { currentEmail: user.email, requestedEmail: newEmail }
        });

        const emailNotificationSent = await sendEmailChangeVerificationEmail({
          user,
          newEmail,
          verificationUrl
        });

        return res.json({
          message: emailNotificationSent
            ? 'A verification link was sent to your new email address.'
            : 'Email delivery is not configured. Use the local verification link shown below.',
          emailNotificationSent,
          developmentVerificationUrl:
            process.env.NODE_ENV === 'production' ? undefined : verificationUrl
        });
      } catch (error) {
        console.error('Email change request failed:', error);
        return res.status(500).json({
          message: error.message || 'Unable to request an email change.'
        });
      }
    }
  );

  app.get('/api/account/change-email/verify', async (req, res) => {
    try {
      const rawToken = String(req.query.token || '');

      if (!rawToken) {
        return res.status(400).send('Missing email-verification token.');
      }

      const tokenHash = hashSecurityToken(rawToken);
      const pending = await findPendingEmailChangeByTokenHash(tokenHash);

      if (!pending) {
        return res.status(400).send('This verification link is invalid or has already been used.');
      }

      const user = await findUserById(pending.userId);

      if (!user) {
        await deletePendingEmailChanges(pending.userId);
        return res.status(400).send('This verification link is invalid or has already been used.');
      }

      const expiresAt = new Date(pending.expiresAt || 0).getTime();

      if (!expiresAt || expiresAt < Date.now()) {
        await deletePendingEmailChanges(user.id);
        return res.status(400).send('This verification link has expired. Request a new email change from OPUS Settings.');
      }

      const newEmail = String(pending.newEmail || '').trim().toLowerCase();
      const conflict = await findUserByEmail(newEmail);

      if (conflict && conflict.id !== user.id) {
        return res.status(409).send('This email address is already assigned to another OPUS account.');
      }

      const previousEmail = user.email;
      const now = new Date().toISOString();

      await updateUser(user.id, {
        email: newEmail,
        sessionVersion: Number(user.sessionVersion || 1) + 1,
        updatedAt: now
      });
      await deletePendingEmailChanges(user.id);

      const settings = await getUserSettingsRow(user.id);
      if (settings && Object.keys(settings).length) {
        await upsertUserSettings(user.id, { ...settings, email: newEmail });
      }

      await addAuditLog({
        actorId: user.id,
        actorRole: user.role,
        action: 'EMAIL_CHANGE_VERIFIED',
        targetUserId: user.id,
        metadata: { previousEmail, newEmail }
      });

      clearSessionCookies(res);

      // OPUS uses a single login page for every role.
      const loginPath = '/login';
      const loginUrl = `${FRONTEND_URL}${loginPath}?email=${encodeURIComponent(newEmail)}`;

      return res.send(`
        <!doctype html>
        <html>
          <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
            <div style="max-width:560px;margin:70px auto;padding:24px;">
              <div style="background:#fff;border:1px solid #e2e8f0;border-radius:22px;padding:32px;text-align:center;">
                <div style="font-size:13px;font-weight:800;color:#7c3aed;letter-spacing:.08em;text-transform:uppercase;">OPUS Security</div>
                <h1 style="margin:16px 0 10px;">Email verified successfully</h1>
                <p style="color:#475569;line-height:1.7;">Your login email is now ${escapeHtml(newEmail)}. For security, existing sessions were invalidated.</p>
                <a href="${escapeHtml(loginUrl)}" style="display:inline-block;margin-top:18px;padding:13px 20px;border-radius:12px;background:#7c3aed;color:#fff;text-decoration:none;font-weight:800;">Return to OPUS Login</a>
              </div>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Email verification failed:', error);
      return res.status(500).send('Unable to verify the new email address.');
    }
  });


  // Update your own basic details. Available to EVERY role — a recruiter or
  // admin should be able to correct their own name without asking someone
  // else. Role, company and status are deliberately not editable here:
  // those are set by whoever created the account.
  app.patch(
    '/api/account/profile',
    requireAuth,
    async (req, res) => {
      try {
        const name = String(req.body.name || '').trim();

        if (name.length < 2 || name.length > 80) {
          return res.status(400).json({ message: 'Enter a name between 2 and 80 characters.' });
        }

        const updated = await updateUser(req.user.id, { name });

        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'PROFILE_UPDATED',
          targetUserId: req.user.id,
          metadata: { name }
        });

        return res.json({
          message: 'Profile updated.',
          user: sanitizeUser(updated)
        });
      } catch (error) {
        console.error('Profile update failed:', error);
        return res.status(500).json({ message: 'Unable to update your profile.' });
      }
    }
  );

  app.post(
    '/api/account/change-password',
    requireAuth,
    async (req, res) => {
      try {
        const currentPassword = String(req.body.currentPassword || '');
        const newPassword = String(req.body.newPassword || '');
        const confirmPassword = String(req.body.confirmPassword || '');

        if (!currentPassword || !newPassword || !confirmPassword) {
          return res.status(400).json({
            message: 'Current password, new password, and confirmation are required.'
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

        const user = await findUserById(req.user.id);

        if (!user) {
          return res.status(404).json({ message: 'Account not found.' });
        }

        const passwordMatches = await bcrypt.compare(currentPassword, user.password);

        if (!passwordMatches) {
          return res.status(401).json({ message: 'The current password is incorrect.' });
        }

        const samePassword = await bcrypt.compare(newPassword, user.password);

        if (samePassword) {
          return res.status(400).json({
            message: 'The new password must be different from the current password.'
          });
        }

        await updateUser(user.id, {
          password: await bcrypt.hash(newPassword, 12),
          sessionVersion: Number(user.sessionVersion || 1) + 1,
          updatedAt: new Date().toISOString()
        });

        await addAuditLog({
          actorId: user.id,
          actorRole: user.role,
          action: 'PASSWORD_CHANGED',
          targetUserId: user.id
        });

        clearSessionCookies(res);

        return res.json({
          message: 'Password changed successfully. Please sign in again.',
          loginPath: '/login'
        });
      } catch (error) {
        console.error('Password change failed:', error);
        return res.status(500).json({ message: error.message || 'Unable to change password.' });
      }
    }
  );
}
