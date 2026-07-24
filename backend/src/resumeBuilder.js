// Tailored resume generation.
//
// Builds an ATS-friendly resume PDF for ONE specific job, using the profile
// data the user already stored in MongoDB plus the requirements detected in the
// job posting. The skills the job asks for are promoted to the top so an
// applicant tracking system sees them first.
//
// Uses pdfkit, which is already a backend dependency (the admin PDF reports use
// it). No new packages, no API key, no network call.

import PDFDocument from 'pdfkit';
import { scoreJob, extractSkills } from './ats.js';

const PAGE_MARGIN = 50;
const VIOLET = '#6d28d9';
const SLATE = '#334155';
const MUTED = '#64748b';

function splitList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);

  return String(value || '')
    .split(/[,;|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// User's skills, ordered so the ones this job asks for come first.
function prioritiseSkills(profileSkills, jobSkills) {
  const wanted = new Set(jobSkills.map((skill) => skill.toLowerCase()));

  const matched = [];
  const rest = [];

  for (const skill of profileSkills) {
    const isWanted =
      wanted.has(skill.toLowerCase()) ||
      extractSkills(skill).some((canonical) => wanted.has(canonical.toLowerCase()));

    (isWanted ? matched : rest).push(skill);
  }

  return { matched, rest, ordered: [...matched, ...rest] };
}

// A short summary line aimed at this specific role.
function buildSummary(profile, job, matchedSkills) {
  const years = Number(profile.experienceYears || 0);
  const title = profile.professionalTitle || 'Software professional';
  const target = job.title || 'the role';
  const company = job.company && job.company !== 'Company not listed' ? ` at ${job.company}` : '';

  const experiencePart = years
    ? `${title} with ${years}+ year${years === 1 ? '' : 's'} of experience`
    : title;

  const skillsPart = matchedSkills.length
    ? ` Strengths relevant to this role include ${matchedSkills.slice(0, 8).join(', ')}.`
    : '';

  const existing = String(profile.about || '').trim();

  return `${experiencePart}, applying for ${target}${company}.${skillsPart}${
    existing ? ` ${existing}` : ''
  }`;
}

function heading(doc, text) {
  doc.moveDown(0.8);
  doc.fillColor(VIOLET).fontSize(11).font('Helvetica-Bold').text(text.toUpperCase());
  const y = doc.y + 2;
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(doc.page.width - PAGE_MARGIN, y)
    .strokeColor('#e2e8f0')
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor(SLATE).font('Helvetica').fontSize(10);
}

/**
 * Generate the tailored resume PDF.
 *
 * @returns {Promise<{buffer:Buffer, score:number, matched:string[], missing:string[]}>}
 */
function buildTailoredResume(profile = {}, job = {}) {
  const ats = scoreJob(profile, job);

  const jobSkills = [
    ...new Set([
      ...ats.matched,
      ...ats.missing,
      ...splitList(job.skills)
    ])
  ];

  const profileSkills = splitList(profile.skills);
  const { matched, ordered } = prioritiseSkills(profileSkills, jobSkills);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('error', reject);
      doc.on('end', () =>
        resolve({
          buffer: Buffer.concat(chunks),
          score: ats.score,
          matched: ats.matched,
          missing: ats.missing
        })
      );

      // ---- Header ----
      doc
        .fillColor('#0f172a')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(profile.name || 'Your Name');

      const targetTitle = job.title || profile.professionalTitle || '';
      if (targetTitle) {
        doc
          .fillColor(VIOLET)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(targetTitle);
      }

      const contact = [profile.email, profile.phone, profile.location]
        .filter(Boolean)
        .join('  ·  ');

      if (contact) {
        doc.moveDown(0.2);
        doc.fillColor(MUTED).fontSize(9.5).font('Helvetica').text(contact);
      }

      // ---- Summary ----
      heading(doc, 'Professional Summary');
      doc.text(buildSummary(profile, job, matched), { align: 'justify' });

      // ---- Skills (job-relevant first) ----
      if (ordered.length) {
        heading(doc, 'Skills');

        if (matched.length) {
          doc.font('Helvetica-Bold').text('Relevant to this role: ', { continued: true });
          doc.font('Helvetica').text(matched.join(', '));
        }

        const others = ordered.filter((skill) => !matched.includes(skill));
        if (others.length) {
          doc.moveDown(0.2);
          doc.font('Helvetica-Bold').text('Additional: ', { continued: true });
          doc.font('Helvetica').text(others.join(', '));
        }
      }

      // ---- Experience ----
      heading(doc, 'Experience');
      const years = Number(profile.experienceYears || 0);
      doc.text(
        years
          ? `${years}+ years of professional experience${
              profile.professionalTitle ? ` as a ${profile.professionalTitle}` : ''
            }.`
          : 'Professional experience as described in the profile.'
      );

      if (profile.about) {
        doc.moveDown(0.3);
        doc.text(String(profile.about), { align: 'justify' });
      }

      // ---- Additional details ----
      const extras = [
        profile.workAuthorization ? `Work authorization: ${profile.workAuthorization}` : '',
        profile.preferredWorkMode ? `Preferred work mode: ${profile.preferredWorkMode}` : '',
        job.location ? `Open to: ${job.location}` : ''
      ].filter(Boolean);

      if (extras.length) {
        heading(doc, 'Additional Details');
        extras.forEach((line) => doc.text(`• ${line}`));
      }

      // ---- Footer note (for the applicant, not the employer) ----
      doc.moveDown(1.2);
      doc
        .fillColor('#94a3b8')
        .fontSize(8)
        .text(
          `Tailored by OPUS for ${job.title || 'this role'}${
            job.company ? ` at ${job.company}` : ''
          } · ATS match ${ats.score}%${
            ats.missing.length ? ` · Consider adding: ${ats.missing.slice(0, 5).join(', ')}` : ''
          }`,
          { align: 'center' }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Safe file name, e.g. "Java_Developer_Acme_91pct.pdf"
function tailoredFileName(job = {}, score = 0) {
  const clean = (value) =>
    String(value || '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);

  const parts = [clean(job.title) || 'Resume', clean(job.company), `${score}pct`].filter(Boolean);
  return `${parts.join('_')}.pdf`;
}

export {
  buildTailoredResume,
  tailoredFileName,
  prioritiseSkills
};
