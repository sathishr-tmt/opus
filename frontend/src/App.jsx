// OPUS frontend root — composed from the Step 4 modular split.
import { useState, useEffect, useRef } from 'react';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import AdminInvitation from './pages/AdminInvitation';
import { ResumeOnboarding } from './pages/ResumeOnboarding.jsx';
import { readStoredUser, saveSession, clearSession, apiRequest } from './lib/api.js';
import { LOGIN_PATH, ROLE_HOME_PATHS, ROLE_LOGIN_PATHS, getPathForPage, getPageForPath, navigateTo, STAFF_INACTIVITY_LIMIT_MS, USER_INACTIVITY_LIMIT_MS } from './lib/router.js';
import { resolveInitialTheme, applyTheme, saveTheme } from './lib/theme.js';
import { Toast, SessionVerificationScreen } from './components/ui.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { TopBar } from './components/TopBar.jsx';
import { HelpSupportPage } from './components/HelpSupportPage.jsx';
import { DashboardPage } from './portals/user/DashboardPage.jsx';
import { JobSearchPage } from './portals/user/JobSearchPage.jsx';
import { CalendarPage } from './portals/user/CalendarPage.jsx';
import { SettingsPage } from './portals/user/SettingsPage.jsx';
import { MyApplicationsPage } from './portals/user/MyApplicationsPage.jsx';
import { MyResumesPage } from './portals/user/MyResumesPage.jsx';
import { ProfileResumePage } from './portals/user/ProfileResumePage.jsx';
import { RecruiterRegisterPage } from './portals/staff/RecruiterRegisterPage.jsx';
import { RecruiterPortalPage } from './portals/staff/RecruiterPortalPage.jsx';
import { AdminPortalSection } from './portals/staff/AdminPortalSection.jsx';
import { SuperAdminPortalSection } from './portals/staff/SuperAdminPortalSection.jsx';

function App() {
  const [path, setPath] = useState(window.location.pathname || '/login');
  const [activePage, setActivePageState] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [toast, setToast] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [theme, setThemeState] = useState(resolveInitialTheme);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Apply the theme to <html> whenever it changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      return next;
    });
  }

  // Refs let the popstate handler (registered once) read the latest values.
  const currentUserRef = useRef(null);
  const handleLogoutRef = useRef(null);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [gmailStatus, setGmailStatus] = useState({
    connected: false,
    alerts: []
  });

  // Job seekers see a one-time resume step after their first login, until a
  // base resume exists. `null` = not yet checked.
  const [needsResumeOnboarding, setNeedsResumeOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  async function checkResumeOnboarding(user) {
    if (!user || user.role !== 'user') {
      setNeedsResumeOnboarding(false);
      setOnboardingChecked(true);
      return;
    }
    try {
      const data = await apiRequest('/api/documents');
      setNeedsResumeOnboarding(!data.baseResume);
    } catch {
      setNeedsResumeOnboarding(false);
    } finally {
      setOnboardingChecked(true);
    }
  }

  function showToast(message) {
    setToast(message);
    window.clearTimeout(window.opusToastTimer);
    window.opusToastTimer = window.setTimeout(() => setToast(''), 3000);
  }

  function defaultPageForRole(role) {
    if (role === 'super_admin') return 'super-dashboard';
    if (role === 'admin') return 'admin-dashboard';
    if (role === 'recruiter') return 'recruiter-dashboard';
    return 'dashboard';
  }

  function setActivePage(page) {
  const role =
    currentUser?.role ||
    readStoredUser()?.role ||
    'user';

  const nextPath = getPathForPage(role, page);

  setActivePageState(page);

  if (window.location.pathname !== nextPath) {
    // Replace the current portal history entry.
    // This prevents browser Back from reversing every sidebar click.
    navigateTo(nextPath, true);
  }

  window.dispatchEvent(new Event('opus-activity'));
}

  async function loadDashboard() {
    if (!currentUser || currentUser.role !== 'user') return;

    try {
      const data = await apiRequest('/api/dashboard');
      setDashboard(data);
    } catch (error) {
      if (error.status === 401) {
        handleLogout('expired');
        return;
      }

      showToast('Failed to load dashboard.');
    }
  }

  async function loadGmailStatus() {
    if (!currentUser || currentUser.role !== 'user') return;

    try {
      const data = await apiRequest('/api/gmail/status');

      setGmailStatus({
        connected: data.connected || false,
        connectedAt: data.connectedAt || null,
        lastCheckedAt: data.lastCheckedAt || null,
        alerts: data.alerts || []
      });
    } catch {
      setGmailStatus({ connected: false, alerts: [] });
    }
  }

  async function connectGmail() {
    try {
      const data = await apiRequest('/api/gmail/auth-url');

      if (!data.authUrl) {
        throw new Error('The server did not return a Gmail authorization URL.');
      }

      window.location.assign(data.authUrl);
    } catch (error) {
      showToast(error.message || 'Unable to start Gmail connection.');
    }
  }

  async function checkGmailResponses() {
    try {
      const data = await apiRequest('/api/gmail/check-responses');
      await loadGmailStatus();

      if (data.alerts?.length) {
        showToast(
          `${data.alerts.length} recruiter email response${
            data.alerts.length > 1 ? 's' : ''
          } detected.`
        );
      } else {
        showToast(data.message || 'No recruiter responses detected yet.');
      }
    } catch (error) {
      showToast(error.message || 'Failed to check Gmail responses.');
    }
  }

  function handleAuthSuccess(user, redirectPath = '') {
    if (!user) return;

    saveSession(null, user);
    setCurrentUser(user);
    setActivePageState(defaultPageForRole(user.role));
    checkResumeOnboarding(user);
    navigateTo(redirectPath || ROLE_HOME_PATHS[user.role] || '/dashboard', true);
    showToast(`Welcome, ${user.name || 'OPUS User'}`);
  }

  async function handleLogout(reason = 'manual') {
    const previousRole = currentUser?.role || readStoredUser()?.role || 'user';

    try {
      if (currentUser && reason !== 'expired') {
        await apiRequest('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // The local session is still cleared even if the server session already expired.
    }

    clearSession();
    localStorage.setItem('opus_logout_at', String(Date.now()));
    setCurrentUser(null);
    setDashboard(null);
    setGmailStatus({ connected: false, alerts: [] });
    setActivePageState('dashboard');
    // Every role returns to the same single login page.
    navigateTo(ROLE_LOGIN_PATHS[previousRole] || LOGIN_PATH, true);

    if (reason === 'inactive') {
      showToast('Your session expired due to inactivity. Please sign in again.');
    } else if (reason === 'expired') {
      showToast('Your session has expired. Please sign in again.');
    } else if (reason === 'security') {
      showToast('Security information updated. Sign in again to continue.');
    } else if (reason === 'back') {
      showToast('You were signed out for security when navigating back. Please sign in again.');
    } else {
      showToast('Signed out successfully.');
    }
  }

  // Keep a live reference to handleLogout for the popstate handler.
  handleLogoutRef.current = handleLogout;

  useEffect(() => {
    function handleLocationChange() {
      // A genuine browser Back/Forward press (not app-initiated navigation)
      // while signed in ends the session immediately, per OPUS policy. This
      // guarantees protected content is never re-exposed through history.
      const isBrowserBackForward = !window.__opusInternalNavigation;

      if (isBrowserBackForward && currentUserRef.current) {
        if (handleLogoutRef.current) {
          handleLogoutRef.current('back');
        }
        return;
      }

      setPath(window.location.pathname || '/login');
    }

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  useEffect(() => {
    async function restoreSession() {
      try {
        const data = await apiRequest('/api/auth/me');
        const verifiedUser = data.user || null;

        if (verifiedUser) {
          saveSession(null, verifiedUser);
          setCurrentUser(verifiedUser);
          setActivePageState(defaultPageForRole(verifiedUser.role));
          checkResumeOnboarding(verifiedUser);
        }
      } catch {
        clearSession();
      } finally {
        setCheckingSession(false);
      }
    }

    restoreSession();
  }, []);

  useEffect(() => {
    if (checkingSession) return;

    const publicPaths = [
      '/login',
      '/register',
      '/staff/login',
      '/staff/register',
      '/forgot-password',
      '/reset-password',
      '/verify-email',
      '/admin-invite'
    ];
    const isUserPortalPath = path === '/dashboard' || path.startsWith('/dashboard/');
    const isRecruiterPortalPath = path === '/recruiter' || path.startsWith('/recruiter/');
    const isAdminPortalPath = path === '/admin' || path.startsWith('/admin/');
    const isSuperAdminPortalPath = path === '/super-admin' || path.startsWith('/super-admin/');
    const isProtectedPath =
      isUserPortalPath ||
      isRecruiterPortalPath ||
      isAdminPortalPath ||
      isSuperAdminPortalPath;

    if (!currentUser) {
      // Single login page: any protected route sends every role to /login.
      if (isProtectedPath) {
        navigateTo(LOGIN_PATH, true);
        return;
      }

      // Legacy staff login URL now resolves to the unified login page.
      if (path === '/staff/login' || path === '/' || !publicPaths.includes(path)) {
        navigateTo(LOGIN_PATH, true);
      }
      return;
    }

    const expectedPath = ROLE_HOME_PATHS[currentUser.role] || '/dashboard';

    if (publicPaths.includes(path)) {
      navigateTo(expectedPath, true);
      return;
    }

    const rolePathMatches =
      (currentUser.role === 'user' && isUserPortalPath) ||
      (currentUser.role === 'recruiter' && isRecruiterPortalPath) ||
      (currentUser.role === 'admin' && isAdminPortalPath) ||
      (currentUser.role === 'super_admin' && isSuperAdminPortalPath);

    if (!rolePathMatches) {
      navigateTo(expectedPath, true);
    }
  }, [checkingSession, currentUser?.id, currentUser?.role, path]);

  useEffect(() => {
    if (!currentUser) return;

    setActivePageState(getPageForPath(currentUser.role, path));
  }, [currentUser?.role, path]);

  useEffect(() => {
    if (!currentUser) return;

    if (currentUser.role === 'user') {
      loadDashboard();
      loadGmailStatus();
    }
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!currentUser) return;

    let inactivityTimer;
    const inactivityLimit =
      currentUser.role === 'user'
        ? USER_INACTIVITY_LIMIT_MS
        : STAFF_INACTIVITY_LIMIT_MS;

    const resetTimer = () => {
      window.clearTimeout(inactivityTimer);
      inactivityTimer = window.setTimeout(
        () => handleLogout('inactive'),
        inactivityLimit
      );
    };

    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'opus-activity'
    ];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, resetTimer, { passive: true })
    );

    resetTimer();

    return () => {
      window.clearTimeout(inactivityTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, resetTimer)
      );
    };
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    function synchronizeLogout(event) {
      if (event.key === 'opus_logout_at') {
        clearSession();
        setCurrentUser(null);
        navigateTo(LOGIN_PATH, true);
      }
    }

    function handleAuthExpired() {
      handleLogout('expired');
    }

    window.addEventListener('storage', synchronizeLogout);
    window.addEventListener('opus-auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('storage', synchronizeLogout);
      window.removeEventListener('opus-auth-expired', handleAuthExpired);
    };
  }, [currentUser?.role]);

  if (checkingSession) {
    return <SessionVerificationScreen />;
  }

  // Job seekers with no base resume see the onboarding step before the portal.
  if (currentUser && needsResumeOnboarding && onboardingChecked) {
    return (
      <>
        <ResumeOnboarding
          currentUser={currentUser}
          showToast={showToast}
          onComplete={() => {
            setNeedsResumeOnboarding(false);
            loadDashboard();
          }}
        />
        <Toast message={toast} />
      </>
    );
  }

  if (!currentUser) {
    let publicPage;

    if (path === '/staff/register') {
      publicPage = <RecruiterRegisterPage showToast={showToast} />;
    } else if (path === '/register') {
      publicPage = <Register onSwitchToLogin={() => navigateTo('/login')} />;
    } else if (path === '/forgot-password') {
      publicPage = <ForgotPassword onBack={() => navigateTo(LOGIN_PATH)} />;
    } else if (path === '/reset-password') {
      publicPage = <ResetPassword onComplete={(loginPath) => navigateTo(loginPath, true)} />;
    } else if (path === '/verify-email') {
      publicPage = (
        <VerifyEmail
          onContinue={(loginPath) => navigateTo(loginPath, true)}
          onResend={async (email) => {
            try {
              const data = await apiRequest('/api/auth/resend-verification', {
                method: 'POST',
                body: { email }
              });
              showToast(data.message);
            } catch (error) {
              showToast(error.message);
            }
          }}
        />
      );
    } else if (path === '/admin-invite') {
      publicPage = <AdminInvitation onComplete={() => navigateTo(LOGIN_PATH, true)} />;
    } else {
      publicPage = (
        <Login
          onLogin={handleAuthSuccess}
          onSwitchToRegister={() => navigateTo('/register')}
          onForgotPassword={() => navigateTo('/forgot-password')}
          onRecruiterRegister={() => navigateTo('/staff/register')}
        />
      );
    }

    return (
      <>
        {publicPage}
        <Toast message={toast} />
      </>
    );
  }

  const isUserPortal = currentUser.role === 'user';

  return (
    <div className={`opus-app min-h-screen bg-slate-50 ${isUserPortal ? 'user-portal' : 'staff-portal'}`}>
      <TopBar
        showToast={showToast}
        gmailStatus={gmailStatus}
        currentUser={currentUser}
        setActivePage={setActivePage}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        onToggleSidebar={() => setSidebarOpen((value) => !value)}
      />

      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        currentUser={currentUser}
        onLogout={handleLogout}
        open={sidebarOpen}
      />

      <main className={`min-h-screen transition-all duration-300 ${isUserPortal ? 'pt-[60px]' : 'pt-[84px]'} ${sidebarOpen ? (isUserPortal ? 'ml-0 md:ml-[238px]' : 'ml-60') : 'ml-0'}`}>
        <div className={`${isUserPortal ? 'opus-page' : ''} px-7 py-6`}>
          {activePage === 'help' && (
            <HelpSupportPage currentUser={currentUser} />
          )}

          {currentUser.role === 'user' && activePage !== 'help' && (
            <>
              {activePage === 'dashboard' && (
                <DashboardPage
                  dashboard={dashboard}
                  onDashboardChange={loadDashboard}
                  showToast={showToast}
                  gmailStatus={gmailStatus}
                  onConnectGmail={connectGmail}
                  onCheckGmail={checkGmailResponses}
                  onViewAll={() => setActivePage('applications')}
                />
              )}

              {activePage === 'jobs' && (
                <JobSearchPage
                  onDashboardChange={loadDashboard}
                  showToast={showToast}
                />
              )}

              {activePage === 'applications' && (
                <MyApplicationsPage
                  dashboard={dashboard}
                  onDashboardChange={loadDashboard}
                  showToast={showToast}
                />
              )}

              {activePage === 'resumes' && (
                <MyResumesPage showToast={showToast} />
              )}

              {activePage === 'calendar' && (
                <CalendarPage
                  onDashboardChange={loadDashboard}
                  showToast={showToast}
                />
              )}

              {activePage === 'profile' && (
                <ProfileResumePage
                  onDashboardChange={loadDashboard}
                  showToast={showToast}
                  currentUser={currentUser}
                />
              )}

              {activePage === 'settings' && (
                <SettingsPage
                  onDashboardChange={loadDashboard}
                  showToast={showToast}
                  currentUser={currentUser}
                  onLogout={handleLogout}
                />
              )}
            </>
          )}

          {currentUser.role === 'recruiter' && activePage !== 'help' && (
            <RecruiterPortalPage
              activePage={activePage}
              currentUser={currentUser}
              showToast={showToast}
            />
          )}

          {currentUser.role === 'admin' && activePage !== 'help' && (
            <AdminPortalSection
              activePage={activePage}
              showToast={showToast}
              setActivePage={setActivePage}
            />
          )}

          {currentUser.role === 'super_admin' && activePage !== 'help' && (
            <SuperAdminPortalSection
              activePage={activePage}
              showToast={showToast}
              setActivePage={setActivePage}
            />
          )}
        </div>
      </main>

      <Toast message={toast} />
    </div>
  );
}

export default App;