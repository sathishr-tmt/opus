// Account panel — one component every role uses to manage their own account:
// display name, email address, and password.
//
// Previously only job seekers could change their email; recruiters, admins and
// super admins could change a password and nothing else, even though the
// backend supported it for any signed-in user.
//
// Role, company and status are shown but not editable: those are set by
// whoever created the account, and letting someone edit their own role would
// defeat the permission system.
import { useState } from 'react';
import { UserCircle, MailCheck, KeyRound } from 'lucide-react';
import { apiRequest } from '../lib/api.js';
import { Card, Field, inputClass, btnPrimaryClass } from './ui.jsx';

function AccountPanel({ currentUser, showToast, onLogout, onUserChange, roleLabel }) {
  const [name, setName] = useState(currentUser?.name || '');
  const [savingName, setSavingName] = useState(false);

  const [emailForm, setEmailForm] = useState({ currentPassword: '', newEmail: '' });
  const [emailLoading, setEmailLoading] = useState(false);
  const [developmentVerificationUrl, setDevelopmentVerificationUrl] = useState('');

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  async function saveName() {
    if (name.trim().length < 2) {
      showToast('Enter a name of at least 2 characters.');
      return;
    }

    setSavingName(true);
    try {
      const data = await apiRequest('/api/account/profile', {
        method: 'PATCH',
        body: { name: name.trim() }
      });
      showToast(data.message || 'Profile updated.');
      if (onUserChange && data.user) onUserChange(data.user);
    } catch (error) {
      showToast(error.message || 'Unable to update your profile.');
    } finally {
      setSavingName(false);
    }
  }

  async function requestEmailChange(event) {
    event.preventDefault();
    setDevelopmentVerificationUrl('');

    if (!emailForm.currentPassword || !emailForm.newEmail.trim()) {
      showToast('Enter your current password and the new email address.');
      return;
    }

    setEmailLoading(true);
    try {
      const data = await apiRequest('/api/account/change-email/request', {
        method: 'POST',
        body: {
          currentPassword: emailForm.currentPassword,
          newEmail: emailForm.newEmail.trim()
        }
      });

      setEmailForm({ currentPassword: '', newEmail: '' });
      setDevelopmentVerificationUrl(data.developmentVerificationUrl || '');
      showToast(data.message || 'Verification sent to the new address.');
    } catch (error) {
      showToast(error.message || 'Unable to request an email change.');
    } finally {
      setEmailLoading(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();

    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      showToast('Complete all password fields.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast('New password and confirmation do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      const data = await apiRequest('/api/account/change-password', {
        method: 'POST',
        body: passwordForm
      });

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast(data.message || 'Password changed.');

      // A password change invalidates the session, so sign out cleanly.
      if (onLogout) window.setTimeout(() => onLogout('security'), 900);
    } catch (error) {
      showToast(error.message || 'Unable to change your password.');
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <>
      <Card
        title="Your details"
        hint="Role and company are set by whoever created this account and cannot be changed here."
        className="max-w-2xl"
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <UserCircle size={22} />
          </span>
          <div>
            <p className="text-sm font-extrabold text-slate-900">
              {currentUser?.name || 'Account'}
            </p>
            <p className="text-xs text-slate-500">
              {currentUser?.email} · {roleLabel}
            </p>
          </div>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2">
          <Field label="Display name">
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Company">
            <input className={inputClass} value={currentUser?.company || '—'} disabled />
          </Field>
        </div>

        <button className={btnPrimaryClass} disabled={savingName} onClick={saveName}>
          {savingName ? 'Saving...' : 'Save name'}
        </button>
      </Card>

      <div className="grid gap-3.5 xl:grid-cols-2">
        <form onSubmit={requestEmailChange}>
          <Card
            title="Change email"
            hint="Your current address stays active until you verify the new one."
          >
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <MailCheck size={19} />
            </span>

            <Field label="New email address">
              <input
                type="email"
                autoComplete="email"
                className={inputClass}
                placeholder="new-email@example.com"
                value={emailForm.newEmail}
                onChange={(event) =>
                  setEmailForm((previous) => ({ ...previous, newEmail: event.target.value }))
                }
              />
            </Field>

            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                className={inputClass}
                placeholder="Confirm your current password"
                value={emailForm.currentPassword}
                onChange={(event) =>
                  setEmailForm((previous) => ({
                    ...previous,
                    currentPassword: event.target.value
                  }))
                }
              />
            </Field>

            {developmentVerificationUrl && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                Email is not configured on this server. Open this link to verify:
                <a
                  href={developmentVerificationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all font-bold text-violet-700 underline"
                >
                  {developmentVerificationUrl}
                </a>
              </div>
            )}

            <button type="submit" className={btnPrimaryClass} disabled={emailLoading}>
              {emailLoading ? 'Sending...' : 'Verify new email'}
            </button>
          </Card>
        </form>

        <form onSubmit={changePassword}>
          <Card
            title="Change password"
            hint="You will be signed out afterwards and must sign in again."
          >
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <KeyRound size={19} />
            </span>

            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                className={inputClass}
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((previous) => ({
                    ...previous,
                    currentPassword: event.target.value
                  }))
                }
              />
            </Field>

            <Field label="New password">
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                placeholder="Minimum 8 characters"
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm((previous) => ({
                    ...previous,
                    newPassword: event.target.value
                  }))
                }
              />
            </Field>

            <Field label="Confirm new password">
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={passwordForm.confirmPassword}
                onChange={(event) =>
                  setPasswordForm((previous) => ({
                    ...previous,
                    confirmPassword: event.target.value
                  }))
                }
              />
            </Field>

            <button type="submit" className={btnPrimaryClass} disabled={passwordLoading}>
              {passwordLoading ? 'Changing...' : 'Change password'}
            </button>
          </Card>
        </form>
      </div>
    </>
  );
}

export {
  AccountPanel
};
