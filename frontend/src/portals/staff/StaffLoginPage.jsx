// DEPRECATED — OPUS now uses a SINGLE login page (`/login`) for every role:
// User, Recruiter, Admin, and Super Admin. This file is kept only so any older
// import keeps working; it immediately redirects to the unified login page.
import { useEffect } from 'react';
import { LOGIN_PATH, navigateTo } from '../../lib/router.js';

function StaffLoginPage() {
  useEffect(() => {
    navigateTo(LOGIN_PATH, true);
  }, []);

  return null;
}

export {
  StaffLoginPage
};
