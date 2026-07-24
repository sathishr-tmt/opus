// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

import { useState, useEffect } from 'react';
import {
  FileText
} from 'lucide-react';
import { apiRequest, API_BASE } from '../../lib/api.js';
import { PageHeader, FilterInput, FilterSelect } from '../../components/ui.jsx';

function ProfileResumePage({ onDashboardChange, showToast, currentUser }) {
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

  async function loadResumes() {
    try {
      const data = await apiRequest('/api/profile/resume');
      setResumeDocs(data.documents || []);
    } catch (error) {
      // non-fatal
    }
  }
  useEffect(() => { loadResumes(); }, []);

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
      showToast('Resume uploaded.');
      loadResumes();
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
            Upload your resume (PDF, DOC, or DOCX, up to 5 MB). It is stored
            securely and only shared with recruiters assigned to your applications.
          </p>

          <label className="mt-5 block cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              disabled={uploading}
              onChange={(event) => uploadResume(event.target.files?.[0])}
            />
            <FileText className="mx-auto text-slate-400" size={28} />
            <p className="mt-3 text-sm font-black text-slate-700">
              {uploading ? 'Uploading...' : 'Choose Resume'}
            </p>
            <p className="mt-1 text-xs text-slate-400">PDF, DOC, or DOCX</p>
          </label>

          {resumeDocs.length > 0 && (
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
          )}
        </div>
      </div>
    </section>
  );
}

export {
  ProfileResumePage
};
