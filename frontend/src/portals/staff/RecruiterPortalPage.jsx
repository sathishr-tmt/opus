// Recruiter portal — wired to /api/recruiter/* and /api/account/*.
//
// A recruiter sees only the candidates an admin assigned to them. That is
// enforced on the server; this file simply renders what it is given.
import { useState, useEffect } from 'react';
import {
  BriefcaseBusiness, CheckCircle2, Users, CalendarCheck, ArrowLeft, FileText, Link2
} from 'lucide-react';
import { apiRequest, API_BASE } from '../../lib/api.js';
import {
  PageHeader, Card, StatTile, Pill, ListItem, Field, MonthCalendar,
  inputClass, btnClass, btnPrimaryClass, btnSmClass, EmptyState, ExportMenu, KpiCard
} from '../../components/ui.jsx';
import { StatusDonut, RecruitmentFunnel } from '../../components/charts.jsx';
import { AccountPanel } from '../../components/AccountPanel.jsx';

const CANDIDATE_STATUSES = [
  'Applied', 'Under Review', 'Online Assessment', 'Technical Interview',
  'Final Interview', 'Offer', 'Rejected', 'Withdrawn'
];

// Progression order used to build the recruitment funnel from real statuses.
const STATUS_ORDER = {
  Applied: 0, 'Under Review': 1, 'Online Assessment': 2,
  'Technical Interview': 3, 'Final Interview': 4, Offer: 5
};

function formatWhen(startsAt) {
  if (!startsAt) return 'Unscheduled';
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return 'Unscheduled';
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function activeInterview(application) {
  return (application.interviews || []).find(
    (interview) => interview.status !== 'cancelled'
  );
}

function download(documentId) {
  window.open(`${API_BASE}/api/documents/${documentId}/download`, '_blank');
}

function CandidateCard({ application, onStatus, onNotes, onSchedule }) {
  const [note, setNote] = useState(application.recruiterNotes || '');
  const [scheduling, setScheduling] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const interview = activeInterview(application);

  return (
    <div className="mb-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">
            {application.candidate?.name || 'Candidate'}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {application.title}
            {application.candidate?.email ? ` · ${application.candidate.email}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {application.candidate?.resumeDocumentId && (
            <button
              className={btnSmClass}
              onClick={() => download(application.candidate.resumeDocumentId)}
            >
              Resume
            </button>
          )}
          <Pill>{application.status}</Pill>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <select
          value={application.status}
          onChange={(event) => onStatus(application.id, event.target.value)}
          className={`${inputClass} w-[170px]`}
        >
          {CANDIDATE_STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>

        <input
          placeholder="Add a note..."
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            if (note !== (application.recruiterNotes || '')) {
              onNotes(application.id, note);
            }
          }}
          className={`${inputClass} min-w-[160px] flex-1`}
        />

        {interview ? (
          <Pill tone="violet">Interview: {formatWhen(interview.startsAt)}</Pill>
        ) : scheduling ? (
          <span className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              className={inputClass}
            />
            <button
              className={btnPrimaryClass}
              onClick={() => {
                if (!startsAt) return;
                onSchedule(application.id, new Date(startsAt).toISOString());
                setScheduling(false);
              }}
            >
              Confirm
            </button>
            <button className={btnClass} onClick={() => setScheduling(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button className={btnPrimaryClass} onClick={() => setScheduling(true)}>
            Schedule interview
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One candidate in full: profile, resumes, applications, interviews.
 * ------------------------------------------------------------------ */
function CandidateDetail({ userId, showToast, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await apiRequest(`/api/recruiter/candidates/${userId}`);
        setData(result);
      } catch (error) {
        showToast(error.message || 'Unable to load this candidate.');
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  if (loading) {
    return (
      <Card title="Candidate">
        <EmptyState text="Loading candidate..." />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card title="Candidate">
        <EmptyState text="This candidate is not assigned to you." />
        <button className={`${btnClass} mt-3`} onClick={onBack}>
          Back to my candidates
        </button>
      </Card>
    );
  }

  const { candidate, documents = [], applications = [], interviews = [] } = data;
  const skills = String(candidate.skills || '')
    .split(/[,;|\n]/)
    .map((skill) => skill.trim())
    .filter(Boolean);

  return (
    <>
      <button className={`${btnClass} mb-3.5`} onClick={onBack}>
        <span className="inline-flex items-center gap-1.5">
          <ArrowLeft size={14} /> My candidates
        </span>
      </button>

      <Card title={candidate.name} hint={candidate.email}>
        <div className="grid gap-3.5 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-400">Title</p>
            <p className="text-[13px] font-bold text-slate-900">
              {candidate.professionalTitle || 'Not provided'}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-400">Experience</p>
            <p className="text-[13px] font-bold text-slate-900">
              {candidate.experienceYears ? `${candidate.experienceYears} years` : 'Not provided'}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-400">Location</p>
            <p className="text-[13px] text-slate-700">{candidate.location || 'Not provided'}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-400">Work authorization</p>
            <p className="text-[13px] text-slate-700">
              {candidate.workAuthorization || 'Not provided'}
            </p>
          </div>
        </div>

        {skills.length > 0 && (
          <div className="mt-3.5">
            <p className="mb-1.5 text-[11px] font-bold uppercase text-slate-400">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full bg-violet-50 px-2.5 py-1 text-[11.5px] font-semibold text-violet-700"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {candidate.about && (
          <div className="mt-3.5">
            <p className="mb-1 text-[11px] font-bold uppercase text-slate-400">Summary</p>
            <p className="text-[13px] leading-6 text-slate-600">{candidate.about}</p>
          </div>
        )}
      </Card>

      <Card title="Resumes" hint="Base resume plus any versions tailored to a specific job.">
        {documents.length ? (
          documents.map((document) => (
            <ListItem
              key={document.id}
              title={document.originalName}
              meta={
                document.kind === 'tailored'
                  ? [
                      document.matchScore != null ? `${document.matchScore}% match` : null,
                      document.jobTitle,
                      document.company ? `@ ${document.company}` : null
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Base resume'
              }
              right={
                <>
                  {document.matchScore != null && (
                    <Pill tone={document.matchScore >= 65 ? 'green' : 'amber'}>
                      {document.matchScore}%
                    </Pill>
                  )}
                  <button className={btnSmClass} onClick={() => download(document.id)}>
                    <span className="inline-flex items-center gap-1.5">
                      <FileText size={12} /> Download
                    </span>
                  </button>
                </>
              }
            />
          ))
        ) : (
          <EmptyState text="This candidate has not uploaded a resume yet." />
        )}
      </Card>

      <Card title="Applications" hint="Everything this person has applied to.">
        {applications.length ? (
          applications.map((application) => (
            <ListItem
              key={application.id}
              title={application.title || 'Application'}
              meta={[
                application.company,
                application.appliedAt
                  ? new Date(application.appliedAt).toLocaleDateString()
                  : null
              ]
                .filter(Boolean)
                .join(' · ')}
              right={<Pill>{application.status}</Pill>}
            />
          ))
        ) : (
          <EmptyState text="No applications yet." />
        )}
      </Card>

      <Card title="Interviews">
        {interviews.length ? (
          interviews.map((interview) => (
            <ListItem
              key={interview.id}
              title={formatWhen(interview.startsAt)}
              meta={[interview.mode, interview.location].filter(Boolean).join(' · ')}
              right={
                <Pill tone={interview.status === 'cancelled' ? 'red' : 'violet'}>
                  {interview.status}
                </Pill>
              }
            />
          ))
        ) : (
          <EmptyState text="No interviews scheduled." />
        )}
      </Card>
    </>
  );
}

function RecruiterPortalPage({ activePage, currentUser, showToast, setActivePage, onLogout }) {
  const [overview, setOverview] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [openCandidateId, setOpenCandidateId] = useState('');
  const [loading, setLoading] = useState(false);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [jobForm, setJobForm] = useState({
    title: '', department: '', location: '', workMode: 'Onsite',
    employmentType: 'Full-time', experienceRequirement: '',
    minSalary: '', maxSalary: '', description: '',
    recruiterEmail: '', recruiterPhone: ''
  });
  const [savingJob, setSavingJob] = useState(false);
  const [creatingPosting, setCreatingPosting] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState('');

  async function loadApplications() {
    const data = await apiRequest('/api/recruiter/applications');
    setApplications(data.applications || []);
  }

  async function loadJobs() {
    const data = await apiRequest('/api/recruiter/jobs');
    setJobs(data.jobs || []);
  }

  async function loadOverview() {
    const data = await apiRequest('/api/recruiter/overview');
    setOverview(data);
  }

  async function loadCandidates() {
    const data = await apiRequest('/api/recruiter/candidates');
    setCandidates(data.candidates || []);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (activePage === 'recruiter-dashboard') {
          await Promise.all([loadOverview(), loadApplications(), loadCandidates()]);
        } else if (activePage === 'recruiter-candidates') {
          await loadCandidates();
        } else if (activePage === 'recruiter-jobs' || activePage === 'recruiter-create-job') {
          await loadJobs();
        } else if (activePage === 'recruiter-applications' || activePage === 'recruiter-calendar') {
          await loadApplications();
        }
      } catch (error) {
        showToast(error.message || 'Unable to load recruiter data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activePage, currentUser?.id]);

  // Leaving the candidates page closes any open detail view.
  useEffect(() => {
    if (activePage !== 'recruiter-candidates') setOpenCandidateId('');
  }, [activePage]);

  function updateJobForm(name, value) {
    setJobForm((previous) => ({ ...previous, [name]: value }));
  }

  async function saveJobPosting() {
    if (!jobForm.title.trim() || !jobForm.location.trim()) {
      showToast('Job title and location are required.');
      return;
    }
    setSavingJob(true);
    try {
      await apiRequest('/api/recruiter/jobs', { method: 'POST', body: jobForm });
      setJobForm({
        title: '', department: '', location: '', workMode: 'Onsite',
        employmentType: 'Full-time', experienceRequirement: '',
        minSalary: '', maxSalary: '', description: '',
        recruiterEmail: '', recruiterPhone: ''
      });
      setImportUrl('');
      setImportNote('');
      showToast('Posting published.');
    } catch (error) {
      showToast(error.message || 'Unable to create job posting.');
    } finally {
      setSavingJob(false);
    }
  }

  // Read a public job posting page and fill the form from it. The recruiter
  // still reviews every field before publishing — extraction is not perfect.
  async function importFromUrl() {
    const url = importUrl.trim();

    if (!url) {
      showToast('Paste a job posting link first.');
      return;
    }

    setImporting(true);
    setImportNote('');

    try {
      const data = await apiRequest('/api/recruiter/jobs/import-url', {
        method: 'POST',
        body: { url }
      });

      const fields = data.fields || {};

      // Only overwrite fields the page actually provided, so anything already
      // typed by hand survives.
      setJobForm((previous) => ({
        title: fields.title || previous.title,
        department: fields.department || previous.department,
        location: fields.location || previous.location,
        workMode: fields.workMode || previous.workMode,
        employmentType: fields.employmentType || previous.employmentType,
        experienceRequirement:
          fields.experienceRequirement || previous.experienceRequirement,
        minSalary: fields.minSalary || previous.minSalary,
        maxSalary: fields.maxSalary || previous.maxSalary,
        description: fields.description || previous.description,
        // Contact details are yours, not the page's — never overwritten.
        recruiterEmail: previous.recruiterEmail,
        recruiterPhone: previous.recruiterPhone
      }));

      setImportNote(data.warning || '');
      showToast(data.message || 'Details read from the link.');
    } catch (error) {
      showToast(error.message || 'That link could not be read.');
    } finally {
      setImporting(false);
    }
  }

  async function togglePosting(job) {
    const status = job.status === 'open' ? 'closed' : 'open';
    try {
      await apiRequest(`/api/recruiter/jobs/${job.id}`, { method: 'PATCH', body: { status } });
      showToast(status === 'closed' ? 'Posting closed.' : 'Posting reopened.');
      await loadJobs();
    } catch (error) {
      showToast(error.message || 'Unable to update posting.');
    }
  }

  async function setCandidateStatus(applicationId, status) {
    try {
      await apiRequest(`/api/recruiter/applications/${applicationId}`, {
        method: 'PATCH', body: { status }
      });
      showToast('Candidate status updated.');
      await loadApplications();
    } catch (error) {
      showToast(error.message || 'Unable to update status.');
    }
  }

  async function setCandidateNotes(applicationId, notes) {
    try {
      await apiRequest(`/api/recruiter/applications/${applicationId}`, {
        method: 'PATCH', body: { notes }
      });
      showToast('Note saved.');
    } catch (error) {
      showToast(error.message || 'Unable to save note.');
    }
  }

  async function scheduleInterview(applicationId, startsAt) {
    try {
      await apiRequest(`/api/recruiter/applications/${applicationId}/interviews`, {
        method: 'POST', body: { startsAt, mode: 'Video' }
      });
      showToast('Interview scheduled — candidate emailed.');
      await loadApplications();
    } catch (error) {
      showToast(error.message || 'Unable to schedule interview.');
    }
  }

  const interviews = applications
    .map((application) => ({ application, interview: activeInterview(application) }))
    .filter((entry) => entry.interview);

  /* ---------------- dashboard ---------------- */

  if (activePage === 'recruiter-dashboard') {
    const statusCounts = applications.reduce((acc, application) => {
      const status = application.status || 'Applied';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const donutData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

    const total = applications.length;
    const reached = (minIndex) =>
      applications.filter((a) => (STATUS_ORDER[a.status] ?? -1) >= minIndex).length;
    const funnelData = [
      { name: 'Applied', value: total },
      { name: 'Reviewed', value: reached(1) },
      { name: 'Assessment', value: reached(2) },
      { name: 'Interview', value: reached(3) },
      { name: 'Offer', value: reached(5) }
    ];

    return (
      <section>
        <PageHeader title="Dashboard" subtitle="Your candidates, postings and interviews." />
        <div className="mb-4 grid gap-3.5 md:grid-cols-4">
          {/* Each card opens the page it summarises. */}
          <KpiCard
            label="My candidates"
            value={overview?.counts?.myCandidates ?? candidates.length}
            icon={Users}
            tone="violet"
            onClick={() => setActivePage && setActivePage('recruiter-candidates')}
          />
          <KpiCard
            label="Needs action"
            value={overview?.counts?.needsAction ?? 0}
            icon={CheckCircle2}
            tone={overview?.counts?.needsAction ? 'amber' : 'slate'}
            onClick={() => setActivePage && setActivePage('recruiter-applications')}
          />
          <KpiCard
            label="Active postings"
            value={overview?.counts?.activePostings ?? 0}
            icon={BriefcaseBusiness}
            tone="blue"
            onClick={() => setActivePage && setActivePage('recruiter-jobs')}
          />
          <KpiCard
            label="Upcoming interviews"
            value={overview?.counts?.upcomingInterviews ?? interviews.length}
            icon={CalendarCheck}
            tone="teal"
            onClick={() => setActivePage && setActivePage('recruiter-calendar')}
          />
        </div>

        {total > 0 && (
          <div className="mb-4 grid gap-3.5 lg:grid-cols-2">
            <Card title="Candidate status" hint="Where your candidates sit right now">
              <StatusDonut data={donutData} height={240} />
            </Card>
            <Card
              title="Recruitment funnel"
              hint="Each stage counts everyone who reached at least that far"
            >
              <RecruitmentFunnel data={funnelData} height={240} />
            </Card>
          </div>
        )}

        <Card
          title="My candidates"
          action={
            <button
              className="text-[13px] font-bold text-violet-700"
              onClick={() => setActivePage && setActivePage('recruiter-candidates')}
            >
              View all &rarr;
            </button>
          }
        >
          {loading ? (
            <EmptyState text="Loading..." />
          ) : candidates.length ? (
            candidates.slice(0, 5).map((candidate) => (
              <ListItem
                key={candidate.id}
                title={candidate.name}
                meta={[candidate.professionalTitle, candidate.location]
                  .filter(Boolean)
                  .join(' · ') || candidate.email}
                right={
                  <Pill tone={candidate.activeApplicationCount ? 'violet' : 'slate'}>
                    {candidate.activeApplicationCount} active
                  </Pill>
                }
              />
            ))
          ) : (
            <EmptyState text="No candidates assigned yet. An admin assigns candidates to you." />
          )}
        </Card>
      </section>
    );
  }

  /* ---------------- my candidates ---------------- */

  if (activePage === 'recruiter-candidates') {
    if (openCandidateId) {
      return (
        <section>
          <PageHeader title="Candidate" subtitle="Profile, resumes, applications and interviews." />
          <CandidateDetail
            userId={openCandidateId}
            showToast={showToast}
            onBack={() => setOpenCandidateId('')}
          />
        </section>
      );
    }

    return (
      <section>
        <PageHeader
          title="My Candidates"
          subtitle="The people an admin assigned to you."
          action={
            <ExportMenu
              options={[
                {
                  label: 'Assigned candidates (CSV)',
                  path: '/api/exports/recruiter/assigned-applications.csv'
                }
              ]}
            />
          }
        />

        <Card
          title={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
          hint="Click a candidate to see their full profile, resumes and history."
        >
          {loading ? (
            <EmptyState text="Loading candidates..." />
          ) : candidates.length ? (
            candidates.map((candidate) => (
              <div
                key={candidate.id}
                onClick={() => setOpenCandidateId(candidate.id)}
                className="mb-2 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3.5 transition hover:border-violet-300 hover:bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{candidate.name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {[candidate.professionalTitle, candidate.location, candidate.email]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {candidate.resumeDocumentId && (
                      <button
                        className={btnSmClass}
                        onClick={(event) => {
                          event.stopPropagation();
                          download(candidate.resumeDocumentId);
                        }}
                      >
                        Resume
                      </button>
                    )}
                    <Pill tone="slate">{candidate.applicationCount} applications</Pill>
                    <Pill tone={candidate.activeApplicationCount ? 'violet' : 'slate'}>
                      {candidate.activeApplicationCount} active
                    </Pill>
                  </div>
                </div>

                {candidate.latestApplication && (
                  <p className="mt-2 text-[11.5px] text-slate-400">
                    Latest: {candidate.latestApplication.title}
                    {candidate.latestApplication.company
                      ? ` @ ${candidate.latestApplication.company}`
                      : ''}{' '}
                    — {candidate.latestApplication.status}
                  </p>
                )}
              </div>
            ))
          ) : (
            <EmptyState text="No candidates assigned to you yet. An admin assigns them in User Management." />
          )}
        </Card>
      </section>
    );
  }

  /* ---------------- job postings ---------------- */

  if (activePage === 'recruiter-jobs' || activePage === 'recruiter-create-job') {
    return (
      <section>
        <PageHeader
          title="My Job Postings"
          subtitle="Create, edit, and close your postings."
          action={
            <button
              className={creatingPosting ? btnClass : btnPrimaryClass}
              onClick={() => setCreatingPosting((value) => !value)}
            >
              {creatingPosting ? 'Cancel' : '+ New posting'}
            </button>
          }
        />

        {/* Creating a posting happens here rather than on a separate page —
            it is an action on this list, not a destination of its own. */}
        {creatingPosting && (
          <div className="mb-3.5">
            <Card title="Create job posting" className="max-w-2xl">
              {/* Paste a link and let the page fill itself in. */}
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-slate-700">
                  <Link2 size={14} /> Import from a link
                </p>

                <div className="flex flex-wrap gap-2">
                  <input
                    className={`${inputClass} min-w-[220px] flex-1`}
                    placeholder="https://company.com/careers/java-developer"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        importFromUrl();
                      }
                    }}
                  />
                  <button
                    className={btnPrimaryClass}
                    disabled={importing}
                    onClick={importFromUrl}
                  >
                    {importing ? 'Reading page...' : 'Fill from link'}
                  </button>
                </div>

                <p className="mt-2 text-[11.5px] leading-5 text-slate-500">
                  Works on company career pages and most job boards. LinkedIn,
                  Workday and Greenhouse load their pages with JavaScript and
                  cannot be read this way. Always check the fields before
                  publishing.
                </p>

                {importNote && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-semibold text-amber-800">
                    {importNote}
                  </p>
                )}
              </div>

              <Field label="Job title">
                <input className={inputClass} value={jobForm.title} placeholder="Java Developer"
                  onChange={(e) => updateJobForm('title', e.target.value)} />
              </Field>
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field label="Location">
                  <input className={inputClass} value={jobForm.location} placeholder="Dallas, TX"
                    onChange={(e) => updateJobForm('location', e.target.value)} />
                </Field>
                <Field label="Work mode">
                  <select className={inputClass} value={jobForm.workMode}
                    onChange={(e) => updateJobForm('workMode', e.target.value)}>
                    <option>Onsite</option><option>Remote</option><option>Hybrid</option>
                  </select>
                </Field>
                <Field label="Employment type">
                  <select className={inputClass} value={jobForm.employmentType}
                    onChange={(e) => updateJobForm('employmentType', e.target.value)}>
                    <option>Full-time</option><option>Part-time</option>
                    <option>Contract</option><option>Internship</option>
                  </select>
                </Field>
                <Field label="Department">
                  <input className={inputClass} value={jobForm.department} placeholder="Engineering"
                    onChange={(e) => updateJobForm('department', e.target.value)} />
                </Field>
                <Field label="Minimum salary">
                  <input className={inputClass} type="number" value={jobForm.minSalary} placeholder="120000"
                    onChange={(e) => updateJobForm('minSalary', e.target.value)} />
                </Field>
                <Field label="Maximum salary">
                  <input className={inputClass} type="number" value={jobForm.maxSalary} placeholder="150000"
                    onChange={(e) => updateJobForm('maxSalary', e.target.value)} />
                </Field>
              </div>
              <Field label="Experience requirement">
                <input className={inputClass} value={jobForm.experienceRequirement} placeholder="Example: 3–5 years"
                  onChange={(e) => updateJobForm('experienceRequirement', e.target.value)} />
              </Field>
              <Field label="Description">
                <textarea rows={4} className={inputClass} value={jobForm.description}
                  placeholder="Role responsibilities and requirements..."
                  onChange={(e) => updateJobForm('description', e.target.value)} />
              </Field>

              {/* Optional. Candidates see these on the posting so they can
                  reach you directly. Left blank, your account email is used. */}
              <p className="mb-2 mt-1 text-[11px] font-bold uppercase text-slate-400">
                Contact details (optional)
              </p>
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field label="Recruiter email">
                  <input
                    className={inputClass}
                    type="email"
                    value={jobForm.recruiterEmail}
                    placeholder={currentUser?.email || 'you@company.com'}
                    onChange={(e) => updateJobForm('recruiterEmail', e.target.value)}
                  />
                </Field>
                <Field label="Recruiter phone number">
                  <input
                    className={inputClass}
                    value={jobForm.recruiterPhone}
                    placeholder="+1 (555) 000-0000"
                    onChange={(e) => updateJobForm('recruiterPhone', e.target.value)}
                  />
                </Field>
              </div>
              <p className="mb-3.5 text-[11.5px] leading-5 text-slate-500">
                Shown to candidates on this posting. Leave the email blank and
                your account address is used.
              </p>
              <button
                className={btnPrimaryClass}
                disabled={savingJob}
                onClick={async () => {
                  await saveJobPosting();
                  setCreatingPosting(false);
                  await loadJobs();
                }}
              >
                {savingJob ? 'Publishing...' : 'Publish posting'}
              </button>
            </Card>
          </div>
        )}

        <Card title="My job postings">
          {loading ? (
            <EmptyState text="Loading postings..." />
          ) : jobs.length ? (
            jobs.map((job) => (
              <ListItem
                key={job.id}
                title={job.title}
                meta={`${job.location} · ${job.workMode} · ${job.jobType}`}
                right={
                  <>
                    <Pill>{job.status}</Pill>
                    <button className={btnSmClass} onClick={() => togglePosting(job)}>
                      {job.status === 'open' ? 'Close' : 'Reopen'}
                    </button>
                  </>
                }
              />
            ))
          ) : (
            <EmptyState text="You have no postings yet." />
          )}
        </Card>
      </section>
    );
  }

  /* ---------------- assigned applications ---------------- */

  if (activePage === 'recruiter-applications') {
    return (
      <section>
        <PageHeader
          title="Assigned Applications"
          subtitle="Review and progress your candidates."
          action={
            <ExportMenu
              options={[
                {
                  label: 'Assigned candidates (CSV)',
                  path: '/api/exports/recruiter/assigned-applications.csv'
                },
                {
                  label: 'My interviews (calendar file)',
                  path: '/api/exports/recruiter/interviews.ics'
                }
              ]}
            />
          }
        />
        <Card title="Assigned applications">
          <p className="mb-3.5 text-[13px] text-slate-500">
            Update status, add notes, and schedule interviews for the candidates
            assigned to you.
          </p>
          {loading ? (
            <EmptyState text="Loading candidates..." />
          ) : applications.length ? (
            applications.map((application) => (
              <CandidateCard
                key={application.id}
                application={application}
                onStatus={setCandidateStatus}
                onNotes={setCandidateNotes}
                onSchedule={scheduleInterview}
              />
            ))
          ) : (
            <EmptyState text="Nothing to work yet. Applications appear here once your candidates apply to a posting." />
          )}
        </Card>
      </section>
    );
  }

  /* ---------------- interview calendar ---------------- */

  if (activePage === 'recruiter-calendar') {
    const markedDays = interviews
      .map(({ interview }) => new Date(interview.startsAt))
      .filter((date) =>
        !Number.isNaN(date.getTime()) &&
        date.getFullYear() === monthDate.getFullYear() &&
        date.getMonth() === monthDate.getMonth()
      )
      .map((date) => date.getDate());

    return (
      <section>
        <PageHeader
          title="Interview Calendar"
          subtitle="Interviews you have scheduled."
          action={
            <ExportMenu
              label="Export calendar"
              options={[
                {
                  label: 'My interviews (calendar file)',
                  path: '/api/exports/recruiter/interviews.ics'
                }
              ]}
            />
          }
        />
        <div className="grid gap-3.5 lg:grid-cols-2">
          <Card>
            <MonthCalendar
              monthDate={monthDate}
              markedDays={markedDays}
              legend="Interview scheduled"
              onPrev={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}
              onNext={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}
            />
          </Card>
          <Card title="Upcoming interviews">
            {interviews.length ? (
              interviews.map(({ application, interview }) => (
                <ListItem
                  key={interview.id || application.id}
                  title={application.candidate?.name || 'Candidate'}
                  meta={`${application.title} · ${formatWhen(interview.startsAt)}`}
                  right={<Pill tone="violet">Scheduled</Pill>}
                />
              ))
            ) : (
              <EmptyState text="No interviews scheduled yet. Schedule one from Assigned Applications." />
            )}
          </Card>
        </div>
      </section>
    );
  }

  /* ---------------- profile / settings ---------------- */

  if (activePage === 'recruiter-profile' || activePage === 'recruiter-settings') {
    return (
      <section>
        <PageHeader
          title="Recruiter Profile"
          subtitle="Your account details, email address, and password."
        />
        <AccountPanel
          currentUser={currentUser}
          showToast={showToast}
          onLogout={onLogout}
          roleLabel="Recruiter"
        />
      </section>
    );
  }

  return (
    <section>
      <PageHeader title="Recruiter Portal" />
      <Card><EmptyState text="Select a section from the sidebar." /></Card>
    </section>
  );
}

export {
  RecruiterPortalPage
};
