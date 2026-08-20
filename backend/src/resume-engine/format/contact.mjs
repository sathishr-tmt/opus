/**
 * Contact extraction from the master resume.
 *
 * The resume's own contact details are authoritative. The account the candidate
 * signed up with is a fallback and nothing more.
 *
 * This matters more than it looks. A tailored resume that carries the account
 * email instead of the resume's is a silent, total failure of the application:
 * the document reads correctly, passes every check, and the recruiter replies
 * to an address the candidate may not monitor. Nothing surfaces the error — not
 * to the candidate, not to the employer.
 *
 * Extraction reads only the head of the document. Contact details live at the
 * top of every resume, and scanning the whole text picks up a client's email in
 * a project description or a reference's phone number.
 */

/** How many leading non-empty lines count as the header region. */
const HEADER_LINES = 12;

const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g;

/**
 * Phone matching is deliberately conservative. A loose pattern happily matches
 * date ranges ("2019 - 2024"), employee counts and dollar figures, and a wrong
 * phone number is worse than none.
 */
const PHONE_RE =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?/g;

const URL_PATTERNS = [
  { key: 'linkedin', re: /\b(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/i },
  { key: 'github', re: /\b(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?/i },
  { key: 'portfolio', re: /\b(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:vercel\.app|netlify\.app|github\.io|dev|me|io|com)\/?[\w\-/]*/i },
];

/** Words that mark a line as a section heading rather than contact detail. */
const SECTIONISH = /^(profile|summary|objective|experience|education|skills|about)/i;

/**
 * @param {string} text  master resume text with line structure intact
 * @returns {{fullName, email, phone, location, links, linkedin, github, portfolio, confidence}}
 */
export function extractContact(text) {
  const all = String(text ?? '').split(/\r?\n/);
  const lines = all.map((l) => l.trim()).filter(Boolean);
  const header = lines.slice(0, HEADER_LINES);
  const headerText = header.join('\n');

  /* ── email ─────────────────────────────────────────────────────────── */
  // First in the header wins: resumes put their own address before any other.
  const emails = [...headerText.matchAll(EMAIL_RE)].map((m) => m[0]);
  const email = emails[0] ?? null;

  /* ── phone ─────────────────────────────────────────────────────────── */
  let phone = null;
  for (const raw of headerText.match(PHONE_RE) ?? []) {
    const digits = raw.replace(/\D/g, '');
    // 7 is the shortest real subscriber number; 15 is the E.164 maximum.
    if (digits.length < 7 || digits.length > 15) continue;
    // A bare 8-digit run is far more likely to be two years than a number.
    if (!/[+()\-.\s]/.test(raw) && digits.length <= 8) continue;
    phone = raw.trim();
    break;
  }

  /* ── links ─────────────────────────────────────────────────────────── */
  const links = {};
  for (const { key, re } of URL_PATTERNS) {
    const m = headerText.match(re);
    if (!m) continue;
    // Do not let the portfolio pattern re-capture a linkedin/github URL.
    if (key === 'portfolio' && /linkedin\.com|github\.com/i.test(m[0])) continue;
    links[key] = m[0].replace(/\/$/, '');
  }

  /* ── name ──────────────────────────────────────────────────────────── */
  // The first header line that is not contact data and not a section heading.
  let fullName = null;
  for (const l of header) {
    if (SECTIONISH.test(l)) break;
    if (/@|\d{3}/.test(l)) continue;                    // contact line
    if (/https?:\/\/|linkedin\.com|github\.com/i.test(l)) continue;
    const words = l.split(/\s+/);
    if (words.length > 5 || l.length > 60) continue;     // a headline, not a name
    fullName = l.replace(/\s{2,}/g, ' ');
    break;
  }

  /* ── location ──────────────────────────────────────────────────────── */
  // "City, ST" or "City, Country", on a line that also carries contact data.
  let location = null;
  const LOC_RE =
    /\b([A-Z][a-zA-Z.'-]+(?:\s[A-Z][a-zA-Z.'-]+)?),\s*([A-Z]{2}\b|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/;
  for (const l of header) {
    if (SECTIONISH.test(l)) break;
    const m = l.match(LOC_RE);
    if (m && !/@/.test(m[0])) {
      location = m[0];
      break;
    }
  }

  const found = [email, phone, fullName, location].filter(Boolean).length;

  return {
    fullName,
    email,
    phone,
    location,
    linkedin: links.linkedin ?? null,
    github: links.github ?? null,
    portfolio: links.portfolio ?? null,
    links: Object.values(links),
    // Stated so the caller can decide whether to trust this over the account.
    // Low confidence should prompt the user rather than silently substitute.
    confidence: found >= 3 ? 'high' : found >= 2 ? 'medium' : 'low',
  };
}

/**
 * Merge resume-extracted contact with account details.
 *
 * Resume wins on every field it has. The account fills gaps only. Returns which
 * source supplied each field, so the UI can show the candidate what will appear
 * on the document they are about to send.
 */
export function resolveContact(fromResume, fromAccount = {}) {
  const pick = (a, b) => (a ? [a, 'resume'] : [b ?? null, b ? 'account' : 'none']);

  const [fullName, fullNameSrc] = pick(fromResume?.fullName, fromAccount.fullName);
  const [email, emailSrc] = pick(fromResume?.email, fromAccount.email);
  const [phone, phoneSrc] = pick(fromResume?.phone, fromAccount.phone);
  const [location, locationSrc] = pick(fromResume?.location, fromAccount.location);

  return {
    fullName,
    email,
    phone,
    location,
    linkedin: fromResume?.linkedin ?? null,
    github: fromResume?.github ?? null,
    portfolio: fromResume?.portfolio ?? null,
    links: fromResume?.links ?? [],
    sources: {
      fullName: fullNameSrc,
      email: emailSrc,
      phone: phoneSrc,
      location: locationSrc,
    },
  };
}

export default { extractContact, resolveContact };
