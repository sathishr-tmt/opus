/**
 * ATS-safe DOCX emission from a layout plan.
 *
 * Everything here is chosen for one reason: survive an applicant tracking
 * system's parser intact. The rules below are not stylistic preferences, they
 * are the list of things that actually cause a parser to drop or scramble text.
 *
 * WHAT THIS DELIBERATELY DOES NOT USE, and why:
 *
 *   tables            — cell contents are commonly read left-to-right across
 *                       the whole row, interleaving unrelated text, or skipped
 *   text boxes        — frequently not extracted at all
 *   multiple columns  — same interleaving problem as tables
 *   headers / footers — often outside the extracted body, which is why contact
 *                       details in a header is the single most damaging mistake
 *   images / icons    — invisible to a parser; a skill shown only as a bar is
 *                       a skill the ATS does not know you have
 *   text-frame layout — same class of problem as text boxes
 *
 * So: one column, body text only, real list formatting, standard fonts.
 * A resume that looks slightly plainer and parses correctly beats a designed
 * one that arrives as fragments.
 */

import { BLOCK } from './mirror.mjs';

/** Half-points, because that is DOCX's unit for font size. 22 = 11pt. */
const SIZE = { name: 32, heading: 24, body: 21, small: 19 };

/**
 * Fonts every ATS and every reviewer's machine can render. A missing font gets
 * substituted, and substitution is where ligatures and spacing go wrong.
 */
const FONT = 'Calibri';
const FONT_FALLBACK = 'Arial';

/**
 * Build the `docx` library document definition from a layout plan.
 *
 * Takes the docx module as an argument rather than importing it, so this
 * package keeps zero dependencies and the host app supplies its own version.
 *
 * @param {object} plan   from planLayout()
 * @param {object} docx   the `docx` npm module
 * @param {object} [opts] {font, margins}
 */
export function buildAtsDocx(plan, docx, opts = {}) {
  const {
    Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle,
    HeadingLevel, LevelFormat, convertInchesToTwip,
  } = docx;

  const font = opts.font ?? FONT;
  const children = [];

  const para = (runs, o = {}) =>
    new Paragraph({
      children: Array.isArray(runs) ? runs : [runs],
      spacing: { before: o.before ?? 0, after: o.after ?? 40, line: 252 },
      alignment: o.align,
      border: o.border,
      // Keep a heading with the content beneath it, so a section title never
      // strands alone at a page break.
      keepNext: o.keepNext ?? false,
      indent: o.indent,
    });

  const run = (text, o = {}) =>
    new TextRun({
      text: String(text ?? ''),
      size: o.size ?? SIZE.body,
      bold: o.bold ?? false,
      italics: o.italics ?? false,
      color: o.color,
      font,
    });

  for (const b of plan.blocks) {
    switch (b.type) {
      case BLOCK.NAME:
        children.push(
          para(run(b.text, { size: SIZE.name, bold: true }), {
            align: AlignmentType.CENTER,
            after: 20,
          })
        );
        break;

      case BLOCK.CONTACT:
        // A single line with pipe separators is the most reliably parsed form,
        // but the source's own choice wins — some resumes stack these because
        // the values are long, and forcing one line would wrap badly.
        if (b.layout === 'stacked') {
          for (const p of b.parts) {
            children.push(para(run(p, { size: SIZE.small }), { align: AlignmentType.CENTER, after: 10 }));
          }
        } else {
          children.push(
            para(run(b.parts.join('  |  '), { size: SIZE.small }), {
              align: AlignmentType.CENTER,
              after: 140,
            })
          );
        }
        break;

      case BLOCK.HEADING:
        children.push(
          para(run(b.text, { size: SIZE.heading, bold: true }), {
            before: 200,
            after: 60,
            keepNext: true, // never orphan a heading at a page break
            // A bottom rule is drawn as a paragraph border, NOT a one-cell
            // table. Tables are the single biggest ATS parsing hazard, and a
            // table used purely as a horizontal line is an entirely avoidable
            // one.
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: '333333', space: 2 },
            },
          })
        );
        break;

      case BLOCK.SUBHEADING:
        children.push(
          para(
            [
              run(b.text, { bold: true }),
              ...(b.meta ? [run(`  ${b.meta}`, { italics: true, size: SIZE.small })] : []),
            ],
            { before: 100, after: 30, keepNext: true }
          )
        );
        break;

      case BLOCK.ROLE_HEADER: {
        // Company and role on one line, dates on the next.
        //
        // The obvious layout puts dates flush right on the same line, which
        // needs either a table or a right-aligned tab stop. Tables are out (see
        // the header comment). Tab stops survive, but some parsers read the
        // tabbed text as a separate field and detach the date from the role.
        // A second line is plainer and unambiguous.
        const line1 = [run(b.company, { bold: true })];
        if (b.role) line1.push(run(` — ${b.role}`));
        if (b.location) line1.push(run(`, ${b.location}`, { size: SIZE.small }));
        children.push(para(line1, { before: 120, after: 10, keepNext: true }));

        if (b.dates) {
          children.push(
            para(run(b.dates, { italics: true, size: SIZE.small }), {
              after: 40,
              keepNext: true,
            })
          );
        }
        break;
      }

      case BLOCK.BULLET:
        children.push(
          new Paragraph({
            children: [run(b.text)],
            // Real DOCX list numbering, not a literal "•" typed into the text.
            // Typed glyphs become part of the extracted string and show up
            // inside the bullet's own content; proper numbering is structural
            // and parsers strip it correctly.
            numbering: { reference: 'ats-bullets', level: 0 },
            spacing: { after: 30, line: 252 },
          })
        );
        break;

      case BLOCK.INLINE_LIST: {
        // "ERP: SAP S/4HANA, SAP MM, MRP" — one line per group. Keyword
        // matchers read this far better than one skill per line, and it is how
        // most resumes already write a skills block.
        const runs = [];
        if (b.label) runs.push(run(`${b.label}: `, { bold: true }));
        runs.push(run((b.items ?? []).join(', ')));
        children.push(para(runs, { after: 40 }));
        break;
      }

      case BLOCK.PARAGRAPH:
        children.push(
          para(
            run(b.text, {
              bold: b.emphasis ?? false,
              italics: b.muted ?? false,
              color: b.muted ? '444444' : undefined,
              size: b.muted ? SIZE.small : SIZE.body,
            }),
            { after: b.emphasis ? 80 : 50, align: b.emphasis ? AlignmentType.CENTER : undefined }
          )
        );
        break;

      default:
        break;
    }
  }

  return new Document({
    creator: '',        // no tool fingerprint in document metadata
    description: '',
    title: '',
    numbering: {
      config: [
        {
          reference: 'ats-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(0.25),
                    hanging: convertInchesToTwip(0.15),
                  },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            // docx defaults to A4. A US resume laid out on A4 reflows when the
            // reviewer prints it, and the last lines of a two-page document can
            // spill onto a third — stated explicitly rather than inherited.
            size: {
              width: convertInchesToTwip(opts.pageWidth ?? 8.5),
              height: convertInchesToTwip(opts.pageHeight ?? 11),
            },
            margin: {
              top: convertInchesToTwip(opts.margins ?? 0.6),
              right: convertInchesToTwip(opts.margins ?? 0.6),
              bottom: convertInchesToTwip(opts.margins ?? 0.6),
              left: convertInchesToTwip(opts.margins ?? 0.6),
            },
          },
          // Explicitly one column. Stating it prevents a template default from
          // reintroducing the worst parsing failure mode.
          column: { count: 1 },
        },
        // No headers or footers by design — anything placed there is routinely
        // outside the extracted body.
        children,
      },
    ],
  });
}

/**
 * File-level facts for auditAts(). Because this renderer emits no tables, text
 * boxes, images or headers, these are constants — which is the point: the
 * audit can verify the claim rather than take it on trust.
 */
export function atsFileHints() {
  return {
    columns: 1,
    hasTables: false,
    hasTextBoxes: false,
    hasImages: false,
    contactInHeader: false,
    fileType: 'docx',
  };
}

export default { buildAtsDocx, atsFileHints, SIZE, FONT, FONT_FALLBACK };
