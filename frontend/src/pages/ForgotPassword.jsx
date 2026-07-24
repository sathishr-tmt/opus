import { useState } from 'react';
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';

export default function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError('Enter the email address used for your OPUS account.');
      return;
    }

    setLoading(true);

    try {
      const data = await api.forgotPassword(email.trim().toLowerCase());
      setMessage(data.message || 'If that email exists, we sent a password-reset link.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to process the request.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
          <KeyRound size={27} />
        </div>
        <h1 className="mt-5 text-3xl font-black text-slate-950">Reset your password</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
          Enter your User or Staff email. OPUS always shows the same confirmation message for account privacy.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 grid gap-5">
          <label>
            <span className="mb-2 block text-sm font-black text-slate-700">Email Address</span>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
              <Mail size={18} className="text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="w-full bg-transparent text-sm font-bold outline-none"
                placeholder="name@example.com"
              />
            </div>
          </label>

          {message && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold leading-6 text-green-700">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-violet-600 px-5 py-4 text-sm font-black text-white disabled:opacity-60"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
          <span className="flex items-center gap-2"><ShieldCheck size={17} /> Single-use 30-minute link</span>
          <button type="button" onClick={onBack} className="flex items-center gap-1 font-black text-violet-600">
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>
    </div>
  );
}
