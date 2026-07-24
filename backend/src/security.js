// Extracted from the original backend/server.js during the Step 2 modular split.
// Code is moved unchanged; only imports/exports were added.

import path from 'path';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_SECRET, SESSION_COOKIE_NAME, CSRF_COOKIE_NAME, COOKIE_SECURE, COOKIE_SAME_SITE, STAFF_SESSION_MAX_AGE_MS, USER_SESSION_MAX_AGE_MS, USER_REMEMBER_SESSION_MAX_AGE_MS } from './config.js';
import { findUserById } from './repos.js';
import { getEffectivePermissions } from './permissions.js';
import { getHeader } from './gmailUtil.js';

function sanitizeUser(user = {}) {
  const {
    password,
    passwordResetToken,
    passwordResetTokenHash,
    passwordResetExpiresAt,
    emailVerificationToken,
    emailVerificationTokenHash,
    emailVerificationExpiresAt,
    pendingEmailToken,
    pendingEmailTokenExpiresAt,
    pendingEmail,
    pendingEmailTokenHash,
    pendingEmailExpiresAt,
    ...safeUser
  } = user;

  return safeUser;
}

function getAccountStatusMessage(user = {}) {
  if (user.emailVerified === false) {
    return 'Verify your email address before your account can be reviewed or used.';
  }

  if (user.status === 'pending_admin_approval') {
    return 'Your account is awaiting Admin approval. We will email you when your account is ready.';
  }

  if (user.status === 'pending_super_admin_approval') {
    return 'Your Admin account is awaiting Super Admin approval.';
  }

  if (user.status === 'invited') {
    return 'Please complete your registration using the invitation sent to your email.';
  }

  if (user.status === 'declined') {
    return 'Your registration request was not approved. Please contact OPUS support for assistance.';
  }

  if (user.status === 'suspended') {
    return 'Your account has been suspended. Please contact OPUS support.';
  }

  if (user.status === 'disabled' || user.status === 'inactive') {
    return 'Your account is not active. Please contact OPUS support.';
  }

  return 'Your account is not currently permitted to sign in.';
}

function validatePasswordStrength(password = '') {
  if (password.length < 8) {
    return 'Password must contain at least 8 characters.';
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }

  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }

  return '';
}

function hashSecurityToken(token = '') {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(req) {
  const cookieHeader = String(req.headers.cookie || '');

  return cookieHeader.split(';').reduce((cookies, part) => {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex === -1) return cookies;

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (name) {
      cookies[name] = decodeURIComponent(value);
    }

    return cookies;
  }, {});
}

function serializeCookie(
  name,
  value,
  {
    httpOnly = false,
    maxAgeMs = null,
    expires = null,
    sameSite = COOKIE_SAME_SITE,
    secure = COOKIE_SECURE,
    path = '/'
  } = {}
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];

  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (sameSite) parts.push(`SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1)}`);
  if (Number.isFinite(maxAgeMs)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`);
  }
  if (expires instanceof Date) parts.push(`Expires=${expires.toUTCString()}`);

  return parts.join('; ');
}

function appendCookie(res, cookieValue) {
  const current = res.getHeader('Set-Cookie');

  if (!current) {
    res.setHeader('Set-Cookie', [cookieValue]);
    return;
  }

  const values = Array.isArray(current) ? current : [current];
  res.setHeader('Set-Cookie', [...values, cookieValue]);
}

function getSessionDurationMs(user, rememberMe = false) {
  if (['super_admin', 'admin', 'recruiter'].includes(user.role)) {
    return STAFF_SESSION_MAX_AGE_MS;
  }

  return rememberMe
    ? USER_REMEMBER_SESSION_MAX_AGE_MS
    : USER_SESSION_MAX_AGE_MS;
}

function createToken(user, rememberMe = false) {
  const maxAgeMs = getSessionDurationMs(user, rememberMe);

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: Number(user.sessionVersion || 1)
    },
    JWT_SECRET,
    { expiresIn: Math.floor(maxAgeMs / 1000) }
  );
}

function issueSessionCookies(res, user, rememberMe = false) {
  const maxAgeMs = getSessionDurationMs(user, rememberMe);
  const token = createToken(user, rememberMe);
  const csrfToken = crypto.randomBytes(32).toString('hex');

  appendCookie(
    res,
    serializeCookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      maxAgeMs
    })
  );
  appendCookie(
    res,
    serializeCookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      maxAgeMs
    })
  );

  return { maxAgeMs };
}

function clearSessionCookies(res) {
  const expired = new Date(0);

  appendCookie(
    res,
    serializeCookie(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      maxAgeMs: 0,
      expires: expired
    })
  );
  appendCookie(
    res,
    serializeCookie(CSRF_COOKIE_NAME, '', {
      httpOnly: false,
      maxAgeMs: 0,
      expires: expired
    })
  );
}

function safeTokenEqual(left = '', right = '') {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/register',
  '/api/auth/recruiter-register',
  '/api/staff/register',
  '/api/auth/login',
  '/api/staff/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/resend-verification',
  '/api/auth/accept-admin-invitation'
]);

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  const cookies = parseCookies(req);

  // Public requests and legacy Bearer sessions are handled by route auth.
  if (!cookies[SESSION_COOKIE_NAME]) {
    return next();
  }

  const headerToken = String(req.headers['x-csrf-token'] || '');
  const cookieToken = String(cookies[CSRF_COOKIE_NAME] || '');

  if (!safeTokenEqual(headerToken, cookieToken)) {
    return res.status(403).json({
      message: 'Security validation failed. Refresh the page and try again.'
    });
  }

  return next();
}

function createRateLimiter({ windowMs, max, message, keyPrefix, skipSuccessfulRequests = false, perIpOnly = false }) {
  const attempts = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const key = perIpOnly
      ? `${keyPrefix}:${req.ip || 'unknown'}`
      : `${keyPrefix}:${req.ip || 'unknown'}:${email}`;
    const current = attempts.get(key);

    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ message, retryAfter });
    }

    current.count += 1;
    attempts.set(key, current);

    if (skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode < 400) {
          attempts.delete(key);
        }
      });
    }

    return next();
  };
}

const loginRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'login',
  message: 'Too many sign-in attempts. Please wait before trying again.',
  skipSuccessfulRequests: true
});

const registrationRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyPrefix: 'registration',
  message: 'Too many registration attempts. Please try again later.'
});

// Daily cap on NEW accounts from one network/IP, so a single person cannot
// create an endless number of accounts in one day. Keyed by IP only (not email)
// because each new account uses a different email address.
const DAILY_SIGNUP_MAX = Number(process.env.DAILY_SIGNUP_MAX || 5);
const dailySignupLimit = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000,
  max: DAILY_SIGNUP_MAX,
  keyPrefix: 'daily-signup',
  perIpOnly: true,
  message: 'Daily sign-up limit reached for this network. Please try again tomorrow.'
});

const recoveryRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyPrefix: 'recovery',
  message: 'Too many recovery requests. Please try again later.'
});

const ROLE_PERMISSIONS = {
  user: new Set([
    'staff:portal:none',
    'user:self',
    'job:search',
    'application:external:manage',
    'application:internal:create'
  ]),
  recruiter: new Set([
    'staff:portal',
    'profile:self',
    'posting:own:manage',
    'application:assigned:view',
    'application:assigned:update',
    'interview:assigned:manage'
  ]),
  admin: new Set([
    'staff:portal',
    'profile:self',
    'account:user:manage',
    'account:recruiter:manage',
    'posting:all:manage',
    'posting:delete',
    'application:all:view',
    'application:assign',
    'interview:all:manage',
    'job-source:manage',
    'report:view'
  ]),
  super_admin: new Set([
    'staff:portal',
    'profile:self',
    'account:user:manage',
    'account:recruiter:manage',
    'account:admin:manage',
    'posting:all:manage',
    'posting:delete',
    'application:all:view',
    'application:assign',
    'interview:all:manage',
    'job-source:manage',
    'report:view',
    'audit:view',
    'system:manage'
  ])
};

function hasPermission(user, permission) {
  if (!user) return false;
  if (Array.isArray(user.permissions)) {
    return user.permissions.includes(permission);
  }
  return Boolean(ROLE_PERMISSIONS[user.role]?.has(permission));
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        message: 'Access denied. You do not have the required permission.'
      });
    }

    return next();
  };
}

async function requireAuth(req, res, next) {
  try {
    const cookies = parseCookies(req);
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const token = cookies[SESSION_COOKIE_NAME] || bearerToken;

    if (!token) {
      clearSessionCookies(res);
      return res.status(401).json({
        message: 'Authentication required. Please sign in first.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(decoded.id);

    if (!user) {
      clearSessionCookies(res);
      return res.status(401).json({
        message: 'Invalid session. User not found.'
      });
    }

    if (user.status !== 'active') {
      clearSessionCookies(res);
      return res.status(403).json({
        message: getAccountStatusMessage(user),
        status: user.status
      });
    }

    if (user.emailVerified === false) {
      clearSessionCookies(res);
      return res.status(403).json({
        message: 'Verify your email address before signing in.'
      });
    }

    const tokenSessionVersion = Number(decoded.sessionVersion || 1);
    const userSessionVersion = Number(user.sessionVersion || 1);

    if (tokenSessionVersion !== userSessionVersion) {
      clearSessionCookies(res);
      return res.status(401).json({
        message: 'Your session is no longer valid. Please sign in again.'
      });
    }

    req.user = sanitizeUser(user);
    req.user.permissions = await getEffectivePermissions(user.role);
    req.authToken = token;
    return next();
  } catch {
    clearSessionCookies(res);
    return res.status(401).json({
      message: 'Invalid or expired session. Please sign in again.'
    });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Access denied. You do not have permission.'
      });
    }

    return next();
  };
}

function canManageAccount(actorRole, targetRole) {
  if (targetRole === 'super_admin') {
    return false;
  }

  if (targetRole === 'admin') {
    return actorRole === 'super_admin';
  }

  if (targetRole === 'recruiter' || targetRole === 'user') {
    return actorRole === 'super_admin' || actorRole === 'admin';
  }

  return false;
}

export {
  sanitizeUser,
  getAccountStatusMessage,
  validatePasswordStrength,
  hashSecurityToken,
  parseCookies,
  serializeCookie,
  appendCookie,
  getSessionDurationMs,
  createToken,
  issueSessionCookies,
  clearSessionCookies,
  safeTokenEqual,
  CSRF_EXEMPT_PATHS,
  csrfProtection,
  createRateLimiter,
  loginRateLimit,
  registrationRateLimit,
  dailySignupLimit,
  recoveryRateLimit,
  ROLE_PERMISSIONS,
  hasPermission,
  requirePermission,
  requireAuth,
  requireRole,
  canManageAccount
};
