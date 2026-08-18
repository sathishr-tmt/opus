// TopBar — one header for every role, matching the OPUS SaaS prototype:
// brand + role chip, sidebar toggle, working global search, theme toggle,
// live notification bell, and the profile menu.
//
// Search and notifications are backed by /api/search and /api/notifications,
// both of which are role-scoped on the server — this component never decides
// what a user is allowed to see.
import { useState, useEffect, useRef } from 'react';
import { Bell, Sun, Moon, Menu, Search, Loader2 } from 'lucide-react';
import { OpusMark } from './Logo.jsx';
import { ProfileMenu } from './ProfileMenu.jsx';
import { apiRequest } from '../lib/api.js';

const TONE_DOT = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-400'
};

function roleLabel(role) {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  if (role === 'recruiter') return 'Recruiter';
  return 'User';
}

/* ------------------------------------------------------------------ *
 * Global search with a results dropdown.
 * ------------------------------------------------------------------ */
function GlobalSearch({ setActivePage }) {
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  // Close when clicking anywhere else.
  useEffect(() => {
    function onClickAway(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  // Debounced lookup so we are not firing a request per keystroke.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setGroups([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const data = await apiRequest(`/api/search?q=${encodeURIComponent(term)}`);
        setGroups(data.groups || []);
        setOpen(true);
      } catch {
        setGroups([]);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(handle);
  }, [query]);

  function choose(item) {
    setOpen(false);
    setQuery('');
    if (item.page) setActivePage(item.page);
  }

  const hasResults = groups.some((group) => group.items?.length);

  return (
    <div ref={boxRef} className="relative hidden lg:block">
      <div className="flex w-[280px] items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2">
        {loading ? (
          <Loader2 size={16} className="animate-spin text-slate-400" />
        ) : (
          <Search size={16} className="text-slate-400" />
        )}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          placeholder="Search OPUS…"
          className="w-full border-0 bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute right-0 top-[46px] z-40 max-h-[420px] w-[380px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {!hasResults ? (
            <p className="px-3 py-6 text-center text-[13px] text-slate-400">
              {loading ? 'Searching…' : `Nothing found for "${query.trim()}"`}
            </p>
          ) : (
            groups
              .filter((group) => group.items?.length)
              .map((group) => (
                <div key={group.label} className="mb-1 last:mb-0">
                  <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => choose(item)}
                      className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="block truncate text-[13px] font-bold text-slate-900">
                        {item.title}
                      </span>
                      {item.meta && (
                        <span className="block truncate text-[11.5px] text-slate-500">
                          {item.meta}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Notification bell with a real dropdown.
 * ------------------------------------------------------------------ */
function NotificationBell({ setActivePage, extraAlerts = 0 }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  async function load() {
    try {
      const data = await apiRequest('/api/notifications');
      setItems(data.items || []);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    // Refresh quietly every two minutes.
    const timer = setInterval(load, 120000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function onClickAway(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const count = items.length + extraAlerts;

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => { setOpen((value) => !value); if (!open) load(); }}
        className="relative rounded-xl bg-slate-100 p-2.5 text-slate-600 hover:bg-slate-200"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell size={17} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[46px] z-40 max-h-[420px] w-[340px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
            Notifications
          </p>

          {!items.length ? (
            <p className="px-3 py-6 text-center text-[13px] text-slate-400">
              You are all caught up.
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => { setOpen(false); if (item.page) setActivePage(item.page); }}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    TONE_DOT[item.tone] || TONE_DOT.slate
                  }`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-slate-900">
                    {item.title}
                  </span>
                  {item.meta && (
                    <span className="block truncate text-[11.5px] text-slate-500">
                      {item.meta}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TopBar({
  showToast, gmailStatus, currentUser, setActivePage,
  onLogout, theme, onToggleTheme, onToggleSidebar
}) {
  const isDark = theme === 'dark';
  const role = currentUser?.role || 'user';
  const gmailAlertCount = gmailStatus?.alerts?.length || 0;

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-[60px] items-center gap-3 border-b border-slate-200 bg-white/90 px-[22px] backdrop-blur">
      <button
        onClick={onToggleSidebar}
        aria-label="Toggle menu"
        title="Toggle menu"
        className="flex h-9 w-9 items-center justify-center rounded-[10px] text-slate-600 transition hover:bg-slate-100"
      >
        <Menu size={19} />
      </button>

      <div className="flex items-center gap-2">
        <OpusMark size={27} />
        <span className="text-lg font-extrabold tracking-wide text-slate-900">OPUS</span>
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-violet-700">
          {roleLabel(role)}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <GlobalSearch setActivePage={setActivePage} />

        <button
          onClick={onToggleTheme}
          className="rounded-xl bg-slate-100 p-2.5 text-slate-600 hover:bg-slate-200"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <NotificationBell
          setActivePage={setActivePage}
          extraAlerts={role === 'user' ? gmailAlertCount : 0}
        />

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
