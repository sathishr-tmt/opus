const DEFAULT_TIMEOUT_MS = 12000;
const MAX_JOBS_PER_SOURCE = 100;
// Short guard only: stops an accidental double-click from hitting the job
// boards twice. Every real Search still scrapes live.
const RESULT_CACHE_TTL_MS = 30 * 1000;
const JOBICY_CACHE_TTL_MS = 60 * 60 * 1000;

const resultCache = new Map();
const lastSourceHealth = new Map();

function recordSourceHealth(entries = []) {
  for (const entry of entries) {
    const previous = lastSourceHealth.get(entry.source) || {};
    lastSourceHealth.set(entry.source, {
      ...entry,
      lastSuccessAt: entry.ok ? entry.checkedAt : previous.lastSuccessAt || null
    });
  }
}

export function getSourceHealthSnapshot() {
  return [...lastSourceHealth.values()].sort((a, b) => a.source.localeCompare(b.source));
}

export async function probeSources(query = {}) {
  await fetchAllowedJobs({ ...query, refreshId: Date.now() });
  return getSourceHealthSnapshot();
}
const sourceCache = new Map();

const DEFAULT_GREENHOUSE_COMPANIES = [
  'airbnb',
  'stripe',
  'reddit',
  'databricks',
  'coinbase',
  'figma',
  'doordash',
  'okta'
];

const DEFAULT_LEVER_COMPANIES = [
  'netlify',
  'postman',
  'webflow',
  'docker',
  'vercel',
  'hashicorp',
  'brex',
  'ramp'
];

const DEFAULT_ASHBY_COMPANIES = [
  'anthropic',
  'perplexity',
  'replit',
  'linear',
  'supabase',
  'huggingface',
  'notion',
  'ramp'
];

function cleanText(value = '') {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeValue(value = '') {
  return cleanText(value).toLowerCase();
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesWord(text = '', word = '') {
  if (!word) return false;

  const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
  return regex.test(String(text));
}

function parseCsvEnv(value = '', fallback = []) {
  const parsed = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed.length ? parsed : fallback;
}

function parseJsonArrayEnv(value = '') {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error('Invalid JSON format in environment variable.');
  }
}

function buildSearchText(query = {}) {
  return String(
    query.search ||
      query.keyword ||
      query.category ||
      query.title ||
      'developer'
  ).trim();
}

function getCacheValue(cache, key, ttlMs) {
  const cached = cache.get(key);

  if (!cached) return null;

  if (Date.now() - cached.createdAt > ttlMs) {
    cache.delete(key);
    return null;
  }

  return structuredClone(cached.value);
}

function setCacheValue(cache, key, value) {
  cache.set(key, {
    createdAt: Date.now(),
    value: structuredClone(value)
  });
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'OPUS-Job-Fetcher/1.0',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function getJobId(source, value) {
  return `${source}-${String(value || Date.now()).replace(
    /[^a-zA-Z0-9-_]/g,
    '-'
  )}`;
}

function inferWorkMode(text = '') {
  const value = normalizeValue(text);

  if (value.includes('remote')) return 'Remote';
  if (value.includes('hybrid')) return 'Hybrid';

  if (
    value.includes('onsite') ||
    value.includes('on-site') ||
    value.includes('on site') ||
    value.includes('in office')
  ) {
    return 'Onsite';
  }

  return 'Not listed';
}

function inferJobType(text = '') {
  const value = normalizeValue(text);

  if (
    value.includes('contract') ||
    value.includes('temporary') ||
    value.includes('freelance')
  ) {
    return 'Contract';
  }

  if (value.includes('intern')) return 'Internship';

  if (
    value.includes('part-time') ||
    value.includes('part time') ||
    value.includes('parttime')
  ) {
    return 'Part-time';
  }

  if (
    value.includes('full-time') ||
    value.includes('full time') ||
    value.includes('fulltime')
  ) {
    return 'Full-time';
  }

  return 'Full-time';
}

function normalizeSalaryToAnnual(value, period = '') {
  const number = Number(value || 0);

  if (!number) return 0;

  const normalizedPeriod = normalizeValue(period);

  if (normalizedPeriod.includes('hour')) return Math.round(number * 2080);
  if (normalizedPeriod.includes('day')) return Math.round(number * 260);
  if (normalizedPeriod.includes('week')) return Math.round(number * 52);
  if (normalizedPeriod.includes('month')) return Math.round(number * 12);

  return Math.round(number);
}

function extractSalaryNumbers(text = '') {
  const value = normalizeValue(text).replace(/,/g, '');

  const matches = [
    ...value.matchAll(/\$?\s*(\d{2,6})(?:\.\d+)?\s*(k|000)?/g)
  ]
    .map((match) => {
      const base = Number(match[1]);
      const suffix = match[2];

      if (!base) return null;
      if (suffix === 'k' || suffix === '000') return base * 1000;
      if (base >= 10000) return base;
      return null;
    })
    .filter((number) => number && number >= 10000 && number <= 1000000);

  if (!matches.length) {
    return {
      minSalary: 0,
      maxSalary: 0
    };
  }

  return {
    minSalary: Math.min(...matches),
    maxSalary: Math.max(...matches)
  };
}

function extractExperienceYearsFromText(text = '') {
  const value = normalizeValue(text);

  const patterns = [
    /(\d+)\s*\+?\s*(?:years|year|yrs|yr)\s+(?:of\s+)?experience/g,
    /(\d+)\s*-\s*(\d+)\s*(?:years|year|yrs|yr)/g,
    /minimum\s+(\d+)\s*\+?\s*(?:years|year|yrs|yr)/g,
    /at\s+least\s+(\d+)\s*\+?\s*(?:years|year|yrs|yr)/g
  ];

  const foundYears = [];

  patterns.forEach((pattern) => {
    const matches = [...value.matchAll(pattern)];

    matches.forEach((match) => {
      const number = Number(match[1]);

      if (number >= 0 && number <= 30) {
        foundYears.push(number);
      }
    });
  });

  return foundYears.length ? Math.min(...foundYears) : null;
}

function normalizeJob(job = {}) {
  const description = cleanText(job.description || '');
  const salaryFromText = extractSalaryNumbers(
    `${job.salary || ''} ${description}`
  );

  return {
    id: String(job.id || getJobId('job', job.url || job.title)),
    title: cleanText(job.title || 'Untitled Job'),
    company: cleanText(job.company || 'Company not listed'),
    location: cleanText(job.location || 'Not listed'),
    jobType: cleanText(job.jobType || inferJobType(description)),
    workMode: cleanText(
      job.workMode ||
        inferWorkMode(`${job.location || ''} ${description}`)
    ),
    minSalary: Number(job.minSalary || salaryFromText.minSalary || 0),
    maxSalary: Number(job.maxSalary || salaryFromText.maxSalary || 0),
    postedAt: job.postedAt || null,
    source: cleanText(job.source || 'Public Job Feed'),
    url: job.url || '',
    description,
    skills: Array.isArray(job.skills)
      ? [...new Set(job.skills.filter(Boolean).map(cleanText))].slice(0, 12)
      : [],
    experienceLevel: cleanText(job.experienceLevel || ''),
    requiredExperienceYears:
      job.requiredExperienceYears ??
      extractExperienceYearsFromText(
        `${job.title || ''} ${job.experienceLevel || ''} ${description}`
      )
  };
}

/* -------------------------------------------------------------------------- */
/* Workday                                                                    */
/* -------------------------------------------------------------------------- */

// Public Workday career sites used when WORKDAY_SOURCES is not configured.
// Workday job listings and descriptions are public; only submitting an
// application requires a candidate account on the employer's site.
const DEFAULT_WORKDAY_SOURCES = [
  { name: 'Workday', url: 'https://workday.wd5.myworkdayjobs.com/Workday' },
  { name: 'NVIDIA', url: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite' },
  { name: 'Salesforce', url: 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site' },
  { name: 'Adobe', url: 'https://adobe.wd5.myworkdayjobs.com/external_experienced' },
  { name: 'Dell Technologies', url: 'https://dell.wd1.myworkdayjobs.com/External' }
];

// How many listings per source get their full description fetched. Each one is
// an extra HTTP call, so this is capped to keep searches fast.
const WORKDAY_DETAIL_LIMIT = 12;

function normalizeWorkdaySource(source = {}) {
  if (source.endpoint) {
    return {
      name: source.name || 'Workday',
      endpoint: source.endpoint,
      detailBase: source.detailBase || '',
      applyBase: source.applyBase || ''
    };
  }

  if (!source.url) {
    throw new Error('Workday source must include url or endpoint.');
  }

  const url = new URL(source.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const site = pathParts[0];

  if (!site) {
    throw new Error('Workday URL must include a public career-site path.');
  }

  const tenant = url.hostname.split('.')[0];

  return {
    name: source.name || `Workday - ${site}`,
    endpoint: `${url.origin}/wday/cxs/${tenant}/${site}/jobs`,
    // Detail endpoint returns the full HTML job description.
    detailBase: `${url.origin}/wday/cxs/${tenant}/${site}`,
    // Public posting page — where "Apply" sends the user.
    applyBase: `${url.origin}/${site}`
  };
}

// Turn the HTML job description Workday returns into readable plain text.
function htmlToText(html = '') {
  return cleanText(
    String(html)
      .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;|&rsquo;/gi, "'")
      .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
  );
}

// Fetch one posting's full description.
// Workday exposes this at /wday/cxs/{tenant}/{site}/job/{externalPath}; some
// tenants already include "/job/..." in externalPath, so both shapes are handled.
async function fetchWorkdayJobDetail(source, externalPath = '') {
  if (!source.detailBase || !externalPath) return null;

  const suffix = externalPath.startsWith('/job/')
    ? externalPath
    : `/job/${externalPath.replace(/^\//, '')}`;

  try {
    const data = await fetchJson(`${source.detailBase}${suffix}`);
    const info = data.jobPostingInfo || {};

    return {
      description: htmlToText(info.jobDescription || ''),
      postedOn: info.startDate || info.postedOn || null,
      location: info.location || '',
      jobType: info.timeType || '',
      externalUrl: info.externalUrl || ''
    };
  } catch {
    // A failed detail call is not fatal — the listing data is still usable.
    return null;
  }
}

function buildWorkdayApplyUrl(source, externalPath = '') {
  if (!externalPath) return source.applyBase || '';
  if (externalPath.startsWith('http')) return externalPath;
  if (!source.applyBase) return externalPath;

  return `${source.applyBase}${externalPath}`;
}

async function fetchWorkdayJobs(query = {}) {
  const configuredSources = parseJsonArrayEnv(
    process.env.WORKDAY_SOURCES || ''
  );

  // Fall back to the built-in public career sites so Workday works with no
  // configuration, matching how Greenhouse/Lever/Ashby already behave.
  const sourceList = configuredSources.length
    ? configuredSources
    : DEFAULT_WORKDAY_SOURCES;

  const searchText = buildSearchText(query);
  const allJobs = [];

  for (const sourceConfig of sourceList) {
    let source;

    try {
      source = normalizeWorkdaySource(sourceConfig);
    } catch (error) {
      console.warn('Invalid Workday source skipped:', error.message);
      continue;
    }

    try {
      const data = await fetchJson(source.endpoint, {
        method: 'POST',
        body: JSON.stringify({
          appliedFacets: {},
          limit: 20,
          offset: 0,
          searchText
        })
      });

      const postings = (data.jobPostings || data.jobs || []).slice(
        0,
        MAX_JOBS_PER_SOURCE
      );

      // Pull the real job description for the first N postings. These run in
      // parallel and each failure degrades to the listing summary.
      const details = await Promise.all(
        postings
          .slice(0, WORKDAY_DETAIL_LIMIT)
          .map((posting) => fetchWorkdayJobDetail(source, posting.externalPath))
      );

      postings.forEach((posting, index) => {
        const detail = details[index] || null;

        // Prefer the full description; fall back to the listing summary.
        const summary = cleanText(
          [
            posting.title,
            posting.locationsText,
            posting.postedOn,
            ...(posting.bulletFields || [])
          ].join(' ')
        );

        const description = detail?.description
          ? `${detail.description}`
          : summary;

        allJobs.push(
          normalizeJob({
            id: getJobId(
              'workday',
              `${source.name}-${posting.externalPath || posting.title}`
            ),
            title: posting.title,
            company: source.name,
            location:
              posting.locationsText || detail?.location || 'Not listed',
            jobType: detail?.jobType || inferJobType(description),
            workMode: inferWorkMode(description),
            postedAt: posting.postedOn || detail?.postedOn || null,
            source: 'Workday',
            // Public posting page. Browsing and reading the description needs
            // no account; submitting the application requires the candidate to
            // sign in on the employer's Workday site, which happens there.
            url:
              detail?.externalUrl ||
              buildWorkdayApplyUrl(source, posting.externalPath),
            description,
            skills: posting.bulletFields || []
          })
        );
      });
    } catch (error) {
      console.warn(`Workday source failed (${source.name}):`, error.message);
    }
  }

  return allJobs.slice(0, MAX_JOBS_PER_SOURCE);
}

/* -------------------------------------------------------------------------- */
/* Public feeds and public job-board APIs                                     */
/* -------------------------------------------------------------------------- */

async function fetchRemoteOkJobs() {
  const data = await fetchJson('https://remoteok.com/api');
  const jobs = Array.isArray(data) ? data.slice(1) : [];

  return jobs.slice(0, MAX_JOBS_PER_SOURCE).map((job) =>
    normalizeJob({
      id: getJobId('remoteok', job.id),
      title: job.position,
      company: job.company,
      location: job.location || 'Remote',
      jobType: inferJobType(
        `${job.position || ''} ${(job.tags || []).join(' ')}`
      ),
      workMode: 'Remote',
      minSalary: Number(job.salary_min || 0),
      maxSalary: Number(job.salary_max || 0),
      postedAt: job.date || null,
      source: 'RemoteOK',
      url: job.url || '',
      description: job.description,
      skills: job.tags || []
    })
  );
}

async function fetchRemotiveJobs(query = {}) {
  const searchText = encodeURIComponent(buildSearchText(query));
  const data = await fetchJson(
    `https://remotive.com/api/remote-jobs?search=${searchText}`
  );

  return (data.jobs || []).slice(0, MAX_JOBS_PER_SOURCE).map((job) =>
    normalizeJob({
      id: getJobId('remotive', job.id),
      title: job.title,
      company: job.company_name,
      location: job.candidate_required_location || 'Remote',
      jobType: job.job_type || 'Full-time',
      workMode: 'Remote',
      postedAt: job.publication_date,
      source: 'Remotive',
      url: job.url,
      salary: job.salary,
      description: job.description,
      skills: job.tags || []
    })
  );
}

async function fetchArbeitnowJobs() {
  const data = await fetchJson(
    'https://www.arbeitnow.com/api/job-board-api'
  );

  return (data.data || []).slice(0, MAX_JOBS_PER_SOURCE).map((job) =>
    normalizeJob({
      id: getJobId('arbeitnow', job.slug || job.id),
      title: job.title,
      company: job.company_name,
      location: job.location,
      jobType: Array.isArray(job.job_types)
        ? job.job_types[0]
        : 'Full-time',
      workMode: job.remote
        ? 'Remote'
        : inferWorkMode(`${job.location || ''} ${job.description || ''}`),
      postedAt: job.created_at
        ? new Date(job.created_at * 1000).toISOString()
        : null,
      source: 'Arbeitnow',
      url: job.url,
      description: job.description,
      skills: job.tags || []
    })
  );
}

async function fetchJobicyJobs(query = {}) {
  const cacheKey = `jobicy:${normalizeValue(buildSearchText(query))}:${normalizeValue(query.country || '')}`;
  const cached = getCacheValue(sourceCache, cacheKey, JOBICY_CACHE_TTL_MS);

  if (cached) return cached;

  const params = new URLSearchParams({
    count: String(MAX_JOBS_PER_SOURCE),
    tag: buildSearchText(query)
  });

  const country = normalizeValue(query.country || '');

  if (['united states', 'usa', 'us'].includes(country)) {
    params.set('geo', 'usa');
  } else if (country === 'canada') {
    params.set('geo', 'canada');
  } else if (country === 'europe') {
    params.set('geo', 'europe');
  } else if (country === 'united kingdom' || country === 'uk') {
    params.set('geo', 'uk');
  }

  const data = await fetchJson(
    `https://jobicy.com/api/v2/remote-jobs?${params.toString()}`
  );

  const jobs = (data.jobs || []).map((job) => {
    const salaryPeriod = job.salaryPeriod || '';

    return normalizeJob({
      id: getJobId('jobicy', job.id),
      title: job.jobTitle,
      company: job.companyName,
      location: job.jobGeo || 'Remote',
      jobType: job.jobType || 'Full-time',
      workMode: 'Remote',
      minSalary: normalizeSalaryToAnnual(
        job.salaryMin,
        salaryPeriod
      ),
      maxSalary: normalizeSalaryToAnnual(
        job.salaryMax,
        salaryPeriod
      ),
      postedAt: job.pubDate || null,
      source: 'Jobicy',
      url: job.url,
      description: job.jobDescription || job.jobExcerpt,
      skills: [job.jobIndustry, job.jobLevel].filter(Boolean),
      experienceLevel: job.jobLevel || ''
    });
  });

  setCacheValue(sourceCache, cacheKey, jobs);
  return jobs;
}

async function fetchGreenhouseJobs() {
  const companies = parseCsvEnv(
    process.env.GREENHOUSE_COMPANIES,
    DEFAULT_GREENHOUSE_COMPANIES
  );

  const settled = await Promise.allSettled(
    companies.map(async (company) => {
      const data = await fetchJson(
        `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`
      );

      return (data.jobs || []).map((job) => {
        const location =
          job.location?.name ||
          (job.offices || []).map((office) => office.name).join(', ') ||
          'Not listed';

        return normalizeJob({
          id: getJobId('greenhouse', `${company}-${job.id}`),
          title: job.title,
          company,
          location,
          jobType: inferJobType(job.content || job.title),
          workMode: inferWorkMode(`${location} ${job.content || ''}`),
          postedAt: job.updated_at || null,
          source: 'Greenhouse',
          url: job.absolute_url,
          description: job.content,
          skills: (job.departments || []).map(
            (department) => department.name
          )
        });
      });
    })
  );

  return settled
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .slice(0, MAX_JOBS_PER_SOURCE);
}

async function fetchLeverJobs() {
  const companies = parseCsvEnv(
    process.env.LEVER_COMPANIES,
    DEFAULT_LEVER_COMPANIES
  );

  const settled = await Promise.allSettled(
    companies.map(async (company) => {
      const jobs = await fetchJson(
        `https://api.lever.co/v0/postings/${company}?mode=json`
      );

      return (jobs || []).map((job) => {
        const categories = job.categories || {};
        const description = [
          job.descriptionPlain,
          ...(job.lists || []).map(
            (list) => `${list.text}: ${cleanText(list.content || '')}`
          )
        ].join(' ');

        return normalizeJob({
          id: getJobId('lever', `${company}-${job.id}`),
          title: job.text,
          company,
          location: categories.location || 'Not listed',
          jobType: categories.commitment || inferJobType(description),
          workMode: inferWorkMode(
            `${categories.location || ''} ${description}`
          ),
          postedAt: job.createdAt
            ? new Date(job.createdAt).toISOString()
            : null,
          source: 'Lever',
          url: job.hostedUrl || job.applyUrl,
          description,
          skills: Object.values(categories).filter(Boolean)
        });
      });
    })
  );

  return settled
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .slice(0, MAX_JOBS_PER_SOURCE);
}

async function fetchAshbyJobs() {
  const companies = parseCsvEnv(
    process.env.ASHBY_COMPANIES,
    DEFAULT_ASHBY_COMPANIES
  );

  const settled = await Promise.allSettled(
    companies.map(async (company) => {
      const data = await fetchJson(
        `https://api.ashbyhq.com/posting-api/job-board/${company}?includeCompensation=true`
      );

      return (data.jobs || []).map((job) => {
        const location = Array.isArray(job.location)
          ? job.location.join(', ')
          : job.location ||
            job.locationName ||
            (job.locations || [])
              .map((item) => item.name || item)
              .join(', ') ||
            'Not listed';

        const compensation =
          job.compensation?.compensationTierSummary ||
          job.compensation?.summary ||
          '';

        return normalizeJob({
          id: getJobId('ashby', `${company}-${job.id}`),
          title: job.title,
          company,
          location,
          jobType: inferJobType(
            `${job.employmentType || ''} ${job.descriptionHtml || ''}`
          ),
          workMode: inferWorkMode(
            `${location} ${job.workplaceType || ''} ${job.descriptionHtml || ''}`
          ),
          postedAt: job.publishedAt || job.updatedAt || null,
          source: 'Ashby',
          url: job.jobUrl || job.applyUrl || '',
          salary: compensation,
          description: job.descriptionHtml || job.description || '',
          skills: [
            job.department,
            job.team,
            job.employmentType
          ].filter(Boolean)
        });
      });
    })
  );

  return settled
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .slice(0, MAX_JOBS_PER_SOURCE);
}

async function fetchTheMuseJobs(query = {}) {
  const apiKey = process.env.THE_MUSE_API_KEY || '';

  if (!apiKey) return [];

  const params = new URLSearchParams({
    page: '1',
    descending: 'true',
    api_key: apiKey
  });

  const data = await fetchJson(
    `https://www.themuse.com/api/public/jobs?${params.toString()}`
  );

  return (data.results || []).slice(0, MAX_JOBS_PER_SOURCE).map((job) => {
    const locations = (job.locations || [])
      .map((location) => location.name)
      .filter(Boolean)
      .join(', ');

    return normalizeJob({
      id: getJobId('themuse', job.id),
      title: job.name,
      company: job.company?.name,
      location: locations || 'Not listed',
      jobType: inferJobType(job.contents || job.name),
      workMode: inferWorkMode(`${locations} ${job.contents || ''}`),
      postedAt: job.publication_date || null,
      source: 'The Muse',
      url: job.refs?.landing_page || '',
      description: job.contents,
      skills: (job.categories || []).map((category) => category.name),
      experienceLevel: (job.levels || [])
        .map((level) => level.name)
        .join(', ')
    });
  });
}

async function fetchUsaJobs(query = {}) {
  const apiKey = process.env.USAJOBS_API_KEY || '';
  const userAgent = process.env.USAJOBS_USER_AGENT || '';

  if (!apiKey || !userAgent) return [];

  const params = new URLSearchParams({
    Keyword: buildSearchText(query),
    ResultsPerPage: String(MAX_JOBS_PER_SOURCE)
  });

  const location = [query.city, query.state, query.country]
    .filter(Boolean)
    .join(', ');

  if (location) {
    params.set('LocationName', location);
  }

  if (query.minSalary) {
    params.set('RemunerationMinimumAmount', String(query.minSalary));
  }

  if (query.maxSalary) {
    params.set('RemunerationMaximumAmount', String(query.maxSalary));
  }

  const data = await fetchJson(
    `https://data.usajobs.gov/api/search?${params.toString()}`,
    {
      headers: {
        Host: 'data.usajobs.gov',
        'User-Agent': userAgent,
        'Authorization-Key': apiKey
      }
    }
  );

  const items =
    data.SearchResult?.SearchResultItems ||
    data.searchResult?.searchResultItems ||
    [];

  return items.slice(0, MAX_JOBS_PER_SOURCE).map((item) => {
    const descriptor = item.MatchedObjectDescriptor || {};
    const locations = (descriptor.PositionLocation || [])
      .map((locationItem) => locationItem.LocationName)
      .filter(Boolean)
      .join(', ');

    const remuneration = descriptor.PositionRemuneration?.[0] || {};
    const description = [
      descriptor.QualificationSummary,
      descriptor.UserArea?.Details?.JobSummary,
      descriptor.UserArea?.Details?.MajorDuties,
      descriptor.UserArea?.Details?.Requirements
    ]
      .filter(Boolean)
      .join(' ');

    return normalizeJob({
      id: getJobId('usajobs', descriptor.PositionID || item.MatchedObjectId),
      title: descriptor.PositionTitle,
      company:
        descriptor.OrganizationName ||
        descriptor.DepartmentName ||
        'U.S. Federal Government',
      location: locations || 'United States',
      jobType:
        descriptor.PositionSchedule?.[0]?.Name ||
        inferJobType(description),
      workMode: inferWorkMode(`${locations} ${description}`),
      minSalary: Number(remuneration.MinimumRange || 0),
      maxSalary: Number(remuneration.MaximumRange || 0),
      postedAt: descriptor.PublicationStartDate || null,
      source: 'USAJOBS',
      url:
        descriptor.PositionURI ||
        descriptor.ApplyURI?.[0] ||
        '',
      description,
      skills: (descriptor.JobCategory || []).map(
        (category) => category.Name
      )
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                    */
/* -------------------------------------------------------------------------- */

const countryAliases = {
  'united states': [
    'united states',
    'usa',
    'us',
    'u.s.',
    'u.s.a.',
    'america'
  ],
  usa: ['united states', 'usa', 'us', 'u.s.', 'u.s.a.', 'america'],
  us: ['united states', 'usa', 'us', 'u.s.', 'u.s.a.', 'america'],
  india: ['india'],
  canada: ['canada'],
  'united kingdom': ['united kingdom', 'uk', 'england', 'britain'],
  uk: ['united kingdom', 'uk', 'england', 'britain'],
  germany: ['germany', 'deutschland'],
  france: ['france'],
  netherlands: ['netherlands'],
  ireland: ['ireland'],
  australia: ['australia'],
  singapore: ['singapore'],
  'united arab emirates': ['united arab emirates', 'uae'],
  europe: ['europe', 'emea']
};

const stateAliases = {
  texas: ['texas', 'tx'],
  'new york': ['new york', 'ny'],
  'new jersey': ['new jersey', 'nj'],
  california: ['california', 'ca'],
  florida: ['florida', 'fl'],
  arizona: ['arizona', 'az'],
  washington: ['washington', 'wa'],
  illinois: ['illinois', 'il'],
  georgia: ['georgia', 'ga'],
  'north carolina': ['north carolina', 'nc'],
  massachusetts: ['massachusetts', 'ma'],
  pennsylvania: ['pennsylvania', 'pa'],
  colorado: ['colorado', 'co'],
  ohio: ['ohio', 'oh'],
  michigan: ['michigan', 'mi'],
  tennessee: ['tennessee', 'tn'],
  missouri: ['missouri', 'mo'],
  utah: ['utah', 'ut'],
  oregon: ['oregon', 'or']
};

const genericRoleWords = [
  'developer',
  'engineer',
  'software',
  'programmer',
  'consultant',
  'specialist',
  'analyst'
];

const interchangeableRoleWords = new Set([
  'developer',
  'engineer',
  'programmer'
]);

const skillSynonymGroups = [
  [
    'java',
    'spring boot',
    'springboot',
    'spring framework',
    'j2ee',
    'jakarta ee',
    'java microservices'
  ],
  ['javascript', 'typescript', 'node.js', 'nodejs'],
  ['python', 'django', 'flask', 'fastapi'],
  ['c#', 'csharp', '.net', 'dotnet', 'asp.net']
];

function canonicalizeCategoryText(value = '') {
  let normalized = ` ${normalizeValue(value)} `;

  skillSynonymGroups.forEach((group, index) => {
    const canonicalSkill = ` skill-group-${index} `;

    group
      .slice()
      .sort((a, b) => b.length - a.length)
      .forEach((alias) => {
        const aliasPattern = escapeRegex(alias).replace(
          /\s+/g,
          '[\\s-]+'
        );
        normalized = normalized.replace(
          new RegExp(
            `(^|[^a-z0-9])${aliasPattern}(?=$|[^a-z0-9])`,
            'gi'
          ),
          `$1${canonicalSkill}`
        );
      });
  });

  interchangeableRoleWords.forEach((roleWord) => {
    normalized = normalized.replace(
      new RegExp(`\\b${escapeRegex(roleWord)}\\b`, 'gi'),
      ' interchangeable-role '
    );
  });

  return normalized.replace(/\s+/g, ' ').trim();
}

function getJobSearchText(job = {}) {
  return normalizeValue(`
    ${job.title || ''}
    ${job.company || ''}
    ${job.location || ''}
    ${job.jobType || ''}
    ${job.workMode || ''}
    ${job.experienceLevel || ''}
    ${(job.skills || []).join(' ')}
    ${job.description || ''}
  `);
}

function getJobTitleText(job = {}) {
  return normalizeValue(`${job.title || ''} ${(job.skills || []).join(' ')}`);
}

function jobLooksRemote(job = {}) {
  const text = normalizeValue(
    `${job.workMode || ''} ${job.location || ''}`
  );

  return text.includes('remote');
}

function countryMatches(job, query = {}) {
  const selected = normalizeValue(query.country || '');

  if (!selected || selected === 'worldwide') return true;

  if (selected === 'remote') {
    return jobLooksRemote(job);
  }

  const text = normalizeValue(
    `${job.location || ''} ${job.description || ''}`
  );

  return (countryAliases[selected] || [selected]).some((alias) =>
    includesWord(text, alias)
  );
}

function stateMatches(job, query = {}) {
  const selected = normalizeValue(query.state || '');

  if (!selected) return true;
  if (jobLooksRemote(job)) return true;

  const text = normalizeValue(job.location || '');

  return (stateAliases[selected] || [selected]).some((alias) =>
    includesWord(text, alias)
  );
}

function cityMatches(job, query = {}) {
  const selected = normalizeValue(query.city || '');

  if (!selected) return true;
  if (jobLooksRemote(job)) return true;

  return includesWord(normalizeValue(job.location || ''), selected);
}

function categoryMatches(job, query = {}) {
  const category = normalizeValue(
    query.search || query.keyword || query.category || ''
  );

  if (!category) return true;

  const searchableText = getJobSearchText(job);
  const titleText = getJobTitleText(job);

  // Preserve direct title matching as the strongest category match.
  if (titleText.includes(category)) return true;

  const canonicalCategory = canonicalizeCategoryText(category);
  const canonicalSearchableText = canonicalizeCategoryText(searchableText);
  const canonicalTitleText = canonicalizeCategoryText(titleText);

  const words = canonicalCategory
    .split(/\s+/)
    .filter((word) => word.length > 2);

  const skillWords = words.filter(
    (word) => !genericRoleWords.includes(word) &&
      word !== 'interchangeable-role'
  );

  const roleWords = words.filter(
    (word) =>
      genericRoleWords.includes(word) ||
      word === 'interchangeable-role'
  );

  const skillMatched = skillWords.length
    ? skillWords.every((word) =>
        includesWord(canonicalSearchableText, word)
      )
    : true;

  const roleMatched = roleWords.length
    ? roleWords.some((word) => includesWord(canonicalTitleText, word))
    : true;

  return skillMatched && roleMatched;
}

function workModeMatches(job, query = {}) {
  const selected = normalizeValue(query.workMode || '');

  if (!selected) return true;

  const mode = normalizeValue(job.workMode || '');
  const text = normalizeValue(
    `${job.workMode || ''} ${job.location || ''} ${job.description || ''}`
  );

  if (selected === 'remote') {
    return mode === 'remote' || text.includes('remote');
  }

  if (selected === 'hybrid') {
    return mode === 'hybrid' || text.includes('hybrid');
  }

  if (selected === 'onsite' || selected === 'on-site') {
    return (
      mode === 'onsite' ||
      text.includes('onsite') ||
      text.includes('on-site') ||
      text.includes('on site') ||
      text.includes('in office')
    );
  }

  return text.includes(selected);
}

function jobTypeMatches(job, query = {}) {
  const selected = normalizeValue(query.jobType || '');

  if (!selected) return true;

  const text = normalizeValue(
    `${job.jobType || ''} ${job.description || ''}`
  );

  if (selected.includes('full')) {
    return (
      text.includes('full-time') ||
      text.includes('full time') ||
      text.includes('fulltime')
    );
  }

  if (selected.includes('part')) {
    return text.includes('part-time') || text.includes('part time');
  }

  if (selected.includes('contract')) return text.includes('contract');
  if (selected.includes('intern')) return text.includes('intern');

  return text.includes(selected);
}

function hasSalaryData(job = {}) {
  return Number(job.minSalary || 0) > 0 || Number(job.maxSalary || 0) > 0;
}

function salaryMatches(job, query = {}) {
  const requestedMin = Number(query.minSalary || 0);
  const requestedMax = Number(query.maxSalary || 0);

  if (!requestedMin && !requestedMax) return true;

  const jobMin = Number(job.minSalary || 0);
  const jobMax = Number(job.maxSalary || 0);

  // Missing salary fails the strict check and is retained by fallback stages.
  if (!hasSalaryData(job)) return false;

  const effectiveMin = jobMin || jobMax;
  const effectiveMax = jobMax || jobMin;

  if (requestedMin && effectiveMax < requestedMin) return false;
  if (requestedMax && effectiveMin > requestedMax) return false;

  return true;
}

function experienceMatches(job, query = {}) {
  if (query.experienceYears === '' || query.experienceYears === undefined) {
    return true;
  }

  const userYears = Number(query.experienceYears);

  if (Number.isNaN(userYears)) return true;

  const requiredYears =
    job.requiredExperienceYears ??
    extractExperienceYearsFromText(getJobSearchText(job));

  return requiredYears === null || requiredYears <= userYears;
}

function authorizationMatches(job, query = {}) {
  const selected = normalizeValue(query.workAuthorization || '');

  if (!selected || selected === 'no preference') return true;

  const text = getJobSearchText(job);

  const noSponsorship =
    text.includes('no sponsorship') ||
    text.includes('without sponsorship') ||
    text.includes('will not sponsor') ||
    text.includes('unable to sponsor') ||
    text.includes('cannot sponsor');

  if (
    selected.includes('needs sponsorship') ||
    selected.includes('h1b') ||
    selected.includes('opt') ||
    selected.includes('cpt') ||
    selected.includes('f1')
  ) {
    return !noSponsorship;
  }

  return true;
}

function hasValidPostedDate(job = {}) {
  if (!job.postedAt) return false;

  return !Number.isNaN(new Date(job.postedAt).getTime());
}

function postedDateMatches(job, query = {}) {
  const days = Number(query.postedWithinDays || 0);

  if (!days) return true;
  if (!hasValidPostedDate(job)) return false;

  const postedAt = new Date(job.postedAt).getTime();

  return Date.now() - postedAt <= days * 86400000;
}

function buildMatchDetails(job, query = {}) {
  const dateWindowRequested = Number(query.postedWithinDays || 0) > 0;
  const salaryRangeRequested =
    Number(query.minSalary || 0) > 0 || Number(query.maxSalary || 0) > 0;
  const postedDateUnavailable =
    dateWindowRequested && !hasValidPostedDate(job);
  const salaryNotProvided = salaryRangeRequested && !hasSalaryData(job);

  const strictChecks = {
    title: categoryMatches(job, query),
    country: countryMatches(job, query),
    state: stateMatches(job, query),
    city: cityMatches(job, query),
    workMode: workModeMatches(job, query),
    jobType: jobTypeMatches(job, query),
    experience: experienceMatches(job, query),
    authorization: authorizationMatches(job, query),
    salary: salaryMatches(job, query),
    datePosted: postedDateMatches(job, query)
  };

  let matchStage = 99;
  let relaxedFilters = [];

  if (Object.values(strictChecks).every(Boolean)) {
    matchStage = 1;
  } else if (
    strictChecks.title &&
    strictChecks.country &&
    strictChecks.state &&
    strictChecks.city &&
    strictChecks.workMode &&
    strictChecks.jobType &&
    strictChecks.datePosted
  ) {
    matchStage = 2;
    relaxedFilters = [
      !strictChecks.experience && 'experience',
      !strictChecks.authorization && 'work authorization',
      !strictChecks.salary && 'salary'
    ].filter(Boolean);
  } else if (
    strictChecks.title &&
    strictChecks.country &&
    strictChecks.state &&
    strictChecks.workMode &&
    strictChecks.jobType &&
    strictChecks.datePosted
  ) {
    matchStage = 3;
    relaxedFilters = [
      !strictChecks.city && 'city',
      !strictChecks.experience && 'experience',
      !strictChecks.authorization && 'work authorization',
      !strictChecks.salary && 'salary'
    ].filter(Boolean);
  } else if (
    strictChecks.title &&
    strictChecks.country &&
    strictChecks.workMode &&
    strictChecks.jobType &&
    strictChecks.datePosted
  ) {
    matchStage = 4;
    relaxedFilters = [
      !strictChecks.state && 'state',
      !strictChecks.city && 'city',
      !strictChecks.experience && 'experience',
      !strictChecks.authorization && 'work authorization',
      !strictChecks.salary && 'salary'
    ].filter(Boolean);
  } else if (strictChecks.title && strictChecks.country) {
    matchStage = 5;
    relaxedFilters = [
      !strictChecks.state && 'state',
      !strictChecks.city && 'city',
      !strictChecks.workMode && 'work mode',
      !strictChecks.jobType && 'employment type',
      !strictChecks.experience && 'experience',
      !strictChecks.authorization && 'work authorization',
      !strictChecks.salary && 'salary',
      !strictChecks.datePosted && 'date posted'
    ].filter(Boolean);
  } else if (strictChecks.title) {
    matchStage = 6;
    relaxedFilters = [
      !strictChecks.country && 'country',
      !strictChecks.state && 'state',
      !strictChecks.city && 'city',
      !strictChecks.workMode && 'work mode',
      !strictChecks.jobType && 'employment type',
      !strictChecks.experience && 'experience',
      !strictChecks.authorization && 'work authorization',
      !strictChecks.salary && 'salary',
      !strictChecks.datePosted && 'date posted'
    ].filter(Boolean);
  }

  if (
    matchStage < 99 &&
    postedDateUnavailable &&
    !relaxedFilters.includes('date posted')
  ) {
    relaxedFilters.push('date posted');
  }

  if (
    matchStage < 99 &&
    salaryNotProvided &&
    !relaxedFilters.includes('salary')
  ) {
    relaxedFilters.push('salary');
  }

  const labels = {
    1: 'Exact match',
    2: 'Strong match',
    3: 'Nearby match',
    4: 'Regional match',
    5: 'Similar opportunity',
    6: 'Recommended'
  };

  return {
    matchStage,
    matchLabel: labels[matchStage] || 'Not matched',
    relaxedFilters,
    postedDateUnavailable,
    salaryNotProvided
  };
}

function calculateRelevance(job, query = {}, matchDetails = {}) {
  let score = 0;

  const search = normalizeValue(
    query.search || query.keyword || query.category || ''
  );

  const title = normalizeValue(job.title);
  const description = normalizeValue(job.description);

  // Guarantee direct title phrases rank above synonym-only category matches.
  if (search && title.includes(search)) score += 45;

  search
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .forEach((word) => {
      if (includesWord(title, word)) score += 30;
      if (includesWord(description, word)) score += 8;
    });

  const stage = Number(matchDetails.matchStage || 99);
  score += Math.max(0, 90 - stage * 12);

  if (query.country && countryMatches(job, query)) score += 12;
  if (query.state && stateMatches(job, query)) score += 10;
  if (query.city && cityMatches(job, query)) score += 12;
  if (query.workMode && workModeMatches(job, query)) score += 12;
  if (query.jobType && jobTypeMatches(job, query)) score += 8;
  if (query.experienceYears && experienceMatches(job, query)) score += 8;
  if (query.workAuthorization && authorizationMatches(job, query)) score += 5;

  if (query.minSalary || query.maxSalary) {
    if (job.minSalary || job.maxSalary) {
      if (salaryMatches(job, query)) score += 8;
    }
  }

  if (job.postedAt) {
    const postedTime = new Date(job.postedAt).getTime();

    if (!Number.isNaN(postedTime)) {
      const daysOld = (Date.now() - postedTime) / 86400000;

      if (daysOld <= 1) score += 15;
      else if (daysOld <= 7) score += 10;
      else if (daysOld <= 30) score += 4;
    }
  }

  return Math.max(0, Math.round(score));
}

// How many days ago a job was posted. Unknown dates are treated as "old" so a
// dated job is preferred over an undated one, but they are never discarded.
function daysSincePosted(job) {
  const time = new Date(job.postedAt || 0).getTime();
  if (!time || Number.isNaN(time)) return 999;

  return Math.max(0, Math.floor((Date.now() - time) / 86400000));
}

// Freshness band used for ranking. Jobs posted in the last two days rank
// highest, then the last week, then the last fortnight. Older jobs still
// appear — they simply sit lower.
function freshnessTier(job) {
  const days = daysSincePosted(job);

  if (days <= 2) return 4;
  if (days <= 7) return 3;
  if (days <= 15) return 2;
  if (days <= 30) return 1;
  return 0;
}

// Last-resort results so a search NEVER comes back empty.
// Keeps whatever relation to the requested role it can find, marks everything
// as relaxed so the UI can say the search was widened, and prefers newer jobs.
function buildFallbackResults(jobs, query = {}, limit = 25) {
  const roleWords = normalizeValue(query.role || query.title || '')
    .split(/\s+/)
    .filter((word) => word.length > 2);

  const scored = jobs.map((job) => {
    const haystack = normalizeValue(`${job.title} ${job.description || ''}`);
    const hits = roleWords.filter((word) => haystack.includes(word)).length;

    return { job, hits };
  });

  const related = scored.filter((entry) => entry.hits > 0);
  const pool = related.length ? related : scored;

  return pool
    .sort((left, right) => {
      if (right.hits !== left.hits) return right.hits - left.hits;

      const tier = freshnessTier(right.job) - freshnessTier(left.job);
      if (tier !== 0) return tier;

      return (
        new Date(right.job.postedAt || 0).getTime() -
        new Date(left.job.postedAt || 0).getTime()
      );
    })
    .slice(0, limit)
    .map((entry) => ({
      ...entry.job,
      matchStage: 7,
      matchLabel: 'Widened search',
      matchScore: 0,
      relaxedFilters: [
        'location',
        'work mode',
        'employment type',
        'experience',
        'salary',
        'date posted'
      ],
      widened: true
    }));
}

function filterAndRankJobs(jobs, query = {}) {
  const ranked = jobs
    .map((job) => {
      const matchDetails = buildMatchDetails(job, query);

      return {
        ...job,
        ...matchDetails,
        matchScore: calculateRelevance(job, query, matchDetails)
      };
    })
    .filter((job) => job.matchStage < 99)
    .sort((a, b) => {
      // 1. How well the job satisfies the user's filters (always wins).
      if (a.matchStage !== b.matchStage) {
        return a.matchStage - b.matchStage;
      }

      // 2. Freshness — jobs from the last two days surface first.
      const tierDifference = freshnessTier(b) - freshnessTier(a);
      if (tierDifference !== 0) return tierDifference;

      // 3. Relevance score.
      if (a.matchScore !== b.matchScore) {
        return b.matchScore - a.matchScore;
      }

      // 4. Exact posting date.
      return (
        new Date(b.postedAt || 0).getTime() -
        new Date(a.postedAt || 0).getTime()
      );
    });

  // A search must never return nothing. If every job failed the filters,
  // fall back to the closest available matches rather than an empty page.
  if (!ranked.length && jobs.length) {
    return buildFallbackResults(jobs, query);
  }

  return ranked;
}

function dedupeJobs(jobs = []) {
  const seen = new Set();

  return jobs.filter((job) => {
    const key = normalizeValue(
      `${job.title}-${job.company}-${job.location}`
    );

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

async function runSource(sourceName, fetcher) {
  try {
    const jobs = await fetcher();

    return {
      source: sourceName,
      ok: true,
      count: jobs.length,
      jobs,
      warning: null
    };
  } catch (error) {
    return {
      source: sourceName,
      ok: false,
      count: 0,
      jobs: [],
      warning: {
        source: sourceName,
        message: error.message || `${sourceName} failed.`
      }
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Adzuna (primary, filter-accurate source)                                   */
/* -------------------------------------------------------------------------- */

// Map the Country dropdown label to Adzuna's country code.
const ADZUNA_COUNTRY_CODES = {
  'united states': 'us', 'usa': 'us', 'us': 'us',
  'united kingdom': 'gb', 'uk': 'gb', 'great britain': 'gb',
  'canada': 'ca', 'australia': 'au', 'india': 'in',
  'germany': 'de', 'france': 'fr', 'netherlands': 'nl',
  'italy': 'it', 'spain': 'es', 'poland': 'pl',
  'singapore': 'sg', 'new zealand': 'nz'
};

function adzunaConfigured() {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

// Query Adzuna with the user's filters applied SERVER-SIDE (location, salary
// range, employment type, date posted). Returns jobs already normalized to the
// shared schema, so the rest of the app never needs to know the source.
async function fetchAdzunaJobs(query = {}) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  const countryCode =
    ADZUNA_COUNTRY_CODES[normalizeValue(query.country || '')] || 'us';

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: '50',
    'content-type': 'application/json',
    sort_by: 'relevance'
  });

  const what = cleanText(query.search || query.keyword || query.category || 'developer');
  if (what) params.set('what', what);

  // Location is state-level (the City filter was removed).
  const where = cleanText(query.state || '');
  if (where) params.set('where', where);

  const minSalary = Number(query.minSalary || 0);
  const maxSalary = Number(query.maxSalary || 0);
  if (minSalary > 0) params.set('salary_min', String(minSalary));
  if (maxSalary > 0) params.set('salary_max', String(maxSalary));

  const jobType = normalizeValue(query.jobType || '');
  if (jobType === 'full-time' || jobType === 'full time') params.set('full_time', '1');
  else if (jobType === 'part-time' || jobType === 'part time') params.set('part_time', '1');
  else if (jobType === 'contract') params.set('contract', '1');

  const days = Number(query.postedWithinDays || 0);
  if (days > 0) params.set('max_days_old', String(days));

  const url =
    `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/1?${params.toString()}`;
  const data = await fetchJson(url);
  const results = Array.isArray(data && data.results) ? data.results : [];

  return results.slice(0, MAX_JOBS_PER_SOURCE).map((job) => {
    const contractTime = String(job.contract_time || '');
    const contractType = String(job.contract_type || '');
    const jobTypeLabel =
      contractTime === 'part_time' ? 'Part-time'
      : contractTime === 'full_time' ? 'Full-time'
      : contractType === 'contract' ? 'Contract'
      : '';
    return normalizeJob({
      id: getJobId('adzuna', job.id),
      title: job.title,
      company: job.company && job.company.display_name,
      location: job.location && job.location.display_name,
      jobType: jobTypeLabel,
      minSalary: Number(job.salary_min || 0),
      maxSalary: Number(job.salary_max || 0),
      postedAt: job.created || null,
      source: 'Adzuna',
      url: job.redirect_url || '',
      description: job.description,
      skills: job.category && job.category.label ? [job.category.label] : []
    });
  });
}

function buildResultCacheKey(query = {}) {
  return JSON.stringify({
    search: buildSearchText(query),
    country: query.country || '',
    state: query.state || '',
    city: query.city || '',
    jobType: query.jobType || '',
    workMode: query.workMode || '',
    experienceYears: query.experienceYears || '',
    workAuthorization: query.workAuthorization || '',
    minSalary: query.minSalary || '',
    maxSalary: query.maxSalary || '',
    postedWithinDays: query.postedWithinDays || ''
  });
}

export async function fetchAllowedJobs(query = {}) {
  const cacheKey = buildResultCacheKey(query);
  const refreshNumber = Number(query.refreshId || 0);

  // Every explicit Search scrapes live. The only reuse is a very short guard
  // (RESULT_CACHE_TTL_MS) so an accidental double-click does not hit the job
  // boards twice. Changing any filter changes the cache key, so new filters
  // always produce a fresh scrape.
  const forceFresh = Boolean(query.forceFresh);

  if (!refreshNumber && !forceFresh) {
    const cached = getCacheValue(
      resultCache,
      cacheKey,
      RESULT_CACHE_TTL_MS
    );

    if (cached) return cached;
  }

  let sourceResults;

  if (adzunaConfigured()) {
    // Adzuna is the PRIMARY, filter-accurate source. We query it alone so the
    // free remote/company feeds do not reintroduce off-filter noise.
    sourceResults = await Promise.all([
      runSource('Adzuna', () => fetchAdzunaJobs(query))
    ]);

    const adzunaCount = sourceResults.reduce((sum, r) => sum + r.count, 0);

    // Fallback: if Adzuna returns nothing for this exact filter set, widen to
    // the free public feeds so the page is never empty. (The JSearch fallback
    // slots in here next.)
    if (adzunaCount === 0) {
      const fallback = await Promise.all([
        runSource('RemoteOK', () => fetchRemoteOkJobs()),
        runSource('Remotive', () => fetchRemotiveJobs(query)),
        runSource('Arbeitnow', () => fetchArbeitnowJobs()),
        runSource('Jobicy', () => fetchJobicyJobs(query)),
        runSource('The Muse', () => fetchTheMuseJobs(query)),
        runSource('USAJOBS', () => fetchUsaJobs(query))
      ]);
      sourceResults = sourceResults.concat(fallback);
    }
  } else {
    // No Adzuna key configured — fall back to the original free feeds.
    sourceResults = await Promise.all([
      runSource('RemoteOK', () => fetchRemoteOkJobs()),
      runSource('Remotive', () => fetchRemotiveJobs(query)),
      runSource('Arbeitnow', () => fetchArbeitnowJobs()),
      runSource('Jobicy', () => fetchJobicyJobs(query)),
      runSource('Greenhouse', () => fetchGreenhouseJobs()),
      runSource('Lever', () => fetchLeverJobs()),
      runSource('Ashby', () => fetchAshbyJobs()),
      runSource('Workday', () => fetchWorkdayJobs(query)),
      runSource('The Muse', () => fetchTheMuseJobs(query)),
      runSource('USAJOBS', () => fetchUsaJobs(query))
    ]);
  }

  const warnings = sourceResults
    .filter((result) => result.warning)
    .map((result) => result.warning);

  const allJobs = sourceResults.flatMap((result) => result.jobs);
  const uniqueJobs = dedupeJobs(allJobs);
  let sortedJobs = filterAndRankJobs(uniqueJobs, query);

  if (refreshNumber && sortedJobs.length > 10) {
    const rotationStart =
      refreshNumber % Math.min(sortedJobs.length, 50);

    sortedJobs = [
      ...sortedJobs.slice(rotationStart),
      ...sortedJobs.slice(0, rotationStart)
    ];
  }

  sortedJobs = sortedJobs.slice(0, 500);

  const matchSummary = {
    exact: sortedJobs.filter((job) => job.matchStage === 1).length,
    strong: sortedJobs.filter((job) => job.matchStage === 2).length,
    nearby: sortedJobs.filter((job) =>
      [3, 4].includes(job.matchStage)
    ).length,
    recommended: sortedJobs.filter((job) =>
      [5, 6].includes(job.matchStage)
    ).length
  };

  const sourceHealth = sourceResults.map((resultItem) => ({
    source: resultItem.source,
    ok: resultItem.ok,
    count: resultItem.count,
    error: resultItem.warning?.message || null,
    checkedAt: new Date().toISOString()
  }));
  recordSourceHealth(sourceHealth);

  const result = {
    jobs: sortedJobs,
    top10: sortedJobs.slice(0, 10),
    total: sortedJobs.length,
    hasMore: sortedJobs.length > 10,
    warnings,
    sources: sourceHealth.map(({ source, ok, count }) => ({ source, ok, count })),
    matchSummary,
    filters: {
      search: query.search || query.keyword || '',
      keyword: query.keyword || '',
      category: query.category || '',
      country: query.country || '',
      state: query.state || '',
      city: query.city || '',
      jobType: query.jobType || '',
      workMode: query.workMode || '',
      experienceYears: query.experienceYears || '',
      workAuthorization: query.workAuthorization || '',
      minSalary: query.minSalary || '',
      maxSalary: query.maxSalary || '',
      postedWithinDays: query.postedWithinDays || '',
      refreshId: query.refreshId || ''
    }
  };

  setCacheValue(resultCache, cacheKey, result);
  return result;
}
