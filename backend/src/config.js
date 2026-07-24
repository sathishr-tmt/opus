// Extracted from the original backend/server.js during the Step 2 modular split.
// Code is moved unchanged; only imports/exports were added.

import 'dotenv/config';

const PORT = Number(process.env.PORT || 5000);

const JWT_SECRET =
  process.env.JWT_SECRET || 'replace_this_development_secret_before_deployment';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;

const ADMIN_NOTIFICATION_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL ||
  process.env.PRIMARY_ADMIN_EMAIL ||
  '';

const NODE_ENV = process.env.NODE_ENV || 'development';

const IS_PRODUCTION = NODE_ENV === 'production';

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'opus_session';

const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'opus_csrf';

const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? String(process.env.COOKIE_SECURE).toLowerCase() === 'true'
  : IS_PRODUCTION;

const COOKIE_SAME_SITE = String(
  process.env.COOKIE_SAME_SITE || 'lax'
).toLowerCase();

const STAFF_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const USER_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const USER_REMEMBER_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

const ADMIN_INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

if (IS_PRODUCTION) {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET ===
      'replace_this_development_secret_before_deployment' ||
    process.env.JWT_SECRET.length < 32
  ) {
    throw new Error(
      'JWT_SECRET must be set to a unique value of at least 32 characters in production.'
    );
  }

  if (!COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be true in production.');
  }
}

if (!['lax', 'strict', 'none'].includes(COOKIE_SAME_SITE)) {
  throw new Error('COOKIE_SAME_SITE must be lax, strict, or none.');
}

if (COOKIE_SAME_SITE === 'none' && !COOKIE_SECURE) {
  throw new Error('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true.');
}

export {
  PORT,
  JWT_SECRET,
  FRONTEND_URL,
  BACKEND_URL,
  ADMIN_NOTIFICATION_EMAIL,
  NODE_ENV,
  IS_PRODUCTION,
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  COOKIE_SECURE,
  COOKIE_SAME_SITE,
  STAFF_SESSION_MAX_AGE_MS,
  USER_SESSION_MAX_AGE_MS,
  USER_REMEMBER_SESSION_MAX_AGE_MS,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  ADMIN_INVITATION_TTL_MS
};
