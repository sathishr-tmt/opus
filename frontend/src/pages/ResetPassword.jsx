import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { api } from '../services/api';

export default function ResetPassword({ onComplete }) {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loginPath, setLoginPath] = useState('/login');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!token) {
      setError('This password-reset link is missing its security token.');
      return;
    }

    setLoading(true);
    try {
      const data = await api.resetPassword({ token, ...form });
      setMessage(data.message);
      setLoginPath(data.loginPath || '/login');
    } catch (requestError) {
      setError(requestError.message || 'Unable to reset the password.');
    } finally {
      setLoading(false);
    }
  }

  if (message) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-green-600"><CheckCircle2 size={31} /></div>
          <h1 className="mt-5 text-3xl font-black text-slate-950">Password updated</h1>
          <p className="mt-3 text-slate-500">{message}</p>
          <button onClick={() => onComplete(loginPath)} className="mt-7 rounded-2xl bg-violet-600 px-6 py-4 text-sm font-black text-white">Return to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><LockKeyhole size={27} /></div>
        <h1 className="mt-5 text-3xl font-black text-slate-950">Choose a new password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Use at least 8 characters with uppercase, lowercase, and a number.</p>

        <div className="mt-7 grid gap-5">
          {['newPassword', 'confirmPassword'].map((name) => (
            <label key={name}>
              <span className="mb-2 block text-sm font-black text-slate-700">{name === 'newPassword' ? 'New Password' : 'Confirm New Password'}</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <LockKeyhole size={18} className="text-slate-400" />
                <input
                  type={show ? 'text' : 'password'}
                  value={form[name]}
                  onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
                  className="w-full bg-transparent text-sm font-bold outline-none"
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShow((current) => !current)} className="text-slate-400">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </label>
          ))}

          {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}
          <button type="submit" disabled={loading} className="rounded-2xl bg-violet-600 px-5 py-4 text-sm font-black text-white disabled:opacity-60">{loading ? 'Updating...' : 'Update Password'}</button>
        </div>
      </form>
    </div>
  );
}
