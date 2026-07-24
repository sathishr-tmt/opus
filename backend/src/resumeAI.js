// Resume AI: turn an uploaded resume file into a Gemini "part" (PDF inline or
// extracted DOCX text), then analyze it (auto-fill) or rewrite it for a job.
import fs from 'fs';
import mammoth from 'mammoth';
import { geminiJson } from './gemini.js';

// Build a Gemini content part from a resume file on disk.
async function resumePart(filePath, mimeType = '') {
  if (!filePath || !fs.existsSync(filePath)) return null;
  if (mimeType === 'application/pdf') {
    const data = fs.readFileSync(filePath).toString('base64');
    return { inlineData: { mimeType: 'application/pdf', data } };
  }
  // .docx / .doc -> extract raw text with mammoth
  try {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return { text: `RESUME TEXT:\n${(value || '').slice(0, 12000)}` };
  } catch {
    return null;
  }
}

// Parse a resume into structured profile fields.
async function analyzeResume(filePath, mimeType) {
  const part = await resumePart(filePath, mimeType);
  const prompt =
`You are an expert resume parser. Read the attached resume and return ONLY JSON with EXACTLY these keys:
{"professionalTitle": string, "experienceYears": number, "skills": string[] (10-20 core technical skills, most important first), "professionalSummary": string (2-3 sentence professional summary), "location": string, "phone": string}
Rules: infer experienceYears as a whole number from the work history. Only list skills the resume actually shows. If a field is unknown use "" (or 0, or []). Do not invent employers or degrees.`;
  return geminiJson(prompt, part ? [part] : []);
}

// Rewrite a resume tailored to one job. Returns structured resume JSON.
async function rewriteResume(profile = {}, job = {}, filePath, mimeType) {
  const part = await resumePart(filePath, mimeType);
  const prompt =
`You are an expert resume writer. Rewrite the candidate's resume so it is tailored and ATS-optimized for the TARGET JOB below. Stay truthful to the candidate's real experience from the attached resume and profile — do NOT fabricate employers, dates, degrees, or metrics that are not present. Naturally emphasize the job's key skills where the candidate genuinely has them.

Return ONLY JSON with this exact shape:
{
 "name": string,
 "title": string,
 "contact": string,
 "summary": string,
 "skills": string[],
 "experience": [ {"role": string, "company": string, "dates": string, "bullets": string[] } ],
 "education": [ {"credential": string, "institution": string, "year": string } ]
}
Guidance: summary = 3-4 sentences tailored to the job. skills = 12-18, prioritising overlap with the job. Each experience entry = 3-5 achievement bullets starting with strong action verbs, keeping any real metrics.

TARGET JOB:
Title: ${job.title || ''}
Company: ${job.company || ''}
Location: ${job.location || ''}
Description: ${String(job.description || '').slice(0, 3000)}

CANDIDATE PROFILE:
Name: ${profile.name || ''}
Email: ${profile.email || ''}
Current title: ${profile.professionalTitle || ''}
Years of experience: ${profile.experienceYears || ''}
Location: ${profile.location || ''}
Phone: ${profile.phone || ''}
Skills: ${profile.skills || ''}
About: ${profile.about || ''}`;
  return geminiJson(prompt, part ? [part] : []);
}

export { analyzeResume, rewriteResume };
