// Sidebar — compact prototype design (OPUS mark, flat nav, sign-out at bottom).
import { HelpCircle, LogOut } from 'lucide-react';
import { userNavItems, recruiterNavItems, adminNavItems, superAdminNavItems } from '../lib/constants.js';
import { OpusMark } from './Logo.jsx';

function Sidebar({ activePage, setActivePage, currentUser, onLogout, badges = {} }) {
  const role = currentUser?.role || 'user';

  const navItems =
    role === 'super_admin'
      ? superAdminNavItems
      : role === 'admin'
      ? adminNavItems
      : role === 'recruiter'
      ? recruiterNavItems
      : userNavItems;

  const roleTag =
    role === 'super_admin'
      ? 'Super Admin'
      : role === 'admin'
      ? 'Admin'
      : role === 'recruiter'
      ? 'Recruiter'
      : '';

  function NavButton({ id, label, icon: Icon, badge }) {
    const active = activePage === id;
    return (
      <button
        onClick={() => setActivePage(id)}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
          active
            ? 'bg-violet-50 text-violet-700'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <Icon size={18} className="shrink-0" />
        <span className="truncate">{label}</span>
        {badge > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-extrabold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className="fixed left-0 top-0 z-20 flex h-screen w-60 flex-col border-r border-slate-200 bg-white px-3.5 py-4">
      <div className="mb-4 flex items-center gap-2 px-2">
        <OpusMark size={34} />
        <span className="text-lg font-extrabold text-slate-900">OPUS</span>
        {roleTag && (
          <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-violet-700">
            {roleTag}
          </span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavButton key={item.id} {...item} badge={badges[item.id]} />
        ))}

        <div className="flex-1" />

        <NavButton id="help" label="Help & Support" icon={HelpCircle} />

        <div className="mx-1.5 my-2 border-t border-slate-200" />

        <button
          onClick={() => onLogout('manual')}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          <LogOut size={18} className="shrink-0" />
          Sign Out
        </button>
      </nav>
    </aside>
  );
}

export {
  Sidebar
};
