/**
 * Format mirroring — lay the tailored content out the way the SOURCE resume
 * was laid out.
 *
 * This is the module that makes the engine faithful rather than opinionated.
 * Without it, `profileSource()` reads the user's structure and nothing acts on
 * it: the renderer emits its own hardcoded headings in its own fixed order, so
 * a resume that said "WORK HISTORY" and "AREAS OF EXPERTISE" comes back saying
 * "Professional Experience" and "Core Competencies & Technologies".
 *
 * The output here is a NEUTRAL BLOCK LIST, not a DOCX. Keeping layout planning
 * separate from drawing means the same plan renders to DOCX, PDF, Markdown or
 * plain text and all four agree on structure — and it makes the ordering
 * testable without opening a document.
 *
 * Two rules govern everything below:
 *
 *   1. Section ORDER and LABELS come from the source. Never from this file.
 *   2. A section the source does not have is never invented. A section the
 *      source has and the tailored content cannot fill is dropped silently
 *      rather than emitted empty — an empty heading reads as an omission.
 */

/** Block kinds a renderer must handle. Deliberately few. */
export const BLOCK = {
  NAME: 'name',
  CONTACT: 'contact',
  HEADING: 'heading',
  PARAGRAPH: 'paragraph',
  BULLET: 'bullet',
  ROLE_HEADER: 'role_header',
  SUBHEADING: 'subheading',
  INLINE_LIST: 'inline_list',
};

/**
 * Build a layout plan.
 *
 * @param {object} doc            tailored content (headline, summary, competencies, roles, ...)
 * @param {object} sourceProfile  from profileSource() — supplies order, labels, style
 * @param {object} [opts]
 * @returns {{blocks: Array, style: object, mirrored: object}}
 */
export function planLayout(doc, sourceProfile, opts = {}) {
  const style = sourceProfile?.style ?? {};
  const sections = sourceProfile?.sections ?? [];
  const blocks = [];

  // NOTE: `null` is meaningful here and must NOT be defaulted away. It means the
  // source is written in paragraph form with no bullet glyphs, and injecting
  // bullets would change the document's voice — the opposite of mirroring.
  // `style.bulletGlyph || '•'` silently turned every prose resume into a
  // bulleted one.
  const glyph = style.bulletGlyph ?? null;
  const headingCase = style.headingCase || 'upper';

  const label = (text) =>
    headingCase === 'upper' ? String(text).toUpperCase() : String(text);

  // Threaded into every section builder so formatDates() can mirror the
  // source's own range punctuation. Previously buildSection() was handed only
  // {glyph, label}, so formatDates() always fell through to its '–' default and
  // a resume written "2021 to 2024" came back "2021 – 2024". The date-separator
  // test passed anyway because its fixture happened to use the default.
  const ctx = {
    glyph,
    label,
    dateSeparator: style.dateSeparator ?? '–',
    presentWord: style.presentWord ?? 'Present',
  };

  /* ── header: name and contact always lead ────────────────────────── */

  const c = doc.candidate ?? {};
  if (c.full_name) blocks.push({ type: BLOCK.NAME, text: c.full_name });
  if (doc.headline) blocks.push({ type: BLOCK.PARAGRAPH, text: doc.headline, emphasis: true });

  const contact = [c.location, c.phone, c.email, ...(c.links ?? [])].filter(Boolean);
  if (contact.length) {
    blocks.push({
      type: BLOCK.CONTACT,
      parts: contact,
      // Mirror how the source arranged these. A resume that stacked them
      // stacked them for a reason (often column width).
      layout: style.contactLayout === 'stacked' ? 'stacked' : 'single-line',
    });
  }

  /* ── body: the source's sections, in the source's order ──────────── */

  // Which canonical kinds did we actually emit? Used to catch content that has
  // nowhere to go under the source's own structure.
  const emitted = new Set();

  for (const section of sections) {
    const built = buildSection(section, doc, ctx);
    if (!built.length) continue;      // nothing to fill it — drop, don't emit empty
    blocks.push(...built);
    if (section.kind) emitted.add(section.kind);
  }

  /* ── fallback: content the source had no section for ─────────────── */

  // If the source's headings did not cover something the tailored document
  // contains, it still has to appear — dropping a candidate's education because
  // their heading was unrecognised would be worse than appending a section.
  const orphans = [];
  const has = (k) => emitted.has(k);

  if (!has('experience') && doc.roles?.length) orphans.push(['experience', 'EXPERIENCE']);
  if (!has('skills') && doc.competencies?.length) orphans.push(['skills', 'SKILLS']);
  if (!has('education') && doc.education?.length) orphans.push(['education', 'EDUCATION']);
  if (!has('certifications') && doc.certifications?.length) orphans.push(['certifications', 'CERTIFICATIONS']);
  if (!has('projects') && doc.projects?.length) orphans.push(['projects', 'PROJECTS']);

  for (const [kind, fallbackLabel] of orphans) {
    const built = buildSection({ kind, heading: fallbackLabel }, doc, ctx);
    if (built.length) {
      blocks.push(...built);
      emitted.add(kind);
    }
  }

  return {
    blocks,
    style: {
      // null = source used no bullets; a renderer must emit prose, not a default glyph
      bulletGlyph: glyph,
      usesBullets: glyph !== null,
      headingCase,
      dateFormat: style.dateFormat ?? null,
      dateSeparator: style.dateSeparator ?? '–',
      presentWord: style.presentWord ?? 'Present',
      usesRoleBlurbs: style.usesRoleBlurbs ?? false,
    },
    mirrored: {
      /** Headings actually used, so a caller can prove the source was followed. */
      headings: blocks.filter((b) => b.type === BLOCK.HEADING).map((b) => b.text),
      sourceHeadings: sections.map((s) => s.heading),
      appended: orphans.map(([, l]) => l),
    },
  };
}

/* ── per-section builders ────────────────────────────────────────────── */

function buildSection(section, doc, ctx) {
  const { kind, heading } = section;
  const out = [];
  const head = () => out.push({ type: BLOCK.HEADING, text: ctx.label(heading), kind });

  switch (kind) {
    case 'summary': {
      if (!doc.summary) return [];
      head();
      // A summary written as bullets in the source stays bullets.
      if (Array.isArray(doc.summary)) {
        for (const b of doc.summary) out.push(bulletBlock(textOf(b), ctx));
      } else {
        out.push({ type: BLOCK.PARAGRAPH, text: String(doc.summary) });
      }
      return out;
    }

    case 'skills': {
      const groups = doc.competencies ?? [];
      if (!groups.length) return [];
      head();
      for (const g of groups) {
        // Inline lists ("ERP: SAP, MM, MRP") parse far better than one skill
        // per line, and match how most resumes write this block.
        out.push({
          type: BLOCK.INLINE_LIST,
          label: g.category ?? g.label ?? null,
          items: g.items ?? g.skills ?? [],
        });
      }
      return out;
    }

    case 'experience': {
      const roles = doc.roles ?? [];
      if (!roles.length) return [];
      head();
      for (const r of roles) {
        out.push({
          type: BLOCK.ROLE_HEADER,
          company: r.employer ? `${r.company} (via ${r.employer})` : r.company,
          role: r.title ?? r.role,
          location: r.location ?? '',
          dates: formatDates(r, ctx),
        });
        if (ctx && r.blurb) out.push({ type: BLOCK.PARAGRAPH, text: r.blurb, muted: true });

        // Bullets attached DIRECTLY to the role — these were being dropped by
        // the previous renderer, which only walked r.projects. A resume that
        // does not use project sub-headings lost every bullet it had.
        for (const b of r.bullets ?? []) out.push(bulletBlock(textOf(b), ctx));

        for (const p of r.projects ?? []) {
          if (p.name) out.push({ type: BLOCK.SUBHEADING, text: p.name });
          if (p.blurb) out.push({ type: BLOCK.PARAGRAPH, text: p.blurb, muted: true });
          for (const b of p.bullets ?? []) out.push(bulletBlock(textOf(b), ctx));
        }
      }
      return out;
    }

    case 'projects': {
      const projects = doc.projects ?? [];
      if (!projects.length) return [];
      head();
      for (const p of projects) {
        out.push({ type: BLOCK.SUBHEADING, text: p.name, meta: p.role ?? '' });
        if (p.blurb) out.push({ type: BLOCK.PARAGRAPH, text: p.blurb, muted: true });
        for (const b of p.bullets ?? []) out.push(bulletBlock(textOf(b), ctx));
      }
      return out;
    }

    case 'education': {
      const items = doc.education ?? [];
      if (!items.length) return [];
      head();
      for (const e of items) {
        out.push({
          type: BLOCK.ROLE_HEADER,
          company: e.institution ?? e.school ?? '',
          role: [e.degree, e.field].filter(Boolean).join(', '),
          location: e.location ?? '',
          dates: e.dates ?? e.year ?? '',
        });
        if (e.detail) out.push({ type: BLOCK.PARAGRAPH, text: e.detail, muted: true });
      }
      return out;
    }

    case 'certifications': {
      const items = doc.certifications ?? [];
      if (!items.length) return [];
      head();
      for (const c of items) out.push(bulletBlock(textOf(c), ctx));
      return out;
    }

    case 'awards':
    case 'publications':
    case 'volunteer':
    case 'languages':
    case 'interests': {
      const items = doc[kind] ?? [];
      if (!items.length) return [];
      head();
      for (const i of items) out.push(bulletBlock(textOf(i), ctx));
      return out;
    }

    default: {
      // Unrecognised heading. If the tailored document carries content under a
      // matching custom key, render it; otherwise skip. Never guess.
      const custom = doc.custom?.[heading] ?? doc.custom?.[String(heading).toLowerCase()];
      if (!custom) return [];
      head();
      if (Array.isArray(custom)) for (const i of custom) out.push(bulletBlock(textOf(i), ctx));
      else out.push({ type: BLOCK.PARAGRAPH, text: String(custom) });
      return out;
    }
  }
}

/* ── helpers ─────────────────────────────────────────────────────────── */

const textOf = (b) => (typeof b === 'string' ? b : b?.text ?? '');

/**
 * A paragraph-style source has no bullet glyph. Emitting bullets into it would
 * change the document's voice, so those roles render as prose instead.
 */
function bulletBlock(text, ctx) {
  if (!ctx.glyph) return { type: BLOCK.PARAGRAPH, text };
  return { type: BLOCK.BULLET, text, glyph: ctx.glyph };
}

/** Rebuild a date range using the source's own separator and "Present" word. */
function formatDates(r, ctx) {
  if (r.dates) return r.dates;
  const start = r.start ?? '';
  const end = r.current ? (ctx.presentWord ?? 'Present') : (r.end ?? '');
  if (!start && !end) return '';
  const sep = ctx.dateSeparator ?? '–';
  return [start, end].filter(Boolean).join(` ${sep} `);
}

export default { planLayout, BLOCK };
