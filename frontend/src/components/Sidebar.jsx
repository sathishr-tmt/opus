// Sidebar — menu only (the OPUS logo now lives in the top header). It sits
// below the header and collapses to zero width so the content widens. The
// three-line button in the header toggles `open`.
import { HelpCircle, LogOut } from 'lucide-react';
import { userNavItems, recruiterNavItems, adminNavItems, superAdminNavItems } from '../lib/constants.js';

function Sidebar({ activePage, setActivePage, currentUser, onLogout, badges = {}, open = true }) {
  const role = currentUser?.role || 'user';

  const navItems =
    role === 'super_admin'
      ? superAdminNavItems
      : role === 'admin'
      ? adminNavItems
      : role === 'recruiter'
      ? recruiterNavItems
      : userNavItems;

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
    <aside
      className={`fixed left-0 top-[84px] bottom-0 z-20 overflow-hidden border-r border-slate-200 bg-white transition-all duration-300 ${
        open ? 'w-60' : 'w-0 border-r-0'
      }`}
    >
      <nav className="flex h-full w-60 flex-col gap-0.5 overflow-y-auto px-3.5 py-4">
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
