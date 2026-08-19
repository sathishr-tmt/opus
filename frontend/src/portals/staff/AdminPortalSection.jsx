// Admin portal sections — prototype design: Management, Job Postings,
// Job Sources, Calendar & Interviews, Reports, and Settings.
import { useState, useEffect } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import {
  PageHeader, Card, StatTile, Pill, ListItem, MonthCalendar, Field, Tabs,
  inputClass, btnClass, btnSmClass, btnPrimaryClass, EmptyState, ExportMenu
} from '../../components/ui.jsx';
import { StatusDonut, BarComparison, HealthGauge } from '../../components/charts.jsx';
import { apiRequest, API_BASE } from '../../lib/api.js';
import { AdminDashboardPage, AdminRecruiterApprovalsPage, AdminUsersPage } from './AdminPage.jsx';
import { AdminInternalApplicationsPage } from './AdminInternalApplicationsPage.jsx';
import { AccountPanel } from '../../components/AccountPanel.jsx';

function downloadUrl(path) {
  window.open(`${API_BASE}${path}`, '_blank');
}

/* ------------------------------------------------------------------ *
 * Management — one destination for the three "who is in the system and
 * what are they doing" pages, which used to be three sidebar items.
 *
 * Each tab renders the existing page unchanged, so nothing about how
 * they work has altered — only where you reach them from.
 * ------------------------------------------------------------------ */
function AdminManagementPage({ showToast, initialTab = 'users' }) {
  const [tab, setTab] = useState(initialTab);
  const [counts, setCounts] = useState({ pending: 0, unassigned: 0 });

  // Small badges on the tabs, so a queue is visible without opening it.
  useEffect(() => {
    async function loadCounts() {
      try {
        const [usersData, appsData] = await Promise.all([
          apiRequest('/api/admin/users').catch(() => ({ users: [] })),
          apiRequest('/api/admin/internal-applications').catch(() => ({ applications: [] }))
        ]);

        const users = usersData.users || [];

        setCounts({
          pending: users.filter((user) =>
            ['pending_admin_approval', 'pending_super_admin_approval'].includes(user.status)
          ).length,
          unassigned: (appsData.applications || []).filter(
            (application) => !application.assignedRecruiterId
          ).length
        });
      } catch {
        setCounts({ pending: 0, unassigned: 0 });
      }
    }
    loadCounts();
  }, [tab]);

  return (
    <section>
      <Tabs
        active={tab}
        onChange={setTab}
        items={[
          { key: 'users', label: 'User Management' },
          { key: 'recruiters', label: 'Recruiter Management', count: counts.pending },
          { key: 'applications', label: 'Application Management', count: counts.unassigned }
        ]}
      />

      {tab === 'users' && <AdminUsersPage showToast={showToast} />}
      {tab === 'recruiters' && <AdminRecruiterApprovalsPage showToast={showToast} />}
      {tab === 'applications' && <AdminInternalApplicationsPage showToast={showToast} />}
    </section>
  );
}

function AdminJobPostingsPage({ showToast }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest('/api/admin/platform-jobs');
      setJobs(data.jobs || []);
    } catch (error) {
      showToast(error.message || 'Unable to load postings.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function setStatus(jobId, status) {
    try {
      await apiRequest(`/api/admin/platform-jobs/${jobId}`, { method: 'PATCH', body: { status } });
      showToast(`Posting ${status === 'closed' ? 'closed' : 'reopened'}.`);
      load();
    } catch (error) {
      showToast(error.message || 'Update failed.');
    }
  }

  async function remove(jobId) {
    try {
      await apiRequest(`/api/admin/platform-jobs/${jobId}`, { method: 'DELETE' });
      showToast('Posting deleted.');
      load();
    } catch (error) {
      showToast(error.message || 'Delete failed.');
    }
  }

  return (
    <section>
      <PageHeader title="Job Postings" subtitle="Manage every posting on the platform." />
      <Card
        title="All job postings"
        action={
          <ExportMenu
            options={[
              { label: 'Job postings (CSV)', path: '/api/exports/admin/job-postings.csv' }
            ]}
          />
        }
      >
        <p className="mb-3.5 text-[13px] text-slate-500">
          Every posting across the platform. Admins can close, reopen, or delete any posting.
        </p>
        {loading ? (
          <EmptyState text="Loading postings..." />
        ) : jobs.length ? (
          jobs.map((job) => (
            <ListItem
              key={job.id}
              title={job.title}
              meta={`${job.company || 'OPUS'} · ${job.location}`}
              right={
                <>
                  <Pill>{job.status}</Pill>
                  {job.status === 'open'
                    ? <button className={btnSmClass} onClick={() => setStatus(job.id, 'closed')}>Close</button>
                    : <button className={btnSmClass} onClick={() => setStatus(job.id, 'open')}>Reopen</button>}
                  <button
                    className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                    onClick={() => remove(job.id)}
                  >
                    Delete
                  </button>
                </>
              }
            />
          ))
        ) : (
          <EmptyState text="No platform postings yet." />
        )}
      </Card>
    </section>
  );
}

function AdminJobSourcesPage({ showToast }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest('/api/admin/job-sources');
      setSources(data.sources || []);
    } catch (error) {
      showToast(error.message || 'Unable to load sources.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const data = await apiRequest('/api/admin/job-sources/refresh', { method: 'POST', body: {} });
      setSources(data.sources || []);
      showToast('Sources probed.');
    } catch (error) {
      showToast(error.message || 'Probe failed.');
    } finally {
      setRefreshing(false);
    }
  }

  // Health summary from the real source list.
  const total = sources.length;
  const healthy = sources.filter((s) => s.ok).length;
  const healthPct = total ? Math.round((healthy / total) * 100) : 0;

  return (
    <section>
      <PageHeader title="Job Sources" subtitle="Monitor external job feeds and health." />

      {total > 0 && (
        <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1fr_1.6fr]">
          <Card title="Overall source health">
            <HealthGauge
              value={healthPct}
              color={healthPct >= 80 ? '#16a34a' : healthPct >= 50 ? '#d97706' : '#dc2626'}
              height={190}
            />
          </Card>
          <div className="grid grid-cols-3 gap-3.5">
            <StatTile label="Enabled" value={total} />
            <StatTile label="Healthy" value={healthy} />
            <StatTile label="Failing" value={total - healthy} />
          </div>
        </div>
      )}

      <Card
        title="Job sources & health"
        action={
          <button onClick={refresh} disabled={refreshing} className={btnPrimaryClass}>
            <RefreshCw size={12} className={`mr-1 inline ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Probing...' : 'Probe now'}
          </button>
        }
      >
        <p className="mb-3.5 text-[13px] text-slate-500">
          External job feeds OPUS pulls from. Probe to check each source is responding.
        </p>
        {loading ? (
          <EmptyState text="Loading sources..." />
        ) : sources.length ? (
          sources.map((s) => (
            <ListItem
              key={s.source}
              title={s.source}
              meta={
                (s.ok ? `${s.lastCount ?? s.count ?? 0} results` : (s.lastError || 'Unavailable')) +
                (s.lastSuccessAt ? ` · last ok ${new Date(s.lastSuccessAt).toLocaleString()}` : '')
              }
              right={<Pill tone={s.ok ? 'green' : 'red'}>{s.ok ? 'Healthy' : 'Failing'}</Pill>}
            />
          ))
        ) : (
          <EmptyState text="No source data yet. Probe now or run a job search first." />
        )}
      </Card>
    </section>
  );
}

function AdminInterviewsPage({ showToast }) {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest('/api/admin/interviews');
      setInterviews(data.interviews || []);
    } catch (error) {
      showToast(error.message || 'Unable to load interviews.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function cancel(id) {
    try {
      await apiRequest(`/api/admin/interviews/${id}`, { method: 'DELETE' });
      showToast('Interview cancelled.');
      load();
    } catch (error) {
      showToast(error.message || 'Cancel failed.');
    }
  }

  const markedDays = interviews
    .filter((i) => i.status !== 'cancelled' && i.startsAt)
    .map((i) => new Date(i.startsAt))
    .filter((d) =>
      !Number.isNaN(d.getTime()) &&
      d.getFullYear() === monthDate.getFullYear() &&
      d.getMonth() === monthDate.getMonth()
    )
    .map((d) => d.getDate());

  return (
    <section>
      <PageHeader
        title="Calendar & Interviews"
        subtitle="All interviews across recruiters."
        action={
          <ExportMenu
            label="Export calendar"
            options={[
              { label: 'All interviews (calendar file)', path: '/api/exports/admin/interviews.ics' }
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
        <Card title="All interviews">
          {loading ? (
            <EmptyState text="Loading interviews..." />
          ) : interviews.length ? (
            interviews.map((i) => (
              <ListItem
                key={i.id}
                title={i.title || 'Candidate interview'}
                meta={`${i.startsAt ? new Date(i.startsAt).toLocaleString() : 'Unscheduled'} · ${i.mode || 'Video'}`}
                right={
                  <>
                    <Pill>{i.status}</Pill>
                    {i.status !== 'cancelled' && (
                      <button
                        className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                        onClick={() => cancel(i.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </>
                }
              />
            ))
          ) : (
            <EmptyState text="No interviews scheduled across the platform." />
          )}
        </Card>
      </div>
    </section>
  );
}

function AdminReportsPage({ showToast }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    apiRequest('/api/admin/reports')
      .then((d) => setSummary(d.summary))
      .catch((e) => showToast(e.message || 'Unable to load reports.'));
  }, []);

  const exports = [
    { title: 'Applications report', meta: 'Every application with status and assigned recruiter', label: 'CSV', path: '/api/exports/admin/applications.csv' },
    { title: 'Job postings report', meta: 'All postings, owners, and open/closed status', label: 'CSV', path: '/api/exports/admin/job-postings.csv' },
    { title: 'Interviews report', meta: 'Scheduled interviews across all recruiters', label: '.ics', path: '/api/exports/admin/interviews.ics' },
    { title: 'Platform summary (PDF)', meta: 'High-level metrics for a period', label: 'PDF', path: '/api/exports/admin/report.pdf' }
  ];

  // Aggregate the report summary into chart-ready data.
  const appByStatus = {};
  (summary?.applications || []).forEach((row) => {
    const status = row.status || row.kind || 'Unknown';
    appByStatus[status] = (appByStatus[status] || 0) + (row.c || 0);
  });
  const appDonut = Object.entries(appByStatus)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0);

  const userByRole = {};
  (summary?.users || []).forEach((row) => {
    const role = row.role || 'user';
    userByRole[role] = (userByRole[role] || 0) + (row.c || 0);
  });
  const roleCategories = Object.keys(userByRole);
  const roleValues = roleCategories.map((role) => userByRole[role]);

  function Group({ title, rows, keys }) {
    return (
      <Card title={title}>
        {(rows || []).length ? rows.map((row, idx) => (
          <div key={idx} className="mb-1.5 flex justify-between rounded-lg bg-slate-50 px-3.5 py-2 text-[13px] font-semibold text-slate-700">
            <span>{keys.map((k) => row[k]).filter((v) => v !== undefined).join(' / ')}</span>
            <span className="font-extrabold text-slate-900">{row.c}</span>
          </div>
        )) : <EmptyState text="No data." />}
      </Card>
    );
  }

  return (
    <section>
      <PageHeader title="Reports" subtitle="Download platform data and summaries." />

      {summary && (appDonut.length > 0 || roleCategories.length > 0) && (
        <div className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
          {appDonut.length > 0 && (
            <Card title="Applications by status">
              <StatusDonut data={appDonut} height={240} />
            </Card>
          )}
          {roleCategories.length > 0 && (
            <Card title="Users by role">
              <BarComparison categories={roleCategories} data={roleValues} height={240} />
            </Card>
          )}
        </div>
      )}

      <Card
        title="Reports & exports"
        hint="Pick a date range once, then choose a format. Leave the range blank for all time."
        action={
          <ExportMenu
            label="Export"
            options={exports.map((item) => ({
              label: `${item.title} (${item.label})`,
              path: item.path
            }))}
          />
        }
      >
        {exports.map((item) => (
          <ListItem
            key={item.title}
            title={item.title}
            meta={item.meta}
            right={<Pill tone="slate">{item.label}</Pill>}
          />
        ))}
      </Card>
      {summary && (
        <div className="grid gap-3.5 md:grid-cols-2">
          <Group title="Users" rows={summary.users} keys={['role', 'status']} />
          <Group title="Job Postings" rows={summary.jobs} keys={['status']} />
          <Group title="Applications" rows={summary.applications} keys={['kind', 'status']} />
          <Group title="Interviews" rows={summary.interviews} keys={['status']} />
        </div>
      )}
    </section>
  );
}

function AdminSettingsPage({ showToast, currentUser, onLogout }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest('/api/admin/settings')
      .then((d) => setSettings(d.settings))
      .catch((e) => showToast(e.message || 'Unable to load settings.'));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const data = await apiRequest('/api/admin/settings', { method: 'PUT', body: settings });
      setSettings(data.settings);
      showToast('Settings saved.');
    } catch (error) {
      showToast(error.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <PageHeader
        title="Admin Settings"
        subtitle="Platform configuration and your own account."
      />

      {settings ? (
        <Card
          title="Platform settings"
          hint="These apply to everyone using OPUS."
          className="max-w-2xl"
        >
          <Field label="Platform name">
            <input className={inputClass} value={settings.platformName || ''}
              onChange={(e) => setSettings({ ...settings, platformName: e.target.value })} />
          </Field>
          <Field label="Support email">
            <input className={inputClass} value={settings.supportEmail || ''}
              onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })} />
          </Field>
          <label className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-slate-700">
            <input type="checkbox" checked={!!settings.allowRecruiterSelfRegistration}
              onChange={(e) => setSettings({ ...settings, allowRecruiterSelfRegistration: e.target.checked })} />
            Allow recruiter self-registration
          </label>
          <label className="mb-3.5 flex items-center gap-2 text-[13px] font-semibold text-slate-700">
            <input type="checkbox" checked={!!settings.maintenanceMode}
              onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })} />
            Maintenance mode
          </label>
          <button className={btnPrimaryClass} disabled={saving} onClick={save}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </Card>
      ) : (
        <Card className="max-w-2xl"><EmptyState text="Loading settings..." /></Card>
      )}

      {/* Your own account: name, email address, password. */}
      <AccountPanel
        currentUser={currentUser}
        showToast={showToast}
        onLogout={onLogout}
        roleLabel="Admin"
      />
    </section>
  );
}

function AdminPortalSection({ activePage, showToast, setActivePage = () => {}, currentUser, onLogout }) {
  if (activePage === 'admin-dashboard') {
    return <AdminDashboardPage showToast={showToast} setActivePage={setActivePage} />;
  }

  // User / Recruiter / Application management are tabs inside Management.
  // The old page ids still resolve, opening the matching tab, so existing
  // links and dashboard shortcuts keep working.
  if (activePage === 'admin-management') {
    return <AdminManagementPage showToast={showToast} initialTab="users" />;
  }
  if (activePage === 'admin-users') {
    return <AdminManagementPage showToast={showToast} initialTab="users" />;
  }
  if (activePage === 'admin-recruiters') {
    return <AdminManagementPage showToast={showToast} initialTab="recruiters" />;
  }
  if (activePage === 'admin-applications') {
    return <AdminManagementPage showToast={showToast} initialTab="applications" />;
  }

  if (activePage === 'admin-jobs') return <AdminJobPostingsPage showToast={showToast} />;
  if (activePage === 'admin-sources') return <AdminJobSourcesPage showToast={showToast} />;
  if (activePage === 'admin-calendar') return <AdminInterviewsPage showToast={showToast} />;
  if (activePage === 'admin-reports') return <AdminReportsPage showToast={showToast} />;
  if (activePage === 'admin-settings') {
    return (
      <AdminSettingsPage
        showToast={showToast}
        currentUser={currentUser}
        onLogout={onLogout}
      />
    );
  }

  return (
    <section>
      <PageHeader title="Admin Portal" subtitle="Manage OPUS platform activity." />
      <Card><EmptyState text="Select a section from the sidebar." /></Card>
    </section>
  );
}

export {
  AdminPortalSection,
  // Reused by the Super Admin portal, which now has its own Job Sources item.
  AdminJobSourcesPage
};
