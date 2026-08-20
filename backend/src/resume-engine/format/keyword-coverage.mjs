// Keyword coverage: does the emitted document still carry the terms the posting
// asks for, and — the part that matters — is anything missing that the master
// resume could have supported?
//
// auditAts() checks structure. It passed a document with no skills block at all,
// because structurally nothing was wrong: the section simply was not there. A
// content check is the one thing that would have caught that on the first
// download, and every other defect in this batch with it.
//
// The two cases must not be reported the same way:
//
//   missing  the JD wants it, the master does not have it. A gap. The candidate
//            already knows, or needs to; not a defect.
//   dropped  the JD wants it, the master HAS it, and the output lost it. That is
//            this pipeline losing the candidate's own evidence, and it is
//            critical — they cannot see it by opening the file.

const STOP = new Set(
  ('and or the a an of for to in on at by with from as is are was were be been this that ' +
   'required requirements experience years strong ability must should preferred plus ' +
   'including include includes such other work working knowledge understanding skills ' +
   'you your our we their they will can may have has had using used use across within')
    .split(' ')
);

/** Terms worth scoring: multi-word phrases and meaningful single tokens. */
function termsOf(text) {
  const out = new Set();
  const clean = String(text ?? '').replace(/\s+/g, ' ');

  // Capitalised or acronym-ish runs: "SAP MM", "Procure-to-Pay", "Power BI", "BRD".
  for (const m of clean.matchAll(/\b([A-Z][A-Za-z0-9+#./-]*(?:[ -][A-Z][A-Za-z0-9+#./-]*)*)\b/g)) {
    const v = m[1].trim();
    if (v.length < 3) continue;
    if (STOP.has(v.toLowerCase())) continue;
    out.add(v);
  }
  return [...out];
}

const norm = (s) => ` ${String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
const has = (haystack, term) => haystack.includes(norm(term));

/**
 * @param {{emitted: string, jdText: string, masterText: string}} args
 * @returns {{covered: string[], dropped: string[], missing: string[], findings: object[]}}
 */
export function auditKeywordCoverage({ emitted, jdText, masterText }) {
  const wanted = termsOf(jdText);
  const outHay = norm(emitted);
  const masterHay = norm(masterText);

  const covered = [];
  const dropped = [];
  const missing = [];

  for (const term of wanted) {
    const inOut = has(outHay, term);
    const inMaster = has(masterHay, term);
    if (inOut) covered.push(term);
    else if (inMaster) dropped.push(term);
    else missing.push(term);
  }

  const findings = [];
  if (dropped.length) {
    findings.push({
      severity: 'critical',
      code: 'dropped_supported_keywords',
      message:
        `${dropped.length} term(s) this posting asks for are in your resume but not in ` +
        `this document: ${dropped.slice(0, 8).join(', ')}.`,
      fix: 'These are yours. The tailored document lost them — regenerate before sending.',
    });
  }
  if (missing.length) {
    findings.push({
      severity: 'suggestion',
      code: 'unevidenced_keywords',
      message:
        `${missing.length} term(s) the posting asks for are not evidenced anywhere in ` +
        `your resume: ${missing.slice(0, 8).join(', ')}.`,
      fix: 'Nothing to fix in the document — these are genuine gaps against this posting.',
    });
  }
  return { covered, dropped, missing, findings };
}

export default { auditKeywordCoverage };
