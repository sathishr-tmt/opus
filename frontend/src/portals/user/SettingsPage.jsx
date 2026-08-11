// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

import { useState, useEffect } from 'react';
import {
  KeyRound,
  MailCheck,
  Settings
} from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { PageHeader, FilterInput } from '../../components/ui.jsx';

// Professional on/off switch that actually reflects and persists state.
function Toggle({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
        on ? 'bg-violet-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function SettingsPage({
  onDashboardChange,
  showToast,
  currentUser,
  onLogout
}) {
  const [settings, setSettings] = useState({
    name: '',
    phone: '',
    location: '',
    about: '',
    notifications: {
      email: true,
      interviews: true,
      jobAlerts: true
    }
  });

  const [emailForm, setEmailForm] = useState({
    currentPassword: '',
    newEmail: ''
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [saving, setSaving] = useState(false);
  const [savingNotification, setSavingNotification] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [developmentVerificationUrl, setDevelopmentVerificationUrl] =
    useState('');

  async function loadSettings() {
    try {
      const data = await apiRequest('/api/settings');
      setSettings((previous) => ({
        ...previous,
        ...(data.settings || {})
      }));
    } catch (error) {
      showToast(error.message || 'Failed to load settings.');
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function updateSetting(name, value) {
    setSettings((previous) => ({
      ...previous,
      [name]: value
    }));
  }

  function updateNotification(name, value) {
    setSettings((previous) => ({
      ...previous,
      notifications: {
        ...(previous.notifications || {}),
        [name]: value
      }
    }));
  }

  // Each notification toggle saves immediately (optimistic + revert on error).
  async function toggleNotification(key) {
    const nextValue = !settings.notifications?.[key];
    const nextNotifications = {
      ...(settings.notifications || {}),
      [key]: nextValue
    };

    updateNotification(key, nextValue); // optimistic
    setSavingNotification(key);

    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: {
          name: settings.name,
          phone: settings.phone,
          location: settings.location,
          about: settings.about,
          notifications: nextNotifications
        }
      });
      showToast('Notification preference saved.');
    } catch (error) {
      updateNotification(key, !nextValue); // revert
      showToast(error.message || 'Unable to save preference.');
    } finally {
      setSavingNotification('');
    }
  }

  async function saveSettings() {
    setSaving(true);

    try {
      const data = await apiRequest('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          name: settings.name,
          phone: settings.phone,
          location: settings.location,
          about: settings.about,
          notifications: settings.notifications
        })
      });

      setSettings((previous) => ({
        ...previous,
        ...(data.settings || {})
      }));

      await onDashboardChange();
      showToast('Profile and notification settings saved.');
    } catch (error) {
      showToast(error.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function requestEmailChange(event) {
    event.preventDefault();
    setDevelopmentVerificationUrl('');

    if (!emailForm.currentPassword || !emailForm.newEmail.trim()) {
      showToast('Enter your current password and new email address.');
      return;
    }

    setEmailLoading(true);

    try {
      const data = await apiRequest('/api/account/change-email/request', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: emailForm.currentPassword,
          newEmail: emailForm.newEmail.trim()
        })
      });

      setEmailForm({ currentPassword: '', newEmail: '' });
      setDevelopmentVerificationUrl(data.developmentVerificationUrl || '');
      showToast(
        data.message ||
          'Verification instructions were sent to your new email address.'
      );
    } catch (error) {
      showToast(error.message || 'Unable to request an email change.');
    } finally {
      setEmailLoading(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();

    if (
      !passwordForm.currentPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
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
        body: JSON.stringify(passwordForm)
      });

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      showToast(data.message || 'Password changed successfully.');

      window.setTimeout(() => {
        onLogout('security');
      }, 800);
    } catch (error) {
      showToast(error.message || 'Unable to change password.');
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <section>
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, notifications, email address, and password."
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">
            Profile Preferences
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FilterInput
              label="Name"
              value={settings.name || ''}
              onChange={(value) => updateSetting('name', value)}
            />

            <FilterInput
              label="Current Login Email"
              type="email"
              value={currentUser?.email || ''}
              onChange={() => {}}
              disabled
            />

            <FilterInput
              label="Phone"
              value={settings.phone || ''}
              onChange={(value) => updateSetting('phone', value)}
            />

            <FilterInput
              label="Location"
              value={settings.location || ''}
              onChange={(value) => updateSetting('location', value)}
            />
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              About
            </span>

            <textarea
              value={settings.about || ''}
              onChange={(event) => updateSetting('about', event.target.value)}
              rows="5"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />
          </label>

          <button
            onClick={saveSettings}
            disabled={saving}
            className="mt-5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Profile Preferences'}
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Notifications</h2>
          <p className="mt-1 text-sm text-slate-500">Changes save automatically.</p>

          <div className="mt-4 grid gap-3">
            {[
              ['email', 'Email notifications'],
              ['interviews', 'Interview reminders'],
              ['jobAlerts', 'Job alerts']
            ].map(([key, label]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"
              >
                <span className="font-bold text-slate-700">{label}</span>

                <Toggle
                  on={Boolean(settings.notifications?.[key])}
                  disabled={savingNotification === key}
                  onChange={() => toggleNotification(key)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <PageHeader
          title="Account & Security"
          subtitle="Sensitive account changes require your current password."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={requestEmailChange}
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <MailCheck size={23} />
          </div>

          <h2 className="mt-4 text-lg font-black text-slate-900">
            Change Email
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Your current email remains active until you verify the new address.
          </p>

          <div className="mt-5 grid gap-4">
            <FilterInput
              label="New Email Address"
              type="email"
              autoComplete="email"
              value={emailForm.newEmail}
              onChange={(value) =>
                setEmailForm((previous) => ({
                  ...previous,
                  newEmail: value
                }))
              }
              placeholder="new-email@example.com"
            />

            <FilterInput
              label="Current Password"
              type="password"
              autoComplete="current-password"
              value={emailForm.currentPassword}
              onChange={(value) =>
                setEmailForm((previous) => ({
                  ...previous,
                  currentPassword: value
                }))
              }
              placeholder="Confirm your current password"
            />
          </div>

          {developmentVerificationUrl && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              SMTP is not configured. For local development, open this
              verification link:
              <a
                href={developmentVerificationUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block break-all font-black text-violet-700 underline"
              >
                {developmentVerificationUrl}
              </a>
            </div>
          )}

          <button
            type="submit"
            disabled={emailLoading}
            className="mt-5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {emailLoading ? 'Sending Verification...' : 'Verify New Email'}
          </button>
        </form>

        <form
          onSubmit={changePassword}
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <KeyRound size={23} />
          </div>

          <h2 className="mt-4 text-lg font-black text-slate-900">
            Change Password
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            After a successful password change, OPUS signs you out and requires
            the new password.
          </p>

          <div className="mt-5 grid gap-4">
            <FilterInput
              label="Current Password"
              type="password"
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={(value) =>
                setPasswordForm((previous) => ({
                  ...previous,
                  currentPassword: value
                }))
              }
            />

            <FilterInput
              label="New Password"
              type="password"
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={(value) =>
                setPasswordForm((previous) => ({
                  ...previous,
                  newPassword: value
                }))
              }
              placeholder="Minimum 8 characters"
            />

            <FilterInput
              label="Confirm New Password"
              type="password"
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(value) =>
                setPasswordForm((previous) => ({
                  ...previous,
                  confirmPassword: value
                }))
              }
            />
          </div>

          <button
            type="submit"
            disabled={passwordLoading}
            className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {passwordLoading ? 'Changing Password...' : 'Change Password'}
          </button>
        </form>
      </div>
    </section>
  );
}

export {
  SettingsPage
};
