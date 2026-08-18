// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

import { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Building2,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck
} from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { formatMoney } from '../../lib/constants.js';
import { PageHeader, StatCard, Badge, EmptyState, FilterInput, FilterSelect } from '../../components/ui.jsx';

function JobSearchPage({ onDashboardChange, showToast }) {
  // Common job titles offered as dropdown suggestions. The Job Title field is a
  // combo box: the user can pick one of these OR type any title of their own.
  const jobTitleOptions = [
    'Software Engineer',
    'Software Developer',
    'Frontend Developer',
    'Backend Developer',
    'Full Stack Developer',
    'Java Developer',
    'Python Developer',
    'React Developer',
    'Node.js Developer',
    'Mobile App Developer',
    'DevOps Engineer',
    'Cloud Engineer',
    'Site Reliability Engineer',
    'Data Engineer',
    'Data Analyst',
    'Data Scientist',
    'Machine Learning Engineer',
    'AI Engineer',
    'QA Automation Engineer',
    'Cybersecurity Analyst',
    'Database Administrator',
    'Business Analyst',
    'Product Manager',
    'Project Manager',
    'UI/UX Designer',
    'Scrum Master',
    'Systems Administrator',
    'Network Engineer'
  ];

  // Full list of US states (+ DC). The backend passes this straight to the
  // job API as the location, so results obey the state you pick.
  const stateOptions = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia',
    'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
    'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
    'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
    'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
    'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
    'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
  ];

  const workAuthorizationOptions = [
    'No Preference',
    'OPT',
    'STEM OPT',
    'CPT',
    'F1',
    'H1B',
    'H4 EAD',
    'Green Card Holder',
    'US Citizen',
    'Permanent Resident',
    'Needs Sponsorship',
    'No Sponsorship Required'
  ];

  const emptyFilters = {
    keyword: '',
    // Country is fixed to the United States now that Location is a US-state
    // dropdown; the backend still receives it and maps it to a country code.
    country: 'United States',
    state: '',
    jobType: '',
    experienceYears: '',
    workMode: '',
    workAuthorization: '',
    minSalary: '',
    maxSalary: '',
    postedWithinDays: '7'
  };

  const [filters, setFilters] = useState(emptyFilters);
  const [jobs, setJobs] = useState([]);
  const [savedJobIds, setSavedJobIds] = useState([]);
  const [sources, setSources] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [matchSummary, setMatchSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [pendingApplyJob, setPendingApplyJob] = useState(null);
  // Holds the job the user was sent away to apply for, until they come back.
  const awaitingReturnJobRef = useRef(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [refreshNumber, setRefreshNumber] = useState(0);

  const visibleJobs = showAllResults ? jobs : jobs.slice(0, 10);

  function updateFilter(name, value) {
    setFilters((previous) => ({
      ...previous,
      [name]: value
    }));
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setJobs([]);
    setSources([]);
    setWarnings([]);
    setMatchSummary({});
    setShowAllResults(false);
    setSelectedJob(null);
    setPendingApplyJob(null);
    setHasSearched(false);
    showToast('Job-search filters cleared.');
  }

  function formatPostedDate(value) {
    if (!value) return 'Not listed';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return 'Not listed';

    const daysOld = Math.floor((Date.now() - date.getTime()) / 86400000);

    if (daysOld <= 0) return 'Today';
    if (daysOld === 1) return '1 day ago';
    if (daysOld < 30) return `${daysOld} days ago`;

    return date.toLocaleDateString();
  }

  function formatSalary(job) {
    const min = Number(job.minSalary || 0);
    const max = Number(job.maxSalary || 0);

    if (!min && !max) return 'Not disclosed';
    if (min && max && min !== max) {
      return `${formatMoney(min)} – ${formatMoney(max)}`;
    }
    if (min) return `${formatMoney(min)}+`;
    return `Up to ${formatMoney(max)}`;
  }

  // Colour band for the ATS percentage shown against each job.
  function atsTone(score) {
    if (score >= 80) return 'bg-green-50 text-green-700';
    if (score >= 60) return 'bg-blue-50 text-blue-700';
    if (score >= 45) return 'bg-amber-50 text-amber-700';
    return 'bg-red-50 text-red-700';
  }

  function getMatchPresentation(job) {
    const stage = Number(job.matchStage || 99);

    if (stage === 1) {
      return {
        label: job.matchLabel || 'Exact match',
        style: 'border-green-200 bg-green-50 text-green-700'
      };
    }

    if (stage === 2) {
      return {
        label: job.matchLabel || 'Strong match',
        style: 'border-violet-200 bg-violet-50 text-violet-700'
      };
    }

    if (stage === 3 || stage === 4) {
      return {
        label: job.matchLabel || 'Nearby match',
        style: 'border-amber-200 bg-amber-50 text-amber-700'
      };
    }

    return {
      label: job.matchLabel || 'Recommended',
      style: 'border-slate-200 bg-slate-100 text-slate-600'
    };
  }

  async function searchJobs({ refresh = false } = {}) {
    const searchTerm = filters.keyword.trim() || 'developer';
    const nextRefreshNumber = refresh ? refreshNumber + 1 : refreshNumber;

    setLoading(true);
    setShowAllResults(false);
    setSelectedJob(null);
    setPendingApplyJob(null);

    try {
      const data = await apiRequest('/api/jobs/fetch', {
        method: 'POST',
        body: JSON.stringify({
          ...filters,
          search: searchTerm,
          refreshId: nextRefreshNumber,
          // Every Search click scrapes the job boards live rather than
          // reusing an earlier result set.
          forceFresh: true
        })
      });

      const nextJobs = data.jobs || [];

      setJobs(nextJobs);
      setSavedJobIds(data.savedJobIds || []);
      setSources(data.sources || []);
      setWarnings(data.warnings || []);
      setMatchSummary(data.matchSummary || {});
      setHasSearched(true);

      if (refresh) {
        setRefreshNumber(nextRefreshNumber);
      }

      if (nextJobs.length) {
        showToast(
          `Found ${nextJobs.length} opportunities ranked for your filters.`
        );
      } else {
        showToast(
          'No suitable opportunities were found. Try a broader title, location, or date range.'
        );
      }
    } catch (error) {
      showToast(error.message || 'Failed to fetch job opportunities.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleSaved(job) {
    try {
      const data = await apiRequest(`/api/saved/${job.id}`, {
        method: 'POST'
      });

      setSavedJobIds(data.savedJobIds || []);
      await onDashboardChange();

      const saved = (data.savedJobIds || []).includes(String(job.id));
      showToast(saved ? 'Job saved.' : 'Job removed from saved jobs.');
    } catch (error) {
      showToast(error.message || 'Unable to update saved jobs.');
    }
  }

  function openJobSource(job) {
    if (!job.url) {
      showToast('The original job link is not available.');
      return;
    }

    window.open(job.url, '_blank', 'noopener,noreferrer');
  }

  // When the user returns to this tab after being sent to a job portal, ask
  // whether they actually applied. Only a "Yes" records the application.
  useEffect(() => {
    function askOnReturn() {
      if (document.visibilityState !== 'visible') return;
      if (!awaitingReturnJobRef.current) return;

      const job = awaitingReturnJobRef.current;
      awaitingReturnJobRef.current = null;
      // Small delay so the tab is settled before the dialog appears.
      window.setTimeout(() => setPendingApplyJob(job), 400);
    }

    document.addEventListener('visibilitychange', askOnReturn);
    window.addEventListener('focus', askOnReturn);

    return () => {
      document.removeEventListener('visibilitychange', askOnReturn);
      window.removeEventListener('focus', askOnReturn);
    };
  }, []);

  // Apply does NOT mark the job as applied. It sends the user to the real job
  // portal first; the "Did you apply?" question is asked only once they come
  // back to this tab (see the visibility listener above).
  function beginApplication(job) {
    if (!job.url) {
      showToast('The original job link is not available.');
      return;
    }

    setSelectedJob(null);
    awaitingReturnJobRef.current = job;
    openJobSource(job);
  }

  async function confirmApplication() {
    if (!pendingApplyJob) return;

    try {
      await apiRequest(`/api/applications/${pendingApplyJob.id}`, {
        method: 'POST',
        body: JSON.stringify({
          job: pendingApplyJob,
          status: 'Applied'
        })
      });

      setPendingApplyJob(null);
      await onDashboardChange();
      showToast('Application added to My Applications.');
    } catch (error) {
      showToast(error.message || 'Failed to track this application.');
    }
  }

  return (
    <section>
      <PageHeader
        title="Job Search"
        subtitle="OPUS searches connected public job feeds, applies your filters, and clearly labels relaxed recommendations."
        action={
          <button
            onClick={() => searchJobs({ refresh: true })}
            disabled={loading}
            className="flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh Results'}
          </button>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
        <div className="mb-5">
          <h2 className="text-[15px] font-extrabold text-slate-900">
            Search Preferences
          </h2>
          <p className="mt-1 max-w-4xl text-[13px] leading-5 text-slate-500">
            OPUS keeps the job title as the primary requirement. When exact
            results are limited, it relaxes optional filters in stages and
            shows the change on each result.
          </p>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          {/* Job Title: a combo box — type any title, or pick from the list. */}
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold text-slate-600">
              Job Title
            </span>
            <input
              list="jobTitleOptions"
              value={filters.keyword}
              onChange={(event) => updateFilter('keyword', event.target.value)}
              placeholder="Type a title, or pick from the list"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none transition focus:border-violet-500"
            />
            <datalist id="jobTitleOptions">
              {jobTitleOptions.map((title) => (
                <option key={title} value={title} />
              ))}
            </datalist>
          </label>

          <FilterSelect
            label="Location"
            value={filters.state}
            onChange={(value) => updateFilter('state', value)}
            options={stateOptions}
          />

          <FilterSelect
            label="Work Mode"
            value={filters.workMode}
            onChange={(value) => updateFilter('workMode', value)}
            options={['Onsite', 'Hybrid', 'Remote']}
          />

          <FilterSelect
            label="Employment Type"
            value={filters.jobType}
            onChange={(value) => updateFilter('jobType', value)}
            options={['Full-time', 'Part-time', 'Contract', 'Internship']}
          />

          <FilterInput
            label="Years of Experience"
            type="number"
            min="0"
            max="50"
            value={filters.experienceYears}
            onChange={(value) =>
              updateFilter('experienceYears', value.replace(/[^0-9]/g, ''))
            }
            placeholder="Example: 5"
          />

          <FilterSelect
            label="Work Authorization"
            value={filters.workAuthorization}
            onChange={(value) => updateFilter('workAuthorization', value)}
            options={workAuthorizationOptions}
          />

          <FilterInput
            label="Minimum Salary"
            type="number"
            min="0"
            step="1000"
            value={filters.minSalary}
            onChange={(value) => updateFilter('minSalary', value)}
            placeholder="Example: 80000"
          />

          <FilterInput
            label="Maximum Salary"
            type="number"
            min="0"
            step="1000"
            value={filters.maxSalary}
            onChange={(value) => updateFilter('maxSalary', value)}
            placeholder="Example: 150000"
          />

          {/* Date Posted — LinkedIn-style options. Values are days-old; the
              backend reads postedWithinDays (empty = Any time / no limit). */}
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold text-slate-600">
              Date Posted
            </span>
            <select
              value={filters.postedWithinDays}
              onChange={(event) => updateFilter('postedWithinDays', event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none transition focus:border-violet-500"
            >
              <option value="">Any time</option>
              <option value="1">Past 24 hours</option>
              <option value="7">Past week</option>
              <option value="30">Past month</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            onClick={() => searchJobs()}
            disabled={loading}
            className="rounded-[10px] bg-violet-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Searching...' : 'Search Opportunities'}
          </button>

          <button
            onClick={clearFilters}
            disabled={loading}
            className="rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-black text-slate-900">Connected Job Sources</h2>
              <p className="mt-1 text-sm text-slate-500">
                A source can return zero results when it has no matching jobs or
                is not configured.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {sources.map((source) => (
                <span
                  key={source.source}
                  className={`rounded-full border px-3 py-1 text-xs font-black ${
                    source.ok
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {source.source}: {source.count || 0}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={20} />
            <div>
              <h2 className="font-black text-amber-900">
                Some sources could not be checked
              </h2>
              <div className="mt-2 grid gap-1 text-sm font-medium text-amber-800">
                {warnings.map((warning) => (
                  <p key={`${warning.source}-${warning.message}`}>
                    <span className="font-black">{warning.source}:</span>{' '}
                    {warning.message}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {hasSearched && (
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Exact Matches"
            value={matchSummary.exact || 0}
            icon={CheckCircle2}
            tone="green"
          />
          <StatCard
            title="Strong Matches"
            value={matchSummary.strong || 0}
            icon={ShieldCheck}
            tone="violet"
          />
          <StatCard
            title="Nearby Matches"
            value={matchSummary.nearby || 0}
            icon={Building2}
            tone="yellow"
          />
          <StatCard
            title="Recommended"
            value={matchSummary.recommended || 0}
            icon={Search}
            tone="blue"
          />
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-900">
              Search Results ({jobs.length})
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Showing {visibleJobs.length} of {jobs.length}. Results are ranked
              by title, location, work mode, experience, salary, authorization,
              and freshness.
            </p>
          </div>

          {jobs.length > 10 && (
            <button
              onClick={() => setShowAllResults((previous) => !previous)}
              className="rounded-[10px] border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-700 hover:bg-slate-50"
            >
              {showAllResults ? 'Show Top 10' : 'View All Results'}
            </button>
          )}
        </div>

        {visibleJobs.length ? (
          <div className="overflow-x-auto">
            <table className="opus-data-table w-full min-w-[1250px] border-collapse text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2">Match</th>
                  <th className="px-4 py-2">Opportunity</th>
                  <th className="px-4 py-2">Posted</th>
                  <th className="px-4 py-2">Location / Mode</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Salary</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>

              <tbody>
                {visibleJobs.map((job) => {
                  const match = getMatchPresentation(job);
                  const isSaved = savedJobIds.includes(String(job.id));

                  return (
                    <tr key={job.id} className="align-top transition hover:bg-slate-50">
                      <td className="px-4 py-4">
                        {/* ATS score: how well the user's profile matches this posting. */}
                        {job.atsScore != null ? (
                          <span
                            className={`inline-flex rounded-lg px-2.5 py-1 text-sm font-black ${atsTone(
                              job.atsScore
                            )}`}
                            title={(job.atsReasons || []).join('\n')}
                          >
                            {job.atsScore}%
                          </span>
                        ) : (
                          <span
                            className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500"
                            title="Add your skills and target role in Profile & Resume."
                          >
                            ATS n/a
                          </span>
                        )}

                        <span
                          className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-black ${match.style}`}
                        >
                          {match.label}
                        </span>

                        {job.atsMissing?.length > 0 && (
                          <p className="mt-2 max-w-[180px] text-xs font-bold leading-5 text-amber-600">
                            Missing: {job.atsMissing.slice(0, 4).join(', ')}
                          </p>
                        )}

                        {job.relaxedFilters?.length > 0 && (
                          <p className="mt-2 max-w-[180px] text-xs font-bold leading-5 text-slate-400">
                            Relaxed: {job.relaxedFilters.join(', ')}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <h3 className="max-w-sm font-black text-slate-900">
                          {job.title}
                        </h3>
                        <p className="mt-1 text-sm font-bold text-slate-500">
                          {job.company}
                        </p>
                        {job.skills?.length > 0 && (
                          <p className="mt-2 max-w-sm text-xs leading-5 text-slate-400">
                            {job.skills.slice(0, 5).join(' · ')}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-4 text-sm font-bold text-slate-600">
                        {formatPostedDate(job.postedAt)}
                      </td>

                      <td className="px-4 py-4">
                        <p className="max-w-[210px] text-sm font-bold text-slate-600">
                          {job.location || 'Not listed'}
                        </p>
                        <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700">
                          {job.workMode || 'Not listed'}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <Badge>{job.jobType || 'Not listed'}</Badge>
                      </td>

                      <td className="px-4 py-4 text-sm font-bold text-slate-600">
                        {formatSalary(job)}
                      </td>

                      <td className="px-4 py-4">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                          {job.source || 'Public Job Feed'}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex min-w-[220px] flex-wrap gap-2">
                          <button
                            onClick={() => setSelectedJob(job)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            View JD
                          </button>

                          <button
                            onClick={() => toggleSaved(job)}
                            className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${
                              isSaved
                                ? 'bg-violet-100 text-violet-700'
                                : 'bg-white text-slate-600'
                            }`}
                          >
                            <Bookmark
                              size={15}
                              fill={isSaved ? 'currentColor' : 'none'}
                            />
                            {isSaved ? 'Saved' : 'Save'}
                          </button>

                          <button
                            onClick={() => beginApplication(job)}
                            className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700"
                          >
                            Apply
                            <ExternalLink size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            text={
              hasSearched
                ? 'No suitable jobs were returned. Broaden one filter and search again.'
                : 'Choose your filters and click Search Opportunities.'
            }
          />
        )}
      </div>

      {selectedJob && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {selectedJob.atsScore != null && (
                    <span
                      className={`inline-flex rounded-lg px-3 py-1 text-sm font-black ${atsTone(
                        selectedJob.atsScore
                      )}`}
                    >
                      ATS {selectedJob.atsScore}%
                    </span>
                  )}

                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                      getMatchPresentation(selectedJob).style
                    }`}
                  >
                    {getMatchPresentation(selectedJob).label}
                  </span>
                </div>

                <h2 className="text-2xl font-black text-slate-900">
                  {selectedJob.title}
                </h2>

                <p className="mt-1 text-sm font-bold text-slate-500">
                  {selectedJob.company} · {selectedJob.location}
                </p>
              </div>

              <button
                onClick={() => setSelectedJob(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-600 hover:bg-slate-200"
                aria-label="Close job details"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ['Work Mode', selectedJob.workMode || 'Not listed'],
                ['Job Type', selectedJob.jobType || 'Not listed'],
                ['Salary', formatSalary(selectedJob)],
                ['Source', selectedJob.source || 'Public Job Feed']
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <p className="text-xs font-black uppercase text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1 font-black text-slate-800">{value}</p>
                </div>
              ))}
            </div>

            {selectedJob.relaxedFilters?.length > 0 && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                OPUS relaxed these filters to include this opportunity:{' '}
                {selectedJob.relaxedFilters.join(', ')}.
              </div>
            )}

            {/* Why this job scored what it scored. */}
            {selectedJob.atsScore != null && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="font-black text-slate-900">
                  ATS match: {selectedJob.atsScore}%
                </h3>

                {selectedJob.atsReasons?.length > 0 && (
                  <ul className="mt-3 grid gap-1.5 text-sm font-bold text-slate-600">
                    {selectedJob.atsReasons.map((reason, index) => (
                      <li key={index}>· {reason}</li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-400">
                      Skills you have
                    </p>
                    <p className="mt-1 text-sm font-bold text-green-700">
                      {selectedJob.atsMatched?.length
                        ? selectedJob.atsMatched.join(', ')
                        : 'None detected'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-black uppercase text-slate-400">
                      Skills to add
                    </p>
                    <p className="mt-1 text-sm font-bold text-amber-700">
                      {selectedJob.atsMissing?.length
                        ? selectedJob.atsMissing.join(', ')
                        : 'Nothing missing'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <h3 className="font-black text-slate-900">Job Description</h3>

              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">
                {selectedJob.description ||
                  'The job description was not provided by this source.'}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                onClick={() => toggleSaved(selectedJob)}
                className="flex items-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
              >
                <Bookmark size={17} />
                {savedJobIds.includes(String(selectedJob.id))
                  ? 'Remove Saved Job'
                  : 'Save Job'}
              </button>

              <button
                onClick={() => beginApplication(selectedJob)}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white"
              >
                Open Source and Apply
                <ExternalLink size={17} />
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingApplyJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <CheckCircle2 size={27} />
            </div>

            <h2 className="mt-5 text-2xl font-black text-slate-950">
              Did you submit the application?
            </h2>

            <p className="mt-3 text-sm leading-7 text-slate-500">
              Confirm only after you finish applying for{' '}
              <span className="font-black text-slate-800">
                {pendingApplyJob.title}
              </span>{' '}
              at {pendingApplyJob.company}. OPUS will then add it to My
              Applications with the status Applied.
            </p>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                onClick={() => setPendingApplyJob(null)}
                className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
              >
                Not Yet
              </button>

              <button
                onClick={confirmApplication}
                className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white"
              >
                Yes, Mark as Applied
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export {
  JobSearchPage
};