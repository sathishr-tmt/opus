// Jobs posted by the recruiter a candidate is assigned to.
//
// A job seeker is assigned to one recruiter by an admin. Anything that
// recruiter posts on OPUS should be easy for their own candidates to find,
// rather than buried among the external job feeds.
//
// If nobody is assigned yet, this returns an empty list and says so — the page
// explains the situation instead of looking broken.
import {
  findUserById, listPlatformJobs, listApplications, listSavedJobs
} from '../repos.js';
import { requireAuth, requireRole } from '../security.js';

export default function registerMyRecruiterRoutes(app) {
  app.get(
    '/api/my-recruiter/jobs',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      try {
        const me = await findUserById(req.user.id);
        const recruiterId = me?.assignedRecruiterId || null;

        if (!recruiterId) {
          return res.json({
            recruiter: null,
            jobs: [],
            message: 'No recruiter has been assigned to you yet.'
          });
        }

        const recruiter = await findUserById(recruiterId);

        // A recruiter who was deleted or deactivated should not silently
        // produce an empty page that looks like they posted nothing.
        if (!recruiter || recruiter.role !== 'recruiter') {
          return res.json({
            recruiter: null,
            jobs: [],
            message: 'Your assigned recruiter account is no longer active.'
          });
        }

        const [postings, applications, saved] = await Promise.all([
          listPlatformJobs({ recruiterId }),
          listApplications({ userId: req.user.id }),
          listSavedJobs(req.user.id)
        ]);

        const appliedJobIds = new Set(
          applications.map((application) => String(application.jobId)).filter(Boolean)
        );
        const savedJobIds = new Set(saved.map((entry) => String(entry.jobId)));

        // Open roles first, then most recently posted.
        const jobs = postings
          .map((job) => ({
            ...job,
            applied: appliedJobIds.has(String(job.id)),
            saved: savedJobIds.has(String(job.id))
          }))
          .sort((left, right) => {
            if (left.status !== right.status) return left.status === 'open' ? -1 : 1;
            return (
              new Date(right.postedAt || right.createdAt || 0).getTime() -
              new Date(left.postedAt || left.createdAt || 0).getTime()
            );
          });

        return res.json({
          recruiter: {
            id: recruiter.id,
            name: recruiter.name,
            email: recruiter.email,
            company: recruiter.company || null
          },
          jobs,
          counts: {
            total: jobs.length,
            open: jobs.filter((job) => job.status === 'open').length,
            applied: jobs.filter((job) => job.applied).length
          }
        });
      } catch (error) {
        console.error('My recruiter jobs failed:', error);
        return res.status(500).json({ message: 'Unable to load your recruiter\'s jobs.' });
      }
    }
  );
}
