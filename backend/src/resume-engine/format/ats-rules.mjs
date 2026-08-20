/**
 * ATS compatibility — check and repair, without redesigning the resume.
 *
 * Two jobs, kept deliberately separate:
 *
 *   auditAts()  — reports what would trip an applicant tracking system.
 *   repairAts() — fixes only the things that are safe to fix automatically,
 *                 i.e. changes no wording and loses no content.
 *
 * Everything stylistic stays a SUGGESTION. The user's format is the user's
 * choice; the engine's job is to stop a parser silently dropping their
 * experience, not to impose a house style.
 *
 * What actually breaks ATS parsers, in rough order of damage:
 *   1. Text in tables, text boxes, headers/footers, or multi-column layout —
 *      commonly read out of order or skipped entirely.
 *   2. Images and icons carrying information (a skill bar with no text).
 *   3. Invisible/odd Unicode splitting keywords (see sanitize/ai-marks.mjs).
 *   4. Non-standard section headings the parser cannot classify.
 *   5. Date formats a range regex cannot read.
 *   6. Contact details only in a header region.
 *
 * Note on scope: 1, 2 and 6 are properties of the FILE, not of the text. This
 * module can flag them when given file-level hints, but it cannot see them from
 * plain text alone — and it says so rather than implying a clean audit.
 */

import { inspectText } from '../sanitize/ai-marks.mjs';
import { classifyHeading } from './source-profile.mjs';

/** Headings ATS parsers reliably recognise. */
const SAFE_HEADINGS = {
  summary: ['SUMMARY', 'PROFESSIONAL SUMMARY', 'PROFILE'],
  skills: ['SKILLS', 'TECHNICAL SKILLS', 'CORE COMPETENCIES'],
  experience: ['EXPERIENCE', 'PROFESSIONAL EXPERIENCE', 'WORK EXPERIENCE'],
  projects: ['PROJECTS'],
  education: ['EDUCATION'],
  certifications: ['CERTIFICATIONS'],
  awards: ['AWARDS'],
  publications: ['PUBLICATIONS'],
  languages: ['LANGUAGES'],
  volunteer: ['VOLUNTEER EXPERIENCE'],
  interests: ['INTERESTS'],
};

const SEVERITY = { critical: 3, warning: 2, suggestion: 1 };

/**
 * Audit a tailored document plus its source profile.
 *
 * @param {object} doc            the rendered resume document
 * @param {object} sourceProfile  from profileSource()
 * @param {object} [fileHints]    optional file-level facts the caller knows:
 *                                {hasTables, hasTextBoxes, hasImages, columns,
 *                                 contactInHeader, fileType}
 */
export function auditAts(doc, sourceProfile, fileHints = {}) {
  const findings = [];
  const add = (severity, code, message, fix) =>
    findings.push({ severity, code, message, fix });

  /* ── file-level structure: the biggest killers ───────────────────── */

  if (fileHints.columns > 1) {
    add('critical', 'multi_column',
      `Layout uses ${fileHints.columns} columns. Many parsers read straight across, interleaving unrelated text.`,
      'Use a single-column layout for the submitted copy.');
  }
  if (fileHints.hasTables) {
    add('critical', 'tables',
      'Content sits inside tables. Cell contents are frequently read out of order or dropped.',
      'Move table content into plain paragraphs and bullets.');
  }
  if (fileHints.hasTextBoxes) {
    add('critical', 'text_boxes',
      'Content sits in text boxes, which many parsers skip entirely.',
      'Move text-box content into the main document body.');
  }
  if (fileHints.contactInHeader) {
    add('critical', 'contact_in_header',
      'Contact details are in the page header region, which is often not extracted.',
      'Put name, email and phone in the first lines of the body.');
  }
  if (fileHints.hasImages) {
    add('warning', 'images',
      'The document contains images. Any information shown only as a graphic is invisible to a parser.',
      'Ensure every fact also appears as text.');
  }
  if (fileHints.fileType && !['docx', 'pdf', 'txt'].includes(String(fileHints.fileType).toLowerCase())) {
    add('warning', 'file_type',
      `Format "${fileHints.fileType}" is not universally supported.`,
      'Submit DOCX unless the posting asks for PDF.');
  }
  if (!Object.keys(fileHints).length) {
    add('suggestion', 'file_not_inspected',
      'Layout was not inspected — tables, columns, text boxes and header placement could not be checked from text alone.',
      'Pass fileHints from the document renderer for a complete audit.');
  }

  /* ── headings ────────────────────────────────────────────────────── */

  for (const s of sourceProfile?.sections ?? []) {
    if (!s.kind) {
      add('warning', 'unrecognised_heading',
        `Heading "${s.heading}" does not map to a standard section, so its content may not be classified.`,
        'Consider a conventional heading, or keep it if the wording matters to you.');
      continue;
    }
    const safe = SAFE_HEADINGS[s.kind] ?? [];
    const normalised = s.heading.toUpperCase().replace(/[^A-Z& ]/g, '').trim();
    if (safe.length && !safe.includes(normalised)) {
      add('suggestion', 'nonstandard_heading',
        `"${s.heading}" is understood, but "${safe[0]}" is the most reliably parsed wording.`,
        `Optional: rename to "${safe[0]}".`);
    }
  }

  const kinds = new Set(sourceProfile?.kinds ?? []);
  if (!kinds.has('skills')) {
    add('critical', 'no_skills_section',
      'No skills section found. Keyword matching leans on this block more than any other.',
      'Add a skills or core-competencies section.');
  }
  if (!kinds.has('experience')) {
    add('critical', 'no_experience_section',
      'No experience section found.',
      'Add a professional experience section.');
  }

  /* ── text-level issues ───────────────────────────────────────────── */

  const text = documentText(doc);

  const marks = inspectText(text);
  if (marks.suspicious) {
    const blocking = marks.findings.filter((f) =>
      ['invisible_codepoints', 'homoglyphs', 'non_standard_spaces'].includes(f.class)
    );
    if (blocking.length) {
      add('critical', 'invisible_characters',
        `Found ${blocking.reduce((n, f) => n + f.count, 0)} invisible or lookalike characters that split keywords during tokenisation.`,
        'Run the sanitize pass — this is automatic and lossless.');
    }
  }

  const dates = (text.match(/\b(19|20)\d{2}\b/g) || []).length;
  if (dates < 2) {
    add('warning', 'few_dates',
      'Few or no four-digit years found. Parsers use these to compute tenure.',
      'Write date ranges with four-digit years, e.g. "Jun 2022 – Mar 2025".');
  }

  if (!/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) {
    add('critical', 'no_email',
      'No email address found in the document body.',
      'Include an email in the first few lines.');
  }
  if (!/\+?\d[\d\s().-]{7,}\d/.test(text)) {
    add('warning', 'no_phone',
      'No phone number found.',
      'Include a phone number with country code.');
  }

  // Long bullets get truncated in some parsers and skimmed by every human.
  const longBullets = collectBullets(doc).filter((b) => b.split(/\s+/).length > 45);
  if (longBullets.length) {
    add('suggestion', 'long_bullets',
      `${longBullets.length} bullet(s) exceed 45 words.`,
      'Split into two, or trim to the claim plus its evidence.');
  }

  findings.sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity]);

  const critical = findings.filter((f) => f.severity === 'critical').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  return {
    findings,
    counts: {
      critical,
      warning: warnings,
      suggestion: findings.filter((f) => f.severity === 'suggestion').length,
    },
    // Deliberately NOT a 0–100 "ATS score". Every vendor parses differently, so
    // a single number would imply a precision nobody can honestly claim. Counts
    // of concrete, named problems are more useful and more truthful.
    parseable: critical === 0,
    summary:
      critical === 0
        ? warnings === 0
          ? 'No parsing blockers found.'
          : `No blockers; ${warnings} thing(s) worth improving.`
        : `${critical} issue(s) likely to break parsing. Fix these before submitting.`,
  };
}

/**
 * Apply only the repairs that cannot change meaning or lose content.
 *
 * Everything else stays a suggestion in the audit. The line is deliberate:
 * automatic edits are limited to character-level normalisation, because that is
 * the only class of change where "the engine did it silently" is defensible.
 */
export function repairAts(doc, opts = {}) {
  const applied = [];

  // Character-level normalisation only — no rewording, no reordering.
  const walk = (node) => {
    if (typeof node === 'string') {
      let s = node;
      s = s.replace(/[ \t]{2,}/g, ' ');
      s = s.replace(/[ \t]+$/gm, '');
      if (opts.asciiPunctuation !== false) {
        s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
      }
      return s;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  };

  const repaired = walk(doc);
  applied.push('normalised whitespace', 'ASCII quotes');

  return { doc: repaired, applied };
}

/* ── helpers ───────────────────────────────────────────────────────── */

function collectBullets(doc) {
  const out = [];
  for (const r of doc?.roles ?? []) {
    for (const p of r.projects ?? []) for (const b of p.bullets ?? []) out.push(textOf(b));
    for (const b of r.bullets ?? []) out.push(textOf(b));
  }
  for (const p of doc?.projects ?? []) for (const b of p.bullets ?? []) out.push(textOf(b));
  return out.filter(Boolean);
}

const textOf = (b) => (typeof b === 'string' ? b : b?.text ?? '');

/** Flatten a document to plain text for pattern checks. */
export function documentText(doc) {
  const parts = [];
  const walk = (n) => {
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') Object.values(n).forEach(walk);
  };
  walk(doc);
  return parts.join('\n');
}

export default { auditAts, repairAts, documentText };
