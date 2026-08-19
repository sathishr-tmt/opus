import mongoose from 'mongoose';

const { Schema } = mongoose;
const Mixed = Schema.Types.Mixed;

const emptyObject = () => ({});
const emptyArray = () => [];
const now = () => new Date();

function createSchema(definition, collection) {
  return new Schema(definition, {
    collection,
    versionKey: false,
    strict: true,
    minimize: false
  });
}

function getModel(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

const userSchema = createSchema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ['user', 'recruiter', 'admin', 'super_admin']
    },
    status: {
      type: String,
      required: true,
      default: 'pending_admin_approval'
    },
    emailVerified: { type: Boolean, required: true, default: false },
    careerGoal: { type: String, default: null },
    experienceYears: { type: Number, default: null },
    company: { type: String, default: null },
    department: { type: String, default: null },
    // Set by an admin: which recruiter looks after this candidate.
    // null means nobody is assigned yet. Only meaningful on role 'user'.
    assignedRecruiterId: { type: String, default: null },
    sessionVersion: { type: Number, required: true, default: 1 },
    emailVerificationTokenHash: { type: String, default: null },
    emailVerificationExpiresAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    declinedBy: { type: String, default: null },
    declinedAt: { type: Date, default: null },
    declineReason: { type: String, default: null },
    attributes: { type: Mixed, default: emptyObject },
    createdAt: { type: Date, required: true, default: now },
    updatedAt: { type: Date, required: true, default: now }
  },
  'users'
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
// Recruiters read their candidate list by this field on every request.
userSchema.index({ assignedRecruiterId: 1 });

const adminInvitationSchema = createSchema(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    tokenHash: { type: String, default: null },
    status: { type: String, required: true, default: 'pending' },
    invitedBy: { type: String, default: null },
    userId: { type: String, default: null },
    createdAt: { type: Date, required: true, default: now },
    expiresAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null }
  },
  'admin_invitations'
);

adminInvitationSchema.index({ email: 1 });

const approvalRequestSchema = createSchema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    requestedRole: { type: String, default: null },
    requiredApproverRole: { type: String, default: null },
    status: { type: String, required: true, default: 'pending' },
    requestedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null }
  },
  'approval_requests'
);

approvalRequestSchema.index({ status: 1 });
approvalRequestSchema.index({ userId: 1 });

const auditLogSchema = createSchema(
  {
    _id: { type: String, required: true },
    actorId: { type: String, default: null },
    actorRole: { type: String, default: null },
    action: { type: String, required: true },
    targetUserId: { type: String, default: null },
    metadata: { type: Mixed, default: emptyObject },
    createdAt: { type: Date, required: true, default: now }
  },
  'audit_logs'
);

auditLogSchema.index({ createdAt: 1 });
auditLogSchema.index({ action: 1 });

const platformJobSchema = createSchema(
  {
    _id: { type: String, required: true },
    recruiterId: { type: String, default: null },
    title: { type: String, required: true },
    company: { type: String, default: null },
    location: { type: String, default: null },
    jobType: { type: String, default: null },
    experienceLevel: { type: String, default: null },
    workMode: { type: String, default: null },
    minSalary: { type: Number, default: null },
    maxSalary: { type: Number, default: null },
    skills: { type: [String], default: emptyArray },
    description: { type: String, default: null },
    status: { type: String, required: true, default: 'open' },
    source: { type: String, required: true, default: 'Platform' },
    postedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    attributes: { type: Mixed, default: emptyObject },
    createdAt: { type: Date, required: true, default: now },
    updatedAt: { type: Date, required: true, default: now }
  },
  'platform_jobs'
);

platformJobSchema.index({ recruiterId: 1 });
platformJobSchema.index({ status: 1 });

const applicationSchema = createSchema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    jobId: { type: String, default: null },
    kind: {
      type: String,
      required: true,
      enum: ['external', 'internal']
    },
    title: { type: String, default: null },
    company: { type: String, default: null },
    location: { type: String, default: null },
    url: { type: String, default: null },
    source: { type: String, default: null },
    status: { type: String, required: true, default: 'Applied' },
    recruiterId: { type: String, default: null },
    recruiterNotes: { type: String, default: '' },
    appliedAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null },
    attributes: { type: Mixed, default: emptyObject }
  },
  'applications'
);

applicationSchema.index({ userId: 1 });
applicationSchema.index({ recruiterId: 1 });
applicationSchema.index({ kind: 1 });
applicationSchema.index({ status: 1 });

const interviewSchema = createSchema(
  {
    _id: { type: String, required: true },
    applicationId: { type: String, default: null },
    userId: { type: String, default: null },
    recruiterId: { type: String, default: null },
    scheduledAt: { type: Date, default: null },
    mode: { type: String, default: null },
    location: { type: String, default: null },
    notes: { type: String, default: null },
    status: { type: String, required: true, default: 'scheduled' },
    attributes: { type: Mixed, default: emptyObject },
    createdAt: { type: Date, required: true, default: now },
    updatedAt: { type: Date, required: true, default: now }
  },
  'interviews'
);

interviewSchema.index({ applicationId: 1 });
interviewSchema.index({ recruiterId: 1 });

const calendarEventSchema = createSchema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    title: { type: String, default: null },
    eventDate: { type: String, default: null },
    eventTime: { type: String, default: null },
    type: { type: String, default: null },
    notes: { type: String, default: null },
    attributes: { type: Mixed, default: emptyObject },
    createdAt: { type: Date, required: true, default: now },
    updatedAt: { type: Date, required: true, default: now }
  },
  'calendar_events'
);

calendarEventSchema.index({ userId: 1 });
calendarEventSchema.index({ eventDate: 1 });

const savedJobSchema = createSchema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    jobId: { type: String, required: true },
    jobSnapshot: { type: Mixed, default: null },
    savedAt: { type: Date, required: true, default: now }
  },
  'saved_jobs'
);

savedJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });

const jobStatusSchema = createSchema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    jobId: { type: String, required: true },
    status: { type: String, required: true },
    updatedAt: { type: Date, required: true, default: now }
  },
  'job_statuses'
);

jobStatusSchema.index({ userId: 1, jobId: 1 }, { unique: true });

const userSettingsSchema = createSchema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    settings: { type: Mixed, default: emptyObject },
    updatedAt: { type: Date, required: true, default: now }
  },
  'user_settings'
);

userSettingsSchema.index({ userId: 1 }, { unique: true });

const pendingEmailChangeSchema = createSchema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    newEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true, default: now }
  },
  'pending_email_changes'
);

pendingEmailChangeSchema.index({ userId: 1 });
pendingEmailChangeSchema.index({ tokenHash: 1 });

const gmailAccountSchema = createSchema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    tokens: { type: Mixed, default: null },
    status: { type: Mixed, default: emptyObject },
    updatedAt: { type: Date, required: true, default: now }
  },
  'gmail_accounts'
);

gmailAccountSchema.index({ userId: 1 }, { unique: true });

const rolePermissionSchema = createSchema(
  {
    _id: { type: String, required: true },
    role: { type: String, required: true },
    permissions: { type: [String], default: emptyArray },
    updatedBy: { type: String, default: null },
    updatedAt: { type: Date, required: true, default: now }
  },
  'role_permissions'
);

rolePermissionSchema.index({ role: 1 }, { unique: true });

const jobSourceHealthSchema = createSchema(
  {
    _id: { type: String, required: true },
    source: { type: String, required: true },
    ok: { type: Boolean, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    lastCount: { type: Number, default: null },
    updatedAt: { type: Date, required: true, default: now }
  },
  'job_source_health'
);

jobSourceHealthSchema.index({ source: 1 }, { unique: true });

const platformSettingSchema = createSchema(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true },
    value: { type: Mixed, default: emptyObject },
    updatedBy: { type: String, default: null },
    updatedAt: { type: Date, required: true, default: now }
  },
  'platform_settings'
);

platformSettingSchema.index({ key: 1 }, { unique: true });

const documentSchema = createSchema(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true },
    // 'resume'   = the user's single base resume
    // 'tailored' = a version generated for one specific job posting
    kind: { type: String, required: true, default: 'resume' },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    mimeType: { type: String, default: null },
    sizeBytes: { type: Number, default: null },
    // Metadata used by the My Resumes page for tailored versions.
    label: { type: String, default: null },
    matchScore: { type: Number, default: null },
    jobTitle: { type: String, default: null },
    company: { type: String, default: null },
    sourceJobId: { type: String, default: null },
    createdAt: { type: Date, required: true, default: now }
  },
  'documents'
);

documentSchema.index({ ownerId: 1 });
documentSchema.index({ ownerId: 1, kind: 1 });

const User = getModel('User', userSchema);
const AdminInvitation = getModel(
  'AdminInvitation',
  adminInvitationSchema
);
const ApprovalRequest = getModel(
  'ApprovalRequest',
  approvalRequestSchema
);
const AuditLog = getModel('AuditLog', auditLogSchema);
const PlatformJob = getModel('PlatformJob', platformJobSchema);
const Application = getModel('Application', applicationSchema);
const Interview = getModel('Interview', interviewSchema);
const CalendarEvent = getModel('CalendarEvent', calendarEventSchema);
const SavedJob = getModel('SavedJob', savedJobSchema);
const JobStatus = getModel('JobStatus', jobStatusSchema);
const UserSettings = getModel('UserSettings', userSettingsSchema);
const PendingEmailChange = getModel(
  'PendingEmailChange',
  pendingEmailChangeSchema
);
const GmailAccount = getModel('GmailAccount', gmailAccountSchema);
const RolePermission = getModel(
  'RolePermission',
  rolePermissionSchema
);
const JobSourceHealth = getModel(
  'JobSourceHealth',
  jobSourceHealthSchema
);
const PlatformSetting = getModel(
  'PlatformSetting',
  platformSettingSchema
);
const StoredDocument = getModel('StoredDocument', documentSchema);

const mongoModels = Object.freeze([
  User,
  AdminInvitation,
  ApprovalRequest,
  AuditLog,
  PlatformJob,
  Application,
  Interview,
  CalendarEvent,
  SavedJob,
  JobStatus,
  UserSettings,
  PendingEmailChange,
  GmailAccount,
  RolePermission,
  JobSourceHealth,
  PlatformSetting,
  StoredDocument
]);

export {
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
  UserSettings,
  mongoModels
};
