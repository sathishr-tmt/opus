// Recruiter portal — rebuilt to match the OPUS Recruiter Portal prototype,
// wired to the existing backend (/api/recruiter/*, /api/account/*).
import { useState, useEffect } from 'react';
import { apiRequest, API_BASE } from '../../lib/api.js';
import {
  PageHeader, Card, StatTile, Pill, ListItem, Field, MonthCalendar,
  inputClass, btnClass, btnPrimaryClass, btnSmClass, EmptyState
} from '../../components/ui.jsx';
import { StatusDonut, RecruitmentFunnel } from '../../components/charts.jsx';

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
              onClick={() =>
                window.open(
                  `${API_BASE}/api/documents/${application.candidate.resumeDocumentId}/download`,
                  '_blank'
                )
              }
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

function RecruiterPortalPage({ activePage, currentUser, showToast }) {
  const [overview, setOverview] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [jobForm, setJobForm] = useState({
    title: '', department: '', location: '', workMode: 'Onsite',
    employmentType: 'Full-time', experienceRequirement: '',
    minSalary: '', maxSalary: '', description: ''
  });
  const [savingJob, setSavingJob] = useState(false);

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [changingPassword, setChangingPassword] = useState(false);

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

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (activePage === 'recruiter-dashboard') {
          await Promise.all([loadOverview(), loadApplications()]);
        } else if (activePage === 'recruiter-jobs') {
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

  function updateJobForm(name, value) {
    setJobForm((previous) => ({ ...previous, [name]: value }));
  }

  async function saveJobPosting(goToPostings) {
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
        minSalary: '', maxSalary: '', description: ''
      });
      showToast('Posting published.');
      if (goToPostings) goToPostings();
    } catch (error) {
      showToast(error.message || 'Unable to create job posting.');
    } finally {
      setSavingJob(false);
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

  async function changePassword() {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      showToast('Enter your current and new password.');
      return;
    }
    setChangingPassword(true);
    try {
      const data = await apiRequest('/api/account/change-password', {
        method: 'POST', body: passwordForm
      });
      setPasswordForm({ currentPassword: '', newPassword: '' });
      showToast(data.message || 'Password changed.');
    } catch (error) {
      showToast(error.message || 'Unable to change password.');
    } finally {
      setChangingPassword(false);
    }
  }

  const interviews = applications
    .map((application) => ({ application, interview: activeInterview(application) }))
    .filter((entry) => entry.interview);

  if (activePage === 'recruiter-dashboard') {
    // Build the status donut and recruitment funnel from real applications.
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
      { name: 'Assigned', value: total },
      { name: 'Reviewed', value: reached(1) },
      { name: 'Assessment', value: reached(2) },
      { name: 'Interview', value: reached(3) },
      { name: 'Offer', value: reached(5) }
    ];

    return (
      <section>
        <PageHeader title="Dashboard" subtitle="Your postings and assigned candidates." />
        <div className="mb-4 grid gap-3.5 md:grid-cols-4">
          <StatTile label="My postings" value={overview?.counts?.postings ?? 0} />
          <StatTile label="Active postings" value={overview?.counts?.activePostings ?? 0} />
          <StatTile label="Assigned candidates" value={overview?.counts?.assignedApplications ?? applications.length} />
          <StatTile label="Interviews" value={overview?.counts?.upcomingInterviews ?? interviews.length} />
        </div>

        {total > 0 && (
          <div className="mb-4 grid gap-3.5 lg:grid-cols-2">
            <Card title="Candidate status">
              <StatusDonut data={donutData} height={240} />
            </Card>
            <Card title="Recruitment funnel">
              <RecruitmentFunnel data={funnelData} height={240} />
            </Card>
          </div>
        )}

        <Card title="Assigned candidates">
          {loading ? (
            <EmptyState text="Loading..." />
          ) : applications.length ? (
            applications.slice(0, 4).map((application) => (
              <ListItem
                key={application.id}
                title={application.candidate?.name || 'Candidate'}
                meta={application.title}
                right={<Pill>{application.status}</Pill>}
              />
            ))
          ) : (
            <EmptyState text="No candidates assigned yet. An admin assigns applications to you." />
          )}
        </Card>
      </section>
    );
  }

  if (activePage === 'recruiter-jobs') {
    return (
      <section>
        <PageHeader title="My Job Postings" subtitle="Create, edit, and close your postings." />
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

  if (activePage === 'recruiter-create-job') {
    return (
      <section>
        <PageHeader title="Create Job Posting" subtitle="Publish a new role for your company." />
        <Card title="Create job posting" className="max-w-2xl">
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
          <button className={btnPrimaryClass} disabled={savingJob} onClick={() => saveJobPosting()}>
            {savingJob ? 'Publishing...' : 'Publish posting'}
          </button>
        </Card>
      </section>
    );
  }

  if (activePage === 'recruiter-applications') {
    return (
      <section>
        <PageHeader title="Assigned Applications" subtitle="Review and progress your candidates." />
        <Card title="Assigned applications">
          <p className="mb-3.5 text-[13px] text-slate-500">
            Update status, add notes, and schedule interviews for candidates an admin assigned to you.
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
            <EmptyState text="No candidates assigned yet." />
          )}
        </Card>
      </section>
    );
  }

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
        <PageHeader title="Interview Calendar" subtitle="Interviews you have scheduled." />
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

  if (activePage === 'recruiter-profile' || activePage === 'recruiter-settings') {
    return (
      <section>
        <PageHeader
          title={activePage === 'recruiter-profile' ? 'Recruiter Profile' : 'Settings'}
          subtitle="Recruiter profile and security."
        />
        <Card title="Recruiter profile" className="max-w-xl">
          <div className="grid gap-3.5 md:grid-cols-2">
            <Field label="Full name">
              <input className={inputClass} defaultValue={currentUser?.name || ''} disabled />
            </Field>
            <Field label="Company">
              <input className={inputClass} defaultValue={currentUser?.company || ''} disabled />
            </Field>
            <Field label="Email">
              <input className={inputClass} defaultValue={currentUser?.email || ''} disabled />
            </Field>
            <Field label="Role">
              <input className={inputClass} defaultValue="Recruiter" disabled />
            </Field>
          </div>
        </Card>
        <Card title="Account & security" className="max-w-xl">
          <Field label="Current password">
            <input type="password" className={inputClass} value={passwordForm.currentPassword}
              placeholder="••••••••"
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
          </Field>
          <Field label="New password">
            <input type="password" className={inputClass} value={passwordForm.newPassword}
              placeholder="••••••••"
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
          </Field>
          <button className={btnPrimaryClass} disabled={changingPassword} onClick={changePassword}>
            {changingPassword ? 'Changing...' : 'Change password'}
          </button>
        </Card>
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
