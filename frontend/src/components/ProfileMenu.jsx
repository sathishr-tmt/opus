// Top-right profile menu — shown for every role (user, recruiter, admin,
// super admin). Clicking the avatar opens a small dropdown with the account
// name/role, a Profile shortcut, Settings, and Sign Out.
import { useState, useEffect, useRef } from 'react';
import { UserCircle, Settings as SettingsIcon, LogOut, Database, Activity } from 'lucide-react';
import { formatRoleLabel, superAdminMenuItems, recruiterMenuItems } from '../lib/constants.js';

function initials(name) {
  return String(name || 'U')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Per-role menu. Only the USER has an editable Profile (basic info + resume).
// Staff roles have no separate editable profile, so their menu is just Settings
// + Sign Out — their name/email/role are fixed at account creation.
const MENU = {
  user: { profile: 'profile', settings: 'settings' },
  recruiter: { settings: 'recruiter-settings' },
  admin: { settings: 'admin-settings' },
  super_admin: { settings: 'super-settings' }
};

function ProfileMenu({ currentUser, setActivePage, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function closeOnOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, []);

  const role = currentUser?.role || 'user';
  const pages = MENU[role] || MENU.user;

  function go(pageId) {
    setOpen(false);
    setActivePage(pageId);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 hover:bg-slate-100"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-sm font-extrabold text-blue-700">
          {initials(currentUser?.name)}
        </div>
        <span className="text-sm font-bold text-slate-900">
          {currentUser?.name || 'Account'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-extrabold text-slate-900">
              {currentUser?.name || 'Account'}
            </p>
            <p className="truncate text-xs text-slate-500">{currentUser?.email}</p>
            <span className="mt-1.5 inline-flex rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">
              {formatRoleLabel(role)}
            </span>
          </div>

          {/* Profile appears for job seekers only (editable basic info + resume). */}
          {pages.profile && (
            <button
              onClick={() => go(pages.profile)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <UserCircle size={17} /> Profile
            </button>
          )}

          {/* Super Admin keeps platform configuration here rather than in the
              sidebar: visited occasionally, not part of the daily flow. */}
          {role === 'super_admin' || role === 'recruiter' ? (
            (role === 'super_admin' ? superAdminMenuItems : recruiterMenuItems).map((item) => {
              const Icon =
                item.id === 'super-sources'
                  ? Database
                  : item.id === 'super-health'
                  ? Activity
                  : item.id === 'recruiter-profile'
                  ? UserCircle
                  : SettingsIcon;

              return (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Icon size={17} /> {item.label}
                </button>
              );
            })
          ) : (
            <button
              onClick={() => go(pages.settings)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <SettingsIcon size={17} /> Settings
            </button>
          )}

          <div className="border-t border-slate-100" />

          <button
            onClick={() => {
              setOpen(false);
              onLogout('manual');
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            <LogOut size={17} /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

export {
  ProfileMenu
};
