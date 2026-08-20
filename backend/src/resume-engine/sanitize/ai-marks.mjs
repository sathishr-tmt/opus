/**
 * Layer A — deterministic AI-mark removal for resume text.
 *
 * WHY THIS MATTERS FOR RESUMES SPECIFICALLY, beyond provenance:
 * invisible codepoints break ATS parsers. A zero-width space inside "Java​Script"
 * makes the parser read two unknown tokens instead of one known skill, and the
 * candidate silently loses the keyword match. Narrow no-break spaces inside
 * dates ("Jun 2026") stop date-range regexes matching, so an employer's tenure
 * reads as absent. So this pass is a document-quality fix first and a hygiene
 * measure second — it is worth running on every generated resume regardless of
 * what produced it.
 *
 * SCOPE — this file is Layer A only: characters and codepoints that are
 * verifiably present or absent. It is deterministic, reversible in effect, and
 * every change is counted and reported.
 *
 * It does NOT do Layer B (statistical/stylometric rewriting to defeat
 * classifiers). That belongs to a model, cannot be verified locally, and — in a
 * resume pipeline — actively fights the grounding guarantee, because rewriting
 * for token-distribution reasons is exactly the pressure that drifts a factual
 * claim. If you want Layer B, run it as an explicit, separate, user-approved
 * step and re-run the grounding validator afterwards.
 *
 * Container metadata (DOCX/PDF XMP, EXIF, C2PA) is handled in strip-metadata.mjs.
 */

/* ─── codepoint classes ──────────────────────────────────────────────── */

/**
 * Zero-width and invisible formatting characters.
 * These carry no glyph, so a human proofreading the document cannot see them,
 * but a parser tokenises around them.
 */
const INVISIBLE = [
  '​', // ZERO WIDTH SPACE
  '‌', // ZERO WIDTH NON-JOINER
  '‍', // ZERO WIDTH JOINER
  '⁠', // WORD JOINER
  '⁡', // FUNCTION APPLICATION
  '⁢', // INVISIBLE TIMES
  '⁣', // INVISIBLE SEPARATOR
  '⁤', // INVISIBLE PLUS
  '﻿', // ZERO WIDTH NO-BREAK SPACE / BOM
  '­', // SOFT HYPHEN
  '᠎', // MONGOLIAN VOWEL SEPARATOR
];

/**
 * Bidirectional control characters. Legitimate in RTL documents; in an
 * English-language resume they are almost always either an artefact or a
 * deliberate marker, and they can reorder text a reader never sees reordered.
 */
const BIDI = [
  '‎', '‏', // LRM, RLM
  '‪', '‫', '‬', '‭', '‮', // embedding/override
  '⁦', '⁧', '⁨', '⁩', // isolates
];

/**
 * Unicode Tags block (U+E0000–U+E007F). Entirely invisible, and the standard
 * carrier for steganographic payloads embedded in text.
 */
const TAG_BLOCK = /[\u{E0000}-\u{E007F}]/gu;

/** Variation selectors — invisible, and another common payload carrier. */
const VARIATION_SELECTORS = /[︀-️]|[\u{E0100}-\u{E01EF}]/gu;

/**
 * Unusual spaces that render like a normal space but are a different codepoint.
 * Normalising these to U+0020 is what keeps "Jun 2026" matchable by a date regex.
 * NOTE: U+00A0 (NBSP) is included — it is common and legitimate in typography,
 * but in a resume it is more likely to break parsing than to help layout.
 */
const ODD_SPACES = /[   -   　]/g;

/**
 * Typographic characters that are legitimate but parse worse in ATS systems.
 * Curly quotes and en/em dashes routinely arrive mangled in plain-text ATS
 * pipelines. Converting to ASCII is a readability trade the resume wins.
 */
const TYPOGRAPHIC = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/–/g, '-'],   // en dash
  [/—/g, ' - '], // em dash — spaced, so words do not fuse
  [/…/g, '...'], // ellipsis
  [/−/g, '-'],   // minus sign
  [/[•‣◦⁃]/g, '•'], // normalise bullet glyphs
];

/**
 * Cyrillic/Greek homoglyphs that look identical to Latin letters.
 * A Cyrillic 'а' inside "Java" makes the skill unmatchable.
 *
 * ONLY applied in aggressive mode: this substitution is genuinely destructive
 * for a resume that legitimately contains non-Latin text (a name, a publication
 * title, a language skill). Defaulting it on would corrupt real content.
 */
const HOMOGLYPHS = new Map([
  ['А', 'A'], ['а', 'a'], ['В', 'B'], ['Е', 'E'],
  ['е', 'e'], ['К', 'K'], ['М', 'M'], ['Н', 'H'],
  ['О', 'O'], ['о', 'o'], ['Р', 'P'], ['р', 'p'],
  ['С', 'C'], ['с', 'c'], ['Т', 'T'], ['Х', 'X'],
  ['х', 'x'], ['у', 'y'], ['і', 'i'], ['ј', 'j'],
  ['Α', 'A'], ['Β', 'B'], ['Ε', 'E'], ['Ζ', 'Z'],
  ['Η', 'H'], ['Ι', 'I'], ['Κ', 'K'], ['Μ', 'M'],
  ['Ν', 'N'], ['Ο', 'O'], ['Ρ', 'P'], ['Τ', 'T'],
  ['Υ', 'Y'], ['Χ', 'X'], ['ο', 'o'], ['α', 'a'],
]);

/* ─── inspection ─────────────────────────────────────────────────────── */

/**
 * Report what is present without changing anything.
 *
 * Confidence labels are deliberately conservative. Invisible codepoints in a
 * resume are `probable` rather than `confirmed` provenance marks, because a
 * copy-paste from a web page produces the same artefacts. Claiming certainty
 * here would be dishonest, and the user makes a better decision with an honest
 * label than a confident one.
 */
export function inspectText(text) {
  const s = String(text ?? '');
  const findings = [];
  const count = (re) => (s.match(re) || []).length;

  const invisible = count(new RegExp(`[${INVISIBLE.join('')}]`, 'g'));
  if (invisible) {
    findings.push({
      class: 'invisible_codepoints',
      count: invisible,
      confidence: 'probable',
      impact: 'Breaks ATS tokenisation — a zero-width space inside a skill name hides that skill.',
    });
  }

  const bidi = count(new RegExp(`[${BIDI.join('')}]`, 'g'));
  if (bidi) {
    findings.push({
      class: 'bidi_controls',
      count: bidi,
      confidence: 'probable',
      impact: 'Can reorder rendered text in ways a proofread will not catch.',
    });
  }

  const tags = count(TAG_BLOCK);
  if (tags) {
    findings.push({
      class: 'unicode_tag_block',
      count: tags,
      confidence: 'confirmed',
      impact: 'Invisible Tags-block characters have no legitimate use in a resume.',
    });
  }

  const vs = count(VARIATION_SELECTORS);
  if (vs) {
    findings.push({
      class: 'variation_selectors',
      count: vs,
      confidence: 'informational',
      impact: 'Invisible; legitimate after emoji, suspicious after plain letters.',
    });
  }

  const odd = count(ODD_SPACES);
  if (odd) {
    findings.push({
      class: 'non_standard_spaces',
      count: odd,
      confidence: 'informational',
      impact: 'Date and phone-number regexes fail across a non-breaking space.',
    });
  }

  let homoglyphs = 0;
  for (const ch of s) if (HOMOGLYPHS.has(ch)) homoglyphs += 1;
  if (homoglyphs) {
    findings.push({
      class: 'homoglyphs',
      count: homoglyphs,
      confidence: 'probable',
      impact: 'Latin-lookalike letters make the containing word unmatchable.',
      note: 'Only removed with aggressive:true — destructive for genuine non-Latin text.',
    });
  }

  return {
    ok: true,
    suspicious: findings.length > 0,
    findings,
    chars: s.length,
  };
}

/* ─── cleaning ───────────────────────────────────────────────────────── */

/**
 * Strip Layer A marks.
 *
 * @param {string} text
 * @param {{aggressive?: boolean, asciiPunctuation?: boolean, nfkc?: boolean}} opts
 *   aggressive        — also fold Cyrillic/Greek homoglyphs to Latin (default false)
 *   asciiPunctuation  — fold curly quotes and dashes to ASCII (default true, ATS-friendly)
 *   nfkc              — apply NFKC normalisation (default false; it rewrites
 *                       ligatures and full-width forms, which is usually right
 *                       but is a real content change, so it stays opt-in)
 * @returns {{text: string, report: object}}
 */
export function cleanText(text, opts = {}) {
  const {
    aggressive = false,
    asciiPunctuation = true,
    nfkc = false,
  } = opts;

  let s = String(text ?? '');
  const before = inspectText(s);
  const actions = [];
  const tally = (label, fn) => {
    const prev = s;
    s = fn(s);
    if (s !== prev) {
      // Character delta is the honest measure — a regex may fire many times.
      actions.push({ action: label, charsDelta: prev.length - s.length });
    }
  };

  // Order matters. Remove invisibles BEFORE normalising spaces, or a zero-width
  // space between two odd spaces survives as a visible gap.
  tally('remove_invisible_codepoints', (x) =>
    x.replace(new RegExp(`[${INVISIBLE.join('')}]`, 'g'), '')
  );
  tally('remove_bidi_controls', (x) =>
    x.replace(new RegExp(`[${BIDI.join('')}]`, 'g'), '')
  );
  tally('remove_unicode_tag_block', (x) => x.replace(TAG_BLOCK, ''));
  tally('remove_variation_selectors', (x) => x.replace(VARIATION_SELECTORS, ''));
  tally('normalise_spaces', (x) => x.replace(ODD_SPACES, ' '));

  if (asciiPunctuation) {
    tally('ascii_punctuation', (x) => {
      let y = x;
      for (const [re, rep] of TYPOGRAPHIC) y = y.replace(re, rep);
      return y;
    });
  }

  if (aggressive) {
    tally('fold_homoglyphs', (x) =>
      [...x].map((ch) => HOMOGLYPHS.get(ch) ?? ch).join('')
    );
  }

  if (nfkc) {
    tally('nfkc_normalise', (x) => x.normalize('NFKC'));
  }

  // Whitespace tidy — collapse runs of spaces/tabs but NEVER newlines. Line
  // structure is what the evidence bank reads bullets from; collapsing it here
  // would reintroduce the exact bug this engine exists to avoid.
  tally('tidy_horizontal_whitespace', (x) =>
    x.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '')
  );

  const after = inspectText(s);

  return {
    text: s,
    report: {
      before: before.findings,
      after: after.findings,
      actions,
      // Honest residual statement. Layer A is verifiable; anything statistical
      // is not, and this field says so rather than implying a clean bill.
      residual:
        after.findings.length === 0
          ? 'No Layer A marks remain. Statistical/stylometric marks are out of scope for this pass and cannot be verified locally.'
          : 'Some findings remain (see `after`) — most likely legitimate content that would be destroyed by removal.',
      verifiable: true,
      layer: 'A',
    },
  };
}

/**
 * Convenience: clean every string field of a tailored resume document in place,
 * returning a new document plus one merged report.
 *
 * Applied to the RENDERED document rather than the source resume, because the
 * source is the user's own file and should be left byte-identical — the
 * grounding validator compares against it, and silently editing it would make
 * the fabrication check compare output to an already-modified baseline.
 */
export function cleanDocument(doc, opts = {}) {
  const actions = [];
  const seen = { before: [], after: [] };

  const walk = (node) => {
    if (typeof node === 'string') {
      const { text, report } = cleanText(node, opts);
      actions.push(...report.actions);
      seen.before.push(...report.before);
      seen.after.push(...report.after);
      return text;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  };

  const cleaned = walk(doc);

  // Merge duplicate action labels into one row each, so the report reads as a
  // summary rather than a per-field log.
  const merged = new Map();
  for (const a of actions) {
    const prev = merged.get(a.action) ?? { action: a.action, charsDelta: 0, fields: 0 };
    prev.charsDelta += a.charsDelta;
    prev.fields += 1;
    merged.set(a.action, prev);
  }

  return {
    doc: cleaned,
    report: {
      actions: [...merged.values()],
      fieldsTouched: merged.size ? actions.length : 0,
      residual:
        seen.after.length === 0
          ? 'No Layer A marks remain in the rendered document.'
          : 'Residual findings remain — inspect before shipping.',
      verifiable: true,
      layer: 'A',
    },
  };
}

export default { inspectText, cleanText, cleanDocument };
