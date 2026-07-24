// In-memory cache of recently seen external jobs (Step 3b).
// Replaces the old pattern of persisting up to 1,500 cached external jobs
// inside the database. Used to resolve job details when a user saves or
// applies to a job shortly after searching. Bounded and TTL-limited.
// NOTE: per-instance. For multi-instance deployments move to Redis
// (interface kept deliberately small: rememberJobs / getJob).

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_ENTRIES = 5000;

const cache = new Map();

export function rememberJobs(jobs = []) {
  const now = Date.now();
  for (const job of jobs) {
    if (!job?.id) continue;
    cache.set(String(job.id), { job, expiresAt: now + TTL_MS });
  }
  while (cache.size > MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

export function getJob(jobId) {
  const entry = cache.get(String(jobId));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(String(jobId));
    return null;
  }
  return entry.job;
}
