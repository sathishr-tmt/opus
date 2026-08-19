// Admin portal core pages — rebuilt to match the OPUS Admin Portal prototype:
// Dashboard (platform overview), Recruiter Approvals, and User Management.
import { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, BriefcaseBusiness, ClipboardList, UserPlus } from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import {
  PageHeader, Card, StatTile, Pill, ListItem, DataTable,
  inputClass, btnSmClass, EmptyState, KpiCard, ConfirmModal
} from '../../components/ui.jsx';
import {
  StatusDonut, BarComparison, TrendChart, RecruitmentFunnel, ActivityHeatmap
} from '../../components/charts.jsx';

const ROLE_LABELS = {
  user: 'Users',
  recruiter: 'Recruiters',
  admin: 'Admins',
  super_admin: 'Super Admins'
};

function statusLabel(status) {
  if (status === 'pending_admin_approval' || status === 'pending_super_admin_approval') {
    return 'pending';
  }
  return status;
}

function AdminDashboardPage({ showToast, setActivePage }) {
  const [overview, setOverview] = useState(null);
  const [pending, setPending] = useState([]);
  const [applications, setApplications] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [overviewData, pendingData, appsData, usersData, analyticsData] = await Promise.all([
          apiRequest('/api/admin/overview'),
          apiRequest('/api/admin/pending-approvals').catch(() => ({ users: [] })),
          apiRequest('/api/admin/internal-applications'),
          apiRequest('/api/admin/users'),
          apiRequest('/api/admin/analytics').catch(() => null)
        ]);
        setOverview(overviewData);
        setPending((pendingData.users || []).filter((u) => u.role === 'recruiter'));
        setApplications(appsData.applications || []);
        setCandidates((usersData.users || []).filter((u) => u.role === 'user'));
        setAnalytics(analyticsData);
      } catch (error) {
        showToast(error.message || 'Failed to load admin dashboard.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Job seekers nobody is looking after yet — the queue an admin works through.
  const unassignedCandidates = candidates.filter(
    (candidate) => !candidate.assignedRecruiterId
  );

  // Accounts by role donut, from the real role breakdown.
  const usersByRole = overview?.usersByRole || {};
  const roleDonut = Object.entries(usersByRole)
    .map(([role, value]) => ({ name: ROLE_LABELS[role] || role, value }))
    .filter((d) => d.value > 0);

  // Applications by status bar, from the real internal-applications list.
  const statusCounts = applications.reduce((acc, application) => {
    const status = application.status || 'Applied';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const statusCategories = Object.keys(statusCounts);
  const statusValues = statusCategories.map((status) => statusCounts[status]);

  return (
    <section>
      <PageHeader title="Dashboard" subtitle="Platform overview and operations." />
      <div className="mb-4 grid gap-3.5 md:grid-cols-4">
        {/* Each card opens the page it summarises. */}
        <KpiCard
          label="Recruiters"
          value={overview?.usersByRole?.recruiter ?? 0}
          icon={ShieldCheck}
          tone="violet"
          onClick={() => setActivePage('admin-recruiters')}
        />
        <KpiCard
          label="Candidates without a recruiter"
          value={unassignedCandidates.length}
          icon={UserPlus}
          tone={unassignedCandidates.length ? 'amber' : 'slate'}
          onClick={() => setActivePage('admin-users')}
        />
        <KpiCard
          label="Job postings"
          value={overview?.totalJobs ?? 0}
          icon={BriefcaseBusiness}
          tone="blue"
          onClick={() => setActivePage('admin-jobs')}
        />
        <KpiCard
          label="Applications"
          value={overview?.totalApplications ?? 0}
          icon={ClipboardList}
          tone="teal"
          onClick={() => setActivePage('admin-applications')}
        />
      </div>

      {/* Everything below is computed from real records — user.createdAt,
          application.appliedAt, source and status. A chart with no data says
          so rather than drawing an invented line. */}
      {!loading && (
        <>
          <div className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
            <Card
              title="Platform growth"
              hint="Total users and applications over the last 6 months"
            >
              {analytics?.growth?.categories?.length ? (
                <TrendChart
                  categories={analytics.growth.categories}
                  series={analytics.growth.series}
                  height={240}
                />
              ) : (
                <EmptyState text="No activity recorded yet." />
              )}
            </Card>

            <Card
              title="Applications by source"
              hint="Where the listings people applied to came from"
            >
              {analytics?.bySource?.categories?.length ? (
                <BarComparison
                  categories={analytics.bySource.categories}
                  data={analytics.bySource.data}
                  height={240}
                />
              ) : (
                <EmptyState text="No applications yet." />
              )}
            </Card>
          </div>

          <div className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
            <Card
              title="Recruitment pipeline"
              hint="How far applications reach — each stage counts everyone who got at least that far"
              action={
                <button
                  className="text-[13px] font-bold text-violet-700"
                  onClick={() => setActivePage('admin-applications')}
                >
                  Applications &rarr;
                </button>
              }
            >
              {analytics?.pipeline?.length ? (
                <RecruitmentFunnel data={analytics.pipeline} height={240} />
              ) : (
                <EmptyState text="No applications yet." />
              )}
            </Card>

            <Card
              title="Activity heatmap"
              hint="When applications actually arrive, by day and time"
            >
              {analytics?.heatmap?.data?.length ? (
                <ActivityHeatmap
                  xLabels={analytics.heatmap.xLabels}
                  yLabels={analytics.heatmap.yLabels}
                  data={analytics.heatmap.data}
                  max={analytics.heatmap.max}
                  height={240}
                />
              ) : (
                <EmptyState text="No applications yet." />
              )}
            </Card>
          </div>

          <div className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
            <Card title="Accounts by role" hint="Make-up of every account on the platform">
              {roleDonut.length ? (
                <StatusDonut data={roleDonut} height={240} />
              ) : (
                <EmptyState text="No accounts yet." />
              )}
            </Card>

            <Card title="Applications by status" hint="Where applications sit right now">
              {statusCategories.length ? (
                <BarComparison categories={statusCategories} data={statusValues} height={240} />
              ) : (
                <EmptyState text="No applications yet." />
              )}
            </Card>
          </div>
        </>
      )}

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card
          title="Recruiters awaiting approval"
          action={
            <button
              className="text-[13px] font-bold text-violet-700"
              onClick={() => setActivePage('admin-recruiters')}
            >
              View all &rarr;
            </button>
          }
        >
          {loading ? (
            <EmptyState text="Loading..." />
          ) : pending.length ? (
            pending.map((user) => (
              <ListItem
                key={user.id}
                title={user.name}
                meta={user.company || user.email}
                right={<Pill tone="amber">pending</Pill>}
              />
            ))
          ) : (
            <EmptyState text="No recruiters awaiting approval." />
          )}
        </Card>

        <Card
          title="Candidates without a recruiter"
          hint="Assign these people so a recruiter can start working with them."
          action={
            <button
              className="text-[13px] font-bold text-violet-700"
              onClick={() => setActivePage('admin-users')}
            >
              Assign &rarr;
            </button>
          }
        >
          {loading ? (
            <EmptyState text="Loading..." />
          ) : unassignedCandidates.length ? (
            unassignedCandidates.slice(0, 8).map((candidate) => (
              <ListItem
                key={candidate.id}
                title={candidate.name}
                meta={candidate.email}
                right={<Pill tone="amber">unassigned</Pill>}
              />
            ))
          ) : (
            <EmptyState text="Every candidate has a recruiter." />
          )}
        </Card>
      </div>
    </section>
  );
}

function AdminRecruiterApprovalsPage({ showToast }) {
  const [recruiters, setRecruiters] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [usersData, pendingData] = await Promise.all([
        apiRequest('/api/admin/users'),
        apiRequest('/api/admin/pending-approvals').catch(() => ({ users: [] }))
      ]);
      const fromUsers = (usersData.users || []).filter((u) => u.role === 'recruiter');
      const fromPending = (pendingData.users || []).filter((u) => u.role === 'recruiter');
      const merged = [...fromPending, ...fromUsers.filter((u) => !fromPending.some((p) => p.id === u.id))];
      setRecruiters(merged);
    } catch (error) {
      showToast(error.message || 'Failed to load recruiters.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function approve(user) {
    try {
      await apiRequest(`/api/admin/users/${user.id}/approve`, { method: 'PATCH' });
      showToast(`${user.name} approved — email sent.`);
      load();
    } catch (error) {
      showToast(error.message || 'Approval failed.');
    }
  }

  async function decline(user) {
    try {
      await apiRequest(`/api/admin/users/${user.id}/decline`, { method: 'PATCH', body: {} });
      showToast(`${user.name} rejected.`);
      load();
    } catch (error) {
      showToast(error.message || 'Decline failed.');
    }
  }

  return (
    <section>
      <PageHeader title="Recruiter Approvals" subtitle="Approve recruiters before they can work." />
      <Card title="Recruiter accounts">
        <p className="mb-3.5 text-[13px] text-slate-500">
          Recruiters self-register and stay pending until you approve them. Approved
          recruiters can post jobs and work assigned candidates.
        </p>
        {loading ? (
          <EmptyState text="Loading recruiters..." />
        ) : recruiters.length ? (
          <DataTable headers={['Name', 'Company', 'Email', 'Status', '']}>
            {recruiters.map((user) => {
              const display = statusLabel(user.status);
              return (
                <tr key={user.id}>
                  <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] font-bold text-slate-900">{user.name}</td>
                  <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] text-slate-600">{user.company || '—'}</td>
                  <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] text-slate-500">{user.email}</td>
                  <td className="border-t border-slate-200 px-2.5 py-2.5"><Pill>{display}</Pill></td>
                  <td className="border-t border-slate-200 px-2.5 py-2.5 text-right">
                    {display === 'pending' ? (
                      <span className="inline-flex gap-1.5">
                        <button
                          className="rounded-lg bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700 hover:bg-green-100"
                          onClick={() => approve(user)}
                        >
                          Approve
                        </button>
                        <button
                          className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                          onClick={() => decline(user)}
                        >
                          Reject
                        </button>
                      </span>
                    ) : (
                      <span className="text-[13px] text-slate-400">
                        {display === 'active' ? 'Approved' : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState text="No recruiter accounts yet." />
        )}
      </Card>
    </section>
  );
}

function AdminUsersPage({ showToast }) {
  const [users, setUsers] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [filter, setFilter] = useState('all');

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest('/api/admin/users');
      setUsers(data.users || []);
      setRecruiters(data.recruiters || []);
    } catch (error) {
      showToast(error.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function updateUser(userId, payload) {
    try {
      const data = await apiRequest(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: payload
      });
      setUsers(data.users || []);
      showToast('User updated successfully.');
    } catch (error) {
      showToast(error.message || 'Failed to update user.');
    }
  }

  // Hand a candidate to a recruiter, or pass an empty id to take them off.
  async function assignRecruiter(userId, recruiterId) {
    setSavingId(userId);
    try {
      const data = await apiRequest(`/api/admin/users/${userId}/assign-recruiter`, {
        method: 'PATCH',
        body: { recruiterId }
      });

      // Update just this row rather than refetching the whole table.
      setUsers((current) =>
        current.map((user) =>
          user.id === userId
            ? { ...user, assignedRecruiterId: data.user?.assignedRecruiterId ?? null }
            : user
        )
      );

      showToast(data.message || 'Assignment updated.');
    } catch (error) {
      showToast(error.message || 'Unable to assign this candidate.');
    } finally {
      setSavingId('');
    }
  }

  async function deleteUser(user) {
    try {
      const data = await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      setUsers(data.users || []);
      showToast('User deleted successfully.');
    } catch (error) {
      showToast(error.message || 'Failed to delete user.');
    } finally {
      setPendingDelete(null);
    }
  }

  const candidateCount = users.filter((user) => user.role === 'user').length;
  const unassignedCount = users.filter(
    (user) => user.role === 'user' && !user.assignedRecruiterId
  ).length;

  const visible = users.filter((user) => {
    if (filter === 'all') return true;
    if (filter === 'unassigned') return user.role === 'user' && !user.assignedRecruiterId;
    if (filter === 'assigned') return user.role === 'user' && user.assignedRecruiterId;
    return user.role === filter;
  });

  const FILTERS = [
    ['all', `All (${users.length})`],
    ['unassigned', `Unassigned (${unassignedCount})`],
    ['assigned', `Assigned (${candidateCount - unassignedCount})`],
    ['recruiter', 'Recruiters']
  ];

  return (
    <section>
      <PageHeader
        title="User Management"
        subtitle="Assign candidates to recruiters, change roles, and manage accounts."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => {
          const on = filter === value;
          return (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition ${
                on
                  ? 'border-violet-300 bg-violet-50 text-violet-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <Card
        title="All users"
        hint={
          recruiters.length
            ? 'Pick a recruiter to hand a candidate over. Choose "Unassigned" to take them back.'
            : 'No active recruiters yet — approve a recruiter before assigning candidates.'
        }
      >
        {loading ? (
          <EmptyState text="Loading users..." />
        ) : visible.length ? (
          <DataTable headers={['User', 'Email', 'Role', 'Recruiter', 'Status', 'Created', '']}>
            {visible.map((user) => (
              <tr key={user.id}>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] font-bold text-slate-900">{user.name}</td>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] text-slate-500">{user.email}</td>
                <td className="border-t border-slate-200 px-2.5 py-2.5">
                  <select
                    value={user.role}
                    onChange={(event) => updateUser(user.id, { role: event.target.value })}
                    className={`${inputClass} w-auto`}
                  >
                    {/* "Admin" is deliberately absent: only a Super Admin can
                        create admins, and only through an invitation. */}
                    <option value="recruiter">Recruiter</option>
                    <option value="user">User</option>
                  </select>
                </td>

                {/* Only job seekers belong to a recruiter. */}
                <td className="border-t border-slate-200 px-2.5 py-2.5">
                  {user.role === 'user' ? (
                    <select
                      value={user.assignedRecruiterId || ''}
                      disabled={savingId === user.id || !recruiters.length}
                      onChange={(event) => assignRecruiter(user.id, event.target.value)}
                      className={`${inputClass} w-auto ${
                        user.assignedRecruiterId ? '' : 'text-amber-700'
                      }`}
                    >
                      <option value="">Unassigned</option>
                      {recruiters.map((recruiter) => (
                        <option key={recruiter.id} value={recruiter.id}>
                          {recruiter.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[13px] text-slate-400">—</span>
                  )}
                </td>

                <td className="border-t border-slate-200 px-2.5 py-2.5">
                  <select
                    value={user.status}
                    onChange={(event) => updateUser(user.id, { status: event.target.value })}
                    className={`${inputClass} w-auto`}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </td>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] text-slate-500">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                </td>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-right">
                  <button
                    className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                    onClick={() => setPendingDelete(user)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState text="No users match this filter." />
        )}
      </Card>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete this account?"
        body={
          pendingDelete
            ? `${pendingDelete.name} (${pendingDelete.email}) will be permanently removed, along with their applications and documents. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete account"
        tone="red"
        onConfirm={() => deleteUser(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

export {
  AdminDashboardPage,
  AdminRecruiterApprovalsPage,
  AdminUsersPage
};
