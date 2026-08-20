// Format-preserving resume rewrite: keep the uploaded .docx layout (fonts,
// headings, spacing, structure) EXACTLY and only replace the wording with a
// Gemini-tailored version for the target job.
import fs from 'fs';
import PizZip from 'pizzip';
import { llmJson } from './llm.js';
import { cleanText } from './resume-engine/sanitize/ai-marks.mjs';

function escapeXml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Returns { buffer } — a .docx identical in layout to the original, reworded.
async function rewriteDocxPreserveFormat(filePath, profile = {}, job = {}) {
  const zip = new PizZip(fs.readFileSync(filePath));
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) throw new Error('Not a valid .docx (missing document.xml).');
  const xml = xmlFile.asText();

  const paraRegex = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const paragraphs = xml.match(paraRegex) || [];

  const textOf = (p) => {
    const runs = p.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [];
    return runs.map((t) => t.replace(/<[^>]+>/g, '')).join('');
  };

  const items = paragraphs.map((p, i) => ({ i, text: textOf(p) }));
  const nonEmpty = items.filter((it) => it.text.trim().length > 0);

  const prompt =
`You are an expert resume writer. Below is a resume, given as an ordered list of its paragraphs. Rewrite the WORDING of each paragraph so the resume is tailored and ATS-optimized for the TARGET JOB, WITHOUT changing the document's structure.

STRICT RULES:
- Return a JSON object: {"paragraphs": string[]} whose array has EXACTLY the same length and order as the input.
- Keep section headings (e.g. "EXPERIENCE", "SKILLS", "EDUCATION"), company names, job titles, dates, school names, and the person's name/contact info UNCHANGED.
- Only improve the wording of summaries, bullet points, and skill lines to match the job. Keep every fact truthful — do NOT invent employers, dates, degrees, or metrics.
- Do NOT merge, split, add, or remove paragraphs. One input paragraph -> one output string.
- If a paragraph should stay exactly as-is, return it unchanged.

TARGET JOB:
Title: ${job.title || ''}
Company: ${job.company || ''}
Location: ${job.location || ''}
Description: ${String(job.description || '').slice(0, 2500)}

INPUT PARAGRAPHS (JSON array, in order):
${JSON.stringify(nonEmpty.map((n) => n.text))}`;

  const { data: result } = await llmJson(prompt);
  const rewritten = Array.isArray(result && result.paragraphs) ? result.paragraphs : [];

  if (!rewritten.length) {
    throw new Error('The rewrite came back empty; keeping the original resume.');
  }

  // Map rewritten text back to the ORIGINAL paragraph indexes.
  // Strip invisible characters the model may have emitted before they reach
  // the document. A zero-width space inside "JavaScript" makes an applicant
  // tracking system read two unknown tokens instead of one known skill, and
  // the candidate silently loses the keyword match. A narrow no-break space in
  // "Jun 2026" stops date matching, so their tenure reads as absent.
  const byIndex = new Map();
  let sanitised = 0;

  nonEmpty.forEach((n, idx) => {
    const raw = rewritten[idx];
    if (raw == null || !String(raw).trim()) return;

    const { text, report } = cleanText(String(raw));
    // The report lists what was found and what was done; a non-empty
    // actions array means this paragraph was actually altered.
    if (report?.actions?.length) sanitised += 1;

    byIndex.set(n.i, text);
  });

  if (sanitised) {
    console.log(`docxRewrite: cleaned invisible characters from ${sanitised} paragraph(s)`);
  }

  // Walk paragraphs in order; for each rewritten one, put the new text into the
  // FIRST <w:t> run (keeping its formatting) and blank the remaining runs.
  let k = -1;
  const newXml = xml.replace(paraRegex, (p) => {
    k += 1;
    if (!byIndex.has(k)) return p;
    const newText = byIndex.get(k);
    let first = true;
    return p.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g, (m, open, _mid, close) => {
      if (first) {
        first = false;
        // Ensure whitespace is preserved.
        const openTag = /xml:space=/.test(open) ? open : open.replace('<w:t', '<w:t xml:space="preserve"');
        return `${openTag}${escapeXml(newText)}${close}`;
      }
      return `${open}${close}`;
    });
  });

  zip.file('word/document.xml', newXml);
  return { buffer: zip.generate({ type: 'nodebuffer' }) };
}

export { rewriteDocxPreserveFormat };
