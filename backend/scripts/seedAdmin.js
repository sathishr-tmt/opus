// Secure Super Admin seed for MongoDB.
// Reads PRIMARY_ADMIN_NAME / PRIMARY_ADMIN_EMAIL / PRIMARY_ADMIN_PASSWORD
// from backend/.env, then creates or updates exactly one active, verified
// super_admin account and invalidates its older sessions.
// Usage from project root: npm run seed:super-admin --prefix backend

import 'dotenv/config';
import bcrypt from 'bcryptjs';

import {
  connectMongo,
  disconnectMongo
} from '../src/mongo.js';

import {
  addAuditLog,
  findUserByEmail,
  insertUser,
  updateUser
} from '../src/repos.js';

function normalizeEmail(value = '') {
  return String(value)
    .trim()
    .toLowerCase();
}

function validateEnvironment() {
  const name = String(
    process.env.PRIMARY_ADMIN_NAME || ''
  ).trim();

  const email = normalizeEmail(
    process.env.PRIMARY_ADMIN_EMAIL
  );

  const password = String(
    process.env.PRIMARY_ADMIN_PASSWORD || ''
  );

  if (!name) {
    throw new Error(
      'PRIMARY_ADMIN_NAME is missing in backend/.env.'
    );
  }

  if (
    !email ||
    !email.includes('@') ||
    email.startsWith('change_me')
  ) {
    throw new Error(
      'PRIMARY_ADMIN_EMAIL is missing or invalid in backend/.env.'
    );
  }

  if (
    !password ||
    password.startsWith('CHANGE_ME')
  ) {
    throw new Error(
      'PRIMARY_ADMIN_PASSWORD is missing in backend/.env.'
    );
  }

  if (password.length < 8) {
    throw new Error(
      'PRIMARY_ADMIN_PASSWORD must contain at least 8 characters.'
    );
  }

  if (!/[A-Z]/.test(password)) {
    throw new Error(
      'PRIMARY_ADMIN_PASSWORD must contain at least one uppercase letter.'
    );
  }

  if (!/[a-z]/.test(password)) {
    throw new Error(
      'PRIMARY_ADMIN_PASSWORD must contain at least one lowercase letter.'
    );
  }

  if (!/[0-9]/.test(password)) {
    throw new Error(
      'PRIMARY_ADMIN_PASSWORD must contain at least one number.'
    );
  }

  return {
    name,
    email,
    password
  };
}

async function main() {
  const {
    name,
    email,
    password
  } = validateEnvironment();

  await connectMongo();

  const passwordHash = await bcrypt.hash(
    password,
    12
  );

  const now = new Date().toISOString();

  const existing = await findUserByEmail(
    email
  );

  let user;

  if (existing) {
    if (existing.role !== 'super_admin') {
      throw new Error(
        `The account ${email} exists with role "${existing.role}". ` +
        'Refusing to escalate an existing non-super-admin account.'
      );
    }

    user = await updateUser(existing.id, {
      name,
      password: passwordHash,
      status: 'active',
      emailVerified: true,
      sessionVersion:
        Number(existing.sessionVersion || 1) + 1,
      updatedAt: now
    });

    console.log(
      'Existing Super Admin updated.'
    );
  } else {
    user = await insertUser({
      id:
        `admin-${Date.now()}-` +
        Math.random()
          .toString(36)
          .slice(2, 8),
      name,
      email,
      password: passwordHash,
      role: 'super_admin',
      status: 'active',
      emailVerified: true,
      sessionVersion: 1,
      createdAt: now,
      updatedAt: now
    });

    console.log(
      'Super Admin created.'
    );
  }

  await addAuditLog({
    action: 'SUPER_ADMIN_SEEDED',
    targetUserId: user.id,
    metadata: {
      email
    }
  });

  console.log(`Email:  ${user.email}`);
  console.log('Status: active');
  console.log(
    'Use the password stored privately in PRIMARY_ADMIN_PASSWORD.'
  );
}

try {
  await main();
} finally {
  await disconnectMongo().catch(() => {});
}