import { useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail
} from 'lucide-react';
import { api } from '../services/api';
import { OpusMark, OpusPillars } from '../components/Logo.jsx';

// OPUS single login page — every role (User, Recruiter, Admin, Super Admin)
// signs in here. The backend returns the role's `redirectPath`, which decides
// which portal opens.
export default function Login({
  onLogin,
  onSwitchToRegister,
  onForgotPassword,
  onRecruiterRegister
}) {
  const queryParams = new URLSearchParams(window.location.search);

  const [form, setForm] = useState({
    email: queryParams.get('email') || '',
    password: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const approvalNotice =
    queryParams.get('approved') === 'true'
      ? 'Your account has been approved. Sign in using your registered credentials.'
      : '';

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));

    if (error) {
      setError('');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError('');

    const email = form.email.trim().toLowerCase();

    if (!email || !form.password) {
      setError('Please enter your email address and password.');
      return;
    }

    setLoading(true);

    try {
      const data = await api.login({
        email,
        password: form.password,
        rememberMe
      });

      /*
       * The backend verifies the password, account status, and email
       * verification, then returns the account's role plus `redirectPath`
       * (the home route of that role's portal). One login page serves all
       * four roles; the role decides which portal opens next.
       */
      onLogin(data.user, data.redirectPath);
    } catch (requestError) {
      setError(
        requestError.message ||
          'Unable to sign in. Please verify your credentials and try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  // A small preview of ranked matches shown on the branding panel — it conveys
  // the product's value without listing features in words.
  const previewJobs = [
    {
      title: 'Backend Developer',
      meta: 'Austin, Texas · Onsite · Full-time',
      score: '92%',
      tag: 'Exact',
      scoreClass: 'bg-emerald-500/20 text-emerald-200'
    },
    {
      title: 'Full Stack Engineer',
      meta: 'Dallas, Texas · Hybrid · Full-time',
      score: '78%',
      tag: 'Strong',
      scoreClass: 'bg-sky-500/20 text-sky-200'
    },
    {
      title: 'Python Developer',
      meta: 'Houston, Texas · Remote · Contract',
      score: '64%',
      tag: 'Nearby',
      scoreClass: 'bg-amber-500/20 text-amber-200'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        {/* Left product-information section */}
        <section className="hidden bg-slate-950 px-12 py-10 text-white lg:flex lg:items-center lg:justify-center">
          <div className="w-full max-w-xl">
            <div className="mb-10 flex items-center gap-3">
              <OpusMark size={56} variant="white" />
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  OPUS
                </h1>
                <p className="mt-1 text-sm font-bold text-slate-400">
                  Smart job application
                </p>
              </div>
            </div>

            <OpusPillars className="mb-10" />

            <div className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20">
              <p className="mb-5 inline-flex rounded-full bg-violet-500/20 px-4 py-2 text-sm font-black text-violet-100">
                Job search workspace
              </p>

              <h2 className="max-w-lg text-5xl font-black leading-tight tracking-tight">
                Organize your job search with clarity and control.
              </h2>

              <div className="mt-8 grid gap-3">
                {previewJobs.map((job) => (
                  <div
                    key={job.title}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-4"
                  >
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-black ${job.scoreClass}`}
                    >
                      {job.score}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">
                        {job.title}
                      </p>
                      <p className="truncate text-xs font-bold text-slate-400">
                        {job.meta}
                      </p>
                    </div>

                    <span className="ml-auto shrink-0 rounded-full border border-violet-300/40 bg-violet-500/20 px-3 py-1 text-[11px] font-black text-violet-100">
                      {job.tag}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Login form section */}
        <section className="flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <OpusMark size={44} />

              <div>
                <h1 className="text-xl font-black text-slate-900">
                  OPUS
                </h1>

                <p className="text-xs font-semibold text-slate-500">
                  Job application workspace
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="mb-8">
                <p className="mb-3 inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                  Welcome back
                </p>

                <h2 className="text-3xl font-black text-slate-950">
                  Login to your account
                </h2>
              </div>

              {approvalNotice && (
                <div
                  className="mb-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700"
                  role="status"
                >
                  {approvalNotice}
                </div>
              )}

              <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
                <label className="block" htmlFor="user-login-email">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Email Address
                  </span>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
                    <Mail size={18} className="shrink-0 text-slate-400" />

                    <input
                      id="user-login-email"
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="Enter your email address"
                      autoComplete="email"
                      className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
                      required
                    />
                  </div>
                </label>

                <label className="block" htmlFor="user-login-password">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Password
                  </span>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
                    <Lock size={18} className="shrink-0 text-slate-400" />

                    <input
                      id="user-login-password"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
                      required
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((currentValue) => !currentValue)
                      }
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff size={19} />
                      ) : (
                        <Eye size={19} />
                      )}
                    </button>
                  </div>
                </label>

                <div className="flex items-center justify-between gap-4 text-sm">
                  <label className="flex items-center gap-2 font-bold text-slate-600">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-violet-600"
                    />
                    Remember me for 7 days
                  </label>
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="font-black text-violet-600 hover:text-violet-700"
                  >
                    Forgot password?
                  </button>
                </div>

                {error && (
                  <div
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700 focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? 'Signing in...' : 'Sign In'}

                  {!loading && <ArrowRight size={18} />}
                </button>
              </form>

              <div className="mt-6 grid gap-2 rounded-2xl bg-slate-50 p-4 text-center">
                <p className="text-sm font-bold text-slate-500">
                  Looking for a job?{' '}
                  <button
                    type="button"
                    onClick={onSwitchToRegister}
                    disabled={loading}
                    className="font-black text-violet-600 transition hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Create an account
                  </button>
                </p>

                <p className="text-sm font-bold text-slate-500">
                  Hiring?{' '}
                  <button
                    type="button"
                    onClick={onRecruiterRegister}
                    disabled={loading}
                    className="font-black text-violet-600 transition hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Register as a recruiter
                  </button>
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
