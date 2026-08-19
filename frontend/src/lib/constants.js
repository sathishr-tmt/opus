// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

import {
  BarChart3,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Database,
  FileText,
  LayoutDashboard,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  UserCheck,
  UserCircle,
  Users
} from 'lucide-react';

const userNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'jobs', label: 'Job Search', icon: Search },
  { id: 'applications', label: 'My Applications', icon: ClipboardList },
  { id: 'resumes', label: 'My Resumes', icon: FileText },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'profile', label: 'Profile & Resume', icon: UserCircle },
  { id: 'settings', label: 'Settings', icon: Settings }
];

const recruiterNavItems = [
  { id: 'recruiter-dashboard', label: 'Recruiter Dashboard', icon: LayoutDashboard },
  // Creating a posting is an action on this page, not a separate destination.
  { id: 'recruiter-jobs', label: 'My Job Postings', icon: BriefcaseBusiness },
  { id: 'recruiter-applications', label: 'Assigned Applications', icon: ClipboardList },
  { id: 'recruiter-calendar', label: 'Interview Calendar', icon: CalendarCheck }
];

// Shown in the top-right name dropdown rather than the sidebar.
const recruiterMenuItems = [
  { id: 'recruiter-profile', label: 'Recruiter Profile' },
  { id: 'recruiter-settings', label: 'Settings' }
];

const adminNavItems = [
  { id: 'admin-dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
  // User, Recruiter and Application management are tabs inside one page —
  // they are all "who is in the system and what are they doing".
  { id: 'admin-management', label: 'Management', icon: Users },
  { id: 'admin-jobs', label: 'Job Postings', icon: BriefcaseBusiness },
  { id: 'admin-calendar', label: 'Calendar & Interviews', icon: CalendarCheck },
  { id: 'admin-reports', label: 'Reports', icon: BarChart3 }
];

// Shown in the top-right name dropdown rather than the sidebar.
const adminMenuItems = [
  { id: 'admin-sources', label: 'Job Sources' },
  { id: 'admin-settings', label: 'Admin Settings' }
];
const superAdminNavItems = [
  { id: 'super-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  // Approvals, Admin Invitations and Account Oversight are tabs inside this
  // one page — they are all "who has an account and should they".
  { id: 'super-accounts', label: 'Accounts', icon: Users },
  { id: 'super-permissions', label: 'Role Permissions', icon: UserCheck },
  { id: 'super-audit', label: 'Audit Records', icon: FileText }
];

// Shown in the top-right name dropdown instead of the sidebar: platform
// configuration a Super Admin visits occasionally, not daily.
const superAdminMenuItems = [
  { id: 'super-sources', label: 'Job Sources' },
  { id: 'super-health', label: 'System Health' },
  { id: 'super-settings', label: 'System Settings' }
];

// Sidebar label for one page id — used by the breadcrumb.
function navItemsForRole(role) {
  if (role === 'super_admin') return superAdminNavItems;
  if (role === 'admin') return adminNavItems;
  if (role === 'recruiter') return recruiterNavItems;
  return userNavItems;
}

function navLabelFor(role, pageId) {
  if (pageId === 'help') return 'Help & Support';
  const fromMenu = [...superAdminMenuItems, ...recruiterMenuItems, ...adminMenuItems].find(
    (entry) => entry.id === pageId
  );
  if (fromMenu) return fromMenu.label;
  const item = navItemsForRole(role).find((entry) => entry.id === pageId);
  return item ? item.label : '';
}

const ADMIN_ROLES = ['super_admin', 'admin'];

function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

function formatRoleLabel(role) {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  if (role === 'recruiter') return 'Recruiter';
  return 'User';
}

const applicationStatusOptions = [
  'Applied',
  'Under Review',
  'Online Assessment',
  'Technical Interview',
  'Final Interview'
];

function formatMoney(value) {
  const number = Number(value || 0);

  if (!number) return '$0';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(number);
}

export {
  superAdminMenuItems,
  recruiterMenuItems,
  navItemsForRole,
  navLabelFor,
  userNavItems,
  recruiterNavItems,
  adminNavItems,
  superAdminNavItems,
  ADMIN_ROLES,
  isAdminRole,
  formatRoleLabel,
  applicationStatusOptions,
  formatMoney
};
