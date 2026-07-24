// Resume onboarding — the step a job seeker sees right after their first login
// when they have no base resume yet. Uploading here (optionally with a target
// role and skills, which power the ATS score) then continues to the dashboard.
import { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2 } from 'lucide-react';
import { apiRequest, API_BASE } from '../lib/api.js';
import { OpusMark } from '../components/Logo.jsx';

function csrfHeaders() {
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('opus_csrf='));

  return match ? { 'X-CSRF-Token': decodeURIComponent(match.split('=')[1]) } : {};
}

function ResumeOnboarding({ currentUser, onComplete, showToast }) {
  const [file, setFile] = useState(null);
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [skills, setSkills] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  async function submit() {
    if (!file) {
      showToast('Choose your resume file first.');
      return;
    }

    setSaving(true);
    try {
      // 1. Upload the base resume.
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

      // 2. Save target role + skills if provided (these enable ATS scores).
      if (professionalTitle.trim() || skills.trim()) {
        try {
          await apiRequest('/api/profile', {
            method: 'PUT',
            body: { professionalTitle: professionalTitle.trim(), skills: skills.trim() }
          });
        } catch {
          // Non-fatal — the resume is already saved.
        }
      }

      showToast('Resume saved. Welcome to OPUS.');
      onComplete();
    } catch (error) {
      showToast(error.message || 'Could not save your resume.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <OpusMark size={44} />
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">
              Welcome, {currentUser?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-[13px] text-slate-500">
              Add your resume to get started. You can change it any time from your profile.
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition ${
            file ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-slate-50 hover:border-violet-300'
          }`}
        >
          {file ? (
            <>
              <CheckCircle2 size={26} className="text-green-600" />
              <span className="text-sm font-bold text-slate-800">{file.name}</span>
              <span className="text-xs text-slate-500">Click to choose a different file</span>
            </>
          ) : (
            <>
              <UploadCloud size={26} className="text-slate-400" />
              <span className="text-sm font-bold text-slate-700">Upload your resume</span>
              <span className="text-xs text-slate-500">PDF, DOC, or DOCX · up to 5 MB</span>
            </>
          )}
        </button>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <p className="mb-3 text-xs font-bold text-slate-500">
            Optional — fill these in to see how well jobs match you (your ATS score)
          </p>
          <label className="mb-3 block">
            <span className="mb-1.5 block text-[13px] font-bold text-slate-600">Target role</span>
            <input
              value={professionalTitle}
              onChange={(event) => setProfessionalTitle(event.target.value)}
              placeholder="e.g. Java Backend Developer"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-violet-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold text-slate-600">Skills (comma separated)</span>
            <input
              value={skills}
              onChange={(event) => setSkills(event.target.value)}
              placeholder="e.g. Java, Spring Boot, REST, MySQL"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-violet-500"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={onComplete}
            disabled={saving}
            className="text-[13px] font-bold text-slate-500 hover:text-slate-700"
          >
            Skip for now
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save and continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export {
  ResumeOnboarding
};
