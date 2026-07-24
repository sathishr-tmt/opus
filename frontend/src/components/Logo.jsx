// OPUS brand marks — the crown of three raised-arm figures beneath a star,
// resting on the unity arc. One source of truth so the logo is identical in
// the sidebar, login page, onboarding, and favicon.

// Unique gradient id per instance so multiple marks on one page don't clash.
let gradientSeq = 0;

// The OPUS crown mark — three people (Opportunity, People, Unity, Success),
// a star above, on the unity arc.
// `variant`: 'gradient' (brand colours) or 'white' (for dark/violet backgrounds).
function OpusMark({ size = 40, variant = 'gradient', className = '' }) {
  const gid = `opus-g-${(gradientSeq += 1)}`;
  const fill = variant === 'white' ? '#ffffff' : `url(#${gid})`;

  return (
    <svg
      width={size}
      height={size * (108 / 120)}
      viewBox="0 0 120 108"
      className={className}
      role="img"
      aria-label="OPUS"
    >
      {variant !== 'white' && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7b3fe4" />
            <stop offset="0.55" stopColor="#6a2bd0" />
            <stop offset="1" stopColor="#4c1d95" />
          </linearGradient>
        </defs>
      )}
      <g fill={fill}>
        {/* star */}
        <path d="M60 2 C61 10 63 12 71 13 C63 14 61 16 60 24 C59 16 57 14 49 13 C57 12 59 10 60 2 Z" />
        {/* center figure */}
        <circle cx="60" cy="34" r="9" />
        <path d="M60 47 C48 47 44 60 41 70 C40 74 44 76 46 72 C50 63 54 60 60 60 C66 60 70 63 74 72 C76 76 80 74 79 70 C76 60 72 47 60 47 Z" />
        {/* left figure */}
        <circle cx="34" cy="50" r="7.5" />
        <path d="M34 61 C24 61 21 73 19 82 C18 86 22 88 24 84 C27 76 30 73 34 73 C38 73 41 76 44 84 C46 88 50 86 49 82 C46 73 43 61 34 61 Z" />
        {/* right figure */}
        <circle cx="86" cy="50" r="7.5" />
        <path d="M86 61 C76 61 73 73 71 82 C70 86 74 88 76 84 C79 76 82 73 86 73 C90 73 93 76 96 84 C98 88 102 86 101 82 C98 73 95 61 86 61 Z" />
      </g>
      {/* unity arc */}
      <path
        d="M14 96 C40 84 80 84 106 96"
        fill="none"
        stroke={fill}
        strokeWidth="6.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Mark + "OPUS" wordmark, horizontally.
function OpusLogo({ size = 34, variant = 'gradient', className = '' }) {
  const wordColor = variant === 'white' ? 'text-white' : 'text-slate-900';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <OpusMark size={size} variant={variant} />
      <span className={`text-xl font-extrabold tracking-tight ${wordColor}`}>OPUS</span>
    </div>
  );
}

const PILLARS = [
  { label: 'OPPORTUNITY', icon: 'door' },
  { label: 'PEOPLE', icon: 'people' },
  { label: 'UNITY', icon: 'unity' },
  { label: 'SUCCESS', icon: 'success' }
];

function PillarIcon({ icon }) {
  const stroke = '#a78bfa';
  if (icon === 'door') {
    return (
      <svg width="26" height="26" viewBox="0 0 20 28" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="1" width="16" height="26" rx="2" />
        <circle cx="14" cy="14" r="1.2" fill={stroke} stroke="none" />
      </svg>
    );
  }
  if (icon === 'people') {
    return (
      <svg width="28" height="24" viewBox="0 0 28 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round">
        <circle cx="6" cy="8" r="3.4" /><circle cx="22" cy="8" r="3.4" /><circle cx="14" cy="5" r="3.8" />
        <path d="M0 22 Q6 14 12 22" /><path d="M16 22 Q22 14 28 22" /><path d="M7 19 Q14 10 21 19" />
      </svg>
    );
  }
  if (icon === 'unity') {
    return (
      <svg width="26" height="26" viewBox="0 0 26 26">
        <path d="M13 24 C1 15 3 3 13 9 C23 3 25 15 13 24 Z" fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
        <circle cx="10" cy="11" r="1.9" fill={stroke} /><circle cx="16" cy="11" r="1.9" fill={stroke} />
      </svg>
    );
  }
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3 L2 24 L24 24" fill="none" stroke={stroke} strokeWidth="2" />
      <rect x="5" y="15" width="3.6" height="7" fill={stroke} /><rect x="11" y="11" width="3.6" height="11" fill={stroke} /><rect x="17" y="7" width="3.6" height="15" fill={stroke} />
      <polyline points="5,16 12,11 18,7 22,4" fill="none" stroke="#c4b5fd" strokeWidth="2" />
    </svg>
  );
}

// Row of four pillar tiles — for the login hero and marketing surfaces.
function OpusPillars({ className = '' }) {
  return (
    <div className={`flex gap-3 ${className}`}>
      {PILLARS.map((pillar) => (
        <div key={pillar.label} className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <PillarIcon icon={pillar.icon} />
          </div>
          <span className="text-[9px] font-semibold tracking-wide text-slate-400">{pillar.label}</span>
        </div>
      ))}
    </div>
  );
}

export {
  OpusMark,
  OpusLogo,
  OpusPillars
};
