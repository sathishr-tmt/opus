// Top-right profile menu — shown for every role.
//
// Each role's occasional pages live here rather than in the sidebar: things
// you configure once and rarely revisit. The sidebar keeps only what someone
// opens during normal work.
import { useState, useEffect, useRef } from 'react';
import {
  UserCircle, Settings as SettingsIcon, LogOut, Database, Activity
} from 'lucide-react';
import {
  formatRoleLabel, superAdminMenuItems, recruiterMenuItems, adminMenuItems
} from '../lib/constants.js';

function initials(name) {
  return String(name || 'U')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Job seekers are the only role with an editable Profile page (basic info and
// resume); for them Settings stays in the sidebar, so the dropdown is short.
const USER_MENU = [
  { id: 'profile', label: 'Profile' },
  { id: 'settings', label: 'Settings' }
];

function menuItemsFor(role) {
  if (role === 'super_admin') return superAdminMenuItems;
  if (role === 'admin') return adminMenuItems;
  if (role === 'recruiter') return recruiterMenuItems;
  return USER_MENU;
}

// Pick an icon that matches what the item actually is.
function iconFor(id) {
  if (id.endsWith('-sources')) return Database;
  if (id.endsWith('-health')) return Activity;
  if (id === 'profile' || id.endsWith('-profile')) return UserCircle;
  return SettingsIcon;
}

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
  const items = menuItemsFor(role);

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
        <span className="hidden text-sm font-bold text-slate-900 sm:block">
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

          {items.map((item) => {
            const Icon = iconFor(item.id);

            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Icon size={17} /> {item.label}
              </button>
            );
          })}

          <div className="border-t border-slate-100" />

          {/* Sign Out is here as well as at the foot of the sidebar. */}
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
