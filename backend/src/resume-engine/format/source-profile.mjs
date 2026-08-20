/**
 * Source-format profiling.
 *
 * The engine's contract is: the tailored resume comes back looking like the
 * resume the user uploaded. Not like a template the engine prefers.
 *
 * So before tailoring anything, read the master resume and record HOW it is
 * written — section names and their order, heading case, bullet glyph, date
 * format, whether roles carry a context blurb, whether contact details sit on
 * one line or several. The renderer then reproduces those choices.
 *
 * This is what makes the engine adaptive rather than opinionated. A user who
 * writes "WORK HISTORY" gets "WORK HISTORY" back, not "PROFESSIONAL EXPERIENCE".
 * A user whose resume has no summary does not get one invented.
 *
 * Everything here is DESCRIPTIVE. Nothing in this file decides what a resume
 * *should* look like — see ats-rules.mjs for the (separate, suggested-only)
 * quality opinions.
 */

/* ─── section identification ─────────────────────────────────────────── */

/**
 * Canonical section kinds we can reason about, mapped to the many headings
 * real resumes use for them. The canonical kind drives logic; the user's own
 * literal heading text is what gets rendered.
 */
const SECTION_ALIASES = [
  ['summary', [
    'summary', 'professional summary', 'profile', 'about', 'overview',
    'career summary', 'executive summary', 'objective', 'career objective',
    'professional profile', 'personal statement',
  ]],
  ['skills', [
    'skills', 'technical skills', 'core competencies', 'competencies',
    'core competencies & technologies', 'technologies', 'skills & tools',
    'areas of expertise', 'key skills', 'technical proficiencies', 'expertise',
    'tools', 'tech stack',
  ]],
  ['experience', [
    'experience', 'professional experience', 'work experience', 'employment',
    'employment history', 'work history', 'career history', 'relevant experience',
    'professional background',
  ]],
  ['projects', [
    'projects', 'key projects', 'selected projects', 'personal projects',
    'independent product & requirements work', 'independent work',
    'portfolio', 'side projects', 'notable projects',
  ]],
  ['education', [
    'education', 'academic background', 'academics', 'qualifications',
    'educational qualifications', 'academic qualifications',
  ]],
  ['certifications', [
    'certifications', 'certificates', 'licenses', 'licences',
    'certifications & licenses', 'professional certifications', 'credentials',
  ]],
  ['awards', ['awards', 'honors', 'honours', 'achievements', 'recognition']],
  ['publications', ['publications', 'papers', 'research', 'patents']],
  ['volunteer', ['volunteer', 'volunteering', 'community', 'community involvement']],
  ['languages', ['languages', 'language proficiency']],
  ['interests', ['interests', 'hobbies', 'activities']],
];

const ALIAS_TO_KIND = new Map();
for (const [kind, aliases] of SECTION_ALIASES) {
  for (const a of aliases) ALIAS_TO_KIND.set(a, kind);
}

/** Map a literal heading to a canonical kind, or null if unrecognised. */
export function classifyHeading(line) {
  const key = String(line ?? '')
    .replace(/[^A-Za-z& ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!key) return null;
  if (ALIAS_TO_KIND.has(key)) return ALIAS_TO_KIND.get(key);
  // Substring fallback: "TECHNICAL SKILLS & TOOLS" should still land on skills.
  for (const [alias, kind] of ALIAS_TO_KIND) {
    if (key.includes(alias) && alias.length > 4) return kind;
  }
  return null;
}

/**
 * A line is a heading if it is short, not a bullet, and either all-caps,
 * title-case, or a known section name.
 *
 * Deliberately permissive on the "known section name" branch: a resume that
 * writes "Experience" in sentence case is still declaring a section, and
 * refusing to see it would silently drop the whole block.
 */
function looksLikeHeading(line) {
  const t = String(line ?? '').trim();
  if (!t || t.length > 60) return false;
  if (/^[•·▪‣*\-–—o]\s/.test(t)) return false;
  if (/[.;]$/.test(t)) return false; // headings rarely end in sentence punctuation

  const known = classifyHeading(t) !== null;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (!letters) return false;
  const upperRatio = (t.match(/[A-Z]/g) || []).length / letters.length;

  if (known) return true;
  if (upperRatio > 0.85 && t.split(/\s+/).length <= 6) return true; // ALL CAPS
  return false;
}

/* ─── style detection ────────────────────────────────────────────────── */

const BULLET_GLYPHS = ['•', '·', '▪', '‣', '◦', '-', '*', '–', '—', 'o'];

/** Which bullet character does this resume actually use? */
function detectBulletGlyph(lines) {
  const counts = new Map();
  for (const l of lines) {
    const m = String(l).match(/^\s*([•·▪‣◦*\-–—])\s+/);
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  if (!counts.size) return null; // paragraph-style resume — no glyph to mirror
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** How does this resume write date ranges? Mirror it rather than reformat. */
function detectDateFormat(text) {
  const s = String(text);
  const patterns = [
    // Order matters: more specific first.
    { id: 'Mon YYYY',   re: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(19|20)\d{2}\b/g },
    { id: 'MM/YYYY',    re: /\b(0?[1-9]|1[0-2])\/(19|20)\d{2}\b/g },
    { id: 'YYYY-MM',    re: /\b(19|20)\d{2}-(0?[1-9]|1[0-2])\b/g },
    { id: 'YYYY',       re: /\b(19|20)\d{2}\b/g },
  ];
  let best = { id: 'YYYY', hits: 0 };
  for (const p of patterns) {
    const hits = (s.match(p.re) || []).length;
    if (hits > best.hits) best = { id: p.id, hits };
  }
  return best.hits ? best.id : null;
}

/** Which separator sits between start and end date? "–", "-", "to". */
function detectDateSeparator(text) {
  const s = String(text);
  const candidates = [
    ['–', /\d\s*–\s*(?:\d|Present|Current)/gi],
    ['—', /\d\s*—\s*(?:\d|Present|Current)/gi],
    ['-',  /\d\s*-\s*(?:\d|Present|Current)/gi],
    ['to', /\d\s+to\s+(?:\d|Present|Current)/gi],
  ];
  let best = ['–', 0];
  for (const [sep, re] of candidates) {
    const n = (s.match(re) || []).length;
    if (n > best[1]) best = [sep, n];
  }
  return best[0];
}

/** How is the word for "still employed" written? */
function detectPresentWord(text) {
  const m = String(text).match(/\b(Present|Current|Ongoing|Now|Till Date|To Date)\b/i);
  return m ? m[1] : 'Present';
}

/** ALL CAPS, Title Case, or Sentence case headings? */
function detectHeadingCase(headings) {
  if (!headings.length) return 'upper';
  let upper = 0, title = 0;
  for (const h of headings) {
    const letters = h.replace(/[^A-Za-z]/g, '');
    if (!letters) continue;
    const ratio = (h.match(/[A-Z]/g) || []).length / letters.length;
    if (ratio > 0.85) upper += 1;
    else if (/^[A-Z]/.test(h)) title += 1;
  }
  return upper >= title ? 'upper' : 'title';
}

/* ─── the profile ────────────────────────────────────────────────────── */

/**
 * Read a master resume's plain text and describe its shape.
 *
 * @param {string} text  Extracted resume text WITH line structure intact.
 *                       If this has been flattened to one line, the profile is
 *                       meaningless — call assertNotFlattened first.
 * @returns {object} A description the renderer can follow.
 */
export function profileSource(text) {
  const raw = String(text ?? '');
  const lines = raw.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim());

  // Sections, in the order the user wrote them.
  const sections = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!looksLikeHeading(line)) continue;
    const kind = classifyHeading(line);
    sections.push({
      kind,                 // canonical kind, or null if we do not recognise it
      heading: line,        // the user's literal text — this is what gets rendered
      index: i,
    });
  }

  // Body length per section, used later to budget how much to keep.
  for (let i = 0; i < sections.length; i += 1) {
    const start = sections[i].index + 1;
    const end = i + 1 < sections.length ? sections[i + 1].index : lines.length;
    const body = lines.slice(start, end);
    sections[i].lineCount = body.filter((l) => l.trim()).length;
    sections[i].bulletCount = body.filter((l) =>
      /^\s*[•·▪‣◦*\-–—]\s+/.test(l)
    ).length;
    sections[i].wordCount = body.join(' ').split(/\s+/).filter(Boolean).length;
  }

  const headings = sections.map((s) => s.heading);
  const bulletGlyph = detectBulletGlyph(lines);
  const words = raw.split(/\s+/).filter(Boolean).length;

  return {
    /** Sections in source order — the renderer emits these, and only these. */
    sections,
    /** Canonical kinds present, for quick checks. */
    kinds: sections.map((s) => s.kind).filter(Boolean),

    style: {
      /** null means the source is paragraph-style with no bullet glyphs. */
      bulletGlyph,
      usesBullets: bulletGlyph !== null,
      headingCase: detectHeadingCase(headings),
      dateFormat: detectDateFormat(raw),
      dateSeparator: detectDateSeparator(raw),
      presentWord: detectPresentWord(raw),
      /** Does each role carry a descriptive paragraph before its bullets? */
      usesRoleBlurbs: hasRoleBlurbs(lines),
      /** Are contact details on one line or stacked? */
      contactLayout: detectContactLayout(lines),
    },

    metrics: {
      words,
      lines: nonEmpty.length,
      bullets: lines.filter((l) => /^\s*[•·▪‣◦*\-–—]\s+/.test(l)).length,
      /** Scale-free flatten signal. See assertNotFlattened. */
      wordsPerLine: nonEmpty.length ? words / nonEmpty.length : Infinity,
      /** Rough page estimate at ~500 words/page for a dense resume. */
      estimatedPages: Math.max(1, Math.round(words / 500)),
    },
  };
}

/** A blurb is a non-bullet prose line sitting between a date line and bullets. */
function hasRoleBlurbs(lines) {
  let found = 0;
  for (let i = 0; i < lines.length - 1; i += 1) {
    const cur = lines[i].trim();
    const next = lines[i + 1]?.trim() ?? '';
    const curIsProse = cur.length > 60 && !/^\s*[•·▪‣◦*\-–—]\s/.test(cur);
    const nextIsBullet = /^\s*[•·▪‣◦*\-–—]\s/.test(next);
    if (curIsProse && nextIsBullet) found += 1;
  }
  return found >= 2;
}

/** One line with pipes/bullets separating, or several stacked lines? */
function detectContactLayout(lines) {
  const head = lines.slice(0, 8).map((l) => l.trim()).filter(Boolean);
  for (const l of head) {
    const hasEmail = /@/.test(l);
    const hasPhone = /\+?\d[\d\s().-]{7,}/.test(l);
    const separators = (l.match(/[|·•]/g) || []).length;
    if ((hasEmail || hasPhone) && separators >= 1) return 'single-line';
  }
  return 'stacked';
}

/* ─── the guard that prevents the original bug ───────────────────────── */

/**
 * Reject flattened extraction.
 *
 * `wordsPerLine` is the right signal precisely because it is scale-free: a
 * one-page resume and a ten-page resume both sit well under ~25 when line
 * structure survives, and both go to the hundreds when it does not. No absolute
 * bullet or line count can do that.
 *
 * Throwing here is deliberate. Storing flattened text produces a resume that
 * looks plausible and is missing most of the candidate's evidence — and the
 * user only finds out after sending it to an employer. A failed upload is
 * recoverable; a silently gutted resume is not.
 */
export function assertNotFlattened(text, { maxWordsPerLine = 40 } = {}) {
  const raw = String(text ?? '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const words = raw.split(/\s+/).filter(Boolean).length;

  if (words < 50) {
    throw new Error(
      'Extracted text is too short to be a resume. The file may be a scan or image-only PDF.'
    );
  }
  if (lines.length < 2) {
    throw new Error(
      'Extraction returned a single line — document structure was lost. ' +
        'Upload a DOCX or paste the resume as text instead.'
    );
  }
  const ratio = words / lines.length;
  if (ratio > maxWordsPerLine) {
    throw new Error(
      `Extraction lost line structure (${ratio.toFixed(0)} words per line; a resume is normally under 25). ` +
        'Upload a DOCX or paste the resume as text instead.'
    );
  }
  return { ok: true, words, lines: lines.length, wordsPerLine: ratio };
}

export default { profileSource, assertNotFlattened, classifyHeading };
