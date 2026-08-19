// "My Recruiter" — job postings created by the recruiter this candidate is
// assigned to. Applying here records an internal application, which is what
// puts the person into that recruiter's pipeline.
import { useState, useEffect } from 'react';
import { Building2, ExternalLink, Bookmark, CheckCircle2, Mail, Phone } from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import {
  PageHeader, Card, Pill, EmptyState, KpiCard,
  btnClass, btnPrimaryClass
} from '../../components/ui.jsx';
import { formatMoney } from '../../lib/constants.js';

function salaryLabel(job) {
  const min = Number(job.minSalary || 0);
  const max = Number(job.maxSalary || 0);
  if (!min && !max) return 'Not listed';
  if (min && max) return `${formatMoney(min)} – ${formatMoney(max)}`;
  return formatMoney(min || max);
}

function postedLabel(job) {
  const value = job.postedAt || job.createdAt;
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 30) return `Posted ${days} days ago`;
  return `Posted ${date.toLocaleDateString()}`;
}

function RecruiterJobsPage({ showToast, onDashboardChange }) {
  const [recruiter, setRecruiter] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [counts, setCounts] = useState({ total: 0, open: 0, applied: 0 });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [openJobId, setOpenJobId] = useState('');
  const [busyId, setBusyId] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest('/api/my-recruiter/jobs');
      setRecruiter(data.recruiter || null);
      setJobs(data.jobs || []);
      setCounts(data.counts || { total: 0, open: 0, applied: 0 });
      setMessage(data.message || '');
    } catch (error) {
      showToast(error.message || 'Unable to load your recruiter\'s jobs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function apply(job) {
    setBusyId(job.id);
    try {
      await apiRequest(`/api/applications/${job.id}`, {
        method: 'POST',
        body: { job, status: 'Applied' }
      });
      showToast(`Applied to ${job.title}. Your recruiter can now see it.`);
      await load();
      if (onDashboardChange) await onDashboardChange();
    } catch (error) {
      showToast(error.message || 'Unable to record the application.');
    } finally {
      setBusyId('');
    }
  }

  async function toggleSave(job) {
    try {
      await apiRequest(`/api/saved/${job.id}`, { method: 'POST' });
      await load();
      if (onDashboardChange) await onDashboardChange();
    } catch (error) {
      showToast(error.message || 'Unable to update saved jobs.');
    }
  }

  if (loading) {
    return (
      <section>
        <PageHeader title="My Recruiter" subtitle="Roles posted by your recruiter." />
        <Card><EmptyState text="Loading..." /></Card>
      </section>
    );
  }

  // Nobody assigned, or the recruiter account is gone.
  if (!recruiter) {
    return (
      <section>
        <PageHeader title="My Recruiter" subtitle="Roles posted by your recruiter." />
        <Card title="No recruiter yet">
          <p className="text-[13px] leading-6 text-slate-500">
            {message || 'No recruiter has been assigned to you yet.'}
          </p>
          <p className="mt-2 text-[13px] leading-6 text-slate-500">
            An administrator assigns each candidate to a recruiter. Once that
            happens, the roles they post appear here — and you can keep using
            Job Search in the meantime.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title="My Recruiter"
        subtitle={`Roles posted by ${recruiter.name}${
          recruiter.company ? ` at ${recruiter.company}` : ''
        }.`}
      />

      <div className="mb-4 grid gap-3.5 md:grid-cols-3">
        <KpiCard label="Open roles" value={counts.open} icon={Building2} tone="blue" />
        <KpiCard label="All postings" value={counts.total} icon={Bookmark} tone="slate" />
        <KpiCard
          label="You applied to"
          value={counts.applied}
          icon={CheckCircle2}
          tone={counts.applied ? 'green' : 'slate'}
        />
      </div>

      <Card
        title={`${recruiter.name}'s postings`}
        hint="Applying here puts you straight into your recruiter's pipeline."
      >
        {jobs.length ? (
          jobs.map((job) => {
            const isOpen = openJobId === job.id;

            return (
              <div
                key={job.id}
                className="mb-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">{job.title}</p>
                      <Pill tone={job.status === 'open' ? 'green' : 'slate'}>{job.status}</Pill>
                      {job.applied && <Pill tone="violet">Applied</Pill>}
                      {job.saved && !job.applied && <Pill tone="amber">Saved</Pill>}
                    </div>

                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {[job.location, job.workMode, job.jobType].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-slate-400">
                      {[salaryLabel(job), postedLabel(job)].filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      className={btnClass}
                      onClick={() => setOpenJobId(isOpen ? '' : job.id)}
                    >
                      {isOpen ? 'Hide details' : 'View details'}
                    </button>

                    {!job.applied && (
                      <button className={btnClass} onClick={() => toggleSave(job)}>
                        {job.saved ? 'Unsave' : 'Save'}
                      </button>
                    )}

                    {job.status === 'open' && !job.applied && (
                      <button
                        className={btnPrimaryClass}
                        disabled={busyId === job.id}
                        onClick={() => apply(job)}
                      >
                        {busyId === job.id ? 'Applying...' : 'Apply'}
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3.5">
                    <p className="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
                      Job description
                    </p>
                    <p className="whitespace-pre-line text-[13px] leading-6 text-slate-600">
                      {job.description || 'No description was provided for this role.'}
                    </p>

                    {job.experienceRequirement && (
                      <p className="mt-2.5 text-[12.5px] text-slate-500">
                        <span className="font-bold text-slate-700">Experience:</span>{' '}
                        {job.experienceRequirement}
                      </p>
                    )}

                    {(job.recruiterEmail || job.recruiterPhone) && (
                      <div className="mt-3 rounded-xl bg-slate-50 p-3">
                        <p className="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
                          Contact
                        </p>
                        {job.recruiterEmail && (
                          <a
                            href={`mailto:${job.recruiterEmail}`}
                            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-violet-700 hover:underline"
                          >
                            <Mail size={13} /> {job.recruiterEmail}
                          </a>
                        )}
                        {job.recruiterPhone && (
                          <a
                            href={`tel:${job.recruiterPhone.replace(/[^0-9+]/g, '')}`}
                            className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-violet-700 hover:underline"
                          >
                            <Phone size={13} /> {job.recruiterPhone}
                          </a>
                        )}
                      </div>
                    )}

                    {job.url && (
                      <button
                        className={`${btnClass} mt-3`}
                        onClick={() => window.open(job.url, '_blank', 'noopener,noreferrer')}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          Open original posting <ExternalLink size={13} />
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <EmptyState text={`${recruiter.name} has not posted any roles yet.`} />
        )}
      </Card>
    </section>
  );
}

export {
  RecruiterJobsPage
};
