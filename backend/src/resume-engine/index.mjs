/**
 * resume-engine — adaptive, format-preserving resume tailoring.
 *
 * Four properties this package is built around:
 *
 *   1. ADAPTIVE   — no fixed page count, no fixed section list, no minimum
 *                   bullet count. Everything scales to the resume it is given.
 *   2. FAITHFUL   — the tailored resume keeps the source's structure, section
 *                   names, heading case, bullet glyph and date format.
 *   3. GROUNDED   — nothing is invented. Content is selected and reordered from
 *                   the candidate's own resume; a fabrication check enforces it.
 *   4. HONEST     — degraded runs say so. Suggestions are labelled suggestions.
 *                   No fake "ATS score" out of 100.
 *
 * Usage:
 *
 *   import { prepareSource, tailor } from 'resume-engine';
 *
 *   const src = prepareSource(masterResumeText);
 *   console.log(src.pageSuggestion.reason);   // show the user, let them choose
 *
 *   const out = tailor({ source: src, job, pages: userChoice ?? null });
 *   out.document   // tailored resume, same shape as the source
 *   out.ats        // parsing audit
 *   out.sanitize   // what the Layer A pass removed
 */

export {
  profileSource,
  assertNotFlattened,
  classifyHeading,
} from './format/source-profile.mjs';

export {
  suggestPageCount,
  wordBudget,
  allocateBullets,
} from './format/page-budget.mjs';

export { extractContact, resolveContact } from './format/contact.mjs';
export { planLayout, BLOCK } from './render/mirror.mjs';
export { buildAtsDocx, atsFileHints } from './render/ats-docx.mjs';

export {
  auditAts,
  repairAts,
  documentText,
} from './format/ats-rules.mjs';
export { auditKeywordCoverage } from './format/keyword-coverage.mjs';

export {
  inspectText,
  cleanText,
  cleanDocument,
} from './sanitize/ai-marks.mjs';

import { profileSource, assertNotFlattened } from './format/source-profile.mjs';
import { suggestPageCount, wordBudget, allocateBullets } from './format/page-budget.mjs';
import { auditAts, repairAts } from './format/ats-rules.mjs';
import { cleanDocument } from './sanitize/ai-marks.mjs';

/**
 * Step 1 — read the master resume and describe it.
 *
 * Throws if extraction lost line structure. That is intentional: a flattened
 * resume produces a plausible-looking document missing most of the candidate's
 * evidence, and the failure is invisible until an employer has already seen it.
 *
 * @param {string} masterResumeText  extracted text WITH newlines intact
 * @param {object} ctx               {yearsExperience, market}
 */
export function prepareSource(masterResumeText, ctx = {}) {
  const guard = assertNotFlattened(masterResumeText);
  const profile = profileSource(masterResumeText);
  const pageSuggestion = suggestPageCount(profile, ctx);

  return {
    text: masterResumeText,
    profile,
    pageSuggestion,
    guard,
  };
}

/**
 * Step 2 — produce the tailored document.
 *
 * @param {object} args
 * @param {object} args.source     from prepareSource()
 * @param {object} args.job        {title, company, description}
 * @param {number|null} args.pages user's choice; null = keep source length
 * @param {function} args.select   selector: ({source, job, budget}) => document
 *                                 Injected so this package stays independent of
 *                                 any particular scoring implementation.
 * @param {object} [args.fileHints]
 * @param {object} [args.sanitizeOptions]
 */
export function tailor({ source, job, pages = null, select, fileHints = {}, sanitizeOptions = {} }) {
  if (typeof select !== 'function') {
    throw new Error('tailor() needs a `select` function — see README, "Bring your own selector".');
  }

  const budget = wordBudget(pages, source.profile);

  // Selection happens against the source's own structure, so the document that
  // comes back already mirrors the user's section order and naming.
  let document = select({ source, job, budget, allocateBullets });

  // Layer A hygiene — lossless, character-level. Runs on the OUTPUT, never on
  // the user's source file: the grounding validator compares against the source,
  // so editing it would move the baseline the fabrication check relies on.
  const { doc: sanitised, report: sanitize } = cleanDocument(document, sanitizeOptions);
  document = sanitised;

  const { doc: repaired, applied } = repairAts(document);
  document = repaired;

  const ats = auditAts(document, source.profile, fileHints);

  return {
    document,
    ats,
    sanitize,
    repairsApplied: applied,
    pages: {
      chosen: pages,
      suggestion: source.pageSuggestion,
      // Restating this on every result keeps the contract visible at the call
      // site: nothing was truncated unless the user asked for it.
      enforced: false,
    },
  };
}

export default { prepareSource, tailor };
