// TopBar — sidebar toggle, theme toggle, notifications (users), and the shared profile menu.
import { Bell, Sun, Moon, Menu } from 'lucide-react';
import { ProfileMenu } from './ProfileMenu.jsx';

function TopBar({ showToast, gmailStatus, currentUser, setActivePage, onLogout, theme, onToggleTheme, onToggleSidebar }) {
  const gmailAlertCount = gmailStatus?.alerts?.length || 0;
  const isDark = theme === 'dark';

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
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-7 backdrop-blur">
      <button
        onClick={onToggleSidebar}
        className="rounded-xl bg-slate-100 p-2.5 text-slate-600 hover:bg-slate-200"
        title="Toggle menu"
        aria-label="Toggle menu"
      >
        <Menu size={18} />
      </button>

      <div className="flex items-center gap-3">
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
              <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-extrabold text-white">
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
