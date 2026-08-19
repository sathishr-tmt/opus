// Import a job posting from a public URL.
//
// Fetches the page, reduces it to readable text, and asks the configured AI
// provider to pull out the fields a posting needs. The result FILLS THE FORM —
// a recruiter always reviews it before publishing, because page layouts vary
// and the extraction will sometimes be wrong.
//
// Known limits, stated plainly rather than discovered later:
//   - Sites that render jobs with JavaScript (LinkedIn, Workday, Greenhouse)
//     return an empty shell to a server-side fetch. Nothing can be extracted.
//   - Sites that block non-browser requests return 403.
// Both cases produce a clear message rather than a half-filled form.
import { llmJson, anyLlmConfigured } from './llm.js';

const FETCH_TIMEOUT_MS = 15000;
const MAX_BYTES = 2_000_000;

/**
 * Reject anything that is not a public http(s) address.
 *
 * Without this, a recruiter could point the server at its own network —
 * localhost, a private subnet, or a cloud metadata endpoint — and read back
 * whatever it returns. That is server-side request forgery, and it is the
 * reason this function exists.
 */
function assertPublicUrl(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('That does not look like a valid web address.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https addresses can be imported.');
  }

  const host = url.hostname.toLowerCase();

  const blocked =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '::1' ||
    host.startsWith('[');

  if (blocked) {
    throw new Error('That address is not publicly reachable.');
  }

  return url.toString();
}

// Strip a page down to the text a human would read.
function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchPageText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Some sites return a stripped page to unknown clients.
        'User-Agent':
          'Mozilla/5.0 (compatible; OPUS-JobImport/1.0; +https://opus.example/bot)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      throw new Error(
        response.status === 403 || response.status === 401
          ? 'That site blocked the request. Paste the job details manually.'
          : `The page could not be read (HTTP ${response.status}).`
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('html') && !contentType.includes('text')) {
      throw new Error('That link is not a web page.');
    }

    const html = (await response.text()).slice(0, MAX_BYTES);
    return htmlToText(html);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('That site took too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @returns {Promise<{fields: object, warning?: string}>}
 */
async function importJobFromUrl(rawUrl) {
  const url = assertPublicUrl(rawUrl);

  if (!anyLlmConfigured()) {
    throw new Error(
      'AI is not configured on this server, so a link cannot be read automatically.'
    );
  }

  const text = await fetchPageText(url);

  // A JavaScript-rendered page returns almost nothing useful.
  if (text.length < 400) {
    throw new Error(
      'That page did not return readable job text. Sites like LinkedIn and ' +
        'Workday load their content with JavaScript, which cannot be read this ' +
        'way. Paste the details in manually.'
    );
  }

  const prompt =
`You are reading the text of a job posting web page. Extract the posting details.

Return ONLY a JSON object with exactly these keys:
{
 "title": string,
 "company": string,
 "location": string,
 "workMode": "Onsite" | "Remote" | "Hybrid" | "",
 "employmentType": "Full-time" | "Part-time" | "Contract" | "Internship" | "",
 "department": string,
 "experienceRequirement": string,
 "minSalary": number,
 "maxSalary": number,
 "description": string
}

Rules:
- Use "" for any text field the page does not state, and 0 for a salary it does not state. Do NOT guess.
- "description" should be the responsibilities and requirements, tidied into readable paragraphs. Leave out navigation, cookie notices, and unrelated page furniture.
- Salaries must be plain yearly numbers with no symbols or commas. If the page gives an hourly rate, leave both salaries as 0.
- If the page is clearly not a job posting, return every field empty.

PAGE TEXT:
${text.slice(0, 12000)}`;

  const { data } = await llmJson(prompt, [], text.slice(0, 12000));

  const asNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : '';
  };

  const fields = {
    title: String(data?.title || '').trim(),
    company: String(data?.company || '').trim(),
    location: String(data?.location || '').trim(),
    workMode: ['Onsite', 'Remote', 'Hybrid'].includes(data?.workMode)
      ? data.workMode
      : '',
    employmentType: ['Full-time', 'Part-time', 'Contract', 'Internship'].includes(
      data?.employmentType
    )
      ? data.employmentType
      : '',
    department: String(data?.department || '').trim(),
    experienceRequirement: String(data?.experienceRequirement || '').trim(),
    minSalary: asNumber(data?.minSalary),
    maxSalary: asNumber(data?.maxSalary),
    description: String(data?.description || '').trim()
  };

  if (!fields.title) {
    throw new Error(
      'No job title could be found on that page. It may not be a job posting.'
    );
  }

  return {
    fields,
    warning: fields.description
      ? undefined
      : 'The description came back empty — add it before publishing.'
  };
}

export { importJobFromUrl };
