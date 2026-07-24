// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

import {
  HelpCircle,
  StickyNote
} from 'lucide-react';
import { formatRoleLabel } from '../lib/constants.js';
import { PageHeader } from '../components/ui.jsx';

function HelpSupportPage({ currentUser }) {
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
