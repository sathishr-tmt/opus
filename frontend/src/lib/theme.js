// Light / dark theme handling. The choice is remembered on the device and
// applied by toggling a `dark` class on the <html> element, which the global
// styles in index.css respond to. Works for every role.

const STORAGE_KEY = 'opus_theme';

function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

// The theme to use at startup: saved choice, else the OS preference, else light.
function resolveInitialTheme() {
  const stored = getStoredTheme();
  if (stored) return stored;

  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Ignore — fall through to light.
  }

  return 'light';
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable — the theme still applies for this session.
  }
}

export {
  resolveInitialTheme,
  applyTheme,
  saveTheme
};
