// Authentication flows using the MongoDB-backed repository layer.
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { BACKEND_URL, IS_PRODUCTION, EMAIL_VERIFICATION_TTL_MS } from './config.js';
import {
  findUserByEmail, insertUser, addAuditLog, ensureApprovalRequest, newId
} from './repos.js';
import {
  sanitizeUser, getAccountStatusMessage, validatePasswordStrength,
  hashSecurityToken, issueSessionCookies
} from './security.js';
import { sendRegistrationVerificationEmail } from './email.js';

function getRoleHomePath(role) {
  if (role === 'recruiter') return '/recruiter/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'super_admin') return '/super-admin/dashboard';
  return '/dashboard';
}

async function recordFailedLogin({ email, user = null, reason, req }) {
  await addAuditLog({
    actorId: user?.id || 'anonymous',
    actorRole: user?.role || 'anonymous',
    action: 'ACCOUNT_LOGIN_FAILED',
    targetUserId: user?.id || null,
    metadata: {
      email,
      reason,
      ip: req.ip || null,
      userAgent: req.headers['user-agent'] || null
    }
  });
}

// OPUS uses a SINGLE login page for every role. `allowAllRoles` (the default for
// /api/auth/login) accepts User, Recruiter, Admin, and Super Admin credentials on
// the same endpoint and returns the role-specific redirect path. The legacy
// `staffOnly` mode is retained only for backward compatibility.
async function processLogin(req, res, { staffOnly = false, allowAllRoles = false } = {}) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const requestedRememberMe = Boolean(req.body.rememberMe);

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.'
      });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      await recordFailedLogin({ email, reason: 'INVALID_CREDENTIALS', req });
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password || '');

    if (!passwordMatches) {
      await recordFailedLogin({ email, user, reason: 'INVALID_CREDENTIALS', req });
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const staffRoles = ['super_admin', 'admin', 'recruiter'];
    const isStaff = staffRoles.includes(user.role);

    // "Remember me" is a job-seeker convenience only; staff sessions stay short.
    const rememberMe = requestedRememberMe && !isStaff;

    if (!allowAllRoles) {
      if (staffOnly && !isStaff) {
        await recordFailedLogin({ email, user, reason: 'WRONG_ENTRY_POINT', req });
        return res.status(403).json({
          message: 'This account must use the User Login page.'
        });
      }

      if (!staffOnly && user.role !== 'user') {
        await recordFailedLogin({ email, user, reason: 'WRONG_ENTRY_POINT', req });
        return res.status(403).json({
          message: 'Staff accounts must use the Staff Login page.'
        });
      }
    }

    if (user.emailVerified === false) {
      await recordFailedLogin({ email, user, reason: 'EMAIL_NOT_VERIFIED', req });
      return res.status(403).json({
        message: 'Verify your email address before signing in.',
        status: user.status,
        emailVerified: false
      });
    }

    if (user.status !== 'active') {
      await recordFailedLogin({
        email, user,
        reason: `STATUS_${String(user.status || 'UNKNOWN').toUpperCase()}`,
        req
      });
      return res.status(403).json({
        message: getAccountStatusMessage(user),
        status: user.status
      });
    }

    const session = issueSessionCookies(res, user, rememberMe);

    await addAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: 'ACCOUNT_LOGIN',
      targetUserId: user.id,
      metadata: {
        entryPoint: allowAllRoles ? 'unified' : staffOnly ? 'staff' : 'user',
        rememberMe,
        ip: req.ip || null
      }
    });

    return res.json({
      message: 'Login successful.',
      portal: isStaff ? 'staff' : 'user',
      redirectPath: getRoleHomePath(user.role),
      sessionExpiresInMs: session.maxAgeMs,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({
      message: 'Unable to sign in right now. Please try again.'
    });
  }
}

async function registerAccount(req, res, role) {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({
        message: 'Name, email, password, and confirm password are required.'
      });
    }

    if (!emailPattern.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({
        message: 'Name must contain between 2 and 100 characters.'
      });
    }

    const passwordError = validatePasswordStrength(password);

    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        message: 'Password and confirm password do not match.'
      });
    }

    let careerGoal = '';
    let experienceYears = null;
    let company = '';
    let department = '';

    if (role === 'user') {
      careerGoal = String(req.body.careerGoal || '').trim();
      const experienceInput = req.body.experienceYears;
      experienceYears = Number(experienceInput);

      if (!careerGoal || experienceInput === '' || experienceInput === undefined || experienceInput === null) {
        return res.status(400).json({
          message: 'Career goal and years of experience are required.'
        });
      }

      if (careerGoal.length < 2 || careerGoal.length > 100) {
        return res.status(400).json({
          message: 'Career goal must contain between 2 and 100 characters.'
        });
      }

      if (
        Number.isNaN(experienceYears) ||
        !Number.isInteger(experienceYears) ||
        experienceYears < 0 ||
        experienceYears > 50
      ) {
        return res.status(400).json({
          message: 'Experience must be a whole number between 0 and 50.'
        });
      }
    } else {
      company = String(req.body.company || '').trim();
      department = String(req.body.department || '').trim();

      if (!company) {
        return res.status(400).json({
          message: 'Company is required for recruiter registration.'
        });
      }
    }

    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      return res.status(400).json({
        message: 'Unable to create an account with these details.'
      });
    }

    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const createdAt = now.toISOString();
    const user = {
      id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      email,
      ...(role === 'user'
        ? { careerGoal, experienceYears }
        : { company, department }),
      password: await bcrypt.hash(password, 12),
      role,
      status: 'pending_super_admin_approval',
      emailVerified: false,
      emailVerificationTokenHash: hashSecurityToken(rawVerificationToken),
      emailVerificationExpiresAt: new Date(
        now.getTime() + EMAIL_VERIFICATION_TTL_MS
      ).toISOString(),
      sessionVersion: 1,
      createdAt,
      updatedAt: createdAt
    };

    await insertUser(user);

    await addAuditLog({
      action: role === 'user'
        ? 'USER_REGISTRATION_SUBMITTED'
        : 'RECRUITER_REGISTRATION_SUBMITTED',
      targetUserId: user.id,
      metadata: { email: user.email, role, ip: req.ip || null }
    });

    const verificationUrl = `${BACKEND_URL}/api/auth/verify-email?token=${encodeURIComponent(
      rawVerificationToken
    )}`;
    const emailNotificationSent = await sendRegistrationVerificationEmail(
      user,
      verificationUrl
    );

    return res.status(201).json({
      message:
        'Registration received. Verify your email address, then the Super Admin will review your account. Approvals usually take 24 to 48 hours.',
      registrationComplete: true,
      emailVerificationRequired: true,
      approvalRequired: true,
      emailNotificationSent,
      ...(!IS_PRODUCTION ? { verificationUrl } : {})
    });
  } catch (error) {
    console.error(`${role} registration failed:`, error);
    return res.status(500).json({
      message: 'Registration could not be completed. Please try again.'
    });
  }
}

export { getRoleHomePath, recordFailedLogin, processLogin, registerAccount, ensureApprovalRequest };
