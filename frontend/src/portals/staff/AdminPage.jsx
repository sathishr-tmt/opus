// Admin portal core pages — rebuilt to match the OPUS Admin Portal prototype:
// Dashboard (platform overview), Recruiter Approvals, and User Management.
import { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, BriefcaseBusiness, ClipboardList } from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import {
  PageHeader, Card, StatTile, Pill, ListItem, DataTable,
  inputClass, btnSmClass, EmptyState, KpiCard
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
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [overviewData, pendingData, appsData, analyticsData] = await Promise.all([
          apiRequest('/api/admin/overview'),
          apiRequest('/api/admin/pending-approvals'),
          apiRequest('/api/admin/internal-applications'),
          apiRequest('/api/admin/analytics').catch(() => null)
        ]);
        setOverview(overviewData);
        setPending((pendingData.users || []).filter((u) => u.role === 'recruiter'));
        setApplications(appsData.applications || []);
        setAnalytics(analyticsData);
      } catch (error) {
        showToast(error.message || 'Failed to load admin dashboard.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const unassigned = applications.filter((a) => !a.assignedRecruiterId);

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
          label="Pending approvals"
          value={pending.length}
          icon={UserCheck}
          tone={pending.length ? 'amber' : 'slate'}
          onClick={() => setActivePage('admin-recruiters')}
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
          title="Unassigned applications"
          action={
            <button
              className="text-[13px] font-bold text-violet-700"
              onClick={() => setActivePage('admin-applications')}
            >
              Assign &rarr;
            </button>
          }
        >
          {loading ? (
            <EmptyState text="Loading..." />
          ) : unassigned.length ? (
            unassigned.map((application) => (
              <ListItem
                key={application.id}
                title={application.candidate?.name || 'Candidate'}
                meta={application.title}
                right={<Pill tone="amber">unassigned</Pill>}
              />
            ))
          ) : (
            <EmptyState text="All applications are assigned." />
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
        apiRequest('/api/admin/pending-approvals')
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
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest('/api/admin/users');
      setUsers(data.users || []);
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

  async function deleteUser(userId) {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      const data = await apiRequest(`/api/admin/users/${userId}`, { method: 'DELETE' });
      setUsers(data.users || []);
      showToast('User deleted successfully.');
    } catch (error) {
      showToast(error.message || 'Failed to delete user.');
    }
  }

  return (
    <section>
      <PageHeader title="User Management" subtitle="Change roles, activate or deactivate accounts, and remove users." />
      <Card title="All users">
        {loading ? (
          <EmptyState text="Loading users..." />
        ) : users.length ? (
          <DataTable headers={['User', 'Email', 'Role', 'Status', 'Created', '']}>
            {users.map((user) => (
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
                    onClick={() => deleteUser(user.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState text="No users found." />
        )}
      </Card>
    </section>
  );
}

export {
  AdminDashboardPage,
  AdminRecruiterApprovalsPage,
  AdminUsersPage
};
