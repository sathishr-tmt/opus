// Dynamic role permissions (Step 5a).
// - user and super_admin permissions are FIXED in code and never editable.
// - admin and recruiter permissions are editable by a Super Admin, but only
//   within a fixed allow-list superset, and mandatory permissions can never
//   be removed. Effective permissions are cached and invalidated on change.
import { RolePermission } from './models.js';

// Fixed permission sets (source of truth for non-editable roles + fallbacks).
export const FIXED_PERMISSIONS = {
  user: [
    'user:self',
    'job:search',
    'application:external:manage',
    'application:internal:create'
  ],
  super_admin: [
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
    'system:manage',
    'permissions:manage'
  ]
};

// Default permissions for the editable roles.
export const DEFAULT_EDITABLE_PERMISSIONS = {
  recruiter: [
    'staff:portal',
    'profile:self',
    'posting:own:manage',
    'application:assigned:view',
    'application:assigned:update',
    'interview:assigned:manage'
  ],
  admin: [
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
  ]
};

// Full allow-list for editable roles.
export const ALLOWED_PERMISSIONS = {
  recruiter: [
    'staff:portal',
    'profile:self',
    'posting:own:manage',
    'application:assigned:view',
    'application:assigned:update',
    'interview:assigned:manage'
  ],
  admin: [
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
  ]
};

// Permissions that can never be removed.
export const MANDATORY_PERMISSIONS = {
  recruiter: [
    'staff:portal',
    'profile:self'
  ],
  admin: [
    'staff:portal',
    'profile:self'
  ]
};

export const EDITABLE_ROLES = [
  'admin',
  'recruiter'
];

let cache = null;

export function invalidatePermissionsCache() {
  cache = null;
}

async function loadEditablePermissions() {
  if (cache) {
    return cache;
  }

  const next = {
    ...DEFAULT_EDITABLE_PERMISSIONS
  };

  try {
    const rows = await RolePermission.find({
      role: {
        $in: EDITABLE_ROLES
      }
    })
      .select({
        role: 1,
        permissions: 1
      })
      .lean();

    for (const row of rows) {
      if (
        EDITABLE_ROLES.includes(row.role) &&
        Array.isArray(row.permissions)
      ) {
        // Enforce the allow-list and mandatory permissions when reading.
        const allowed = new Set(
          ALLOWED_PERMISSIONS[row.role]
        );

        const filtered = row.permissions.filter(
          (permission) =>
            allowed.has(permission)
        );

        const withMandatory = new Set([
          ...filtered,
          ...MANDATORY_PERMISSIONS[row.role]
        ]);

        next[row.role] = [
          ...withMandatory
        ];
      }
    }
  } catch {
    // Use safe defaults if MongoDB is temporarily unavailable.
  }

  cache = next;
  return cache;
}

export async function getEffectivePermissions(
  role
) {
  if (FIXED_PERMISSIONS[role]) {
    return [
      ...FIXED_PERMISSIONS[role]
    ];
  }

  const editable =
    await loadEditablePermissions();

  return editable[role]
    ? [...editable[role]]
    : [];
}

// Validate and store a Super Admin permission change.
export async function setRolePermissions(
  role,
  requestedPermissions,
  updatedBy
) {
  if (!EDITABLE_ROLES.includes(role)) {
    const error = new Error(
      "This role's permissions cannot be changed."
    );

    error.statusCode = 400;
    throw error;
  }

  const allowed = new Set(
    ALLOWED_PERMISSIONS[role]
  );

  const requested = Array.isArray(
    requestedPermissions
  )
    ? requestedPermissions
    : [];

  const invalid = requested.filter(
    (permission) =>
      !allowed.has(permission)
  );

  if (invalid.length) {
    const error = new Error(
      `These permissions are not allowed for ${role}: ${invalid.join(', ')}`
    );

    error.statusCode = 400;
    throw error;
  }

  const final = new Set([
    ...requested.filter(
      (permission) =>
        allowed.has(permission)
    ),
    ...MANDATORY_PERMISSIONS[role]
  ]);

  const permissions = [...final];

  await RolePermission.updateOne(
    {
      role
    },
    {
      $set: {
        permissions,
        updatedBy,
        updatedAt: new Date()
      },
      $setOnInsert: {
        _id: role,
        role
      }
    },
    {
      upsert: true,
      runValidators: true
    }
  );

  invalidatePermissionsCache();
  return permissions;
}

// Catalogue used by the Super Admin permissions page.
export async function getPermissionsCatalogue() {
  const editable =
    await loadEditablePermissions();

  return EDITABLE_ROLES.map((role) => ({
    role,
    current: editable[role],
    allowed: ALLOWED_PERMISSIONS[role],
    mandatory:
      MANDATORY_PERMISSIONS[role]
  }));
}