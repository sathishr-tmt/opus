// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Adds resume auto-fill: on upload (or via the "Fill from resume" button) the
// resume is analyzed by the backend (Gemini) and the profile fields are filled.

import { useState, useEffect } from 'react';
import {
  FileText,
  Sparkles
} from 'lucide-react';
import { apiRequest, API_BASE } from '../../lib/api.js';
import {
  PageHeader, FilterInput, FilterSelect, Card, Pill, ListItem,
  btnSmClass, EmptyState, ConfirmModal
} from '../../components/ui.jsx';

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

function ProfileResumePage({ onDashboardChange, showToast, currentUser }) {
  // Tailored resumes were previously a separate "My Resumes" page. They live
  // here now so there is one place that owns resume files.
  const [tailored, setTailored] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    professionalTitle: '',
    experienceYears: '',
    skills: '',
    workAuthorization: '',
    preferredWorkMode: '',
    about: '',
    resumeName: ''
  });
  const [resumeDocs, setResumeDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  async function loadResumes() {
    try {
      const data = await apiRequest('/api/profile/resume');
      setResumeDocs(data.documents || []);
    } catch (error) {
      // non-fatal
    }

    try {
      const all = await apiRequest('/api/documents');
      setTailored(all.tailored || []);
    } catch (error) {
      // non-fatal
    }
  }

  function downloadDocument(documentId) {
    window.open(`${API_BASE}/api/documents/${documentId}/download`, '_blank');
  }

  async function deleteTailored(document) {
    try {
      await apiRequest(`/api/documents/${document.id}`, { method: 'DELETE' });
      showToast('Document deleted.');
      await loadResumes();
    } catch (error) {
      showToast(error.message || 'Unable to delete this document.');
    } finally {
      setPendingDelete(null);
    }
  }
  useEffect(() => { loadResumes(); }, []);

  // Read the uploaded resume with AI and drop the details into the form. The
  // user still reviews and clicks Save. Fields the resume doesn't reveal are
  // left untouched. Silently no-ops if AI analysis isn't configured.
  async function analyzeAndFill({ announce = true } = {}) {
    setAnalyzing(true);
    try {
      const data = await apiRequest('/api/profile/resume/analyze', { method: 'POST' });
      const fields = data.fields || {};

      const skills = Array.isArray(fields.skills)
        ? fields.skills.filter(Boolean).join(', ')
        : (typeof fields.skills === 'string' ? fields.skills : '');

      setProfile((previous) => ({
        ...previous,
        professionalTitle: fields.professionalTitle || previous.professionalTitle,
        experienceYears:
          Number(fields.experienceYears) > 0
            ? String(fields.experienceYears)
            : previous.experienceYears,
        location: fields.location || previous.location,
        phone: fields.phone || previous.phone,
        skills: skills || previous.skills,
        about: fields.professionalSummary || previous.about
      }));

      // The backend reports whether Gemini or the offline parser produced this,
      // so a misconfigured API key surfaces instead of looking like a no-op.
      if (data.detail) console.warn('Resume analysis note:', data.detail);

      if (announce) {
        showToast(
          data.message || 'Profile filled from your resume — review and Save.'
        );
      }
    } catch (error) {
      if (announce) {
        showToast(error.message || 'Could not read the resume. You can fill the details manually.');
      }
    } finally {
      setAnalyzing(false);
    }
  }

  async function uploadResume(file) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('resume', file);
      const res = await fetch(`${API_BASE}/api/profile/resume`, {
        method: 'POST',
        credentials: 'include',
        headers: (() => {
          const m = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('opus_csrf='));
          return m ? { 'X-CSRF-Token': decodeURIComponent(m.split('=')[1]) } : {};
        })(),
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Upload failed.');
      showToast('Resume uploaded — reading your details...');
      await loadResumes();
      // Auto-fill the profile straight after a successful upload.
      await analyzeAndFill();
    } catch (error) {
      showToast(error.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await apiRequest('/api/settings');
        setProfile((previous) => ({
          ...previous,
          ...(data.settings || {})
        }));
      } catch {
        showToast('Failed to load profile.');
      }
    }

    loadProfile();
  }, []);

  function updateProfile(name, value) {
    setProfile((previous) => ({ ...previous, [name]: value }));
  }

  async function saveProfile() {
    try {
      const data = await apiRequest('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(profile)
      });

      setProfile((previous) => ({
        ...previous,
        ...(data.settings || profile)
      }));
      await onDashboardChange();
      showToast('Profile saved successfully.');
    } catch (error) {
      showToast(error.message || 'Failed to save profile.');
    }
  }

  return (
    <section>
      <PageHeader
        title="Profile & Resume"
        subtitle="Maintain the professional information used throughout your job search."
      />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">
            Professional Profile
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FilterInput
              label="Full Name"
              value={profile.name || ''}
              onChange={(value) => updateProfile('name', value)}
            />
            <FilterInput
              label="Login Email Address"
              type="email"
              value={currentUser?.email || profile.email || ''}
              onChange={() => {}}
              disabled
            />
            <FilterInput
              label="Phone Number"
              value={profile.phone || ''}
              onChange={(value) => updateProfile('phone', value)}
            />
            <FilterInput
              label="Location"
              value={profile.location || ''}
              onChange={(value) => updateProfile('location', value)}
            />
            <FilterInput
              label="Professional Title"
              value={profile.professionalTitle || ''}
              onChange={(value) => updateProfile('professionalTitle', value)}
              placeholder="Full Stack Developer"
            />
            <FilterInput
              label="Years of Experience"
              type="number"
              value={profile.experienceYears || ''}
              onChange={(value) => updateProfile('experienceYears', value)}
            />
            <FilterInput
              label="Work Authorization"
              value={profile.workAuthorization || ''}
              onChange={(value) => updateProfile('workAuthorization', value)}
            />
            <FilterSelect
              label="Preferred Work Mode"
              value={profile.preferredWorkMode || ''}
              onChange={(value) => updateProfile('preferredWorkMode', value)}
              options={['Remote', 'Hybrid', 'Onsite']}
            />
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              Skills
            </span>
            <textarea
              rows="4"
              value={profile.skills || ''}
              onChange={(event) => updateProfile('skills', event.target.value)}
              placeholder="Java, Spring Boot, React, AWS"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none focus:border-violet-400"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              Professional Summary
            </span>
            <textarea
              rows="5"
              value={profile.about || ''}
              onChange={(event) => updateProfile('about', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none focus:border-violet-400"
            />
          </label>

          <button
            onClick={saveProfile}
            className="mt-5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white"
          >
            Save Profile
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <FileText size={25} />
          </div>

          <h2 className="mt-4 text-lg font-black text-slate-900">Resume</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Upload your resume (PDF, DOC, or DOCX, up to 5 MB). Your profile
            details fill in automatically from it — just review and Save.
          </p>

          <label className="mt-5 block cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              disabled={uploading || analyzing}
              onChange={(event) => uploadResume(event.target.files?.[0])}
            />
            <FileText className="mx-auto text-slate-400" size={28} />
            <p className="mt-3 text-sm font-black text-slate-700">
              {uploading
                ? 'Uploading...'
                : analyzing
                ? 'Reading your resume...'
                : 'Choose Resume'}
            </p>
            <p className="mt-1 text-xs text-slate-400">PDF, DOC, or DOCX</p>
          </label>

          {resumeDocs.length > 0 && (
            <>
              <div className="mt-4 grid gap-2">
                {resumeDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700">
                    <span>{doc.originalName}</span>
                    <button
                      type="button"
                      onClick={() => window.open(`${API_BASE}/api/documents/${doc.id}/download`, '_blank')}
                      className="rounded-lg bg-green-600 px-3 py-1 text-xs font-black text-white"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => analyzeAndFill()}
                disabled={analyzing || uploading}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles size={16} />
                {analyzing ? 'Reading resume...' : 'Fill profile from resume'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tailored resumes — created by Rewrite in Job Search. Each version is
          tuned to one posting and keeps its own match score. */}
      <div className="mt-4">
        <Card title="Tailored resumes">
          <p className="mb-3.5 text-[13px] text-slate-500">
            Created with Rewrite in Job Search. Each version is tuned to one job
            posting and keeps its own match score.
          </p>

          {tailored.length ? (
            tailored.map((document) => (
              <ListItem
                key={document.id}
                title={document.originalName}
                meta={
                  document.label ||
                  [
                    document.matchScore != null ? `${document.matchScore}% match` : null,
                    document.jobTitle,
                    document.company ? `@ ${document.company}` : null,
                    document.sizeBytes ? formatSize(document.sizeBytes) : null
                  ]
                    .filter(Boolean)
                    .join(' · ') ||
                  formatAge(document.createdAt)
                }
                right={
                  <>
                    {document.matchScore != null && (
                      <Pill
                        tone={
                          document.matchScore >= 80
                            ? 'green'
                            : document.matchScore >= 60
                            ? 'blue'
                            : 'amber'
                        }
                      >
                        {document.matchScore}%
                      </Pill>
                    )}
                    <button className={btnSmClass} onClick={() => downloadDocument(document.id)}>
                      Download
                    </button>
                    <button
                      className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                      onClick={() => setPendingDelete(document)}
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
      </div>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete this resume?"
        body={
          pendingDelete
            ? `"${pendingDelete.originalName}" will be permanently removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        tone="red"
        onConfirm={() => deleteTailored(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

export {
  ProfileResumePage
};
