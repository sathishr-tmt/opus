// MongoDB repository layer.
// Documents are mapped to the same camelCase objects the route handlers have
// always used (including `password` = bcrypt hash), so handler logic and API
// responses remain unchanged.
import crypto from 'crypto';
import {
  AdminInvitation,
  Application,
  ApprovalRequest,
  AuditLog,
  CalendarEvent,
  GmailAccount,
  Interview,
  JobSourceHealth,
  JobStatus,
  PendingEmailChange,
  PlatformJob,
  PlatformSetting,
  SavedJob,
  StoredDocument,
  User,
  UserSettings
} from './models.js';

export const newId = (prefix) =>
  `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex').slice(0, 6)}`;

const toIso = (value) => (value ? new Date(value).toISOString() : null);
const toId = (document) =>
  document?._id == null ? null : String(document._id);

const asObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

const compoundId = (userId, jobId) =>
  `${String(userId)}:${String(jobId)}`;

/* ---------- users ---------- */

const USER_FIELDS = new Map([
  ['name', 'name'],
  ['email', 'email'],
  ['password', 'passwordHash'],
  ['role', 'role'],
  ['status', 'status'],
  ['emailVerified', 'emailVerified'],
  ['careerGoal', 'careerGoal'],
  ['experienceYears', 'experienceYears'],
  ['company', 'company'],
  ['department', 'department'],
  ['assignedRecruiterId', 'assignedRecruiterId'],
  ['sessionVersion', 'sessionVersion'],
  ['emailVerificationTokenHash', 'emailVerificationTokenHash'],
  ['emailVerificationExpiresAt', 'emailVerificationExpiresAt'],
  ['passwordResetTokenHash', 'passwordResetTokenHash'],
  ['passwordResetExpiresAt', 'passwordResetExpiresAt'],
  ['approvedBy', 'approvedBy'],
  ['approvedAt', 'approvedAt'],
  ['declinedBy', 'declinedBy'],
  ['declinedAt', 'declinedAt'],
  ['declineReason', 'declineReason'],
  ['createdAt', 'createdAt'],
  ['updatedAt', 'updatedAt']
]);

export function rowToUser(row) {
  if (!row) return null;

  return {
    ...asObject(row.attributes),
    id: toId(row),
    name: row.name,
    email: row.email,
    password: row.passwordHash,
    role: row.role,
    status: row.status,
    emailVerified: row.emailVerified,
    careerGoal: row.careerGoal ?? undefined,
    experienceYears: row.experienceYears ?? undefined,
    company: row.company ?? undefined,
    department: row.department ?? undefined,
    // Which recruiter looks after this candidate. null = unassigned.
    assignedRecruiterId: row.assignedRecruiterId ?? null,
    sessionVersion: row.sessionVersion,
    emailVerificationTokenHash:
      row.emailVerificationTokenHash ?? null,
    emailVerificationExpiresAt: toIso(
      row.emailVerificationExpiresAt
    ),
    passwordResetTokenHash:
      row.passwordResetTokenHash ?? null,
    passwordResetExpiresAt: toIso(
      row.passwordResetExpiresAt
    ),
    approvedBy: row.approvedBy ?? null,
    approvedAt: toIso(row.approvedAt),
    declinedBy: row.declinedBy ?? null,
    declinedAt: toIso(row.declinedAt),
    declineReason: row.declineReason ?? '',
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

export async function findUserById(id) {
  return rowToUser(
    await User.findById(String(id)).lean()
  );
}

export async function findUserByEmail(email) {
  const normalizedEmail = String(email).toLowerCase();

  return rowToUser(
    await User.findOne({ email: normalizedEmail }).lean()
  );
}

export async function findUserByColumn(column, value) {
  const fields = {
    email_verification_token_hash:
      'emailVerificationTokenHash',
    password_reset_token_hash:
      'passwordResetTokenHash'
  };

  const field = fields[column];

  if (!field) {
    throw new Error('Column not allowed');
  }

  return rowToUser(
    await User.findOne({ [field]: value }).lean()
  );
}

export async function listUsers({
  roles = null,
  statuses = null,
  assignedRecruiterId = undefined,
  limit = null,
  offset = 0
} = {}) {
  const filter = {};

  if (roles?.length) {
    filter.role = { $in: roles };
  }

  if (statuses?.length) {
    filter.status = { $in: statuses };
  }

  // undefined means "do not filter on this at all".
  // null means "only users nobody is looking after yet", which is how an
  // admin finds the unassigned queue.
  if (assignedRecruiterId !== undefined) {
    filter.assignedRecruiterId = assignedRecruiterId;
  }

  let query = User.find(filter).sort({ createdAt: -1 });

  if (limit != null) {
    query = query
      .skip(Number(offset) || 0)
      .limit(Number(limit));
  }

  return (await query.lean()).map(rowToUser);
}

export async function insertUser(user) {
  const known = new Set([
    'id',
    ...USER_FIELDS.keys()
  ]);

  const attributes = Object.fromEntries(
    Object.entries(user).filter(
      ([key]) => !known.has(key)
    )
  );

  const experienceYears = Number(
    user.experienceYears
  );

  await User.create({
    _id: String(user.id),
    name: user.name || '',
    email: String(user.email).toLowerCase(),
    passwordHash: user.password,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified !== false,
    careerGoal: user.careerGoal ?? null,
    experienceYears: Number.isFinite(experienceYears)
      ? experienceYears
      : null,
    company: user.company ?? null,
    department: user.department ?? null,
    assignedRecruiterId: user.assignedRecruiterId ?? null,
    sessionVersion: Number(
      user.sessionVersion || 1
    ),
    emailVerificationTokenHash:
      user.emailVerificationTokenHash ?? null,
    emailVerificationExpiresAt:
      user.emailVerificationExpiresAt ?? null,
    passwordResetTokenHash:
      user.passwordResetTokenHash ?? null,
    passwordResetExpiresAt:
      user.passwordResetExpiresAt ?? null,
    approvedBy: user.approvedBy ?? null,
    approvedAt: user.approvedAt ?? null,
    declinedBy: user.declinedBy ?? null,
    declinedAt: user.declinedAt ?? null,
    declineReason: user.declineReason ?? null,
    attributes,
    createdAt: user.createdAt ?? new Date(),
    updatedAt: user.updatedAt ?? new Date()
  });

  return findUserById(user.id);
}

export async function updateUser(id, patch) {
  const userId = String(id);
  const current = await User.findById(
    userId
  ).lean();

  if (!current) {
    return null;
  }

  const set = {};
  const extra = {};

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id') {
      continue;
    }

    const field = USER_FIELDS.get(key);

    if (field) {
      set[field] =
        key === 'email'
          ? String(value).toLowerCase()
          : value;
    } else {
      extra[key] = value;
    }
  }

  if (Object.keys(extra).length) {
    set.attributes = {
      ...asObject(current.attributes),
      ...extra
    };
  }

  if (Object.keys(set).length) {
    await User.updateOne(
      { _id: userId },
      { $set: set },
      { runValidators: true }
    );
  }

  return findUserById(userId);
}

export async function deleteUser(id) {
  const userId = String(id);

  const applicationIds = (
    await Application.find({ userId })
      .select({ _id: 1 })
      .lean()
  ).map((application) => toId(application));

  if (applicationIds.length) {
    await Interview.deleteMany({
      applicationId: { $in: applicationIds }
    });
  }

  await Promise.all([
    User.deleteOne({ _id: userId }),
    ApprovalRequest.deleteMany({ userId }),
    Application.deleteMany({ userId }),
    UserSettings.deleteOne({ userId }),
    StoredDocument.deleteMany({ ownerId: userId })
  ]);
}

export async function countUsers({
  roles = null,
  statuses = null,
  assignedRecruiterId = undefined
} = {}) {
  const filter = {};

  if (roles?.length) {
    filter.role = { $in: roles };
  }

  if (statuses?.length) {
    filter.status = { $in: statuses };
  }

  if (assignedRecruiterId !== undefined) {
    filter.assignedRecruiterId = assignedRecruiterId;
  }

  return User.countDocuments(filter);
}

/* ---------- audit logs ---------- */

export async function addAuditLog({
  actorId = 'system',
  actorRole = 'system',
  action,
  targetUserId = null,
  metadata = {}
}) {
  await AuditLog.create({
    _id: newId('audit'),
    actorId,
    actorRole,
    action,
    targetUserId,
    metadata
  });
}

export async function listAuditLogs(limit = 500) {
  const rows = await AuditLog.find({})
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .lean();

  return rows.map((row) => ({
    id: toId(row),
    actorId: row.actorId ?? null,
    actorRole: row.actorRole ?? null,
    action: row.action,
    targetUserId: row.targetUserId ?? null,
    metadata: row.metadata || {},
    createdAt: toIso(row.createdAt)
  }));
}

/* ---------- approval requests ---------- */

export async function ensureApprovalRequest(user) {
  const existing = await ApprovalRequest.findOne({
    userId: String(user.id),
    status: 'pending'
  }).lean();

  if (existing) {
    return { id: toId(existing) };
  }

  const id = newId('approval');

  await ApprovalRequest.create({
    _id: id,
    userId: String(user.id),
    requestedRole: user.role,
    requiredApproverRole:
      user.role === 'admin'
        ? 'super_admin'
        : 'admin',
    status: 'pending',
    requestedAt: new Date()
  });

  return { id };
}

export async function resolveApprovalRequests(
  userId,
  { status, reviewedBy }
) {
  await ApprovalRequest.updateMany(
    {
      userId: String(userId),
      status: 'pending'
    },
    {
      $set: {
        status,
        reviewedBy,
        reviewedAt: new Date()
      }
    },
    { runValidators: true }
  );
}

/* ---------- admin invitations ---------- */

const rowToInvitation = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: toId(row),
    email: row.email,
    tokenHash: row.tokenHash ?? null,
    status: row.status,
    invitedBy: row.invitedBy ?? null,
    userId: row.userId ?? null,
    createdAt: toIso(row.createdAt),
    expiresAt: toIso(row.expiresAt),
    acceptedAt: toIso(row.acceptedAt)
  };
};

export async function insertInvitation(invitation) {
  await AdminInvitation.create({
    _id: String(invitation.id),
    email: String(
      invitation.email
    ).toLowerCase(),
    tokenHash: invitation.tokenHash,
    status: invitation.status || 'pending',
    invitedBy: invitation.invitedBy,
    createdAt: new Date(),
    expiresAt: invitation.expiresAt
  });
}

export async function listInvitations() {
  const rows = await AdminInvitation.find({})
    .sort({ createdAt: -1 })
    .lean();

  return rows.map(rowToInvitation);
}

export async function findPendingInvitationByTokenHash(
  tokenHash
) {
  return rowToInvitation(
    await AdminInvitation.findOne({
      tokenHash,
      status: 'pending'
    }).lean()
  );
}

export async function findPendingInvitationByEmail(
  email
) {
  return rowToInvitation(
    await AdminInvitation.findOne({
      email: String(email).toLowerCase(),
      status: 'pending'
    }).lean()
  );
}

export async function updateInvitation(
  id,
  {
    status,
    acceptedAt = null,
    tokenHash,
    userId
  }
) {
  const set = {
    tokenHash:
      tokenHash === undefined
        ? null
        : tokenHash
  };

  if (status != null) {
    set.status = status;
  }

  if (acceptedAt != null) {
    set.acceptedAt = acceptedAt;
  }

  if (userId != null) {
    set.userId = userId;
  }

  await AdminInvitation.updateOne(
    { _id: String(id) },
    { $set: set },
    { runValidators: true }
  );
}

export async function deleteInvitation(id) {
  await AdminInvitation.deleteOne({ _id: String(id) });
}
/* ---------- platform jobs ---------- */

const rowToJob = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...asObject(row.attributes),
    id: toId(row),
    recruiterId: row.recruiterId ?? null,
    createdBy: row.recruiterId ?? null,
    isInternal: true,
    title: row.title,
    company: row.company ?? null,
    location: row.location ?? null,
    jobType: row.jobType ?? null,
    experienceLevel:
      row.experienceLevel ?? null,
    workMode: row.workMode ?? null,
    minSalary:
      row.minSalary != null
        ? Number(row.minSalary)
        : 0,
    maxSalary:
      row.maxSalary != null
        ? Number(row.maxSalary)
        : 0,
    skills: row.skills || [],
    description: row.description ?? '',
    status: row.status,
    source: row.source,
    postedAt: toIso(row.postedAt),
    closedAt: toIso(row.closedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
};

export async function insertPlatformJob(job) {
  const known = new Set([
    'id',
    'recruiterId',
    'createdBy',
    'isInternal',
    'title',
    'company',
    'location',
    'jobType',
    'experienceLevel',
    'workMode',
    'minSalary',
    'maxSalary',
    'skills',
    'description',
    'status',
    'source',
    'postedAt',
    'createdAt',
    'updatedAt',
    'closedAt'
  ]);

  const attributes = Object.fromEntries(
    Object.entries(job).filter(
      ([key]) => !known.has(key)
    )
  );

  await PlatformJob.create({
    _id: String(job.id),
    recruiterId:
      job.recruiterId ?? job.createdBy,
    title: job.title,
    company: job.company ?? null,
    location: job.location ?? null,
    jobType: job.jobType ?? null,
    experienceLevel:
      job.experienceLevel ?? null,
    workMode: job.workMode ?? null,
    minSalary: job.minSalary || null,
    maxSalary: job.maxSalary || null,
    skills: job.skills || [],
    description: job.description ?? null,
    status: job.status || 'open',
    source: 'Platform',
    postedAt: new Date(),
    attributes
  });

  return findPlatformJobById(job.id);
}

export async function findPlatformJobById(id) {
  return rowToJob(
    await PlatformJob.findById(
      String(id)
    ).lean()
  );
}

export async function listPlatformJobs({
  recruiterId = null,
  status = null,
  limit = null,
  offset = 0
} = {}) {
  const filter = {};

  if (recruiterId) {
    filter.recruiterId = recruiterId;
  }

  if (status) {
    filter.status = status;
  }

  let query = PlatformJob.find(filter)
    .sort({ createdAt: -1 });

  if (limit != null) {
    query = query
      .skip(Number(offset) || 0)
      .limit(Number(limit));
  }

  return (await query.lean()).map(rowToJob);
}

export async function updatePlatformJob(
  id,
  patch
) {
  const jobId = String(id);
  const current = await PlatformJob.findById(
    jobId
  ).lean();

  if (!current) {
    return null;
  }

  const allowed = new Set([
    'title',
    'company',
    'location',
    'jobType',
    'experienceLevel',
    'workMode',
    'minSalary',
    'maxSalary',
    'skills',
    'description',
    'status',
    'closedAt'
  ]);

  const ignored = new Set([
    'id',
    'recruiterId',
    'createdBy',
    'isInternal',
    'source',
    'postedAt',
    'createdAt',
    'updatedAt'
  ]);

  const set = {
    updatedAt: new Date()
  };

  const extra = {};

  for (const [key, value] of Object.entries(patch)) {
    if (allowed.has(key)) {
      set[key] =
        key === 'skills'
          ? value || []
          : value;
    } else if (!ignored.has(key)) {
      extra[key] = value;
    }
  }

  if (Object.keys(extra).length) {
    set.attributes = {
      ...asObject(current.attributes),
      ...extra
    };
  }

  await PlatformJob.updateOne(
    { _id: jobId },
    { $set: set },
    { runValidators: true }
  );

  return findPlatformJobById(jobId);
}

export async function deletePlatformJob(id) {
  await PlatformJob.deleteOne({
    _id: String(id)
  });
}

/* ---------- applications ---------- */

const rowToApplication = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...asObject(row.attributes),
    id: toId(row),
    userId: row.userId,
    jobId: row.jobId ?? null,
    applicationType: row.kind,
    title: row.title ?? null,
    company: row.company ?? null,
    location: row.location ?? null,
    url: row.url ?? null,
    source: row.source ?? null,
    status: row.status,
    assignedRecruiterId:
      row.recruiterId ?? null,
    recruiterNotes:
      row.recruiterNotes ?? '',
    appliedAt: toIso(row.appliedAt),
    updatedAt: toIso(row.updatedAt)
  };
};

export async function insertApplication(
  application
) {
  const kind =
    application.kind ||
    (
      application.applicationType ===
        'internal' ||
      application.source === 'Platform'
        ? 'internal'
        : 'external'
    );

  const known = new Set([
    'id',
    'userId',
    'jobId',
    'kind',
    'applicationType',
    'title',
    'company',
    'location',
    'url',
    'source',
    'status',
    'recruiterId',
    'assignedRecruiterId',
    'recruiterNotes',
    'appliedAt',
    'updatedAt',
    'attributes'
  ]);

  const extra = Object.fromEntries(
    Object.entries(application).filter(
      ([key]) => !known.has(key)
    )
  );

  await Application.create({
    _id: String(application.id),
    userId: String(application.userId),
    jobId:
      application.jobId != null
        ? String(application.jobId)
        : null,
    kind,
    title: application.title ?? null,
    company: application.company ?? null,
    location: application.location ?? null,
    url: application.url ?? null,
    source: application.source ?? null,
    status: application.status || 'Applied',
    recruiterId:
      application.assignedRecruiterId ??
      application.recruiterId ??
      null,
    recruiterNotes:
      application.recruiterNotes || '',
    appliedAt:
      application.appliedAt ?? new Date(),
    updatedAt:
      application.updatedAt ?? new Date(),
    attributes: {
      ...extra,
      ...asObject(application.attributes)
    }
  });

  return findApplicationById(application.id);
}

export async function findApplicationById(id) {
  return rowToApplication(
    await Application.findById(
      String(id)
    ).lean()
  );
}

export async function listApplications({
  userId = null,
  userIds = null,
  recruiterId = null,
  kind = null,
  jobId = null,
  limit = null,
  offset = 0
} = {}) {
  const filter = {};

  if (userId) {
    filter.userId = userId;
  }

  // Used by the recruiter portal: every application belonging to the
  // candidates assigned to that recruiter.
  if (userIds?.length) {
    filter.userId = { $in: userIds };
  }

  if (recruiterId) {
    filter.recruiterId = recruiterId;
  }

  if (kind) {
    filter.kind = kind;
  }

  if (jobId != null) {
    filter.jobId = String(jobId);
  }

  let query = Application.find(filter)
    .sort({ appliedAt: -1 });

  if (limit != null) {
    query = query
      .skip(Number(offset) || 0)
      .limit(Number(limit));
  }

  return (await query.lean()).map(
    rowToApplication
  );
}

export async function updateApplication(
  id,
  patch
) {
  const applicationId = String(id);

  const current = await Application.findById(
    applicationId
  ).lean();

  if (!current) {
    return null;
  }

  const fields = new Map([
    ['status', 'status'],
    ['recruiterId', 'recruiterId'],
    ['assignedRecruiterId', 'recruiterId'],
    ['recruiterNotes', 'recruiterNotes'],
    ['title', 'title'],
    ['company', 'company'],
    ['location', 'location'],
    ['url', 'url']
  ]);

  const ignored = new Set([
    'id',
    'userId',
    'kind',
    'applicationType',
    'appliedAt',
    'updatedAt',
    'jobId',
    'source'
  ]);

  const set = {
    updatedAt: new Date()
  };

  const extra = {};

  for (const [key, value] of Object.entries(patch)) {
    const field = fields.get(key);

    if (field) {
      set[field] = value;
    } else if (!ignored.has(key)) {
      extra[key] = value;
    }
  }

  if (Object.keys(extra).length) {
    set.attributes = {
      ...asObject(current.attributes),
      ...extra
    };
  }

  await Application.updateOne(
    { _id: applicationId },
    { $set: set },
    { runValidators: true }
  );

  return findApplicationById(applicationId);
}

export async function deleteApplication(id) {
  const applicationId = String(id);

  await Promise.all([
    Application.deleteOne({
      _id: applicationId
    }),
    Interview.deleteMany({
      applicationId
    })
  ]);
}

/* ---------- interviews ---------- */

const rowToInterview = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...asObject(row.attributes),
    id: toId(row),
    applicationId:
      row.applicationId ?? null,
    startsAt: toIso(row.scheduledAt),
    mode: row.mode ?? null,
    location: row.location ?? '',
    notes: row.notes ?? '',
    status: row.status,
    createdBy:
      row.recruiterId ?? null,
    createdAt: toIso(row.createdAt)
  };
};

export async function insertInterview(interview) {
  await Interview.create({
    _id: String(interview.id),
    applicationId: interview.applicationId,
    userId: interview.userId ?? null,
    recruiterId:
      interview.recruiterId ??
      interview.createdBy ??
      null,
    scheduledAt:
      interview.startsAt ??
      interview.scheduledAt ??
      null,
    mode: interview.mode ?? null,
    location: interview.location ?? null,
    notes: interview.notes ?? null,
    status: interview.status || 'scheduled',
    attributes: {
      durationMinutes:
        interview.durationMinutes ?? 60
    }
  });

  return rowToInterview(
    await Interview.findById(
      String(interview.id)
    ).lean()
  );
}

export async function listInterviews({
  applicationId = null,
  applicationIds = null,
  recruiterId = null,
  userId = null,
  userIds = null
} = {}) {
  const filter = {};

  if (applicationId) {
    filter.applicationId = applicationId;
  }

  if (applicationIds?.length) {
    filter.applicationId = { $in: applicationIds };
  }

  if (recruiterId) {
    filter.recruiterId = recruiterId;
  }

  if (userId) {
    filter.userId = userId;
  }

  if (userIds?.length) {
    filter.userId = { $in: userIds };
  }

  const rows = await Interview.find(filter)
    .sort({ scheduledAt: -1 })
    .lean();

  return rows.map(rowToInterview);
}

export async function attachInterviews(
  application
) {
  const interviews = await listInterviews({
    applicationId: application.id
  });

  return {
    ...application,
    interviews
  };
}

/* ---------- calendar events ---------- */

const rowToEvent = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...asObject(row.attributes),
    id: toId(row),
    userId: row.userId,
    title: row.title ?? null,
    date: row.eventDate || null,
    time: row.eventTime ?? null,
    type: row.type ?? null,
    notes: row.notes ?? '',
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
};

export async function listEvents(userId) {
  const filter = userId
    ? { userId: String(userId) }
    : {};

  const rows = await CalendarEvent.find(filter)
    .sort({
      eventDate: 1,
      eventTime: 1
    })
    .lean();

  return rows.map(rowToEvent);
}

export async function findEventById(id) {
  return rowToEvent(
    await CalendarEvent.findById(
      String(id)
    ).lean()
  );
}

export async function insertEvent(event) {
  await CalendarEvent.create({
    _id: String(event.id),
    userId: String(event.userId),
    title: event.title ?? null,
    eventDate: event.date || null,
    eventTime: event.time ?? null,
    type: event.type ?? null,
    notes: event.notes ?? null,
    attributes: event.attributes || {}
  });

  return findEventById(event.id);
}

export async function updateEvent(id, patch) {
  const fields = new Map([
    ['title', 'title'],
    ['date', 'eventDate'],
    ['time', 'eventTime'],
    ['type', 'type'],
    ['notes', 'notes']
  ]);

  const set = {
    updatedAt: new Date()
  };

  for (const [key, value] of Object.entries(patch)) {
    const field = fields.get(key);

    if (!field) {
      continue;
    }

    set[field] =
      key === 'date'
        ? value || null
        : value;
  }

  await CalendarEvent.updateOne(
    { _id: String(id) },
    { $set: set },
    { runValidators: true }
  );

  return findEventById(id);
}

export async function deleteEvent(id) {
  await CalendarEvent.deleteOne({
    _id: String(id)
  });
}

/* ---------- saved jobs / job statuses ---------- */

export async function listSavedJobs(userId) {
  const rows = await SavedJob.find({
    userId: String(userId)
  })
    .sort({ savedAt: -1 })
    .lean();

  return rows.map((row) => ({
    jobId: row.jobId,
    snapshot: row.jobSnapshot,
    savedAt: row.savedAt
  }));
}

export async function isJobSaved(
  userId,
  jobId
) {
  return Boolean(
    await SavedJob.exists({
      userId: String(userId),
      jobId: String(jobId)
    })
  );
}

export async function saveJob(
  userId,
  jobId,
  snapshot
) {
  const normalizedUserId = String(userId);
  const normalizedJobId = String(jobId);

  await SavedJob.updateOne(
    {
      userId: normalizedUserId,
      jobId: normalizedJobId
    },
    {
      $setOnInsert: {
        _id: compoundId(
          normalizedUserId,
          normalizedJobId
        ),
        userId: normalizedUserId,
        jobId: normalizedJobId,
        jobSnapshot: snapshot || null,
        savedAt: new Date()
      }
    },
    {
      upsert: true,
      runValidators: true
    }
  );
}

export async function unsaveJob(
  userId,
  jobId
) {
  await SavedJob.deleteOne({
    userId: String(userId),
    jobId: String(jobId)
  });
}

export async function getJobStatuses(userId) {
  const rows = await JobStatus.find({
    userId: String(userId)
  }).lean();

  return Object.fromEntries(
    rows.map((row) => [
      row.jobId,
      row.status
    ])
  );
}

export async function setJobStatus(
  userId,
  jobId,
  status
) {
  const normalizedUserId = String(userId);
  const normalizedJobId = String(jobId);

  await JobStatus.updateOne(
    {
      userId: normalizedUserId,
      jobId: normalizedJobId
    },
    {
      $set: {
        status,
        updatedAt: new Date()
      },
      $setOnInsert: {
        _id: compoundId(
          normalizedUserId,
          normalizedJobId
        ),
        userId: normalizedUserId,
        jobId: normalizedJobId
      }
    },
    {
      upsert: true,
      runValidators: true
    }
  );
}

export async function deleteJobStatus(
  userId,
  jobId
) {
  await JobStatus.deleteOne({
    userId: String(userId),
    jobId: String(jobId)
  });
}

/* ---------- user settings ---------- */

export async function getUserSettingsRow(
  userId
) {
  const row = await UserSettings.findOne({
    userId: String(userId)
  }).lean();

  return row?.settings || {};
}

export async function upsertUserSettings(
  userId,
  settings
) {
  const normalizedUserId = String(userId);

  await UserSettings.updateOne(
    {
      userId: normalizedUserId
    },
    {
      $set: {
        settings: settings || {},
        updatedAt: new Date()
      },
      $setOnInsert: {
        _id: normalizedUserId,
        userId: normalizedUserId
      }
    },
    {
      upsert: true,
      runValidators: true
    }
  );

  return getUserSettingsRow(
    normalizedUserId
  );
}

/* ---------- pending email changes ---------- */

export async function insertPendingEmailChange(
  pendingChange
) {
  const userId = String(
    pendingChange.userId
  );

  await PendingEmailChange.deleteMany({
    userId
  });

  await PendingEmailChange.create({
    _id: String(pendingChange.id),
    userId,
    newEmail: String(
      pendingChange.newEmail
    ).toLowerCase(),
    tokenHash: pendingChange.tokenHash,
    expiresAt: pendingChange.expiresAt
  });
}

export async function findPendingEmailChangeByTokenHash(
  tokenHash
) {
  const row =
    await PendingEmailChange.findOne({
      tokenHash
    }).lean();

  if (!row) {
    return null;
  }

  return {
    id: toId(row),
    userId: row.userId,
    newEmail: row.newEmail,
    tokenHash: row.tokenHash,
    expiresAt: toIso(row.expiresAt)
  };
}

export async function deletePendingEmailChanges(
  userId
) {
  await PendingEmailChange.deleteMany({
    userId: String(userId)
  });
}

/* ---------- gmail accounts ---------- */

export async function getGmailAccount(userId) {
  const row = await GmailAccount.findOne({
    userId: String(userId)
  }).lean();

  return {
    tokens: row?.tokens || null,
    status: row?.status || {}
  };
}

export async function upsertGmailAccount(
  userId,
  { tokens, status }
) {
  const normalizedUserId = String(userId);

  await GmailAccount.updateOne(
    {
      userId: normalizedUserId
    },
    {
      $set: {
        tokens: tokens ?? null,
        status: status || {},
        updatedAt: new Date()
      },
      $setOnInsert: {
        _id: normalizedUserId,
        userId: normalizedUserId
      }
    },
    {
      upsert: true,
      runValidators: true
    }
  );
}

/* ---------- dashboard ---------- */

export async function getDashboard(
  userId = null
) {
  const applications = await listApplications(
    userId ? { userId } : {}
  );

  const events = await listEvents(userId);

  const savedCount = userId
    ? (await listSavedJobs(userId)).length
    : await SavedJob.countDocuments({});

  const activeStatuses = [
    'Applied',
    'Under Review',
    'Online Assessment',
    'Technical Interview',
    'Final Interview'
  ];

  const activeApplications =
    applications.filter((application) =>
      activeStatuses.includes(
        application.status
      )
    );

  const interviewApplications =
    applications.filter((application) =>
      [
        'Technical Interview',
        'Final Interview'
      ].includes(application.status)
    );

  const statusCounts = Object.fromEntries(
    activeStatuses.map((status) => [
      status,
      applications.filter(
        (application) =>
          application.status === status
      ).length
    ])
  );

  const recentApplications = [
    ...applications
  ].sort((left, right) => {
    const leftDate = new Date(
      left.updatedAt ||
        left.appliedAt ||
        0
    ).getTime();

    const rightDate = new Date(
      right.updatedAt ||
        right.appliedAt ||
        0
    ).getTime();

    return rightDate - leftDate;
  });

  const upcomingEvents = events.filter(
    (event) => {
      if (!event.date) {
        return false;
      }

      const timestamp = new Date(
        `${event.date}T${
          event.time || '23:59'
        }`
      ).getTime();

      return (
        !Number.isNaN(timestamp) &&
        timestamp >= Date.now()
      );
    }
  );

  return {
    applications:
      activeApplications.length,
    interviews:
      interviewApplications.length,
    savedJobs: savedCount,
    upcomingEvents:
      upcomingEvents.length,
    statusCounts,
    recentApplications
  };
}

/* ---------- admin overview counts ---------- */

export async function countPlatformJobs() {
  return PlatformJob.countDocuments({});
}

export async function countApplications() {
  return Application.countDocuments({});
}

export async function countEvents() {
  return CalendarEvent.countDocuments({});
}

/* ---------- platform settings ---------- */

export async function getSetting(
  key,
  fallback = {}
) {
  const row = await PlatformSetting.findOne({
    key: String(key)
  }).lean();

  return row?.value ?? fallback;
}

export async function setSetting(
  key,
  value,
  updatedBy
) {
  const normalizedKey = String(key);

  await PlatformSetting.updateOne(
    {
      key: normalizedKey
    },
    {
      $set: {
        value,
        updatedBy,
        updatedAt: new Date()
      },
      $setOnInsert: {
        _id: normalizedKey,
        key: normalizedKey
      }
    },
    {
      upsert: true,
      runValidators: true
    }
  );

  return value;
}

/* ---------- documents ---------- */

const rowToDocument = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: toId(row),
    ownerId: row.ownerId,
    kind: row.kind,
    originalName: row.originalName,
    storedName: row.storedName,
    mimeType: row.mimeType ?? null,
    sizeBytes: row.sizeBytes ?? null,
    label: row.label ?? null,
    matchScore: row.matchScore ?? null,
    jobTitle: row.jobTitle ?? null,
    company: row.company ?? null,
    sourceJobId: row.sourceJobId ?? null,
    createdAt: toIso(row.createdAt)
  };
};

export async function insertDocument(document) {
  await StoredDocument.create({
    _id: String(document.id),
    ownerId: String(document.ownerId),
    kind: document.kind || 'resume',
    originalName: document.originalName,
    storedName: document.storedName,
    mimeType: document.mimeType ?? null,
    sizeBytes: document.sizeBytes ?? null,
    label: document.label ?? null,
    matchScore: document.matchScore ?? null,
    jobTitle: document.jobTitle ?? null,
    company: document.company ?? null,
    sourceJobId: document.sourceJobId ?? null
  });

  return findDocumentById(document.id);
}

export async function findDocumentById(id) {
  return rowToDocument(
    await StoredDocument.findById(
      String(id)
    ).lean()
  );
}

export async function listDocuments(
  ownerId,
  kind = null
) {
  const filter = {
    ownerId: String(ownerId)
  };

  if (kind) {
    filter.kind = kind;
  }

  const rows = await StoredDocument.find(
    filter
  )
    .sort({ createdAt: -1 })
    .lean();

  return rows.map(rowToDocument);
}

export async function deleteDocument(id) {
  await StoredDocument.deleteOne({
    _id: String(id)
  });
}

/* ---------- interviews: reschedule / cancel ---------- */

export async function findInterviewById(id) {
  const row = await Interview.findById(
    String(id)
  ).lean();

  if (!row) {
    return null;
  }

  return {
    ...asObject(row.attributes),
    id: toId(row),
    applicationId:
      row.applicationId ?? null,
    userId: row.userId ?? null,
    recruiterId:
      row.recruiterId ?? null,
    startsAt: toIso(row.scheduledAt),
    mode: row.mode ?? null,
    location: row.location ?? '',
    notes: row.notes ?? '',
    status: row.status,
    createdBy:
      row.recruiterId ?? null,
    createdAt: toIso(row.createdAt)
  };
}

export async function updateInterview(
  id,
  patch
) {
  const fields = new Map([
    ['startsAt', 'scheduledAt'],
    ['mode', 'mode'],
    ['location', 'location'],
    ['notes', 'notes'],
    ['status', 'status']
  ]);

  const set = {
    updatedAt: new Date()
  };

  for (const [key, value] of Object.entries(patch)) {
    const field = fields.get(key);

    if (field) {
      set[field] = value;
    }
  }

  await Interview.updateOne(
    { _id: String(id) },
    { $set: set },
    { runValidators: true }
  );

  return findInterviewById(id);
}

export async function listAllInterviews() {
  const interviews = await Interview.find({})
    .sort({ scheduledAt: -1 })
    .lean();

  const applicationIds = [
    ...new Set(
      interviews
        .map(
          (interview) =>
            interview.applicationId
        )
        .filter(Boolean)
    )
  ];

  const applications =
    applicationIds.length
      ? await Application.find({
          _id: {
            $in: applicationIds
          }
        }).lean()
      : [];

  const applicationById = new Map(
    applications.map((application) => [
      toId(application),
      application
    ])
  );

  return interviews.map((interview) => {
    const application =
      applicationById.get(
        interview.applicationId
      );

    return {
      id: toId(interview),
      applicationId:
        interview.applicationId ?? null,
      recruiterId:
        interview.recruiterId ?? null,
      candidateId:
        application?.userId ?? null,
      title:
        application?.title ?? null,
      company:
        application?.company ?? null,
      startsAt: toIso(
        interview.scheduledAt
      ),
      mode: interview.mode ?? null,
      location:
        interview.location ?? '',
      notes: interview.notes ?? '',
      status: interview.status
    };
  });
}

/* ---------- job source health ---------- */

export async function upsertSourceHealth(
  entries = []
) {
  for (const entry of entries) {
    const source = String(entry.source);

    const lastSuccessAt =
      entry.lastSuccessAt ||
      (
        entry.ok
          ? entry.checkedAt
          : null
      );

    const set = {
      ok: entry.ok,
      lastError: entry.error || null,
      lastCount: entry.count ?? 0,
      updatedAt: new Date()
    };

    if (lastSuccessAt) {
      set.lastSuccessAt =
        lastSuccessAt;
    }

    const setOnInsert = {
      _id: source,
      source
    };

    if (!lastSuccessAt) {
      setOnInsert.lastSuccessAt = null;
    }

    await JobSourceHealth.updateOne(
      { source },
      {
        $set: set,
        $setOnInsert: setOnInsert
      },
      {
        upsert: true,
        runValidators: true
      }
    );
  }
}

export async function listSourceHealth() {
  const rows =
    await JobSourceHealth.find({})
      .sort({ source: 1 })
      .lean();

  return rows.map((row) => ({
    source: row.source,
    ok: row.ok,
    lastSuccessAt: toIso(
      row.lastSuccessAt
    ),
    lastError: row.lastError ?? null,
    lastCount: row.lastCount ?? null,
    updatedAt: toIso(row.updatedAt)
  }));
}

/* ---------- reports ---------- */

const groupCounts = async (
  model,
  fields
) => {
  const groupId = Object.fromEntries(
    fields.map((field) => [
      field,
      `$${field}`
    ])
  );

  const rows = await model.aggregate([
    {
      $group: {
        _id: groupId,
        c: { $sum: 1 }
      }
    }
  ]);

  return rows.map((row) => ({
    ...row._id,
    c: row.c
  }));
};

export async function getReportsSummary() {
  const [
    users,
    jobs,
    applications,
    interviews
  ] = await Promise.all([
    groupCounts(User, [
      'role',
      'status'
    ]),
    groupCounts(PlatformJob, [
      'status'
    ]),
    groupCounts(Application, [
      'kind',
      'status'
    ]),
    groupCounts(Interview, [
      'status'
    ])
  ]);

  return {
    users,
    jobs,
    applications,
    interviews
  };
}

/* ---------- pagination helper ---------- */

export function parsePagination(query = {}) {
  const page = Math.max(
    1,
    Number(query.page) || 1
  );

  const pageSize = Math.min(
    200,
    Math.max(
      1,
      Number(query.pageSize) || 50
    )
  );

  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
}
