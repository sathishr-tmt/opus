/**
 * Page budgeting — SUGGEST, never enforce.
 *
 * The engine does not decide how long a resume should be. It computes a
 * recommendation, explains the reasoning, and applies whatever the user chose.
 * If the user says nothing, the source resume's own length wins.
 *
 * This is a deliberate product stance. Length norms vary by market (US one-page
 * convention vs. European CV vs. academic CV), by seniority, and by field. An
 * engine that silently truncated a six-page CV to two pages would be destroying
 * evidence the candidate chose to include, on the strength of a convention that
 * may not even apply to them.
 */

/** Words per page at typical resume density (10–11pt, 0.5–0.75in margins). */
const WORDS_PER_PAGE = 500;

/**
 * Recommend a page count with a stated reason.
 *
 * @param {object} sourceProfile  from profileSource()
 * @param {object} ctx            optional context that shifts the norm
 * @param {number} [ctx.yearsExperience]
 * @param {string} [ctx.market]   'us' | 'uk' | 'eu' | 'academic' | 'unknown'
 * @param {string} [ctx.jobTitle]
 * @returns {{recommended: number, sourcePages: number, min: number, max: number,
 *            reason: string, enforced: false, options: number[]}}
 */
export function suggestPageCount(sourceProfile, ctx = {}) {
  const sourcePages = sourceProfile?.metrics?.estimatedPages ?? 1;
  const years = ctx.yearsExperience;
  const market = (ctx.market ?? 'unknown').toLowerCase();

  // Academic and EU CVs are conventionally long. Recommending compression there
  // would be wrong, so the source length stands.
  if (market === 'academic' || market === 'eu') {
    return {
      recommended: sourcePages,
      sourcePages,
      min: 1,
      max: Math.max(sourcePages, 10),
      reason:
        `${market === 'academic' ? 'Academic CVs' : 'European CVs'} are conventionally long — ` +
        'keeping your source length. Shorten only if the posting asks for it.',
      enforced: false,
      options: dedupe([1, 2, 3, sourcePages]),
    };
  }

  // Experience-based norm, stated as a range rather than a number.
  let lo, hi, basis;
  if (typeof years === 'number' && Number.isFinite(years)) {
    if (years < 3)       { lo = 1; hi = 1; basis = `${years} years of experience`; }
    else if (years < 10) { lo = 1; hi = 2; basis = `${years} years of experience`; }
    else                 { lo = 2; hi = 3; basis = `${years}+ years of experience`; }
  } else {
    lo = 1; hi = 2; basis = 'no stated years of experience';
  }

  // Never recommend growing a resume — there is nothing honest to pad with.
  const recommended = Math.min(sourcePages, Math.max(lo, Math.min(hi, sourcePages)));

  let reason;
  if (sourcePages <= hi) {
    reason =
      `Your resume is about ${sourcePages} page${sourcePages === 1 ? '' : 's'}, which already fits ` +
      `the ${lo}–${hi} page range typical for ${basis}. Keeping it as is.`;
  } else {
    reason =
      `Your master resume runs about ${sourcePages} pages. For ${basis}, ${lo}–${hi} pages is the ` +
      `usual expectation, so the tailored version targets ${recommended}. Your master resume is ` +
      `unchanged — this only affects what gets selected for this application.`;
  }

  return {
    recommended,
    sourcePages,
    min: 1,
    max: Math.max(sourcePages, hi),
    reason,
    enforced: false,
    options: dedupe([1, 2, 3, sourcePages]),
  };
}

/**
 * Convert a chosen page count into a word budget the selector can aim at.
 * Returns null when the user wants the full source length, which tells the
 * selector not to drop anything for length reasons.
 */
export function wordBudget(pages, sourceProfile) {
  const sourceWords = sourceProfile?.metrics?.words ?? 0;
  if (!pages) return null;
  const budget = pages * WORDS_PER_PAGE;
  return budget >= sourceWords ? null : budget;
}

/**
 * Distribute a word budget across roles PROPORTIONALLY to the source, with a
 * floor so no role is emptied.
 *
 * The floor is the important part. Dropping a role's bullets entirely leaves a
 * company name and dates with nothing under it, which reads as a gap the
 * candidate is hiding. Two thin bullets beat a blank.
 *
 * @param {Array<{id: string, sourceBullets: number}>} roles
 * @param {number|null} budgetWords  null = keep everything
 * @param {number} avgWordsPerBullet
 * @returns {Map<string, number>} role id → bullets to keep
 */
export function allocateBullets(roles, budgetWords, avgWordsPerBullet = 25, floor = 2) {
  const out = new Map();
  const totalSource = roles.reduce((s, r) => s + (r.sourceBullets || 0), 0);

  if (!budgetWords || !totalSource) {
    for (const r of roles) out.set(r.id, r.sourceBullets || 0);
    return out;
  }

  // Reserve the floor for every role first, then share what remains by weight.
  const totalBullets = Math.max(1, Math.floor(budgetWords / avgWordsPerBullet));
  const reserved = roles.reduce((s, r) => s + Math.min(floor, r.sourceBullets || 0), 0);
  const spare = Math.max(0, totalBullets - reserved);

  for (const r of roles) {
    const src = r.sourceBullets || 0;
    const base = Math.min(floor, src);
    const share = totalSource ? (src / totalSource) * spare : 0;
    out.set(r.id, Math.min(src, Math.round(base + share)));
  }
  return out;
}

function dedupe(xs) {
  return [...new Set(xs.filter((x) => Number.isFinite(x) && x > 0))].sort((a, b) => a - b);
}

export default { suggestPageCount, wordBudget, allocateBullets };
