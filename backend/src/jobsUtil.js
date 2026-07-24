// Live job-status and dedupe helpers, extracted from the legacy pipeline in Step 3.
// The dead duplicate job-fetch pipeline (jobsLegacy.js) was removed with approval.

function normalizeValue(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const JOB_STATUS_OPTIONS = [
  'Not Applied',
  'Applied',
  'Under Review',
  'Online Assessment',
  'Technical Interview',
  'Final Interview',
  'Offer',
  'Rejected'
];

function normalizeJobStatus(status = '') {
  const matched = JOB_STATUS_OPTIONS.find(
    (item) => normalizeValue(item) === normalizeValue(status)
  );

  return matched || 'Not Applied';
}



function mergeUniqueJobs(jobs = []) {
  const seen = new Set();
  const unique = [];

  jobs.forEach((job) => {
    const key = `${job.source || ''}-${job.id || ''}-${job.title || ''}-${job.company || ''}`
      .toLowerCase()
      .replace(/\s+/g, '-');

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(job);
    }
  });

  return unique;
}

export {
  JOB_STATUS_OPTIONS,
  normalizeJobStatus,
  mergeUniqueJobs
};
