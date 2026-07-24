// Internal-application helpers using the MongoDB-backed repository layer.
import { findUserById, getUserSettingsRow, listDocuments } from './repos.js';

function isInternalJob(job = {}) {
  return job.isInternal === true || String(job.source || '').toLowerCase() === 'platform';
}

function isInternalApplication(application = {}) {
  return application.applicationType === 'internal' || application.source === 'Platform';
}

async function enrichInternalApplication(application) {
  const candidate = await findUserById(application.userId);
  const profile = candidate ? await getUserSettingsRow(candidate.id) : {};

  // The candidate's uploaded base resume, if any. The download itself is still
  // permission-checked per request in the documents route; this only surfaces
  // the document id so authorised staff have a link to click.
  let resumeDocumentId = null;
  if (candidate) {
    const resumes = await listDocuments(candidate.id, 'resume');
    resumeDocumentId = resumes[0]?.id || null;
  }

  return {
    ...application,
    candidate: candidate
      ? {
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
          phone: profile.phone || '',
          location: profile.location || '',
          resume: profile.resume || profile.resumeUrl || null,
          resumeDocumentId
        }
      : null
  };
}

export { isInternalJob, isInternalApplication, enrichInternalApplication };
