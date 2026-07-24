import { CheckCircle2, MailCheck, TriangleAlert } from 'lucide-react';

export default function VerifyEmail({ onContinue, onResend }) {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status') || 'invalid';
  const email = params.get('email') || '';
  const entry = params.get('entry') || 'user';
  const verified = status === 'verified';
  const expired = status === 'expired';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${verified ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
          {verified ? <CheckCircle2 size={31} /> : expired ? <MailCheck size={31} /> : <TriangleAlert size={31} />}
        </div>
        <h1 className="mt-5 text-3xl font-black text-slate-950">
          {verified ? 'Email verified' : expired ? 'Verification link expired' : 'Unable to verify email'}
        </h1>
        <p className="mt-3 leading-7 text-slate-500">
          {verified
            ? 'Your verified registration is now in the appropriate approval queue. You will receive an email after approval.'
            : expired
            ? 'Request a new verification link, then verify your email before approval.'
            : 'The verification link is invalid, already used, or unavailable.'}
        </p>
        {expired && email && (
          <button onClick={() => onResend(email)} className="mt-6 rounded-2xl bg-violet-50 px-6 py-3 text-sm font-black text-violet-700">Resend Verification Email</button>
        )}
        <button onClick={() => onContinue('/login')} className="mt-6 w-full rounded-2xl bg-violet-600 px-6 py-4 text-sm font-black text-white">Continue to Login</button>
      </div>
    </div>
  );
}
