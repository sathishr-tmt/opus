// Unified "my jobs" list.
//
// The user portal shows saved jobs and applied jobs in ONE list:
//   - Dashboard → Recent applications  (newest 6)
//   - My Applications                  (everything, 20 at a time)
//
// Saved jobs and applications live in two different collections, so this module
// merges them into a single, consistently shaped, date-sorted list. Nothing in
// the database changes.

import { listSavedJobs, listApplications } from './repos.js';
import { getJob } from './jobCache.js';
import { attachAtsScores } from './ats.js';

// Statuses that mean "this job was actually submitted".
const APPLIED_STATUSES = [
  'Applied',
  'Under Review',
  'Online Assessment',
  'Technical Interview',
  'Final Interview',
  'Offer',
  'Rejected',
  'Withdrawn'
];

function timeOf(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// One saved job -> unified entry.
function fromSaved(saved) {
  const job = saved.snapshot || getJob(saved.jobId) || {};

  return {
    entryId: `saved:${saved.jobId}`,
    kind: 'saved',
    jobId: String(saved.jobId),
    title: job.title || 'Saved job',
    company: job.company || 'Company not listed',
    location: job.location || '',
    workMode: job.workMode || '',
    jobType: job.jobType || '',
    url: job.url || '',
    description: job.description || '',
    skills: Array.isArray(job.skills) ? job.skills : [],
    status: 'Saved',
    // Saved jobs can still be tailored — they have not been submitted yet.
    canRewrite: true,
    createdAt: saved.createdAt || saved.savedAt || null,
    sortAt: timeOf(saved.createdAt || saved.savedAt)
  };
}

// One application -> unified entry.
function fromApplication(application) {
  const job = application.job || getJob(application.jobId) || {};

  return {
    entryId: `applied:${application.id}`,
    kind: 'applied',
    applicationId: application.id,
    jobId: String(application.jobId || job.id || ''),
    title: application.title || job.title || 'Application',
    company: application.company || job.company || 'Company not listed',
    location: application.location || job.location || '',
    workMode: job.workMode || '',
    jobType: job.jobType || '',
    url: job.url || application.url || '',
    description: job.description || '',
    skills: Array.isArray(job.skills) ? job.skills : [],
    status: application.status || 'Applied',
    // Already submitted — rewriting the resume serves no purpose.
    canRewrite: false,
    createdAt: application.updatedAt || application.appliedAt || null,
    sortAt: timeOf(application.updatedAt || application.appliedAt)
  };
}

/**
 * Build the merged, newest-first list for one user.
 *
 * @param {string} userId
 * @param {object} profile  user settings, used for ATS scores
 * @param {{offset?:number, limit?:number}} page
 */
async function getMyJobs(userId, profile = {}, { offset = 0, limit = 20 } = {}) {
  const [saved, applications] = await Promise.all([
    listSavedJobs(userId),
    listApplications({ userId })
  ]);

  const savedEntries = saved.map(fromSaved);
  const appliedEntries = applications.map(fromApplication);

  // A job that was saved and later applied to should appear once, as applied.
  const appliedJobIds = new Set(
    appliedEntries.map((entry) => entry.jobId).filter(Boolean)
  );

  const merged = [
    ...appliedEntries,
    ...savedEntries.filter((entry) => !appliedJobIds.has(entry.jobId))
  ].sort((left, right) => right.sortAt - left.sortAt);

  const savedCount = merged.filter((entry) => entry.kind === 'saved').length;
  const appliedCount = merged.filter((entry) => entry.kind === 'applied').length;

  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const pageEntries = merged.slice(safeOffset, safeOffset + safeLimit);

  // ATS score is only meaningful for jobs the user has not applied to yet.
  const scored = attachAtsScores(profile, pageEntries).map((entry) =>
    entry.kind === 'applied'
      ? { ...entry, atsScore: null, atsMatched: [], atsMissing: [], atsReasons: [] }
      : entry
  );

  return {
    entries: scored,
    total: merged.length,
    savedCount,
    appliedCount,
    offset: safeOffset,
    limit: safeLimit,
    hasMore: safeOffset + safeLimit < merged.length
  };
}

export {
  getMyJobs,
  APPLIED_STATUSES
};
