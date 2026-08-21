// "Your AI match" — how well the signed-in user's profile fits one job.
//
// Every number here comes from the deterministic scorer in backend/src/ats.js.
// Nothing is invented: a dimension the posting does not state (for example a
// seniority level) is shown as "Not stated" rather than given a made-up score.
import { useState, useEffect } from 'react';
import { RefreshCw, Sparkles, AlertTriangle, ExternalLink } from 'lucide-react';
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
 * Build the starting prompt handed to an external assistant.
 *
 * This is a draft, not a submission: it opens in a new tab where the candidate
 * edits it and attaches their own resume before sending anything. Kept under
 * roughly 6000 characters so the URL survives every browser.
 */
function buildPrompt({ job, matched = [], missing = [], bonus = [], score }) {
  const list = (items) => (items.length ? items.join(', ') : 'None detected');

  const description = String(job?.description || '')
    .replace(/\s+/g, ' ')
    .slice(0, 2500);

  return [
    "I'm tailoring my resume for the role below. I'll attach my current resume in my next message.",
    '',
    `ROLE: ${job?.title || 'Not listed'}`,
    `COMPANY: ${job?.company || 'Not listed'}`,
    `LOCATION: ${job?.location || 'Not listed'}`,
    score != null ? `CURRENT MATCH SCORE: ${score}%` : '',
    '',
    'SKILLS THIS JOB ASKS FOR THAT I ALREADY HAVE:',
    list(matched),
    '',
    "SKILLS THIS JOB ASKS FOR THAT MY PROFILE DOESN'T SHOW:",
    list(missing),
    '',
    'OTHER SKILLS I HAVE THAT THIS JOB DID NOT ASK FOR:',
    list(bonus),
    '',
    'JOB DESCRIPTION:',
    description || 'Not provided.',
    '',
    'WHAT I NEED:',
    '1. Rewrite my resume for this specific role.',
    '2. Keep the existing structure, headings and formatting exactly as they are — change the wording only.',
    '3. For each skill listed as missing, first check whether my resume already shows that experience under different wording. If it does, bring it to the surface. If it genuinely does not, tell me rather than adding it.',
    '4. Do not invent employers, dates, job titles, degrees or metrics.',
    '5. Where I have a relevant bonus skill, work it in naturally if it strengthens the application.'
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * @param {object}   job        The job being matched against.
 * @param {string}   jobId      Its id.
 * @param {function} onRewrite  Optional — shows a "Tailor my resume" button.
 * @param {boolean}  rewriting  Disables that button while it runs.
 * @param {boolean}  saved      Whether the job is already saved.
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

  // Opens a new tab with the prompt already typed in. The candidate reviews it,
  // attaches their resume, and decides what to send.
  function openInAssistant(provider) {
    const prompt = buildPrompt({
      job,
      matched: data?.matched || [],
      missing: data?.missing || [],
      bonus: data?.bonus || [],
      score: data?.score
    });

    const encoded = encodeURIComponent(prompt);

    const url =
      provider === 'claude'
        ? `https://claude.ai/new?q=${encoded}`
        : `https://chatgpt.com/?q=${encoded}`;

    window.open(url, '_blank', 'noopener,noreferrer');

    if (showToast) {
      showToast('Prompt opened in a new tab — attach your resume there.');
    }
  }

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

      {/* Hand the same analysis to an external assistant as a starting prompt.
          Opens in a new tab; nothing is sent until the candidate sends it. */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-2 text-[11.5px] text-slate-500">
          Or draft it yourself with an AI assistant. The prompt opens ready to
          edit — attach your resume there before sending.
        </p>

        <div className="flex flex-wrap gap-2">
          <button className={btnClass} onClick={() => openInAssistant('chatgpt')}>
            <span className="inline-flex items-center gap-1.5">
              Open in ChatGPT <ExternalLink size={13} />
            </span>
          </button>

          <button className={btnClass} onClick={() => openInAssistant('claude')}>
            <span className="inline-flex items-center gap-1.5">
              Open in Claude <ExternalLink size={13} />
            </span>
          </button>
        </div>
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
