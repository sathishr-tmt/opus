# resume-engine

Adaptive, format-preserving resume tailoring. Rewrites a master resume against a
job description without inventing anything and without imposing a template.

```
resume-engine/
├── index.mjs                    # public API
├── format/
│   ├── source-profile.mjs       # read the master resume's own structure
│   ├── page-budget.mjs          # suggest a length; never enforce one
│   └── ats-rules.mjs            # audit + safe repairs
├── sanitize/
│   └── ai-marks.mjs             # Layer A: invisible Unicode, odd spaces
├── test/
│   └── engine.test.mjs          # 34 invariant tests
└── README.md
```

No dependencies. Node 18+.

```bash
node test/engine.test.mjs
```

---

## The four properties

**Adaptive.** No fixed page count, no fixed section list, no minimum bullet
count. Every threshold is relative to the uploaded resume. A one-page resume and
a ten-page CV both work, and neither is measured against the other.

**Faithful.** The output mirrors the source: its section names in its order, its
heading case, its bullet glyph, its date format. If the user writes
"WORK HISTORY" they get "WORK HISTORY" back. If their resume has no summary, one
is not invented.

**Grounded.** Content is selected and reordered from the candidate's own resume.
Nothing is added. A resume that wins a screen on an invented claim loses the
interview.

**Honest.** Degraded runs say they are degraded. Suggestions are labelled
suggestions. There is deliberately **no 0–100 "ATS score"** — every vendor parses
differently, so a single number implies a precision nobody can support. You get
named, concrete findings instead.

---

## Usage

```js
import { prepareSource, tailor } from './index.mjs';

// 1. Read the master resume. Throws if extraction lost line structure.
const source = prepareSource(masterResumeText, { yearsExperience: 5 });

// 2. Show the length suggestion. The user decides.
console.log(source.pageSuggestion.reason);
// "Your master resume runs about 6 pages. For 5 years of experience, 1–2 pages
//  is the usual expectation, so the tailored version targets 2. Your master
//  resume is unchanged — this only affects what gets selected."

// 3. Tailor. `pages: null` keeps the source length.
const result = tailor({
  source,
  job,
  pages: userChoice ?? null,
  select: mySelector,
  fileHints: { columns: 1, hasTables: false, fileType: 'docx' },
});

result.document        // tailored resume, shaped like the source
result.ats.findings    // named parsing problems, by severity
result.ats.parseable   // true when nothing critical remains
result.sanitize.actions
result.pages.enforced  // always false
```

### Bring your own selector

`tailor()` takes a `select` function so the package stays independent of any
particular scoring implementation:

```js
function mySelector({ source, job, budget, allocateBullets }) {
  // source.profile.sections — the user's sections, in their order
  // source.profile.style    — glyph, heading case, date format to mirror
  // budget                  — target word count, or null for "keep everything"
  // Return a document object shaped like the source.
}
```

---

## Why the flatten guard exists

This engine was written after a real failure: a 6-page resume tailored down to
218 words with **zero bullets under any employer**. The tailoring logic was
fine. The input had been destroyed before it arrived.

The PDF extractor ended with:

```js
.join(' ').replace(/\s+/g, ' ')   // collapses the whole resume onto one line
```

Bullets were detected with `/^[•·▪‣]\s*/` — a marker at the **start of a line**.
With no lines, zero bullets were found, every role rendered empty, and the
document silently collapsed to headers.

`assertNotFlattened()` catches this with `words / lines`. That ratio is the right
signal because it is **scale-free**: a one-page resume and a ten-page CV both sit
well under 25 when structure survives, and both go to the hundreds when it does
not. No absolute bullet count can distinguish "short resume" from "destroyed
resume" — a ratio can.

It **throws** rather than returning a warning. A rejected upload is recoverable.
A silently gutted resume is not: the user finds out after an employer has read
it.

---

## Layer A sanitisation

`sanitize/ai-marks.mjs` removes invisible Unicode, bidi controls, the Unicode
Tags block, variation selectors, and non-standard spaces.

**This is a document-quality fix first.** A zero-width space inside
`Java​Script` makes a parser read two unknown tokens instead of one known skill,
and the candidate silently loses the keyword match. A narrow no-break space in
`Jun 2026` stops date regexes matching, so an employer's tenure reads as absent.
Worth running on every generated resume regardless of what produced it.

Deliberate boundaries:

- **Homoglyph folding is opt-in.** Substituting Cyrillic → Latin corrupts
  resumes legitimately containing non-Latin text — a name, a publication title,
  a language skill. Default off.
- **Newlines are never collapsed.** The tidy pass touches spaces and tabs only.
  Collapsing newlines here would reintroduce the exact bug above.
- **It runs on the output, never the source.** The grounding validator compares
  against the source; editing it would move the baseline the fabrication check
  depends on.

### What Layer A is not

Layer A handles characters — verifiably present or absent, every change counted.

It does **not** do Layer B: statistical or stylometric rewriting to defeat
classifiers. That needs a model, cannot be verified locally, and in a resume
pipeline actively fights the grounding guarantee — rewriting for
token-distribution reasons is precisely the pressure that drifts a factual claim
into an untrue one.

If you want Layer B, run it as an explicit user-approved step and **re-run the
grounding validator afterwards**. And do not describe the result as
"proves human-written": no local tool can establish that, and in a hiring context
the claim is one an employer may later test.

---

## Page suggestions

`suggestPageCount()` returns a recommendation, a reason, and `enforced: false`.

- Recommends from years of experience: <3 → 1 page, 3–10 → 1–2, 10+ → 2–3.
- **Never recommends growing** a resume. There is nothing honest to pad with.
- Academic and EU CVs keep their length — those conventions are genuinely
  different, and compressing them would be wrong.
- `allocateBullets()` distributes the budget proportionally with a floor of 2 per
  role, so no employer is left as a bare heading. A company name with nothing
  under it reads as a gap the candidate is hiding.

---

## ATS audit

`auditAts()` returns findings by severity rather than a score.

Ordered roughly by how much damage each does:

| Severity | Examples |
|---|---|
| critical | multi-column layout, tables, text boxes, contact details in the page header, missing skills section, invisible characters |
| warning | images carrying information, unrecognised headings, no phone, few dates |
| suggestion | non-standard heading wording, bullets over 45 words |

Layout problems are properties of the **file**, not the text, so pass
`fileHints` from your renderer. Without them the audit reports
`file_not_inspected` rather than implying a clean bill it cannot support.

`repairAts()` fixes only what cannot change meaning — whitespace and quote
normalisation. Everything else stays a suggestion, because "the engine silently
rewrote it" is only defensible for character-level changes.

---

## Testing philosophy

All 34 tests assert **invariants**, never constants. Fixtures cover a short
bulleted resume, a paragraph-style resume with no bullet glyphs, and one with
unusual headings (`CAREER OBJECTIVE`, `AREAS OF EXPERTISE`, `CREDENTIALS`).

A test asserting `bullets > 60` would be testing one person's resume. Tests here
assert things like: every source employer survives, no role is emptied,
allocation never exceeds the source, newlines are preserved, the audit never
implies completeness it cannot verify.

The paragraph-style fixture exists because that case is invisible until someone
uploads such a resume — and it fails identically to the original bug.
