// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

import {
  HelpCircle,
  StickyNote
} from 'lucide-react';
import { formatRoleLabel } from '../lib/constants.js';
import { PageHeader } from '../components/ui.jsx';

function HelpSupportPage({ currentUser }) {
  const isUserPortal = currentUser?.role === 'user';

  if (isUserPortal) {
    return (
      <section>
        <PageHeader
          title="Help & Support"
          subtitle="Get assistance with your OPUS account, job search, applications, and User portal."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-violet-50 text-violet-600">
              <HelpCircle size={20} />
            </div>

            <h2 className="mt-4 text-[15px] font-extrabold text-slate-900">
              Account Support
            </h2>

            <p className="mt-2 text-[13px] leading-5 text-slate-500">
              Contact the OPUS Super Admin for help with account status,
              profile information, email verification, password access,
              or session-related problems.
            </p>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Super Admin
              </p>

              <a
                href="mailto:sathishreddyr269@gmail.com"
                className="mt-1 block break-all text-[13px] font-bold text-violet-600 hover:text-violet-700 hover:underline"
              >
                sathishreddyr269@gmail.com
              </a>
            </div>

            <a
              href="mailto:sathishreddyr269@gmail.com?subject=OPUS%20User%20Portal%20Support&body=Hello%20OPUS%20Super%20Admin%2C%0A%0AI%20need%20help%20with%20my%20OPUS%20account.%0A%0AProblem%3A%20"
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-[13px] font-extrabold text-white transition hover:bg-violet-700"
            >
              Contact Super Admin
            </a>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-violet-50 text-violet-600">
              <StickyNote size={20} />
            </div>

            <h2 className="mt-4 text-[15px] font-extrabold text-slate-900">
              Job-search Assistance
            </h2>

            <p className="mt-2 text-[13px] leading-5 text-slate-500">
              Get help understanding job results, relaxed filters,
              application tracking, and where your tailored resumes
              are stored.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title="Help & Support"
        subtitle="Find assistance for your OPUS account and workspace."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <HelpCircle size={25} className="text-violet-600" />
          <h2 className="mt-4 text-lg font-black text-slate-900">
            Account Support
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Contact support for login, account status, profile, or application
            tracking assistance.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <StickyNote size={25} className="text-violet-600" />
          <h2 className="mt-4 text-lg font-black text-slate-900">
            Current Workspace
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Signed in as {currentUser?.name || 'OPUS User'} with{' '}
            <span className="font-black">
              {formatRoleLabel(currentUser?.role || 'user')}
            </span>{' '}
            access.
          </p>
        </div>
      </div>
    </section>
  );
}

export {
  HelpSupportPage
};