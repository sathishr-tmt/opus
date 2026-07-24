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
  { id: 'recruiter-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'recruiter-jobs', label: 'My Job Postings', icon: BriefcaseBusiness },
  { id: 'recruiter-create-job', label: 'Create Job Posting', icon: PlusCircle },
  { id: 'recruiter-applications', label: 'Assigned Applications', icon: ClipboardList },
  { id: 'recruiter-calendar', label: 'Interview Calendar', icon: CalendarCheck },
  { id: 'recruiter-profile', label: 'Recruiter Profile', icon: UserCircle },
  { id: 'recruiter-settings', label: 'Settings', icon: Settings }
];

const adminNavItems = [
  { id: 'admin-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'admin-applications', label: 'Applications', icon: ClipboardList },
  { id: 'admin-jobs', label: 'Job Postings', icon: BriefcaseBusiness },
  { id: 'admin-sources', label: 'Job Sources', icon: Database },
  { id: 'admin-calendar', label: 'Calendar & Interviews', icon: CalendarCheck },
  { id: 'admin-reports', label: 'Reports', icon: BarChart3 },
  { id: 'admin-users', label: 'User Management', icon: Users },
  { id: 'admin-settings', label: 'Settings', icon: Settings }
];

const superAdminNavItems = [
  { id: 'super-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'super-approvals', label: 'Approvals', icon: UserCheck },
  { id: 'super-admins', label: 'Admin Invitations', icon: ShieldCheck },
  { id: 'super-accounts', label: 'Account Oversight', icon: Users },
  { id: 'super-permissions', label: 'Role Permissions', icon: UserCheck },
  { id: 'super-audit', label: 'Audit Logs', icon: FileText },
  { id: 'super-health', label: 'System Health', icon: Database },
  { id: 'super-settings', label: 'System Settings', icon: Settings }
];

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
