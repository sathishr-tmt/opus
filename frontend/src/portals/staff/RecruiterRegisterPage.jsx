// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

import { useState } from 'react';
import {
  CheckCircle2,
  UserPlus
} from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { navigateTo } from '../../lib/router.js';
import { FilterInput } from '../../components/ui.jsx';
import { OpusMark } from '../../components/Logo.jsx';

function RecruiterRegisterPage({ showToast }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    department: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function updateForm(name, value) {
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function submitRegistration(event) {
    event.preventDefault();
    setError('');

    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Name, work email address, and password are required.');
      return;
    }

    if (form.password.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Password and confirm password do not match.');
      return;
    }

    setLoading(true);

    try {
      await apiRequest('/api/auth/recruiter-register', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          company: form.company.trim(),
          department: form.department.trim(),
          password: form.password,
          confirmPassword: form.confirmPassword
        }
      });

      setSubmitted(true);
      showToast('Check your email and verify your address before Super Admin review.');
    } catch (registrationError) {
      setError(
        registrationError.message || 'Unable to submit recruiter registration.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-xl rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-green-600">
            <CheckCircle2 size={30} />
          </div>

          <h1 className="mt-5 text-3xl font-black text-slate-950">
            Registration submitted
          </h1>

          <p className="mt-3 leading-7 text-slate-500">
            Check your work email and verify the address first. Once verified, our
            Super Admin team reviews your recruiter account &mdash; this usually takes
            24 to 48 hours, and we will email you the moment a decision is made.
          </p>

          <button
            onClick={() => navigateTo('/login')}
            className="mt-7 rounded-2xl bg-violet-600 px-6 py-4 text-sm font-black text-white"
          >
            Back to Staff Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-5 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => navigateTo('/login')}
          className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <OpusMark size={44} />
          <span className="text-left">
            <span className="block text-lg font-black text-slate-900">
              OPUS
            </span>
            <span className="block text-xs font-bold text-slate-500">
              Recruiter Registration
            </span>
          </span>
        </button>

        <form
          onSubmit={submitRegistration}
          className="mt-8 rounded-[32px] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-9"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <UserPlus size={26} />
          </div>

          <h1 className="mt-5 text-3xl font-black text-slate-950">
            Create Recruiter Account
          </h1>
          <p className="mt-2 text-slate-500">
            Submit your professional information. After email verification, the Super
            Admin reviews and approves your account within 24 to 48 hours.
          </p>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <FilterInput
              label="Full Name"
              value={form.name}
              onChange={(value) => updateForm('name', value)}
              placeholder="Enter your full name"
            />

            <FilterInput
              label="Work Email Address"
              type="email"
              value={form.email}
              onChange={(value) => updateForm('email', value)}
              placeholder="name@company.com"
            />

            <FilterInput
              label="Company"
              value={form.company}
              onChange={(value) => updateForm('company', value)}
              placeholder="Company name"
            />

            <FilterInput
              label="Department"
              value={form.department}
              onChange={(value) => updateForm('department', value)}
              placeholder="Talent Acquisition"
            />

            <FilterInput
              label="Password"
              type="password"
              value={form.password}
              onChange={(value) => updateForm('password', value)}
              placeholder="Minimum 8 characters"
            />

            <FilterInput
              label="Confirm Password"
              type="password"
              value={form.confirmPassword}
              onChange={(value) => updateForm('confirmPassword', value)}
              placeholder="Re-enter your password"
            />
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-600">
              {error}
            </div>
          )}

          <div className="mt-6 rounded-2xl bg-violet-50 p-4 text-sm leading-6 text-violet-700">
            First verify your email address. Your account then remains pending until
            an Admin approves it. You cannot sign in before both steps are complete.
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => navigateTo('/login')}
              className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {loading ? 'Submitting...' : 'Submit Registration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export {
  RecruiterRegisterPage
};
