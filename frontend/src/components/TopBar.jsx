// TopBar — full-width header: OPUS logo with a three-line (hamburger) button
// directly under it, plus theme toggle, notifications (users), and profile menu.
import { Bell, Sun, Moon, Menu } from 'lucide-react';
import { OpusMark } from './Logo.jsx';
import { ProfileMenu } from './ProfileMenu.jsx';

function TopBar({ showToast, gmailStatus, currentUser, setActivePage, onLogout, theme, onToggleTheme, onToggleSidebar }) {
  const gmailAlertCount = gmailStatus?.alerts?.length || 0;
  const isDark = theme === 'dark';

  const role = currentUser?.role || 'user';
  const roleTag =
    role === 'super_admin'
      ? 'Super Admin'
      : role === 'admin'
      ? 'Admin'
      : role === 'recruiter'
      ? 'Recruiter'
      : '';

  function handleNotifications() {
    if (!gmailAlertCount) {
      showToast('No recruiter email notifications yet.');
      return;
    }

    showToast(
      `${gmailAlertCount} recruiter email notification${
        gmailAlertCount > 1 ? 's' : ''
      } found.`
    );
  }

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-[84px] items-center gap-3 border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <OpusMark size={30} />
          <span className="text-lg font-extrabold text-slate-900">OPUS</span>
          {roleTag && (
            <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-violet-700">
              {roleTag}
            </span>
          )}
        </div>

        <button
          onClick={onToggleSidebar}
          aria-label="Toggle menu"
          title="Toggle menu"
          className="flex h-8 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
        >
          <Menu size={20} />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={onToggleTheme}
          className="rounded-xl bg-slate-100 p-2.5 text-slate-600 hover:bg-slate-200"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {currentUser?.role === 'user' && (
          <button
            onClick={handleNotifications}
            className="relative rounded-xl bg-slate-100 p-2.5 hover:bg-slate-200"
            title="Notifications"
          >
            <Bell size={17} />
            {gmailAlertCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-extrabold text-white">
                {gmailAlertCount > 9 ? '9+' : gmailAlertCount}
              </span>
            )}
          </button>
        )}

        <ProfileMenu
          currentUser={currentUser}
          setActivePage={setActivePage}
          onLogout={onLogout}
        />
      </div>
    </header>
  );
}

export {
  TopBar
};
