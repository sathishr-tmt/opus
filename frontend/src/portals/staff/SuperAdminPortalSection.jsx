// Super Admin portal — rebuilt to match the OPUS Super Admin Portal prototype:
// Dashboard, Admin Invitations, Account Oversight, Role Permissions, Audit Logs,
// System Health, and System Settings, wired to /api/super-admin/*.
import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { apiRequest, API_BASE } from '../../lib/api.js';
import {
  PageHeader, Card, StatTile, Pill, ListItem, DataTable, Field,
  inputClass, btnSmClass, btnPrimaryClass, EmptyState
} from '../../components/ui.jsx';
import { formatRoleLabel } from '../../lib/constants.js';

function downloadUrl(path) {
  window.open(`${API_BASE}${path}`, '_blank');
}

function SuperAdminDashboard({ showToast, setActivePage }) {
  const [accounts, setAccounts] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [health, setHealth] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    Promise.allSettled([
      apiRequest('/api/super-admin/accounts').then(setAccounts),
      apiRequest('/api/super-admin/admin-invitations').then((d) => setInvitations(d.invitations || [])),
      apiRequest('/api/super-admin/audit-logs').then((d) => setAuditLogs(d.auditLogs || [])),
      apiRequest('/api/admin/pending-approvals').then((d) => setPendingCount((d.users || []).length)),
      apiRequest('/api/super-admin/system-health').then(setHealth)
    ]).then((results) => {
      if (results.every((r) => r.status === 'rejected')) {
        showToast('Unable to load dashboard data.');
      }
    });
  }, []);

  const pendingInvites = invitations.filter((i) => i.status === 'pending').length;
  const admins = (accounts?.accounts || []).filter((a) => a.role === 'admin');

  return (
    <section>
      <PageHeader title="Dashboard" subtitle="Platform-wide control and oversight." />
      <div className="mb-4 grid gap-3.5 md:grid-cols-4">
        <button type="button" onClick={() => setActivePage('super-approvals')} className="text-left">
          <StatTile label="Pending approvals" value={pendingCount} />
        </button>
        <StatTile label="Admins" value={accounts?.totals?.admin ?? 0} />
        <StatTile label="Pending invites" value={pendingInvites} />
        <StatTile label="Total accounts" value={(accounts?.accounts || []).length} />
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card
          title="Admin team"
          action={
            <button className="text-[13px] font-bold text-violet-700" onClick={() => setActivePage('super-admins')}>
              Manage &rarr;
            </button>
          }
        >
          {admins.length ? (
            admins.map((a) => (
              <ListItem key={a.id} title={a.name} meta={a.email} right={<Pill>{a.status}</Pill>} />
            ))
          ) : (
            <EmptyState text="No admin accounts yet. Invite one from Admin Invitations." />
          )}
        </Card>
        <Card
          title="Recent activity"
          action={
            <button className="text-[13px] font-bold text-violet-700" onClick={() => setActivePage('super-audit')}>
              View logs &rarr;
            </button>
          }
        >
          {auditLogs.length ? (
            auditLogs.slice(0, 4).map((log) => (
              <ListItem
                key={log.id}
                title={log.action}
                meta={`${log.actorRole || 'system'} · ${log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}`}
              />
            ))
          ) : (
            <EmptyState text="No recent activity." />
          )}
        </Card>
      </div>
    </section>
  );
}

function AdminInvitationsPage({ showToast }) {
  const [email, setEmail] = useState('');
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest('/api/super-admin/admin-invitations')
      .then((d) => setInvitations(d.invitations || []))
      .catch((e) => showToast(e.message || 'Unable to load invitations.'));
  }, []);

  async function inviteAdmin(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const data = await apiRequest('/api/super-admin/admin-invitations', {
        method: 'POST',
        body: { email: email.trim().toLowerCase() }
      });
      setEmail('');
      setInvitations((current) => [data.invitation, ...current]);
      showToast(data.message || `Invitation sent to ${data.invitation?.email || 'admin'}.`);
    } catch (error) {
      showToast(error.message || 'Unable to send invitation.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <PageHeader title="Admin Invitations" subtitle="Invite and manage admin accounts." />
      <Card title="Invite an admin" className="max-w-2xl">
        <p className="mb-3.5 text-[13px] text-slate-500">
          Only a Super Admin can create admins. The invitee gets an email link to set their password.
        </p>
        <form onSubmit={inviteAdmin} className="flex gap-2.5">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="jordan@company.com"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button disabled={loading} className={btnPrimaryClass}>
            {loading ? 'Sending...' : 'Send invitation'}
          </button>
        </form>
      </Card>
      <Card title="Admins & invitations">
        {invitations.length ? (
          <DataTable headers={['Email', 'Status', 'Expires']}>
            {invitations.map((invitation) => (
              <tr key={invitation.id}>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] font-bold text-slate-900">{invitation.email}</td>
                <td className="border-t border-slate-200 px-2.5 py-2.5"><Pill>{invitation.status}</Pill></td>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] text-slate-500">
                  {invitation.expiresAt ? new Date(invitation.expiresAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState text="No Admin invitations yet." />
        )}
      </Card>
    </section>
  );
}

function AccountOversight({ showToast }) {
  const [data, setData] = useState(null);

  function load() {
    apiRequest('/api/super-admin/accounts')
      .then(setData)
      .catch((e) => showToast(e.message || 'Unable to load accounts.'));
  }
  useEffect(() => { load(); }, []);

  async function changeRole(account, nextRole) {
    if (!nextRole || nextRole === account.role) return;
    try {
      await apiRequest(`/api/admin/users/${account.id}`, {
        method: 'PUT',
        body: { role: nextRole }
      });
      showToast(
        `${account.name} is now ${formatRoleLabel(nextRole)}. Their existing login credentials now open the ${formatRoleLabel(nextRole)} portal.`
      );
      load();
    } catch (error) {
      showToast(error.message || 'Unable to change role.');
    }
  }

  if (!data) {
    return (
      <section>
        <PageHeader title="Account Oversight" subtitle="View every account; switch Recruiter and Admin roles." />
        <Card><EmptyState text="Loading accounts..." /></Card>
      </section>
    );
  }

  return (
    <section>
      <PageHeader title="Account Oversight" subtitle="View every account; switch Recruiter and Admin roles." />
      <Card title="All accounts" action={<span className="text-[13px] text-slate-500">Super Admin controls</span>}>
        <div className="mb-4 grid gap-3.5 md:grid-cols-4">
          <StatTile label="Super Admins" value={data.totals.super_admin} />
          <StatTile label="Admins" value={data.totals.admin} />
          <StatTile label="Recruiters" value={data.totals.recruiter} />
          <StatTile label="Users" value={data.totals.user} />
        </div>
        <DataTable headers={['Name', 'Email', 'Role', 'Status']}>
          {data.accounts.map((a) => (
            <tr key={a.id}>
              <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] font-bold text-slate-900">{a.name}</td>
              <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] text-slate-500">{a.email}</td>
              <td className="border-t border-slate-200 px-2.5 py-2.5">
                {(a.role === 'recruiter' || a.role === 'admin') ? (
                  <select
                    value={a.role}
                    onChange={(e) => changeRole(a, e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[13px] font-bold text-violet-800"
                    aria-label={`Change role for ${a.name}`}
                  >
                    <option value="recruiter">Recruiter</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <Pill tone="violet">{formatRoleLabel(a.role)}</Pill>
                )}
              </td>
              <td className="border-t border-slate-200 px-2.5 py-2.5"><Pill>{a.status}</Pill></td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </section>
  );
}

function PermissionsEditor({ showToast }) {
  const [roles, setRoles] = useState([]);
  const [saving, setSaving] = useState('');

  async function load() {
    try {
      const data = await apiRequest('/api/super-admin/permissions');
      setRoles(data.roles || []);
    } catch (error) {
      showToast(error.message || 'Unable to load permissions.');
    }
  }
  useEffect(() => { load(); }, []);

  function toggle(role, perm) {
    setRoles((prev) => prev.map((r) => {
      if (r.role !== role) return r;
      const has = r.current.includes(perm);
      if (has && r.mandatory.includes(perm)) return r;
      return { ...r, current: has ? r.current.filter((p) => p !== perm) : [...r.current, perm] };
    }));
  }

  async function save(role) {
    const entry = roles.find((r) => r.role === role);
    setSaving(role);
    try {
      const data = await apiRequest(`/api/super-admin/permissions/${role}`, {
        method: 'PUT',
        body: { permissions: entry.current }
      });
      setRoles((prev) => prev.map((r) => (r.role === role ? { ...r, current: data.permissions } : r)));
      showToast(`${formatRoleLabel(role)} permissions saved — affected staff must sign in again.`);
    } catch (error) {
      showToast(error.message || 'Save failed.');
    } finally {
      setSaving('');
    }
  }

  return (
    <section>
      <PageHeader title="Role Permissions" subtitle="Grant or revoke capabilities per role." />
      <Card title="Role permissions">
        <p className="mb-1.5 text-[13px] text-slate-500">
          Grant or revoke capabilities for Admins and Recruiters. Some permissions are
          mandatory and locked. Super Admin and User permissions are fixed.
        </p>
        <p className="mb-4 text-[13px] text-slate-500">
          Changing a role's permissions forces affected staff to sign in again.
        </p>
        {roles.length ? roles.map((r) => (
          <div key={r.role} className="mb-3.5 rounded-2xl bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">
                {formatRoleLabel(r.role)}{' '}
                <Pill tone="violet">{r.role.replace('_', ' ')}</Pill>
              </h3>
              <button className={btnPrimaryClass} disabled={saving === r.role} onClick={() => save(r.role)}>
                {saving === r.role ? 'Saving...' : 'Save changes'}
              </button>
            </div>
            {r.allowed.map((perm) => {
              const checked = r.current.includes(perm);
              const locked = r.mandatory.includes(perm);
              return (
                <label
                  key={perm}
                  className="mb-1.5 flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-semibold text-slate-700"
                >
                  <span>
                    {perm}
                    {locked && <span className="ml-2 text-xs text-slate-400">— mandatory</span>}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={() => toggle(r.role, perm)}
                    className="h-4 w-4 accent-violet-600"
                  />
                </label>
              );
            })}
          </div>
        )) : <EmptyState text="Loading permissions..." />}
      </Card>
    </section>
  );
}

function AuditLogsPage({ showToast }) {
  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    apiRequest('/api/super-admin/audit-logs')
      .then((d) => setAuditLogs(d.auditLogs || []))
      .catch((e) => showToast(e.message || 'Unable to load audit logs.'));
  }, []);

  return (
    <section>
      <PageHeader title="Audit Logs" subtitle="Every sensitive action on the platform." />
      <Card
        title="Audit logs"
        action={
          <button onClick={() => downloadUrl('/api/exports/super-admin/audit-logs.csv')} className={btnSmClass}>
            <Download size={12} className="mr-1 inline" /> Export CSV
          </button>
        }
      >
        <p className="mb-3.5 text-[13px] text-slate-500">
          Every sensitive action across the platform, newest first.
        </p>
        {auditLogs.length ? (
          <DataTable headers={['When', 'Actor', 'Action']}>
            {auditLogs.map((log) => (
              <tr key={log.id}>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] text-slate-500">
                  {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                </td>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] font-bold text-slate-900">
                  {log.actorRole || 'system'}
                </td>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] text-slate-600">{log.action}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState text="No audit events found." />
        )}
      </Card>
    </section>
  );
}

function SystemHealth({ showToast }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiRequest('/api/super-admin/system-health')
      .then(setData)
      .catch((e) => showToast(e.message || 'Unable to load system health.'));
  }, []);

  if (!data) {
    return (
      <section>
        <PageHeader title="System Health" subtitle="Database, email, and job sources." />
        <Card><EmptyState text="Loading system health..." /></Card>
      </section>
    );
  }

  return (
    <section>
      <PageHeader title="System Health" subtitle="Database, email, and job sources." />
      <Card title="System health">
        <div className="grid gap-3.5 md:grid-cols-2">
          <ListItem
            title="Database"
            meta="MongoDB connection"
            right={<Pill tone="green">Connected</Pill>}
          />
          <ListItem
            title="Email delivery"
            meta="SMTP for invites and notifications"
            right={
              <Pill tone={data.email?.configured ? 'green' : 'amber'}>
                {data.email?.configured ? 'Configured' : 'Not configured'}
              </Pill>
            }
          />
        </div>
      </Card>
      <Card title="Job sources">
        {(data.sources || []).length ? data.sources.map((s) => (
          <ListItem
            key={s.source}
            title={s.source}
            right={<Pill tone={s.ok ? 'green' : 'amber'}>{s.ok ? 'Healthy' : 'Failing'}</Pill>}
          />
        )) : <EmptyState text="No source data yet. Run a job search or probe from the Admin portal." />}
      </Card>
    </section>
  );
}

function SystemSettings({ showToast }) {
  const [settings, setSettings] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    apiRequest('/api/super-admin/settings')
      .then((d) => setSettings(d.settings))
      .catch((e) => showToast(e.message || 'Unable to load settings.'));
  }, []);

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

  return (
    <section>
      <PageHeader title="System Settings" subtitle="Platform configuration and your account." />
      <Card title="Platform settings" className="max-w-xl">
        {settings ? (
          <div className="grid gap-1.5 text-[13px] font-semibold text-slate-700">
            <div className="flex justify-between rounded-lg bg-slate-50 px-3.5 py-2.5">
              <span>Staff inactivity timeout</span>
              <span className="font-extrabold">{settings.sessionPolicy?.staffInactivityMinutes ?? 10} minutes</span>
            </div>
            <div className="flex justify-between rounded-lg bg-slate-50 px-3.5 py-2.5">
              <span>User inactivity timeout</span>
              <span className="font-extrabold">{settings.sessionPolicy?.userInactivityMinutes ?? 60} minutes</span>
            </div>
            <div className="flex justify-between rounded-lg bg-slate-50 px-3.5 py-2.5">
              <span>Recruiter self-registration</span>
              <span className="font-extrabold">{settings.allowRecruiterSelfRegistration ? 'Enabled' : 'Disabled'}</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Session timings are enforced by the backend and frontend.
            </p>
          </div>
        ) : (
          <EmptyState text="Loading settings..." />
        )}
      </Card>
      <Card title="My account & security" className="max-w-xl">
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

function ApprovalsPage({ showToast }) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState('');

  async function load() {
    try {
      const data = await apiRequest('/api/admin/pending-approvals');
      setPending(data.users || []);
    } catch (error) {
      showToast(error.message || 'Unable to load pending approvals.');
      setPending([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function approve(user) {
    setBusy(user.id);
    try {
      await apiRequest(`/api/admin/users/${user.id}/approve`, { method: 'PATCH' });
      showToast(`${user.name} approved \u2014 they can now sign in.`);
      setPending((prev) => (prev || []).filter((u) => u.id !== user.id));
    } catch (error) {
      showToast(error.message || 'Unable to approve account.');
    } finally {
      setBusy('');
    }
  }

  async function decline(user) {
    const reason = window.prompt(
      `Decline ${user.name}? You can add an optional reason (it is emailed to the applicant):`,
      ''
    );
    if (reason === null) return;
    setBusy(user.id);
    try {
      await apiRequest(`/api/admin/users/${user.id}/decline`, {
        method: 'PATCH',
        body: { reason: reason.trim() }
      });
      showToast(`${user.name} was declined.`);
      setPending((prev) => (prev || []).filter((u) => u.id !== user.id));
    } catch (error) {
      showToast(error.message || 'Unable to decline account.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section>
      <PageHeader
        title="Approvals"
        subtitle="Review and approve new user, recruiter, and admin accounts."
      />
      <Card
        title="Pending approvals"
        action={
          <button className="text-[13px] font-bold text-violet-700" onClick={load}>
            Refresh
          </button>
        }
      >
        {pending === null ? (
          <EmptyState text="Loading pending approvals..." />
        ) : pending.length ? (
          <DataTable headers={['Name', 'Email', 'Role', 'Email', 'Decision']}>
            {pending.map((u) => (
              <tr key={u.id}>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] font-bold text-slate-900">{u.name}</td>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] text-slate-500">{u.email}</td>
                <td className="border-t border-slate-200 px-2.5 py-2.5"><Pill tone="violet">{formatRoleLabel(u.role)}</Pill></td>
                <td className="border-t border-slate-200 px-2.5 py-2.5">
                  <Pill tone={u.emailVerified ? 'green' : 'amber'}>{u.emailVerified ? 'Verified' : 'Unverified'}</Pill>
                </td>
                <td className="border-t border-slate-200 px-2.5 py-2.5">
                  <div className="flex gap-2">
                    <button
                      disabled={busy === u.id}
                      onClick={() => approve(u)}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-bold text-white transition hover:bg-violet-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busy === u.id}
                      onClick={() => decline(u)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState text="No accounts are waiting for approval right now." />
        )}
      </Card>
    </section>
  );
}

function SuperAdminPortalSection({ activePage, showToast, setActivePage = () => {} }) {
  if (activePage === 'super-dashboard') {
    return <SuperAdminDashboard showToast={showToast} setActivePage={setActivePage} />;
  }
  if (activePage === 'super-approvals') return <ApprovalsPage showToast={showToast} />;
  if (activePage === 'super-admins') return <AdminInvitationsPage showToast={showToast} />;
  if (activePage === 'super-accounts') return <AccountOversight showToast={showToast} />;
  if (activePage === 'super-permissions') return <PermissionsEditor showToast={showToast} />;
  if (activePage === 'super-audit') return <AuditLogsPage showToast={showToast} />;
  if (activePage === 'super-health' || activePage === 'super-platform') {
    return <SystemHealth showToast={showToast} />;
  }
  if (activePage === 'super-settings') return <SystemSettings showToast={showToast} />;

  return (
    <section>
      <PageHeader title="Super Admin Portal" subtitle="Manage OPUS governance and security." />
      <Card><EmptyState text="Select a section from the sidebar." /></Card>
    </section>
  );
}

export {
  SuperAdminPortalSection
};
