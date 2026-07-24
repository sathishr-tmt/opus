// Optional one-time importer: backend/db.json -> MongoDB.
// Idempotent: documents are upserted by stable IDs, so rerunning is safe.
// Usage from project root: npm run db:import --prefix backend

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  connectMongo,
  disconnectMongo
} from '../src/mongo.js';

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
  RolePermission,
  SavedJob,
  StoredDocument,
  User,
  UserSettings
} from '../src/models.js';

const __dirname = path.dirname(
  fileURLToPath(import.meta.url)
);

const USER_FIELDS = new Set([
  'id',
  'name',
  'email',
  'password',
  'role',
  'status',
  'emailVerified',
  'careerGoal',
  'experienceYears',
  'company',
  'department',
  'sessionVersion',
  'emailVerificationTokenHash',
  'emailVerificationExpiresAt',
  'passwordResetTokenHash',
  'passwordResetExpiresAt',
  'approvedBy',
  'approvedAt',
  'declinedBy',
  'declinedAt',
  'declineReason',
  'createdAt',
  'updatedAt'
]);

const JOB_FIELDS = new Set([
  'id',
  'recruiterId',
  'createdBy',
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
  'closedAt',
  'createdAt',
  'updatedAt'
]);

const APPLICATION_FIELDS = new Set([
  'id',
  'userId',
  'jobId',
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
  'kind',
  'applicationType',
  'internal',
  'attributes'
]);

const EVENT_FIELDS = new Set([
  'id',
  'userId',
  'title',
  'date',
  'time',
  'type',
  'notes',
  'createdAt',
  'updatedAt',
  'attributes'
]);

const INTERVIEW_FIELDS = new Set([
  'id',
  'applicationId',
  'userId',
  'recruiterId',
  'createdBy',
  'startsAt',
  'scheduledAt',
  'mode',
  'location',
  'notes',
  'status',
  'durationMinutes',
  'createdAt',
  'updatedAt',
  'attributes'
]);

const DOCUMENT_FIELDS = new Set([
  'id',
  'ownerId',
  'kind',
  'originalName',
  'storedName',
  'mimeType',
  'sizeBytes',
  'createdAt'
]);

const EDITABLE_PERMISSION_RULES = {
  recruiter: {
    allowed: [
      'staff:portal',
      'profile:self',
      'posting:own:manage',
      'application:assigned:view',
      'application:assigned:update',
      'interview:assigned:manage'
    ],
    mandatory: [
      'staff:portal',
      'profile:self'
    ]
  },

  admin: {
    allowed: [
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
    ],
    mandatory: [
      'staff:portal',
      'profile:self'
    ]
  }
};

const dateOrNull = (value) =>
  value ? new Date(value) : null;

const nowIfMissing = (value) =>
  value ? new Date(value) : new Date();

const restOf = (object, known) =>
  Object.fromEntries(
    Object.entries(object || {}).filter(
      ([key]) => !known.has(key)
    )
  );

const compoundId = (userId, jobId) =>
  `${String(userId)}:${String(jobId)}`;

async function upsertById(
  Model,
  id,
  values
) {
  await Model.updateOne(
    {
      _id: String(id)
    },
    {
      $set: values,
      $setOnInsert: {
        _id: String(id)
      }
    },
    {
      upsert: true,
      runValidators: true
    }
  );
}

function normalizedRolePermissions(
  role,
  permissions
) {
  const rules =
    EDITABLE_PERMISSION_RULES[role];

  if (!rules) {
    return null;
  }

  const allowed = new Set(
    rules.allowed
  );

  const requested = Array.isArray(
    permissions
  )
    ? permissions
    : [];

  return [
    ...new Set([
      ...requested.filter(
        (permission) =>
          allowed.has(permission)
      ),
      ...rules.mandatory
    ])
  ];
}

export async function importDbJson(
  data = {}
) {
  await connectMongo();

  const report = {};

  const userIds = new Set(
    (data.users || [])
      .map((user) =>
        user.id == null
          ? null
          : String(user.id)
      )
      .filter(Boolean)
  );

  let users = 0;

  for (const user of data.users || []) {
    if (
      !user.id ||
      !user.email ||
      !user.password
    ) {
      continue;
    }

    const experienceYears = Number(
      user.experienceYears
    );

    await upsertById(
      User,
      user.id,
      {
        name: user.name || '',
        email: String(
          user.email
        ).toLowerCase(),
        passwordHash: user.password,
        role: user.role || 'user',
        status:
          user.status ||
          'pending_admin_approval',
        emailVerified:
          user.emailVerified !== false,
        careerGoal:
          user.careerGoal ?? null,
        experienceYears:
          Number.isFinite(experienceYears)
            ? experienceYears
            : null,
        company:
          user.company ?? null,
        department:
          user.department ?? null,
        sessionVersion: Number(
          user.sessionVersion || 1
        ),
        emailVerificationTokenHash:
          user.emailVerificationTokenHash ??
          null,
        emailVerificationExpiresAt:
          dateOrNull(
            user.emailVerificationExpiresAt
          ),
        passwordResetTokenHash:
          user.passwordResetTokenHash ??
          null,
        passwordResetExpiresAt:
          dateOrNull(
            user.passwordResetExpiresAt
          ),
        approvedBy:
          user.approvedBy ?? null,
        approvedAt:
          dateOrNull(user.approvedAt),
        declinedBy:
          user.declinedBy ?? null,
        declinedAt:
          dateOrNull(user.declinedAt),
        declineReason:
          user.declineReason ?? null,
        attributes:
          restOf(user, USER_FIELDS),
        createdAt:
          nowIfMissing(user.createdAt),
        updatedAt:
          nowIfMissing(user.updatedAt)
      }
    );

    users += 1;
  }

  report.users = users;

  let invitations = 0;

  for (
    const invitation of
    data.invitations || []
  ) {
    if (
      !invitation.id ||
      !invitation.email
    ) {
      continue;
    }

    await upsertById(
      AdminInvitation,
      invitation.id,
      {
        email: String(
          invitation.email
        ).toLowerCase(),
        tokenHash:
          invitation.tokenHash ??
          invitation.token_hash ??
          null,
        status:
          invitation.status || 'pending',
        invitedBy:
          invitation.invitedBy ?? null,
        userId:
          invitation.userId ?? null,
        createdAt:
          nowIfMissing(
            invitation.createdAt
          ),
        expiresAt:
          dateOrNull(
            invitation.expiresAt
          ),
        acceptedAt:
          dateOrNull(
            invitation.acceptedAt
          )
      }
    );

    invitations += 1;
  }

  report.invitations = invitations;

  let approvals = 0;

  for (
    const approval of
    data.approvalRequests || []
  ) {
    if (
      !approval.id ||
      !userIds.has(
        String(approval.userId)
      )
    ) {
      continue;
    }

    await upsertById(
      ApprovalRequest,
      approval.id,
      {
        userId:
          String(approval.userId),
        requestedRole:
          approval.requestedRole ??
          null,
        requiredApproverRole:
          approval.requiredApproverRole ??
          null,
        status:
          approval.status || 'pending',
        requestedAt:
          dateOrNull(
            approval.requestedAt
          ),
        reviewedBy:
          approval.reviewedBy ?? null,
        reviewedAt:
          dateOrNull(
            approval.reviewedAt
          )
      }
    );

    approvals += 1;
  }

  report.approvalRequests =
    approvals;

  let audits = 0;

  for (
    const log of
    data.auditLogs || []
  ) {
    if (
      !log.id ||
      !log.action
    ) {
      continue;
    }

    await upsertById(
      AuditLog,
      log.id,
      {
        actorId:
          log.actorId ?? null,
        actorRole:
          log.actorRole ?? null,
        action: log.action,
        targetUserId:
          log.targetUserId ?? null,
        metadata:
          log.metadata || {},
        createdAt:
          nowIfMissing(log.createdAt)
      }
    );

    audits += 1;
  }

  report.auditLogs = audits;

  let platformJobs = 0;
  let skippedCachedJobs = 0;

  for (
    const job of
    data.jobs || []
  ) {
    if (
      (job.source || '') !==
      'Platform'
    ) {
      skippedCachedJobs += 1;
      continue;
    }

    if (job.id == null) {
      continue;
    }

    const minSalary =
      Number(job.minSalary || 0) ||
      null;

    const maxSalary =
      Number(job.maxSalary || 0) ||
      null;

    await upsertById(
      PlatformJob,
      job.id,
      {
        recruiterId:
          userIds.has(
            String(job.recruiterId)
          )
            ? String(job.recruiterId)
            : null,
        title:
          job.title || 'Untitled',
        company:
          job.company ?? null,
        location:
          job.location ?? null,
        jobType:
          job.jobType ?? null,
        experienceLevel:
          job.experienceLevel ??
          null,
        workMode:
          job.workMode ?? null,
        minSalary,
        maxSalary,
        skills:
          job.skills || [],
        description:
          job.description ?? null,
        status:
          [
            'open',
            'closed'
          ].includes(job.status)
            ? job.status
            : 'open',
        source: 'Platform',
        postedAt:
          dateOrNull(job.postedAt),
        closedAt:
          dateOrNull(job.closedAt),
        attributes:
          restOf(job, JOB_FIELDS),
        createdAt:
          nowIfMissing(job.createdAt),
        updatedAt:
          nowIfMissing(job.updatedAt)
      }
    );

    platformJobs += 1;
  }

  report.platformJobs =
    platformJobs;

  report.skippedCachedExternalJobs =
    skippedCachedJobs;

  let applications = 0;

  for (
    const application of
    data.applications || []
  ) {
    if (
      !application.id ||
      !userIds.has(
        String(application.userId)
      )
    ) {
      continue;
    }

    const kind =
      application.kind ||
      application.applicationType ||
      (
        application.internal ||
        application.source ===
          'Platform'
          ? 'internal'
          : 'external'
      );

    await upsertById(
      Application,
      application.id,
      {
        userId:
          String(application.userId),
        jobId:
          application.jobId != null
            ? String(
                application.jobId
              )
            : null,
        kind,
        title:
          application.title ?? null,
        company:
          application.company ?? null,
        location:
          application.location ?? null,
        url:
          application.url ?? null,
        source:
          application.source ?? null,
        status:
          application.status ||
          'Applied',
        recruiterId:
          application.assignedRecruiterId ??
          application.recruiterId ??
          null,
        recruiterNotes:
          application.recruiterNotes ||
          '',
        appliedAt:
          dateOrNull(
            application.appliedAt
          ),
        updatedAt:
          dateOrNull(
            application.updatedAt
          ),
        attributes: {
          ...restOf(
            application,
            APPLICATION_FIELDS
          ),
          ...(
            application.attributes ||
            {}
          )
        }
      }
    );

    applications += 1;
  }

  report.applications =
    applications;

  let interviews = 0;

  for (
    const interview of
    data.interviews || []
  ) {
    if (!interview.id) {
      continue;
    }

    await upsertById(
      Interview,
      interview.id,
      {
        applicationId:
          interview.applicationId ??
          null,
        userId:
          interview.userId ?? null,
        recruiterId:
          interview.recruiterId ??
          interview.createdBy ??
          null,
        scheduledAt:
          dateOrNull(
            interview.startsAt ??
            interview.scheduledAt
          ),
        mode:
          interview.mode ?? null,
        location:
          interview.location ?? null,
        notes:
          interview.notes ?? null,
        status:
          interview.status ||
          'scheduled',
        attributes: {
          ...restOf(
            interview,
            INTERVIEW_FIELDS
          ),
          ...(
            interview.attributes ||
            {}
          ),
          durationMinutes:
            interview.durationMinutes ??
            60
        },
        createdAt:
          nowIfMissing(
            interview.createdAt
          ),
        updatedAt:
          nowIfMissing(
            interview.updatedAt
          )
      }
    );

    interviews += 1;
  }

  report.interviews = interviews;

  let events = 0;

  for (
    const event of
    data.events || []
  ) {
    if (
      !event.id ||
      !userIds.has(
        String(event.userId)
      )
    ) {
      continue;
    }

    await upsertById(
      CalendarEvent,
      event.id,
      {
        userId:
          String(event.userId),
        title:
          event.title ?? null,
        eventDate:
          event.date || null,
        eventTime:
          event.time ?? null,
        type:
          event.type ?? null,
        notes:
          event.notes ?? null,
        attributes: {
          ...restOf(
            event,
            EVENT_FIELDS
          ),
          ...(
            event.attributes ||
            {}
          )
        },
        createdAt:
          nowIfMissing(
            event.createdAt
          ),
        updatedAt:
          nowIfMissing(
            event.updatedAt
          )
      }
    );

    events += 1;
  }

  report.calendarEvents = events;

  const jobById = new Map(
    (data.jobs || []).map(
      (job) => [
        String(job.id),
        job
      ]
    )
  );

  let saved = 0;

  for (
    const [userId, jobIds] of
    Object.entries(
      data.savedJobIdsByUser ||
      {}
    )
  ) {
    if (
      !userIds.has(String(userId))
    ) {
      continue;
    }

    for (const jobId of jobIds || []) {
      const id = compoundId(
        userId,
        jobId
      );

      await upsertById(
        SavedJob,
        id,
        {
          userId: String(userId),
          jobId: String(jobId),
          jobSnapshot:
            jobById.get(
              String(jobId)
            ) || null,
          savedAt: new Date()
        }
      );

      saved += 1;
    }
  }

  report.savedJobs = saved;

  let statuses = 0;

  for (
    const [userId, statusMap] of
    Object.entries(
      data.jobStatusesByUser ||
      {}
    )
  ) {
    if (
      !userIds.has(String(userId))
    ) {
      continue;
    }

    for (
      const [jobId, status] of
      Object.entries(statusMap || {})
    ) {
      const id = compoundId(
        userId,
        jobId
      );

      await upsertById(
        JobStatus,
        id,
        {
          userId: String(userId),
          jobId: String(jobId),
          status: String(status),
          updatedAt: new Date()
        }
      );

      statuses += 1;
    }
  }

  report.jobStatuses = statuses;

  let settings = 0;

  for (
    const [userId, userSetting] of
    Object.entries(
      data.userSettings || {}
    )
  ) {
    if (
      !userIds.has(String(userId))
    ) {
      continue;
    }

    await upsertById(
      UserSettings,
      userId,
      {
        userId: String(userId),
        settings:
          userSetting || {},
        updatedAt: new Date()
      }
    );

    settings += 1;
  }

  report.userSettings = settings;

  let pendingEmails = 0;

  for (
    const pending of
    data.pendingEmailChanges || []
  ) {
    if (
      !pending.id ||
      !userIds.has(
        String(pending.userId)
      ) ||
      !pending.tokenHash ||
      !pending.expiresAt
    ) {
      continue;
    }

    await upsertById(
      PendingEmailChange,
      pending.id,
      {
        userId:
          String(pending.userId),
        newEmail:
          String(
            pending.newEmail || ''
          ).toLowerCase(),
        tokenHash:
          pending.tokenHash,
        expiresAt:
          new Date(
            pending.expiresAt
          ),
        createdAt:
          nowIfMissing(
            pending.createdAt
          )
      }
    );

    pendingEmails += 1;
  }

  report.pendingEmailChanges =
    pendingEmails;

  let gmail = 0;

  for (
    const [userId, account] of
    Object.entries(
      data.gmailAccounts || {}
    )
  ) {
    if (
      !userIds.has(String(userId))
    ) {
      continue;
    }

    await upsertById(
      GmailAccount,
      userId,
      {
        userId: String(userId),
        tokens:
          account?.tokens || null,
        status:
          account?.status || {},
        updatedAt: new Date()
      }
    );

    gmail += 1;
  }

  report.gmailAccounts = gmail;

  let rolePermissions = 0;

  const permissionEntries =
    Array.isArray(
      data.rolePermissions
    )
      ? data.rolePermissions.map(
          (entry) => [
            entry.role,
            entry.permissions
          ]
        )
      : Object.entries(
          data.rolePermissions || {}
        );

  for (
    const [
      role,
      requestedPermissions
    ] of permissionEntries
  ) {
    const permissions =
      normalizedRolePermissions(
        role,
        requestedPermissions
      );

    if (!permissions) {
      continue;
    }

    await upsertById(
      RolePermission,
      role,
      {
        role,
        permissions,
        updatedBy:
          'legacy-import',
        updatedAt: new Date()
      }
    );

    rolePermissions += 1;
  }

  report.rolePermissions =
    rolePermissions;

  let sourceHealth = 0;

  for (
    const entry of
    data.jobSourceHealth || []
  ) {
    if (!entry.source) {
      continue;
    }

    await upsertById(
      JobSourceHealth,
      entry.source,
      {
        source:
          String(entry.source),
        ok:
          entry.ok ?? null,
        lastSuccessAt:
          dateOrNull(
            entry.lastSuccessAt
          ),
        lastError:
          entry.lastError ??
          entry.error ??
          null,
        lastCount:
          entry.lastCount ??
          entry.count ??
          null,
        updatedAt:
          nowIfMissing(
            entry.updatedAt
          )
      }
    );

    sourceHealth += 1;
  }

  report.jobSourceHealth =
    sourceHealth;

  let platformSettings = 0;

  const platformSettingEntries =
    Array.isArray(
      data.platformSettings
    )
      ? data.platformSettings.map(
          (entry) => [
            entry.key,
            entry.value
          ]
        )
      : Object.entries(
          data.platformSettings ||
          {}
        );

  for (
    const [key, value] of
    platformSettingEntries
  ) {
    if (!key) {
      continue;
    }

    await upsertById(
      PlatformSetting,
      key,
      {
        key: String(key),
        value: value || {},
        updatedBy:
          'legacy-import',
        updatedAt: new Date()
      }
    );

    platformSettings += 1;
  }

  report.platformSettings =
    platformSettings;

  let documents = 0;

  for (
    const document of
    data.documents || []
  ) {
    if (
      !document.id ||
      !userIds.has(
        String(document.ownerId)
      ) ||
      !document.originalName ||
      !document.storedName
    ) {
      continue;
    }

    await upsertById(
      StoredDocument,
      document.id,
      {
        ownerId:
          String(document.ownerId),
        kind:
          document.kind || 'resume',
        originalName:
          document.originalName,
        storedName:
          document.storedName,
        mimeType:
          document.mimeType ?? null,
        sizeBytes:
          document.sizeBytes ??
          null,
        createdAt:
          nowIfMissing(
            document.createdAt
          ),
        ...restOf(
          document,
          DOCUMENT_FIELDS
        )
      }
    );

    documents += 1;
  }

  report.documents = documents;

  const normalUsers = (
    data.users || []
  ).filter(
    (user) =>
      user.role === 'user'
  );

  if (normalUsers.length === 1) {
    const legacyUser =
      normalUsers[0];

    const userId = String(
      legacyUser.id
    );

    for (
      const jobId of
      data.savedJobIds || []
    ) {
      await upsertById(
        SavedJob,
        compoundId(
          userId,
          jobId
        ),
        {
          userId,
          jobId:
            String(jobId),
          jobSnapshot:
            jobById.get(
              String(jobId)
            ) || null,
          savedAt: new Date()
        }
      );
    }

    for (
      const [jobId, status] of
      Object.entries(
        data.jobStatuses || {}
      )
    ) {
      await upsertById(
        JobStatus,
        compoundId(
          userId,
          jobId
        ),
        {
          userId,
          jobId:
            String(jobId),
          status:
            String(status),
          updatedAt:
            new Date()
        }
      );
    }

    if (data.settings) {
      await upsertById(
        UserSettings,
        userId,
        {
          userId,
          settings:
            data.settings,
          updatedAt:
            new Date()
        }
      );
    }

    if (data.gmailTokens) {
      await upsertById(
        GmailAccount,
        userId,
        {
          userId,
          tokens:
            data.gmailTokens,
          status:
            data.gmailStatus ||
            {},
          updatedAt:
            new Date()
        }
      );
    }

    report.legacyFieldsAttributedTo =
      legacyUser.email;
  } else {
    report.legacyFieldsSkipped = {
      savedJobIds:
        (
          data.savedJobIds ||
          []
        ).length,
      jobStatuses:
        Object.keys(
          data.jobStatuses ||
          {}
        ).length,
      gmailTokens:
        data.gmailTokens ? 1 : 0,
      reason:
        `${normalUsers.length} user-role accounts exist; ` +
        'legacy ownership is ambiguous'
    };
  }

  return report;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const raw = await fs.readFile(
      path.join(
        __dirname,
        '..',
        'db.json'
      ),
      'utf8'
    );

    const data = JSON.parse(raw);

    const report =
      await importDbJson(data);

    console.log(
      'Import complete:'
    );

    console.log(
      JSON.stringify(
        report,
        null,
        2
      )
    );
  } finally {
    await disconnectMongo().catch(
      () => {}
    );
  }
}