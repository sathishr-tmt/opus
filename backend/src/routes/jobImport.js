// Route for importing a job posting from a URL.
//
// Kept in its own file so the recruiter routes stay focused. Rate-limited by
// intent: one import at a time per request, and the AI call inside has its own
// timeout, so a slow or hostile page cannot tie up the server.
import { importJobFromUrl } from '../jobUrlImport.js';
import { requireAuth, requirePermission } from '../security.js';
import { addAuditLog } from '../repos.js';

export default function registerJobImportRoutes(app) {
  app.post(
    '/api/recruiter/jobs/import-url',
    requireAuth,
    requirePermission('posting:own:manage'),
    async (req, res) => {
      const url = String(req.body.url || '').trim();

      if (!url) {
        return res.status(400).json({ message: 'Paste a job posting link first.' });
      }

      try {
        const { fields, warning } = await importJobFromUrl(url);

        await addAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'JOB_POSTING_IMPORTED_FROM_URL',
          metadata: { url, title: fields.title }
        });

        return res.json({
          message: 'Details read from the link. Check them before publishing.',
          fields,
          warning
        });
      } catch (error) {
        // These messages are written to be shown to the recruiter directly.
        console.error('Job URL import failed:', error.message);
        return res.status(422).json({
          message: error.message || 'That link could not be read.'
        });
      }
    }
  );
}
