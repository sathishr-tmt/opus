// "Your AI match" — how well the signed-in user's profile fits one job.
//
// Every number here comes from the deterministic scorer in backend/src/ats.js.
// Nothing is invented: a dimension the posting does not state (for example a
// seniority level) is shown as "Not stated" rather than given a made-up score.
import { useState, useEffect } from 'react';
import { RefreshCw, Sparkles, AlertTriangle } from 'lucide-react';
import { apiRequest } from '../lib/api.js';
import { EmptyState, btnClass, btnPrimaryClass } from './ui.jsx';

const DIMENSIONS = [
  ['skills', 'Skills'],
  ['experience', 'Experience'],
  ['seniority', 'Seniority'],
  ['title', 'Role match'],
  ['location', 'Location'],
  ['authorization', 'Work eligibility']
];

// Red below 35, amber to 65, green above.
function barColor(value) {
  if (value == null) return 'bg-slate-200';
  if (value < 35) return 'bg-red-500';
  if (value < 65) return 'bg-amber-500';
  return 'bg-green-500';
}

function ringColor(score) {
  if (score < 35) return '#dc2626';
  if (score < 65) return '#d97706';
  return '#16a34a';
}

/* Circular score dial, drawn with plain SVG so it needs no chart library. */
function ScoreRing({ score }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <svg viewBox="0 0 84 84" className="h-[84px] w-[84px] shrink-0">
      <circle cx="42" cy="42" r={radius} fill="none" stroke="#eceaf5" strokeWidth="7" />
      <circle
        cx="42"
        cy="42"
        r={radius}
        fill="none"
        stroke={ringColor(score)}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        transform="rotate(-90 42 42)"
      />
      <text
        x="42"
        y="42"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-slate-900"
        style={{ fontSize: 20, fontWeight: 800 }}
      >
        {score}
      </text>
    </svg>
  );
}

function SkillPills({ title, skills, tone }) {
  if (!skills?.length) return null;

  const tones = {
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    violet: 'bg-violet-50 text-violet-700'
  };

  const headings = {
    green: 'text-green-700',
    red: 'text-red-700',
    violet: 'text-violet-700'
  };

  return (
    <div className="mt-3">
      <p className={`mb-1.5 text-[12px] font-bold ${headings[tone]}`}>{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <span
            key={skill}
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${tones[tone]}`}
          >
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * @param {object}   job        The job being matched against.
 * @param {string}   jobId      Its id.
 * @param {function} onRewrite  Optional — shows a "Tailor my resume" button.
 * @param {boolean}  rewriting  Disables that button while it runs.
 */
function MatchPanel({ job, jobId, onRewrite, rewriting, showToast, saved = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function evaluate() {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/api/documents/match', {
        method: 'POST',
        body: { jobId, job }
      });
      setData(result);
    } catch (err) {
      setError(err.message || 'Unable to analyse this job.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (jobId) evaluate();
  }, [jobId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-[18px]">
        <h3 className="text-base font-extrabold text-slate-900">Your AI match</h3>
        <EmptyState text="Analysing this role against your profile…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-[18px]">
        <h3 className="mb-2 text-base font-extrabold text-slate-900">Your AI match</h3>
        <p className="text-[13px] text-slate-500">{error || 'No analysis available.'}</p>
        <button className={`${btnClass} mt-3`} onClick={evaluate}>
          Try again
        </button>
      </div>
    );
  }

  const { score, breakdown = {}, matched, missing, bonus, reasons, blockers = [] } = data;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-[18px]">
      <h3 className="mb-3 text-base font-extrabold text-slate-900">Your AI match</h3>

      {/* Headline score + why */}
      <div className="flex items-start gap-3.5">
        <ScoreRing score={score} />
        <div className="min-w-0 flex-1">
          <ul className="space-y-1">
            {(reasons || []).slice(0, 4).map((reason, index) => (
              <li key={index} className="text-[12.5px] leading-5 text-slate-600">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Hard blockers — stated eligibility requirements the profile does not meet. */}
      {blockers.length > 0 && (
        <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-amber-800">
            <AlertTriangle size={14} /> Eligibility requirements
          </p>
          <ul className="mt-1.5 space-y-1">
            {blockers.map((blocker, index) => (
              <li key={index} className="text-[12px] leading-5 text-amber-800">
                · {blocker.label}
                {blocker.severity === 'unknown' && ' (your work authorization is not filled in)'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-dimension bars */}
      <div className="mt-4 space-y-2">
        {DIMENSIONS.map(([key, label]) => {
          const value = breakdown[key];
          const stated = value != null;

          return (
            <div key={key} className="flex items-center gap-2.5">
              <span className="w-[76px] shrink-0 text-[12px] text-slate-500">{label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span
                  className={`block h-full rounded-full ${barColor(value)}`}
                  style={{ width: stated ? `${value}%` : '0%' }}
                />
              </span>
              <span
                className={`w-[64px] shrink-0 text-right text-[11.5px] ${
                  stated ? 'font-bold text-slate-700' : 'text-slate-400'
                }`}
              >
                {stated ? value : 'Not stated'}
              </span>
            </div>
          );
        })}
      </div>

      <SkillPills title="Matched skills" skills={matched} tone="green" />
      <SkillPills title="Missing skills" skills={missing} tone="red" />
      <SkillPills title="Bonus skills" skills={bonus} tone="violet" />

      <div className="mt-4 flex flex-wrap gap-2">
        <button className={btnClass} onClick={evaluate} disabled={loading}>
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw size={14} /> Re-evaluate
          </span>
        </button>

        {onRewrite && (
          <button className={btnPrimaryClass} onClick={onRewrite} disabled={rewriting}>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={14} />
              {rewriting
                ? 'Tailoring…'
                : saved
                ? 'Tailor my resume'
                : 'Save & tailor my resume'}
            </span>
          </button>
        )}
      </div>

      {score < 40 && missing?.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[12.5px] font-bold text-amber-800">
            Tailoring will not close this gap
          </p>
          <p className="mt-1 text-[12px] leading-5 text-amber-800">
            The missing skills are core requirements for this role, and a rewrite
            cannot add skills you have not listed.
          </p>
        </div>
      )}

      {missing?.length > 0 && (
        <p className="mt-2.5 text-[11.5px] leading-5 text-slate-400">
          Tailoring rewrites your existing resume to foreground the skills you
          genuinely have. It will not add skills you have not listed.
        </p>
      )}
    </div>
  );
}

export {
  MatchPanel
};
