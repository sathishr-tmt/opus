import { useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Target,
  UserRound,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { OpusMark } from '../components/Logo.jsx';

const CAREER_GOALS = [
  'Java Full Stack Developer',
  'Full Stack Developer',
  'Frontend Developer',
  'Backend Developer',
  'AI Engineer',
  'Machine Learning Engineer',
  'Data Engineer',
  'Data Analyst',
  'DevOps Engineer',
  'Cloud Engineer',
  'Cybersecurity Engineer',
  'Quality Assurance Engineer',
  'Business Analyst',
  'Project Manager'
];

export default function Register({ onSwitchToLogin }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    careerGoal: '',
    experienceYears: '',
    password: '',
    confirmPassword: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

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

  function validateForm() {
    const name = form.name.trim();
    const email = form.email.trim();
    const careerGoal = form.careerGoal.trim();
    const experienceYears = Number(form.experienceYears);

    if (name.length < 2) {
      return 'Please enter your full name.';
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      return 'Please enter a valid email address.';
    }

    if (!careerGoal) {
      return 'Please enter or select your career goal.';
    }

    if (
      form.experienceYears === '' ||
      Number.isNaN(experienceYears) ||
      !Number.isInteger(experienceYears) ||
      experienceYears < 0 ||
      experienceYears > 50
    ) {
      return 'Experience must be a whole number between 0 and 50.';
    }

    if (form.password.length < 8) {
      return 'Password must contain at least 8 characters.';
    }

    if (!/[A-Z]/.test(form.password)) {
      return 'Password must contain at least one uppercase letter.';
    }

    if (!/[a-z]/.test(form.password)) {
      return 'Password must contain at least one lowercase letter.';
    }

    if (!/[0-9]/.test(form.password)) {
      return 'Password must contain at least one number.';
    }

    if (form.password !== form.confirmPassword) {
      return 'Password and confirm password do not match.';
    }

    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError('');

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        careerGoal: form.careerGoal.trim(),
        experienceYears: Number(form.experienceYears),
        password: form.password,
        confirmPassword: form.confirmPassword
      };

      const data = await api.register(payload);

      setSuccessMessage(
        data.message ||
          'Registration received. Please verify your email address — the Super Admin will then review your account within 24 to 48 hours.'
      );

      setShowSuccessPopup(true);

      setForm({
        name: '',
        email: '',
        careerGoal: '',
        experienceYears: '',
        password: '',
        confirmPassword: ''
      });
    } catch (requestError) {
      setError(
        requestError.message ||
          'Registration failed. Please review your information and try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  function returnToLogin() {
    setShowSuccessPopup(false);
    onSwitchToLogin();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        {/* Left information section */}
        <section className="hidden bg-slate-950 px-12 py-10 text-white lg:flex lg:items-center lg:justify-center">
          <div className="w-full max-w-xl">
            <div className="mb-10 flex items-center gap-3">
              <OpusMark size={56} variant="white" />
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  OPUS
                </h1>

                <p className="mt-1 text-sm font-bold text-slate-400">
                  Smart job application dashboard
                </p>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20">
              <p className="mb-5 inline-flex rounded-full bg-violet-500/20 px-4 py-2 text-sm font-black text-violet-100">
                Create your career workspace
              </p>

              <h2 className="max-w-lg text-5xl font-black leading-tight tracking-tight">
                Build a more organized and focused job search.
              </h2>

              <p className="mt-5 max-w-lg text-base font-medium leading-7 text-slate-300">
                Create your profile, define your career goal, and manage your
                complete application journey from one professional workspace.
              </p>

              <div className="mt-8 grid gap-4">
                <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-100">
                    <CheckCircle2 size={20} />
                  </div>

                  <p className="text-sm font-bold text-slate-200">
                    Define your career goal and experience level.
                  </p>
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-100">
                    <CheckCircle2 size={20} />
                  </div>

                  <p className="text-sm font-bold text-slate-200">
                    Search and track opportunities in one workspace.
                  </p>
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-100">
                    <CheckCircle2 size={20} />
                  </div>

                  <p className="text-sm font-bold text-slate-200">
                    Receive an email after your account is approved.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Registration form section */}
        <section className="flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-xl">
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
                  New user registration
                </p>

                <h2 className="text-3xl font-black text-slate-950">
                  Create your account
                </h2>

                <p className="mt-2 text-sm font-medium text-slate-500">
                  Complete your profile and submit it for Admin approval.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="grid gap-5"
                noValidate
              >
                <label className="block" htmlFor="register-name">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Full Name
                  </span>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
                    <UserRound
                      size={18}
                      className="shrink-0 text-slate-400"
                    />

                    <input
                      id="register-name"
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Enter your full name"
                      autoComplete="name"
                      maxLength={100}
                      className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
                      required
                    />
                  </div>
                </label>

                <label className="block" htmlFor="register-email">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Email Address
                  </span>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
                    <Mail size={18} className="shrink-0 text-slate-400" />

                    <input
                      id="register-email"
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="Enter your email address"
                      autoComplete="email"
                      maxLength={150}
                      className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
                      required
                    />
                  </div>
                </label>

                <label className="block" htmlFor="register-career-goal">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Career Goal
                  </span>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
                    <Target size={18} className="shrink-0 text-slate-400" />

                    <input
                      id="register-career-goal"
                      type="text"
                      name="careerGoal"
                      value={form.careerGoal}
                      onChange={handleChange}
                      placeholder="Example: Java Full Stack Developer"
                      list="career-goal-options"
                      maxLength={100}
                      className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
                      required
                    />

                    <datalist id="career-goal-options">
                      {CAREER_GOALS.map((careerGoal) => (
                        <option key={careerGoal} value={careerGoal} />
                      ))}
                    </datalist>
                  </div>
                </label>

                <label className="block" htmlFor="register-experience">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Years of Experience
                  </span>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
                    <Briefcase
                      size={18}
                      className="shrink-0 text-slate-400"
                    />

                    <input
                      id="register-experience"
                      type="number"
                      name="experienceYears"
                      value={form.experienceYears}
                      onChange={handleChange}
                      placeholder="Example: 5"
                      min="0"
                      max="50"
                      step="1"
                      inputMode="numeric"
                      className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
                      required
                    />
                  </div>
                </label>

                <label className="block" htmlFor="register-password">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Password
                  </span>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
                    <Lock size={18} className="shrink-0 text-slate-400" />

                    <input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Minimum 8 characters"
                      autoComplete="new-password"
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

                  <span className="mt-2 block text-xs font-semibold text-slate-400">
                    Use uppercase, lowercase, a number, and at least 8
                    characters.
                  </span>
                </label>

                <label className="block" htmlFor="register-confirm-password">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Confirm Password
                  </span>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
                    <Lock size={18} className="shrink-0 text-slate-400" />

                    <input
                      id="register-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      value={form.confirmPassword}
                      onChange={handleChange}
                      placeholder="Enter your password again"
                      autoComplete="new-password"
                      className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
                      required
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(
                          (currentValue) => !currentValue
                        )
                      }
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                      aria-label={
                        showConfirmPassword
                          ? 'Hide confirm password'
                          : 'Show confirm password'
                      }
                      title={
                        showConfirmPassword
                          ? 'Hide confirm password'
                          : 'Show confirm password'
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={19} />
                      ) : (
                        <Eye size={19} />
                      )}
                    </button>
                  </div>
                </label>

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
                  {loading ? 'Submitting registration...' : 'Create Account'}

                  {!loading && <ArrowRight size={18} />}
                </button>
              </form>

              <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-center">
                <p className="text-sm font-bold text-slate-500">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={onSwitchToLogin}
                    disabled={loading}
                    className="font-black text-violet-600 transition hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Sign In
                  </button>
                </p>
              </div>
            </div>

            <p className="mt-5 text-center text-xs font-semibold text-slate-400">
              Verify your email first. Your account can be used after an Admin
              approves the verified registration.
            </p>
          </div>
        </section>
      </div>

      {/* Registration confirmation popup */}
      {showSuccessPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="registration-success-title"
        >
          <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl">
            <button
              type="button"
              onClick={returnToLogin}
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close confirmation popup"
            >
              <X size={20} />
            </button>

            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700">
              <CheckCircle2 size={30} />
            </div>

            <h3
              id="registration-success-title"
              className="mt-6 text-2xl font-black text-slate-950"
            >
              Check your email
            </h3>

            <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
              {successMessage}
            </p>

            <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <p className="text-sm font-bold leading-6 text-violet-800">
                Open your email now and select <strong>Verify Email Address</strong>.
                Once verified, our Super Admin team reviews your account &mdash; this
                usually takes <strong>24 to 48 hours</strong>. We will email you the
                moment a decision is made, and then you can sign in.
              </p>
            </div>

            <button
              type="button"
              onClick={returnToLogin}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700"
            >
              Return to Sign In
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}