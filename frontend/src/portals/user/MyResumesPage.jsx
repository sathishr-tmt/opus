


// My Resumes — the user's base resume plus every job-tailored version,
// matching the OPUS User Portal prototype. Tailored versions are created by the
// Rewrite action in Job Search and carry their own match score.
import { useState, useEffect, useRef } from 'react';
import { apiRequest, API_BASE } from '../../lib/api.js';
import {
  PageHeader, Card, Pill, ListItem, btnClass, btnPrimaryClass, btnSmClass, EmptyState
} from '../../components/ui.jsx';

function csrfHeaders() {
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('opus_csrf='));

  return match
    ? { 'X-CSRF-Token': decodeURIComponent(match.split('=')[1]) }
    : {};
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAge(createdAt) {
  if (!createdAt) return '';
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return '';

  const days = Math.floor((Date.now() - created.getTime()) / 86400000);
  if (days <= 0) return 'uploaded today';
  if (days === 1) return 'uploaded 1d ago';
  if (days < 30) return `uploaded ${days}d ago`;
  return `uploaded ${created.toLocaleDateString()}`;
}

function MyResumesPage({ showToast }) {
  const [baseResume, setBaseResume] = useState(null);
  const [tailored, setTailored] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest('/api/documents');
      setBaseResume(data.baseResume || null);
      setTailored(data.tailored || []);
    } catch (error) {
      showToast(error.message || 'Unable to load your resumes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function uploadResume(file) {
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append('resume', file);

      const response = await fetch(`${API_BASE}/api/profile/resume`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfHeaders(),
        body: form
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Upload failed.');

      showToast('Resume uploaded.');
      await load();
    } catch (error) {
      showToast(error.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function download(documentId) {
    window.open(`${API_BASE}/api/documents/${documentId}/download`, '_blank');
  }

  async function remove(document) {
    const confirmed = window.confirm(`Delete "${document.originalName}"?`);
    if (!confirmed) return;

    try {
      await apiRequest(`/api/documents/${document.id}`, { method: 'DELETE' });
      showToast('Document deleted.');
      await load();
    } catch (error) {
      showToast(error.message || 'Unable to delete this document.');
    }
  }

  return (
    <section>
      <PageHeader
        title="My Resumes"
        subtitle="Your base resume and the versions tailored to specific jobs."
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={(event) => uploadResume(event.target.files?.[0])}
      />

      <Card
        title="Base resume"
        action={
          <button
            className={btnPrimaryClass}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Uploading...' : baseResume ? 'Replace resume' : 'Upload resume'}
          </button>
        }
      >
        {loading ? (
          <EmptyState text="Loading your resumes..." />
        ) : baseResume ? (
          <ListItem
            title={baseResume.originalName}
            meta={`Your master resume · ${formatAge(baseResume.createdAt)}${
              baseResume.sizeBytes ? ` · ${formatSize(baseResume.sizeBytes)}` : ''
            }`}
            right={
              <button className={btnSmClass} onClick={() => download(baseResume.id)}>
                Download
              </button>
            }
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
            <p className="text-sm font-bold text-slate-700">No base resume yet</p>
            <p className="mt-1 text-[13px] text-slate-500">
              PDF, DOC, or DOCX · up to 5 MB
            </p>
            <button
              className={`${btnClass} mt-2.5`}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Uploading...' : 'Upload resume'}
            </button>
          </div>
        )}
      </Card>

      <Card title="Tailored resumes">
        <p className="mb-3.5 text-[13px] text-slate-500">
          Created with Rewrite in Job Search. Each version is tuned to one job
          posting and keeps its own match score.
        </p>

        {loading ? (
          <EmptyState text="Loading..." />
        ) : tailored.length ? (
          tailored.map((document) => (
            <ListItem
              key={document.id}
              title={document.originalName}
              meta={
                document.label ||
                [
                  document.matchScore ? `${document.matchScore}% match` : null,
                  document.jobTitle,
                  document.company ? `@ ${document.company}` : null
                ]
                  .filter(Boolean)
                  .join(' · ') ||
                formatAge(document.createdAt)
              }
              right={
                <>
                  {document.matchScore != null && (
                    <Pill tone="blue">{document.matchScore}%</Pill>
                  )}
                  <button className={btnSmClass} onClick={() => download(document.id)}>
                    Download
                  </button>
                  <button
                    className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                    onClick={() => remove(document)}
                  >
                    Delete
                  </button>
                </>
              }
            />
          ))
        ) : (
          <EmptyState text="No tailored resumes yet. Use Rewrite on a job in Job Search to create one." />
        )}
      </Card>
    </section>
  );
}

export {
  MyResumesPage
};