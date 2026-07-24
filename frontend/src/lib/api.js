// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

const API_BASE = import.meta.env.VITE_API_BASE || '';

function readStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem('opus_user_cache') || 'null');
  } catch {
    return null;
  }
}

function saveSession(_token, user) {
  if (user) {
    sessionStorage.setItem('opus_user_cache', JSON.stringify(user));
  }
}

function clearSession() {
  sessionStorage.removeItem('opus_user_cache');
}

function getCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}

async function apiRequest(url, options = {}) {
  window.dispatchEvent(new Event('opus-activity'));

  const method = String(options.method || 'GET').toUpperCase();
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(!isFormData && options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = getCookie('opus_csrf');
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  const requestOptions = {
    ...options,
    method,
    credentials: 'include',
    headers
  };

  if (
    requestOptions.body &&
    typeof requestOptions.body !== 'string' &&
    !isFormData
  ) {
    requestOptions.body = JSON.stringify(requestOptions.body);
  }

  const response = await fetch(`${API_BASE}${url}`, requestOptions);
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
    throw error;
  }

  return data;
}

export {
  API_BASE,
  readStoredUser,
  saveSession,
  clearSession,
  getCookie,
  apiRequest
};
