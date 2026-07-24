// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

const ROLE_HOME_PATHS = {
  user: '/dashboard',
  recruiter: '/recruiter/dashboard',
  admin: '/admin/dashboard',
  super_admin: '/super-admin/dashboard'
};

// OPUS has ONE login page for every role. Kept as a map so callers stay
// unchanged, but all roles resolve to the same single login route.
const LOGIN_PATH = '/login';

const ROLE_LOGIN_PATHS = {
  user: LOGIN_PATH,
  recruiter: LOGIN_PATH,
  admin: LOGIN_PATH,
  super_admin: LOGIN_PATH
};

const PAGE_PATHS = {
  user: {
    dashboard: '/dashboard',
    jobs: '/dashboard/jobs',
    applications: '/dashboard/applications',
    resumes: '/dashboard/resumes',
    calendar: '/dashboard/calendar',
    profile: '/dashboard/profile',
    settings: '/dashboard/settings',
    help: '/dashboard/help'
  },
  recruiter: {
    'recruiter-dashboard': '/recruiter/dashboard',
    'recruiter-jobs': '/recruiter/jobs',
    'recruiter-create-job': '/recruiter/jobs/create',
    'recruiter-applications': '/recruiter/applications',
    'recruiter-calendar': '/recruiter/calendar',
    'recruiter-profile': '/recruiter/profile',
    'recruiter-settings': '/recruiter/settings',
    help: '/recruiter/help'
  },
  admin: {
    'admin-dashboard': '/admin/dashboard',
    'admin-users': '/admin/users',
    'admin-recruiters': '/admin/recruiters',
    'admin-jobs': '/admin/jobs',
    'admin-applications': '/admin/applications',
    'admin-sources': '/admin/job-sources',
    'admin-calendar': '/admin/calendar',
    'admin-reports': '/admin/reports',
    'admin-settings': '/admin/settings',
    help: '/admin/help'
  },
  super_admin: {
    'super-dashboard': '/super-admin/dashboard',
    'super-approvals': '/super-admin/approvals',
    'super-admins': '/super-admin/admins',
    'super-accounts': '/super-admin/accounts',
    'super-permissions': '/super-admin/permissions',
    'super-platform': '/super-admin/platform',
    'super-health': '/super-admin/system-health',
    'super-audit': '/super-admin/audit-logs',
    'super-settings': '/super-admin/settings',
    help: '/super-admin/help'
  }
};

function getPathForPage(role, page) {
  return (
    PAGE_PATHS[role]?.[page] ||
    ROLE_HOME_PATHS[role] ||
    '/login'
  );
}

function getPageForPath(role, currentPath) {
  const rolePages = PAGE_PATHS[role] || {};

  const matchedEntry = Object.entries(rolePages).find(
    ([, pagePath]) => pagePath === currentPath
  );

  if (matchedEntry) {
    return matchedEntry[0];
  }

  if (role === 'super_admin') {
    return 'super-dashboard';
  }

  if (role === 'admin') {
    return 'admin-dashboard';
  }

  if (role === 'recruiter') {
    return 'recruiter-dashboard';
  }

  return 'dashboard';
}

const STAFF_INACTIVITY_LIMIT_MS = 10 * 60 * 1000;

const USER_INACTIVITY_LIMIT_MS = 60 * 60 * 1000;

function navigateTo(path, replace = false) {
  if (window.location.pathname === path) return;

  if (replace) {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }

  // Flag this as internal (app-initiated) navigation so the popstate handler
  // can tell it apart from a genuine browser Back/Forward press. dispatchEvent
  // runs listeners synchronously, so the flag is only true during our own event.
  window.__opusInternalNavigation = true;
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.__opusInternalNavigation = false;
}

export {
  LOGIN_PATH,
  ROLE_HOME_PATHS,
  ROLE_LOGIN_PATHS,
  PAGE_PATHS,
  getPathForPage,
  getPageForPath,
  navigateTo,
  STAFF_INACTIVITY_LIMIT_MS,
  USER_INACTIVITY_LIMIT_MS
};
