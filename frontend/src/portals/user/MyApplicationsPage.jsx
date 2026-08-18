


// My Applications — the unified list of SAVED and APPLIED jobs.
//
//  - Saved entries can be tailored (Rewrite) and applied to.
//  - Applied entries cannot be rewritten; the application was already sent.
//  - Loads 20 at a time; "View all" pulls in the next 20.
//  - Every entry can be deleted so the list stays manageable.
//  - Filter chips narrow by kind or applied-status; Export downloads a CSV.
import { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api.js';
import {
  PageHeader, Card, StatTile, Pill, EmptyState, ExportMenu,
  btnClass, btnPrimaryClass, inputClass
} from '../../components/ui.jsx';

const PAGE_SIZE = 20;

const APPLIED_STATUSES = [
  'Applied',
  'Under Review',
  'Online Assessment',
  'Technical Interview',
  'Final Interview',
  'Offer',
  'Rejected'
];

// Quick filters shown as chips above the list.
const FILTER_CHIPS = [
  ['all', 'All'],
  ['saved', 'Saved'],
  ['applied', 'Applied'],
  ['Under Review', 'Under Review'],
  ['Technical Interview', 'Interview'],
  ['Offer', 'Offer'],
  ['Rejected', 'Rejected']
];

function MyJobEntry({ entry, onRewrite, onDelete, onStatusChange, onApply, busyId }) {
  const isSaved = entry.kind === 'saved';
  const busy = busyId === entry.entryId;

  return (
    <div className="mb-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-slate-900">{entry.title}</p>
            <Pill tone={isSaved ? 'amber' : 'green'}>
              {isSaved ? 'Saved' : entry.status}
            </Pill>
            {isSaved && entry.atsScore != null && (
              <Pill tone={entry.atsScore >= 80 ? 'green' : entry.atsScore >= 60 ? 'blue' : 'amber'}>
                ATS {entry.atsScore}%
              </Pill>
            )}
          </div>

          <p className="mt-0.5 truncate text-xs text-slate-500">
            {[entry.company, entry.location, entry.workMode].filter(Boolean).join(' · ')}
          </p>

          {isSaved && entry.atsMissing?.length > 0 && (
            <p className="mt-1 text-xs font-bold text-amber-600">
              Missing: {entry.atsMissing.slice(0, 5).join(', ')}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isSaved ? (
            <>
              <button
                className={btnPrimaryClass}
                disabled={busy}
                onClick={() => onRewrite(entry)}
              >
                {busy ? 'Rewriting...' : 'Rewrite'}
              </button>

              <button className={btnClass} onClick={() => onApply(entry)}>
                Apply
              </button>
            </>
          ) : (
            <select
              value={entry.status}
              onChange={(event) => onStatusChange(entry, event.target.value)}
              className={`${inputClass} w-[165px]`}
            >
              {APPLIED_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          )}

          <button
            className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
            onClick={() => onDelete(entry)}
            title="Remove from this list"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function MyApplicationsPage({ onDashboardChange, showToast }) {
  const [entries, setEntries] = useState([]);
  const [meta, setMeta] = useState({ total: 0, savedCount: 0, appliedCount: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState('');

  async function load(limit = PAGE_SIZE) {
    setLoading(true);
    try {
      const data = await apiRequest(`/api/my-jobs?offset=0&limit=${limit}`);
      setEntries(data.entries || []);
      setMeta({
        total: data.total || 0,
        savedCount: data.savedCount || 0,
        appliedCount: data.appliedCount || 0,
        hasMore: data.hasMore || false
      });
    } catch (error) {
      showToast(error.message || 'Unable to load your jobs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // "View all" pulls in the NEXT 20 on top of what is already shown.
  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await apiRequest(
        `/api/my-jobs?offset=${entries.length}&limit=${PAGE_SIZE}`
      );
      setEntries((current) => [...current, ...(data.entries || [])]);
      setMeta((current) => ({ ...current, hasMore: data.hasMore || false }));
    } catch (error) {
      showToast(error.message || 'Unable to load more.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function rewrite(entry) {
    setBusyId(entry.entryId);
    try {
      const data = await apiRequest('/api/documents/rewrite', {
        method: 'POST',
        body: { jobId: entry.jobId }
      });
      showToast(data.message || 'Resume tailored. See My Resumes.');
    } catch (error) {
      showToast(error.message || 'Unable to tailor the resume.');
    } finally {
      setBusyId('');
    }
  }

  async function remove(entry) {
    const confirmed = window.confirm(`Remove "${entry.title}" from your list?`);
    if (!confirmed) return;

    try {
      const id = entry.kind === 'saved' ? entry.jobId : entry.applicationId;
      await apiRequest(`/api/my-jobs/${entry.kind}/${id}`, { method: 'DELETE' });

      setEntries((current) => current.filter((item) => item.entryId !== entry.entryId));
      setMeta((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
        savedCount: current.savedCount - (entry.kind === 'saved' ? 1 : 0),
        appliedCount: current.appliedCount - (entry.kind === 'applied' ? 1 : 0)
      }));

      showToast('Removed.');
      if (onDashboardChange) await onDashboardChange();
    } catch (error) {
      showToast(error.message || 'Unable to remove this entry.');
    }
  }

  async function changeStatus(entry, status) {
    try {
      await apiRequest(`/api/applications/${entry.applicationId}`, {
        method: 'PUT',
        body: { status }
      });

      setEntries((current) =>
        current.map((item) =>
          item.entryId === entry.entryId ? { ...item, status } : item
        )
      );

      showToast(`Status updated to ${status}.`);
      if (onDashboardChange) await onDashboardChange();
    } catch (error) {
      showToast(error.message || 'Unable to update the status.');
    }
  }

  // Applying from a saved entry: open the real posting, then record it.
  async function applyFromSaved(entry) {
    if (entry.url) {
      window.open(entry.url, '_blank', 'noopener,noreferrer');
    }

    const didApply = window.confirm(
      `Did you apply to ${entry.title}${entry.company ? ` at ${entry.company}` : ''}?`
    );
    if (!didApply) return;

    try {
      await apiRequest(`/api/applications/${entry.jobId}`, {
        method: 'POST',
        body: { job: entry, status: 'Applied' }
      });

      showToast('Application recorded.');
      await load(Math.max(PAGE_SIZE, entries.length));
      if (onDashboardChange) await onDashboardChange();
    } catch (error) {
      showToast(error.message || 'Unable to record the application.');
    }
  }

  // Export whatever is currently loaded to a CSV file (client-side).
  function exportCsv() {
    if (!entries.length) {
      showToast('Nothing to export yet.');
      return;
    }
    const header = ['Title', 'Company', 'Location', 'Work Mode', 'Type', 'Status', 'ATS %'];
    const rows = entries.map((e) => [
      e.title || '',
      e.company || '',
      e.location || '',
      e.workMode || '',
      e.kind === 'saved' ? 'Saved' : 'Applied',
      e.kind === 'saved' ? 'Saved' : e.status || '',
      e.atsScore != null ? e.atsScore : ''
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'opus-my-applications.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported CSV.');
  }

  const visible = entries.filter((entry) => {
    if (filter === 'all') return true;
    if (filter === 'saved') return entry.kind === 'saved';
    if (filter === 'applied') return entry.kind === 'applied';
    // Otherwise the filter is a specific applied status.
    return entry.kind === 'applied' && entry.status === filter;
  });

  return (
    <section>
      <PageHeader
        title="My Applications"
        subtitle="Everything you saved or applied to. Saved jobs can still be tailored."
        action={
          <ExportMenu
            options={[
              { label: 'Applications (CSV)', path: '/api/exports/my-applications.csv' },
              { label: 'Summary (PDF)', path: '/api/exports/my-applications.pdf' },
              { label: 'Interviews (calendar file)', path: '/api/exports/my-interviews.ics' }
            ]}
            onLocalExport={exportCsv}
            localLabel="Export this list as shown (CSV)"
          />
        }
      />

      <div className="mb-4 grid gap-3.5 md:grid-cols-3">
        <StatTile label="Applied" value={meta.appliedCount} />
        <StatTile label="Saved" value={meta.savedCount} />
        <StatTile label="Total" value={meta.total} />
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTER_CHIPS.map(([value, label]) => {
          const on = filter === value;
          return (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition ${
                on
                  ? 'border-violet-300 bg-violet-50 text-violet-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <Card title={`Showing ${visible.length} of ${meta.total}`}>
        {loading ? (
          <EmptyState text="Loading your jobs..." />
        ) : visible.length ? (
          <>
            {visible.map((entry) => (
              <MyJobEntry
                key={entry.entryId}
                entry={entry}
                busyId={busyId}
                onRewrite={rewrite}
                onDelete={remove}
                onStatusChange={changeStatus}
                onApply={applyFromSaved}
              />
            ))}

            {meta.hasMore && filter === 'all' && (
              <div className="mt-3 text-center">
                <button className={btnClass} disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? 'Loading...' : `View all (next ${PAGE_SIZE})`}
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState text="Nothing matches this filter yet." />
        )}
      </Card>
    </section>
  );
}

export {
  MyApplicationsPage
};