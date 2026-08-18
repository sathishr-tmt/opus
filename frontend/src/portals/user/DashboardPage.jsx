// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

import { useState, useEffect } from 'react';
import {
  Bookmark,
  Briefcase,
  CalendarDays,
  UserRound
} from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { PageHeader, StatCard, Badge, EmptyState, Pill, btnPrimaryClass } from '../../components/ui.jsx';
import { StatusDonut, TrendChart } from '../../components/charts.jsx';

// The dashboard shows the newest 6 entries from the unified saved+applied list.
const RECENT_LIMIT = 6;

function DashboardPage({
  dashboard,
  onDashboardChange,
  showToast,
  gmailStatus,
  onConnectGmail,
  onCheckGmail,
  onViewAll
}) {
  const [recent, setRecent] = useState([]);
  const [counts, setCounts] = useState({ savedCount: 0, appliedCount: 0, total: 0 });
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [busyId, setBusyId] = useState('');

  async function loadRecent() {
    setLoadingRecent(true);
    try {
      const data = await apiRequest(`/api/my-jobs?offset=0&limit=${RECENT_LIMIT}`);
      setRecent(data.entries || []);
      setCounts({
        savedCount: data.savedCount || 0,
        appliedCount: data.appliedCount || 0,
        total: data.total || 0
      });
    } catch (error) {
      showToast(error.message || 'Unable to load recent activity.');
    } finally {
      setLoadingRecent(false);
    }
  }

  useEffect(() => {
    loadRecent();
  }, [dashboard?.applications, dashboard?.savedJobs]);

  // Rewrite is only offered for SAVED entries; applied ones are already sent.
  async function rewrite(entry) {
    setBusyId(entry.entryId);
    try {
      const data = await apiRequest('/api/documents/rewrite', {
        method: 'POST',
        body: { jobId: entry.jobId }
      });
      showToast(data.message || 'Resume tailored. See My Resumes.');
    } catch (error) {
      showToast(error.message || 'Unable to tailor the resume.');
    } finally {
      setBusyId('');
    }
  }

  async function removeEntry(entry) {
    try {
      const id = entry.kind === 'saved' ? entry.jobId : entry.applicationId;
      await apiRequest(`/api/my-jobs/${entry.kind}/${id}`, { method: 'DELETE' });
      showToast('Removed.');
      await loadRecent();
      await onDashboardChange();
    } catch (error) {
      showToast(error.message || 'Unable to remove this entry.');
    }
  }
  const statusCounts = dashboard?.statusCounts || {
    Applied: 0,
    'Under Review': 0,
    'Online Assessment': 0,
    'Technical Interview': 0,
    'Final Interview': 0
  };

  // Build the donut data from the real status counts, dropping empty buckets.
  const statusEntries = Object.entries(statusCounts);
  const statusTotal = statusEntries.reduce((sum, [, count]) => sum + (count || 0), 0);
  const donutData = statusEntries
    .filter(([, count]) => count > 0)
    .map(([name, value]) => ({ name, value }));

  const profileFields = ['name', 'email', 'phone', 'location', 'about'];
  const completedProfileFields = profileFields.filter((field) => {
    const value = dashboard?.settings?.[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
  }).length;
  const profileCompletion = Math.round((completedProfileFields / profileFields.length) * 100);

  const activityWeeks = Array.from({ length: 8 }, (_, index) => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() - (7 - index) * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
  });
  const activityCounts = activityWeeks.map(({ start, end }) =>
    (dashboard?.recentApplications || []).filter((application) => {
      const date = new Date(application.updatedAt || application.appliedAt || 0);
      return !Number.isNaN(date.getTime()) && date >= start && date <= end;
    }).length
  );

  return (
    <section>
      <PageHeader
        title={`Welcome back, ${dashboard?.settings?.name || 'Sathish R'} 👋`}
        subtitle="Here is an overview of your job search activity."
      />

      {/* Applied and Saved are deliberately separate: the Applied number only
          moves when the user confirms they actually applied. */}
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Applied"
          value={counts.appliedCount}
          icon={Briefcase}
          tone="blue"
        />

        <StatCard
          title="Interviews Scheduled"
          value={dashboard?.interviews ?? dashboard?.upcomingInterviews ?? 0}
          icon={CalendarDays}
          tone="yellow"
        />

        <StatCard
          title="Saved / Recommended"
          value={counts.savedCount}
          icon={Bookmark}
          tone="violet"
        />

        <StatCard
          title="Profile Completion"
          value={`${profileCompletion}%`}
          icon={UserRound}
          tone="green"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
          <h2 className="text-[15px] font-extrabold text-slate-900">Application activity</h2>
          <p className="mt-1 text-xs text-slate-400">Applications updated over the last eight weeks</p>
          <TrendChart
            categories={activityWeeks.map((week) => week.label)}
            series={[{ name: 'Applications', data: activityCounts }]}
            height={235}
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
          <h2 className="text-[15px] font-extrabold text-slate-900">Application status</h2>
          <p className="mt-1 text-xs text-slate-400">Where your active applications stand</p>
          {statusTotal > 0 ? (
            <StatusDonut data={donutData} height={235} />
          ) : (
            <div>
              <StatusDonut data={[{ name: 'No applications yet', value: 1 }]} height={210} />
              <p className="text-center text-xs text-slate-500">Your breakdown appears after you apply.</p>
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              Email Response Detection
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {gmailStatus?.connected
                ? 'Gmail is connected. Check recruiter replies for jobs applied from this portal.'
                : 'Connect Gmail to detect recruiter replies for your tracked applications.'}
            </p>

            {gmailStatus?.lastCheckedAt && (
              <p className="mt-1 text-xs font-bold text-slate-400">
                Last checked:{' '}
                {new Date(gmailStatus.lastCheckedAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {!gmailStatus?.connected && (
              <button
                onClick={onConnectGmail}
                className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white"
              >
                Connect Gmail
              </button>
            )}

            {gmailStatus?.connected && (
              <button
                onClick={onCheckGmail}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white"
              >
                Check Email Responses
              </button>
            )}
          </div>
        </div>

        {gmailStatus?.alerts?.length > 0 && (
          <div className="mt-5 grid gap-3">
            {gmailStatus.alerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-2xl border border-violet-100 bg-violet-50 p-4"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase text-violet-600">
                      Recruiter Response Detected
                    </p>

                    <h3 className="mt-1 font-black text-slate-900">
                      {alert.subject || 'No subject'}
                    </h3>

                    <p className="mt-1 text-sm text-slate-600">
                      From: {alert.from || 'Unknown sender'}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Matched Application: {alert.title} · {alert.company}
                    </p>

                    {alert.snippet && (
                      <p className="mt-2 text-sm text-slate-500">
                        {alert.snippet}
                      </p>
                    )}
                  </div>

                  <Badge>Email</Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {gmailStatus?.connected && !gmailStatus?.alerts?.length && (
          <div className="mt-5">
            <EmptyState text="No recruiter responses detected yet." />
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-extrabold text-slate-900">
                Recent Applications
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                Your {RECENT_LIMIT} newest saved and applied jobs.
              </p>
            </div>

            {counts.total > 0 && (
              <button
                onClick={onViewAll}
                className="text-sm font-black text-violet-700 hover:text-violet-800"
              >
                View all ({counts.total}) →
              </button>
            )}
          </div>

          <div className="grid max-h-[620px] gap-3 overflow-y-auto pr-1">
            {loadingRecent ? (
              <EmptyState text="Loading..." />
            ) : recent.length ? (
              recent.map((entry) => {
                const isSaved = entry.kind === 'saved';

                return (
                  <div key={entry.entryId} className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-black text-slate-900">
                            {entry.title}
                          </h3>
                          <Pill tone={isSaved ? 'amber' : 'green'}>
                            {isSaved ? 'Saved' : entry.status}
                          </Pill>
                          {isSaved && entry.atsScore != null && (
                            <Pill
                              tone={
                                entry.atsScore >= 80
                                  ? 'green'
                                  : entry.atsScore >= 60
                                  ? 'blue'
                                  : 'amber'
                              }
                            >
                              ATS {entry.atsScore}%
                            </Pill>
                          )}
                        </div>

                        <p className="mt-1 truncate text-sm font-medium text-slate-500">
                          {[entry.company, entry.location].filter(Boolean).join(' · ')}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {/* Rewrite only for saved jobs — applied ones are already sent. */}
                        {isSaved && (
                          <button
                            className={btnPrimaryClass}
                            disabled={busyId === entry.entryId}
                            onClick={() => rewrite(entry)}
                          >
                            {busyId === entry.entryId ? 'Rewriting...' : 'Rewrite'}
                          </button>
                        )}

                        <button
                          onClick={() => removeEntry(entry)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-lg font-black text-red-600 hover:bg-red-100"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState text="Nothing yet. Save or apply to a job from Job Search." />
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
          <h2 className="text-[15px] font-extrabold text-slate-900">Application status history</h2>
          <p className="mt-1 text-xs text-slate-400">Latest changes to your active applications</p>

          <div className="relative mt-5 space-y-5 border-l-2 border-slate-100 pl-5">
            {(dashboard?.recentApplications || []).slice(0, 6).map((application) => (
              <div key={application.id} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-violet-600" />
                <p className="text-[13px] font-bold text-slate-800">
                  {application.status || 'Applied'} — {application.company || application.title || 'Application'}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {application.updatedAt || application.appliedAt
                    ? new Date(application.updatedAt || application.appliedAt).toLocaleString()
                    : 'Recently updated'}
                </p>
              </div>
            ))}

            {!dashboard?.recentApplications?.length && (
              <EmptyState text="Application updates will appear here." />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export {
  DashboardPage
};