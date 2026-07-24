const API_BASE = import.meta.env.VITE_API_BASE || '';
const CSRF_COOKIE_NAME = 'opus_csrf';

function getCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : '';
}

function cacheUser(user) {
  if (user) {
    sessionStorage.setItem('opus_user_cache', JSON.stringify(user));
  }
}

function clearCachedUser() {
  sessionStorage.removeItem('opus_user_cache');
}

function getStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem('opus_user_cache') || 'null');
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  window.dispatchEvent(new Event('opus-activity'));

  const method = String(options.method || 'GET').toUpperCase();
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(!isFormData && options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = getCookie(CSRF_COOKIE_NAME);

    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const config = {
    ...options,
    method,
    credentials: 'include',
    headers
  };

  if (config.body && typeof config.body !== 'string' && !isFormData) {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(`${API_BASE}${path}`, config);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');

  if (!response.ok) {
    const error = new Error(
      typeof data === 'object' && data?.message
        ? data.message
        : typeof data === 'string' && data
        ? data
        : 'Request failed'
    );

    error.status = response.status;
    error.data = data;

    if (response.status === 401) {
      clearCachedUser();
      window.dispatchEvent(new CustomEvent('opus-auth-expired'));
    }

    throw error;
  }

  return data;
}

export const api = {
  register: (payload) =>
    request('/api/auth/register', {
      method: 'POST',
      body: payload
    }),

  registerRecruiter: (payload) =>
    request('/api/auth/recruiter-register', {
      method: 'POST',
      body: payload
    }),

  login: async (payload) => {
    const data = await request('/api/auth/login', {
      method: 'POST',
      body: payload
    });

    cacheUser(data.user);
    return data;
  },

  staffLogin: async (payload) => {
    const data = await request('/api/staff/auth/login', {
      method: 'POST',
      body: payload
    });

    cacheUser(data.user);
    return data;
  },

  logout: async () => {
    try {
      return await request('/api/auth/logout', { method: 'POST' });
    } finally {
      clearCachedUser();
      localStorage.setItem('opus_logout_at', String(Date.now()));
    }
  },

  me: async () => {
    const data = await request('/api/auth/me');
    cacheUser(data.user);
    return data;
  },

  staffMe: async () => {
    const data = await request('/api/staff/auth/me');
    cacheUser(data.user);
    return data;
  },

  forgotPassword: (email) =>
    request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email }
    }),

  resetPassword: (payload) =>
    request('/api/auth/reset-password', {
      method: 'POST',
      body: payload
    }),

  resendVerification: (email) =>
    request('/api/auth/resend-verification', {
      method: 'POST',
      body: { email }
    }),

  acceptAdminInvitation: (payload) =>
    request('/api/auth/accept-admin-invitation', {
      method: 'POST',
      body: payload
    }),

  createAdminInvitation: (email) =>
    request('/api/super-admin/admin-invitations', {
      method: 'POST',
      body: { email }
    }),

  adminInvitations: () => request('/api/super-admin/admin-invitations'),

  getStoredUser,
  clearCachedUser,

  adminOverview: () => request('/api/admin/overview'),
  adminUsers: () => request('/api/admin/users'),
  pendingApprovals: () => request('/api/admin/pending-approvals'),

  approveUser: (userId) =>
    request(`/api/admin/users/${userId}/approve`, {
      method: 'PATCH'
    }),

  declineUser: (userId, reason = '') =>
    request(`/api/admin/users/${userId}/decline`, {
      method: 'PATCH',
      body: { reason }
    }),

  sendPasswordReset: (userId) =>
    request(`/api/admin/users/${userId}/send-password-reset`, {
      method: 'POST'
    }),

  updateAdminUser: (userId, payload) =>
    request(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: payload
    }),

  deleteAdminUser: (userId) =>
    request(`/api/admin/users/${userId}`, {
      method: 'DELETE'
    }),

  dashboard: () => request('/api/dashboard'),

  refreshJobs: (params = {}) =>
    request('/api/jobs/fetch', {
      method: 'POST',
      body: params
    }),

  jobs: (params = {}) =>
    request(`/api/jobs?${new URLSearchParams(params).toString()}`),

  toggleSaved: (jobId) =>
    request(`/api/saved/${jobId}`, {
      method: 'POST'
    }),

  savedJobs: () => request('/api/saved'),
  applications: () => request('/api/applications'),

  applyJob: (jobId, job) =>
    request(`/api/applications/${jobId}`, {
      method: 'POST',
      body: { job, status: 'Applied' }
    }),

  updateApplication: (id, status) =>
    request(`/api/applications/${id}`, {
      method: 'PUT',
      body: { status }
    }),

  deleteApplication: (id) =>
    request(`/api/applications/${id}`, {
      method: 'DELETE'
    }),

  calendar: () => request('/api/calendar'),
  addEvent: (event) => request('/api/calendar', { method: 'POST', body: event }),
  updateEvent: (id, event) =>
    request(`/api/calendar/${id}`, { method: 'PUT', body: event }),
  deleteEvent: (id) => request(`/api/calendar/${id}`, { method: 'DELETE' }),

  profile: () => request('/api/profile'),
  saveProfile: (payload) => request('/api/profile', { method: 'PUT', body: payload }),
  settings: () => request('/api/settings'),
  saveSettings: (payload) => request('/api/settings', { method: 'PUT', body: payload }),

  requestEmailChange: (payload) =>
    request('/api/account/change-email/request', {
      method: 'POST',
      body: payload
    }),

  changePassword: (payload) =>
    request('/api/account/change-password', {
      method: 'POST',
      body: payload
    }),

  gmailStatus: () => request('/api/gmail/status'),
  gmailAuthUrl: () => request('/api/gmail/auth-url'),
  checkGmailResponses: () => request('/api/gmail/check-responses')
};

export { API_BASE, request };
