// Document (resume) upload + permission-checked download (Step 5c).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import {
  insertDocument, findDocumentById, listDocuments, deleteDocument, newId,
  findApplicationById, listApplications, addAuditLog,
  listSavedJobs, getUserSettingsRow
} from '../repos.js';
import { requireAuth, requireRole } from '../security.js';
import { getJob } from '../jobCache.js';
import { buildTailoredResume, tailoredFileName } from '../resumeBuilder.js';
import { verifyResumeFile, removeFile } from '../fileGuard.js';
import { scanFile } from '../virusScan.js';
import { scoreJob } from '../ats.js';
import { geminiConfigured } from '../gemini.js';
import { analyzeResume, rewriteResume } from '../resumeAI.js';
import { parseResumeLocally } from '../resumeParse.js';
import { buildResumeDocx } from '../docxBuilder.js';
import { rewriteDocxPreserveFormat } from '../docxRewrite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const EXT_BY_MIME = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = EXT_BY_MIME[file.mimetype] || 'bin';
      cb(null, `${newId('doc')}.${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Only PDF or Word documents are allowed.'));
    }
    cb(null, true);
  }
});

// Whether the requester may download a given document.
async function canAccessDocument(user, doc) {
  if (!doc) return false;
  if (doc.ownerId === user.id) return true;
  // Admins and Super Admins may view any candidate document.
  if (user.permissions?.includes('application:all:view')) return true;
  // A recruiter may view the resume of a candidate whose application is
  // assigned to them.
  if (user.role === 'recruiter') {
    const assigned = await listApplications({ recruiterId: user.id, kind: 'internal' });
    return assigned.some((a) => a.userId === doc.ownerId);
  }
  return false;
}

export default function registerDocumentRoutes(app) {
  // Upload / replace the current user's resume.
  app.post(
    '/api/profile/resume',
    requireAuth,
    requireRole('user'),
    (req, res) => {
      upload.single('resume')(req, res, async (err) => {
        if (err) return res.status(400).json({ message: err.message });
        if (!req.file) return res.status(400).json({ message: 'No file was uploaded.' });

        // Verify the file's REAL content, not just its declared type. A renamed
        // executable or script is caught here and deleted before anything is saved.
        const verdict = verifyResumeFile(path.join(UPLOAD_DIR, req.file.filename));
        if (!verdict.ok) {
          removeFile(path.join(UPLOAD_DIR, req.file.filename));
          return res.status(400).json({ message: verdict.reason });
        }

        // Antivirus scan (only runs when CLAMAV_ENABLED=true).
        const scan = await scanFile(path.join(UPLOAD_DIR, req.file.filename));
        if (!scan.ok) {
          removeFile(path.join(UPLOAD_DIR, req.file.filename));
          return res.status(400).json({ message: scan.reason });
        }

        // Remove previous resumes (keep one current resume per user).
        const previous = await listDocuments(req.user.id, 'resume');
        for (const old of previous) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, old.storedName)); } catch { /* ignore */ }
          await deleteDocument(old.id);
        }

        const doc = await insertDocument({
          id: newId('doc'),
          ownerId: req.user.id,
          kind: 'resume',
          originalName: req.file.originalname,
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size
        });

        await addAuditLog({
          actorId: req.user.id, actorRole: req.user.role,
          action: 'RESUME_UPLOADED', targetUserId: req.user.id,
          metadata: { documentId: doc.id }
        });

        return res.status(201).json({
          message: 'Resume uploaded.',
          document: { id: doc.id, originalName: doc.originalName, sizeBytes: doc.sizeBytes, createdAt: doc.createdAt }
        });
      });
    }
  );

  // List the current user's resume(s).
  app.get(
    '/api/profile/resume',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const docs = await listDocuments(req.user.id, 'resume');
      return res.json({
        documents: docs.map((d) => ({
          id: d.id, originalName: d.originalName, sizeBytes: d.sizeBytes, createdAt: d.createdAt
        }))
      });
    }
  );

  // Analyze the current user's uploaded resume with Gemini and return fields to
  // auto-fill the professional profile (title, experience, skills, summary...).
  app.post(
    '/api/profile/resume/analyze',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const docs = await listDocuments(req.user.id, 'resume');
      const resume = docs[0];

      if (!resume) {
        return res.status(400).json({ message: 'Upload a resume first.' });
      }

      const filePath = path.join(UPLOAD_DIR, resume.storedName);
      const mimeType = resume.mimeType || '';

      let aiFields = null;
      let aiError = '';

      // Preferred path: Gemini. Any failure here is recoverable — we fall
      // through to the offline parser rather than returning nothing.
      if (geminiConfigured()) {
        try {
          aiFields = await analyzeResume(filePath, mimeType);
        } catch (error) {
          aiError = error.message || 'Gemini call failed.';
          console.error('Resume analyze (Gemini) failed:', aiError);
        }
      } else {
        aiError = 'GEMINI_API_KEY is not set.';
      }

      // Offline parser: runs when AI is unavailable, and also alongside it so
      // any field the AI left blank can still be filled.
      let localFields = null;
      try {
        localFields = await parseResumeLocally(filePath, mimeType);
      } catch (error) {
        console.error('Resume analyze (local) failed:', error.message);
      }

      if (!aiFields && (!localFields || localFields._empty)) {
        return res.status(422).json({
          message:
            'Could not read any text from this resume. If it is a scanned image, ' +
            'upload a text-based PDF or DOCX instead.',
          detail: aiError || undefined
        });
      }

      // Merge: AI wins where it produced a value, local fills the gaps.
      const pick = (key) => {
        const fromAi = aiFields ? aiFields[key] : null;
        if (Array.isArray(fromAi) ? fromAi.length : fromAi) return fromAi;
        return localFields ? localFields[key] : null;
      };

      const fields = {
        professionalTitle: pick('professionalTitle') || '',
        experienceYears: Number(pick('experienceYears')) || 0,
        skills: pick('skills') || [],
        professionalSummary: pick('professionalSummary') || '',
        location: pick('location') || '',
        phone: pick('phone') || ''
      };

      const source = aiFields ? 'ai' : 'local';

      return res.json({
        message:
          source === 'ai'
            ? 'Resume analyzed.'
            : 'Resume read offline — review the details before saving.',
        source,
        fields,
        // Surfaced so a misconfigured key is visible instead of silent.
        detail: source === 'local' && aiError ? aiError : undefined
      });
    }
  );

  // My Resumes — every document the current user owns: the base resume plus any
  // job-tailored versions, newest first.
  app.get(
    '/api/documents',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const docs = await listDocuments(req.user.id);

      const documents = docs.map((d) => ({
        id: d.id,
        kind: d.kind,
        originalName: d.originalName,
        sizeBytes: d.sizeBytes,
        label: d.label,
        matchScore: d.matchScore,
        jobTitle: d.jobTitle,
        company: d.company,
        createdAt: d.createdAt
      }));

      return res.json({
        documents,
        baseResume: documents.find((d) => d.kind === 'resume') || null,
        tailored: documents.filter((d) => d.kind === 'tailored')
      });
    }
  );


  // Match analysis for one job — powers the "Your AI match" panel.
  // Read-only: computes the score, never writes a document.
  app.post(
    '/api/documents/match',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      try {
        const jobId = String(req.body.jobId || '');
        if (!jobId) {
          return res.status(400).json({ message: 'A job must be selected.' });
        }

        const saved = await listSavedJobs(req.user.id);
        const savedEntry = saved.find((item) => String(item.jobId) === jobId);
        const job = savedEntry?.snapshot || getJob(jobId) || req.body.job;

        if (!job) {
          return res.status(404).json({ message: 'This job is no longer available.' });
        }

        const profile = await getUserSettingsRow(req.user.id);
        const hasProfile =
          String(profile?.skills || '').trim() || profile?.professionalTitle;

        if (!hasProfile) {
          return res.status(400).json({
            message: 'Add your skills and target role in Profile & Resume first.',
            needsProfile: true
          });
        }

        const result = scoreJob(
          { ...profile, name: profile.name || req.user.name, email: req.user.email },
          job
        );

        return res.json({
          score: result.score,
          breakdown: result.breakdown,
          matched: result.matched,
          missing: result.missing,
          bonus: result.bonus,
          blockers: result.blockers || [],
          reasons: result.reasons,
          requestedCount: result.requestedCount,
          job: { title: job.title, company: job.company, location: job.location }
        });
      } catch (error) {
        console.error('Match analysis failed:', error);
        return res.status(500).json({ message: 'Unable to analyse this job right now.' });
      }
    }
  );

  // Resume Rewrite — generate a resume tailored to ONE saved job.
  //
  // Only SAVED jobs qualify: once an application has been submitted, tailoring
  // the resume serves no purpose. This is enforced here, not just hidden in the
  // UI. Re-running for the same job REPLACES the previous tailored file rather
  // than piling up near-identical copies.
  app.post(
    '/api/documents/rewrite',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      try {
        const jobId = String(req.body.jobId || '');

        if (!jobId) {
          return res.status(400).json({ message: 'A job must be selected.' });
        }

        // The job must be in the user's saved list.
        const saved = await listSavedJobs(req.user.id);
        const savedEntry = saved.find((item) => String(item.jobId) === jobId);

        if (!savedEntry) {
          return res.status(400).json({
            message: 'Save this job first. Rewrite is only available for saved jobs.'
          });
        }

        // Already applied to it? Then rewriting is pointless.
        const applications = await listApplications({ userId: req.user.id });
        if (applications.some((application) => String(application.jobId) === jobId)) {
          return res.status(400).json({
            message: 'You have already applied to this job, so it cannot be rewritten.'
          });
        }

        const job = savedEntry.snapshot || getJob(jobId);

        if (!job) {
          return res.status(404).json({
            message: 'This job is no longer available to tailor against.'
          });
        }

        const profile = await getUserSettingsRow(req.user.id);
        const hasProfile =
          String(profile?.skills || '').trim() || profile?.professionalTitle;

        if (!hasProfile) {
          return res.status(400).json({
            message:
              'Add your skills and target role in Profile & Resume before rewriting.'
          });
        }

        const profileForResume = {
          ...profile,
          name: profile.name || req.user.name,
          email: req.user.email
        };

        // ATS score stays the keyword formula (kept, now meaningful once skills exist).
        const { score, matched, missing } = scoreJob(profileForResume, job);

        // Preferred path: Gemini rewrites the wording of the user's OWN uploaded
        // resume, preserving its original .docx layout. Falls back to a clean
        // template, then to the legacy PDF, so it never hard-fails.
        const baseDocs = await listDocuments(req.user.id, 'resume');
        const baseResume = baseDocs[0] || null;

        let buffer = null;
        let mimeType = 'application/pdf';
        let ext = 'pdf';

        if (geminiConfigured() && baseResume) {
          const basePath = path.join(UPLOAD_DIR, baseResume.storedName);
          const baseMime = baseResume.mimeType || '';
          try {
            if (baseMime === DOCX_MIME) {
              ({ buffer } = await rewriteDocxPreserveFormat(basePath, profileForResume, job));
            } else {
              const structured = await rewriteResume(profileForResume, job, basePath, baseMime);
              buffer = await buildResumeDocx(structured);
            }
            mimeType = DOCX_MIME;
            ext = 'docx';
          } catch (aiError) {
            console.error('Gemini rewrite failed, using template:', aiError.message);
            buffer = null;
          }
        }

        if (!buffer) {
          const built = await buildTailoredResume(profileForResume, job);
          buffer = built.buffer;
          mimeType = 'application/pdf';
          ext = 'pdf';
        }

        // Replace any previous tailored resume for this same job.
        const existing = await listDocuments(req.user.id, 'tailored');
        for (const old of existing.filter((d) => d.sourceJobId === jobId)) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, old.storedName)); } catch { /* ignore */ }
          await deleteDocument(old.id);
        }

        const documentId = newId('doc');
        const storedName = `${documentId}.${ext}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buffer);

        const safePart = (value) =>
          String(value || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const originalName =
          `${safePart(profileForResume.name || 'Resume')}_${safePart(job.title || 'Role')}_${score}pct.${ext}`;

        const created = await insertDocument({
          id: documentId,
          ownerId: req.user.id,
          kind: 'tailored',
          originalName,
          storedName,
          mimeType,
          sizeBytes: buffer.length,
          label: `${score}% match · ${job.title || 'Role'}${
            job.company ? ` @ ${job.company}` : ''
          }`,
          matchScore: score,
          jobTitle: job.title || null,
          company: job.company || null,
          sourceJobId: jobId
        });

        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'RESUME_TAILORED',
          targetUserId: req.user.id,
          metadata: { documentId: created.id, jobId, score }
        });

        return res.status(201).json({
          message: `Resume tailored for ${job.title || 'this role'} (${score}% match).`,
          document: {
            id: created.id,
            originalName: created.originalName,
            matchScore: score,
            label: created.label,
            sizeBytes: created.sizeBytes
          },
          matched,
          missing
        });
      } catch (error) {
        console.error('Resume rewrite failed:', error);
        return res.status(500).json({ message: 'Unable to tailor the resume right now.' });
      }
    }
  );

  // Delete one of the current user's own documents.
  app.delete(
    '/api/documents/:documentId',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const doc = await findDocumentById(String(req.params.documentId));

      if (!doc || doc.ownerId !== req.user.id) {
        return res.status(404).json({ message: 'Document not found.' });
      }

      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, doc.storedName));
      } catch {
        // The database record is still removed if the file is already gone.
      }

      await deleteDocument(doc.id);

      await addAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'DOCUMENT_DELETED',
        targetUserId: req.user.id,
        metadata: { documentId: doc.id, kind: doc.kind }
      });

      return res.json({ message: 'Document deleted.' });
    }
  );

  // Permission-checked download (any authenticated role; access decided in code).
  app.get(
    '/api/documents/:documentId/download',
    requireAuth,
    async (req, res) => {
      const doc = await findDocumentById(String(req.params.documentId));
      if (!doc) return res.status(404).json({ message: 'Document not found.' });

      if (!(await canAccessDocument(req.user, doc))) {
        return res.status(403).json({ message: 'You do not have access to this document.' });
      }

      const filePath = path.join(UPLOAD_DIR, doc.storedName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'The stored file is missing.' });
      }

      await addAuditLog({
        actorId: req.user.id, actorRole: req.user.role,
        action: 'DOCUMENT_DOWNLOADED', targetUserId: doc.ownerId,
        metadata: { documentId: doc.id }
      });

      res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
      // Force a download and stop the browser from re-sniffing the content type,
      // so a document can never be treated as an executable page.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `attachment; filename="${doc.originalName.replace(/[^a-zA-Z0-9.\-_ ]/g, '')}"`);
      return fs.createReadStream(filePath).pipe(res);
    }
  );
}
