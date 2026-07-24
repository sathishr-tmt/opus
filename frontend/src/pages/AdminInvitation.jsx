import { useState } from 'react';
import { CheckCircle2, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '../services/api';

export default function AdminInvitation({ onComplete }) {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [form, setForm] = useState({ name: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.acceptAdminInvitation({ token, ...form });
      setComplete(true);
    } catch (requestError) {
      setError(requestError.message || 'Unable to complete the invitation.');
    } finally {
      setLoading(false);
    }
  }

  if (complete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-xl">
          <CheckCircle2 size={55} className="mx-auto text-green-600" />
          <h1 className="mt-5 text-3xl font-black">Registration submitted</h1>
          <p className="mt-3 text-slate-500">Your Admin account is waiting for Super Admin approval.</p>
          <button onClick={onComplete} className="mt-7 rounded-2xl bg-violet-600 px-6 py-4 text-sm font-black text-white">Back to Staff Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><ShieldCheck size={28} /></div>
        <h1 className="mt-5 text-3xl font-black">Admin invitation</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Create your own password. Staff can never see or set it for you.</p>
        <div className="mt-7 grid gap-5">
          <label><span className="mb-2 block text-sm font-black">Full Name</span><div className="flex gap-3 rounded-2xl border bg-slate-50 p-4"><UserRound size={18} /><input value={form.name} onChange={(e) => setForm((c) => ({...c, name:e.target.value}))} className="w-full bg-transparent font-bold outline-none" /></div></label>
          {['password','confirmPassword'].map((name) => <label key={name}><span className="mb-2 block text-sm font-black">{name === 'password' ? 'Password' : 'Confirm Password'}</span><div className="flex gap-3 rounded-2xl border bg-slate-50 p-4"><LockKeyhole size={18} /><input type="password" value={form[name]} onChange={(e) => setForm((c) => ({...c, [name]:e.target.value}))} className="w-full bg-transparent font-bold outline-none" /></div></label>)}
          {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}
          <button disabled={loading || !token} className="rounded-2xl bg-violet-600 px-5 py-4 text-sm font-black text-white disabled:opacity-60">{loading ? 'Submitting...' : 'Complete Admin Registration'}</button>
        </div>
      </form>
    </div>
  );
}
