// ATS match scoring.
//
// Produces the "ATS %" shown next to every job in Job Search: how well the
// signed-in user's profile matches one job posting, plus the skills that
// matched and the ones that are missing.
//
// This implementation is deterministic and runs offline — no API key, no cost,
// no network call. `scoreJob()` is the single entry point, so an AI-backed
// scorer can be substituted later without touching the callers.

// Skills the scorer recognises inside free-text job descriptions. Each entry is
// [canonical name, ...aliases]. Aliases are matched case-insensitively on word
// boundaries, so "React" does not match "reactive".
const SKILL_DICTIONARY = [
  ['Java', 'java', 'core java', 'java 8', 'java 11', 'java 17'],
  ['Spring Boot', 'spring boot', 'springboot'],
  ['Spring', 'spring framework', 'spring mvc'],
  ['Hibernate', 'hibernate', 'jpa'],
  ['JavaScript', 'javascript', 'es6', 'ecmascript'],
  ['TypeScript', 'typescript'],
  ['React', 'react', 'react.js', 'reactjs'],
  ['Angular', 'angular', 'angularjs'],
  ['Vue', 'vue', 'vue.js', 'vuejs'],
  ['Node.js', 'node.js', 'nodejs', 'node'],
  ['Express', 'express', 'express.js'],
  ['Python', 'python'],
  ['Django', 'django'],
  ['Flask', 'flask'],
  ['FastAPI', 'fastapi'],
  ['C#', 'c#', 'csharp'],
  ['.NET', '.net', 'dotnet', 'asp.net'],
  ['Go', 'golang'],
  ['Ruby', 'ruby', 'ruby on rails', 'rails'],
  ['PHP', 'php', 'laravel'],
  ['SQL', 'sql'],
  ['PostgreSQL', 'postgresql', 'postgres'],
  ['MySQL', 'mysql'],
  ['MongoDB', 'mongodb', 'mongo'],
  ['Redis', 'redis'],
  ['Elasticsearch', 'elasticsearch', 'opensearch'],
  ['Kafka', 'kafka'],
  ['RabbitMQ', 'rabbitmq'],
  ['REST', 'rest', 'rest api', 'restful'],
  ['GraphQL', 'graphql'],
  ['Microservices', 'microservices', 'microservice'],
  ['AWS', 'aws', 'amazon web services'],
  ['Azure', 'azure'],
  ['GCP', 'gcp', 'google cloud'],
  ['Docker', 'docker'],
  ['Kubernetes', 'kubernetes', 'k8s'],
  ['Terraform', 'terraform'],
  ['Jenkins', 'jenkins'],
  ['CI/CD', 'ci/cd', 'cicd', 'continuous integration'],
  ['Git', 'git', 'github', 'gitlab'],
  ['Linux', 'linux', 'unix'],
  ['Agile', 'agile', 'scrum'],
  ['Jira', 'jira'],
  ['HTML', 'html', 'html5'],
  ['CSS', 'css', 'css3', 'sass', 'scss'],
  ['Tailwind', 'tailwind', 'tailwindcss'],
  ['Bootstrap', 'bootstrap'],
  ['Redux', 'redux'],
  ['Next.js', 'next.js', 'nextjs'],
  ['Testing', 'unit testing', 'junit', 'jest', 'pytest', 'selenium'],
  ['Machine Learning', 'machine learning', 'ml'],
  ['TensorFlow', 'tensorflow'],
  ['PyTorch', 'pytorch'],
  ['Pandas', 'pandas'],
  ['NumPy', 'numpy'],
  ['Spark', 'spark', 'pyspark'],
  ['Hadoop', 'hadoop'],
  ['Tableau', 'tableau'],
  ['Power BI', 'power bi', 'powerbi'],
  ['Excel', 'excel'],
  ['Salesforce', 'salesforce', 'apex'],
  ['SAP', 'sap'],
  ['Snowflake', 'snowflake'],
  ['Airflow', 'airflow'],
  ['DBT', 'dbt'],
  ['ETL', 'etl'],
  ['Figma', 'figma'],
  ['Swift', 'swift', 'ios'],
  ['Kotlin', 'kotlin', 'android'],
  ['Flutter', 'flutter', 'dart'],
  ['React Native', 'react native']
];

// Seniority words, used to compare the job's level with the user's experience.
const SENIORITY = [
  { level: 3, words: ['principal', 'staff', 'lead', 'architect', 'head of'] },
  { level: 2, words: ['senior', 'sr.', 'sr '] },
  { level: 1, words: ['mid-level', 'mid level', 'intermediate'] },
  { level: 0, words: ['junior', 'jr.', 'entry level', 'entry-level', 'graduate', 'intern'] }
];

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'our', 'are', 'will', 'this', 'that',
  'have', 'from', 'your', 'who', 'all', 'can', 'has', 'not', 'but', 'they',
  'job', 'work', 'team', 'role', 'developer', 'engineer', 'experience'
]);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True when `alias` appears in `text` as a whole word/phrase.
function containsTerm(text, alias) {
  const pattern = new RegExp(`(^|[^a-z0-9+#.])${escapeRegex(alias)}([^a-z0-9+#]|$)`, 'i');
  return pattern.test(text);
}

// Canonical skill names found anywhere in the supplied text.
function extractSkills(text = '') {
  const haystack = ` ${String(text).toLowerCase()} `;
  const found = [];

  for (const [canonical, ...aliases] of SKILL_DICTIONARY) {
    const terms = [canonical.toLowerCase(), ...aliases];
    if (terms.some((alias) => containsTerm(haystack, alias))) {
      found.push(canonical);
    }
  }

  return found;
}

function detectSeniority(text = '') {
  const haystack = ` ${String(text).toLowerCase()} `;

  for (const entry of SENIORITY) {
    if (entry.words.some((word) => haystack.includes(word))) {
      return entry.level;
    }
  }

  return null;
}

// Smallest number of years the posting asks for, e.g. "5+ years" -> 5.
function requiredYears(text = '') {
  const matches = String(text)
    .toLowerCase()
    .matchAll(/(\d{1,2})\s*\+?\s*(?:to|-|–)?\s*(?:\d{1,2})?\s*(?:\+)?\s*years?/g);

  const values = [...matches].map((match) => Number(match[1])).filter((n) => n > 0 && n < 30);
  return values.length ? Math.min(...values) : null;
}

// Meaningful words shared between the user's target title and the job title.
function titleOverlap(userTitle = '', jobTitle = '') {
  const tokenize = (value) =>
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9+#. ]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  const userWords = new Set(tokenize(userTitle));
  const jobWords = tokenize(jobTitle);

  if (!userWords.size || !jobWords.length) return 0;

  const shared = jobWords.filter((word) => userWords.has(word)).length;
  return shared / jobWords.length;
}


// ---------------------------------------------------------------------------
// Work-authorization requirements stated in a posting.
//
// These are HARD blockers rather than soft preferences: no amount of skill
// overlap makes up for a clearance the candidate does not hold. They are
// reported separately from the score so the UI can call them out plainly.
// ---------------------------------------------------------------------------
const AUTH_SIGNALS = [
  {
    key: 'no_sponsorship',
    label: 'Does not sponsor visas',
    patterns: [
      'not able to sponsor', 'unable to sponsor', 'no sponsorship',
      'without sponsorship', 'do not offer sponsorship', 'does not offer sponsorship',
      'not provide sponsorship', 'no visa sponsorship'
    ],
    // Authorisations that satisfy the requirement anyway.
    satisfiedBy: ['citizen', 'green card', 'permanent resident', 'gc', 'ead', 'authorized', 'authorised', 'no sponsorship required']
  },
  {
    key: 'citizen_required',
    label: 'Requires citizenship',
    patterns: ['must be a u.s. citizen', 'us citizen', 'u.s. citizen', 'citizenship required'],
    satisfiedBy: ['citizen']
  },
  {
    key: 'clearance_required',
    label: 'Requires security clearance',
    patterns: ['security clearance', 'secret clearance', 'ts/sci', 'top secret'],
    satisfiedBy: ['clearance', 'cleared']
  }
];

function checkAuthorization(profile = {}, jobText = '') {
  const haystack = ` ${String(jobText).toLowerCase()} `;
  const authorization = String(profile.workAuthorization || '').toLowerCase();

  const blockers = [];
  let stated = false;

  for (const signal of AUTH_SIGNALS) {
    if (!signal.patterns.some((pattern) => haystack.includes(pattern))) continue;

    stated = true;
    const satisfied =
      Boolean(authorization) &&
      signal.satisfiedBy.some((term) => authorization.includes(term));

    if (!satisfied) {
      blockers.push({
        label: signal.label,
        // An unknown authorisation is a warning; a known mismatch is a blocker.
        severity: authorization ? 'blocker' : 'unknown'
      });
    }
  }

  if (!stated) return { score: null, blockers: [] };
  if (!blockers.length) return { score: 100, blockers: [] };

  const hasHard = blockers.some((b) => b.severity === 'blocker');
  return { score: hasHard ? 0 : 50, blockers };
}

function normalizeUserSkills(profile = {}) {
  const raw = profile.skills;

  const asText = Array.isArray(raw)
    ? raw.join(', ')
    : String(raw || '');

  // Recognised skills from the free-text field, plus any custom entries typed
  // by the user that the dictionary does not know about.
  const recognised = extractSkills(asText);
  const custom = asText
    .split(/[,;|\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && part.length < 40);

  return {
    recognised: new Set(recognised),
    all: [...new Set([...recognised, ...custom])],
    text: `${asText} ${profile.professionalTitle || ''} ${profile.about || ''}`
  };
}

/**
 * Score one job against one user profile.
 *
 * Weighting:
 *   60%  skill overlap with the skills the posting asks for
 *   20%  job-title relevance to the user's target title
 *   10%  years of experience versus what the posting requires
 *   10%  work-mode / location fit
 *
 * @returns {{score:number, matched:string[], missing:string[], reasons:string[]}}
 */
function scoreJob(profile = {}, job = {}) {
  const jobText = [
    job.title,
    job.description,
    Array.isArray(job.skills) ? job.skills.join(' ') : job.skills,
    job.jobType,
    job.workMode
  ]
    .filter(Boolean)
    .join(' \n ');

  const userSkills = normalizeUserSkills(profile);
  const userSkillSet = new Set(
    [...userSkills.recognised, ...extractSkills(userSkills.text)]
  );

  // Skills the posting asks for: dictionary hits in the text, plus any explicit
  // skill tags the source provided.
  const requested = new Set(extractSkills(jobText));
  for (const tag of Array.isArray(job.skills) ? job.skills : []) {
    for (const skill of extractSkills(String(tag))) {
      requested.add(skill);
    }
  }

  const requestedList = [...requested];
  const matched = requestedList.filter((skill) => userSkillSet.has(skill));
  const missing = requestedList.filter((skill) => !userSkillSet.has(skill));

  const reasons = [];
  const overlap = titleOverlap(profile.professionalTitle || '', job.title || '');

  // 1. Skills (60 points).
  let skillPoints;
  if (!requestedList.length) {
    // No recognisable skills in the posting. Falling back to a flat neutral
    // score would rank an unrelated job (e.g. "Office Coordinator") above a
    // technical job the user simply lacks the stack for, so lean on how
    // relevant the job title is instead.
    skillPoints = 20 + overlap * 40;
    reasons.push('The posting does not list specific technical skills.');
  } else {
    skillPoints = (matched.length / requestedList.length) * 60;
    reasons.push(
      `Matched ${matched.length} of ${requestedList.length} requested skills.`
    );
  }

  // 2. Title relevance (20 points).
  const titlePoints = overlap * 20;
  if (profile.professionalTitle) {
    reasons.push(
      overlap >= 0.5
        ? 'Job title closely matches your target role.'
        : overlap > 0
        ? 'Job title partly matches your target role.'
        : 'Job title differs from your target role.'
    );
  }

  // 3. Experience (10 points).
  const userYears = Number(profile.experienceYears || 0);
  const needYears = requiredYears(jobText);
  const jobLevel = detectSeniority(job.title || '');
  let experiencePoints = 7; // neutral default when the posting says nothing

  if (needYears !== null) {
    if (userYears >= needYears) {
      experiencePoints = 10;
      reasons.push(`Meets the ${needYears}+ years of experience requested.`);
    } else if (userYears >= needYears - 1) {
      experiencePoints = 7;
      reasons.push(`Slightly under the ${needYears}+ years requested.`);
    } else {
      experiencePoints = 3;
      reasons.push(`Asks for ${needYears}+ years; your profile lists ${userYears}.`);
    }
  } else if (jobLevel !== null && userYears) {
    const impliedLevel = userYears >= 8 ? 3 : userYears >= 5 ? 2 : userYears >= 2 ? 1 : 0;
    experiencePoints = impliedLevel >= jobLevel ? 10 : impliedLevel === jobLevel - 1 ? 6 : 3;
  }

  // 4. Work mode and location (10 points).
  let fitPoints = 6; // neutral default
  const preferredMode = String(profile.preferredWorkMode || '').toLowerCase();
  const jobMode = String(job.workMode || '').toLowerCase();

  if (preferredMode && jobMode) {
    if (jobMode.includes(preferredMode) || preferredMode.includes(jobMode)) {
      fitPoints = 10;
      reasons.push(`Work mode matches your preference (${job.workMode}).`);
    } else if (jobMode.includes('remote')) {
      fitPoints = 8;
    } else {
      fitPoints = 4;
      reasons.push(`Work mode is ${job.workMode}; you prefer ${profile.preferredWorkMode}.`);
    }
  } else if (jobMode.includes('remote')) {
    fitPoints = 8;
  }

  const userLocation = String(profile.location || '').toLowerCase();
  const jobLocation = String(job.location || '').toLowerCase();
  if (userLocation && jobLocation && jobLocation.includes('remote')) {
    fitPoints = Math.max(fitPoints, 8);
  }

  const total = skillPoints + titlePoints + experiencePoints + fitPoints;

  // Keep the displayed number in a believable ATS range.
  const score = Math.max(25, Math.min(99, Math.round(total)));

  // Skills the candidate has that this posting did NOT ask for. Genuine
  // strengths worth surfacing, but they do not inflate the score.
  const bonus = [...userSkillSet]
    .filter((skill) => !requested.has(skill))
    .slice(0, 10);

  // Each dimension expressed 0-100 so the UI can draw comparable bars.
  // These are the SAME calculations used for the total, just not yet weighted,
  // so the bars always agree with the headline number.
  const pct = (points, max) => Math.round((points / max) * 100);

  const authorization = checkAuthorization(profile, jobText);

  const breakdown = {
    skills: requestedList.length
      ? Math.round((matched.length / requestedList.length) * 100)
      : pct(skillPoints, 60),
    title: pct(titlePoints, 20),
    experience: pct(experiencePoints, 10),
    location: pct(fitPoints, 10)
  };

  // Seniority is reported separately because it is the clearest signal of an
  // over- or under-levelled application.
  const userYearsForLevel = Number(profile.experienceYears || 0);
  const impliedLevel =
    userYearsForLevel >= 8 ? 3 : userYearsForLevel >= 5 ? 2 : userYearsForLevel >= 2 ? 1 : 0;

  if (jobLevel === null) {
    breakdown.seniority = null; // posting does not state a level
  } else {
    const gap = Math.abs(impliedLevel - jobLevel);
    breakdown.seniority = gap === 0 ? 100 : gap === 1 ? 60 : gap === 2 ? 30 : 10;
  }

  breakdown.authorization = authorization.score;

  for (const blocker of authorization.blockers) {
    reasons.push(
      blocker.severity === 'blocker'
        ? `${blocker.label} — your profile says "${profile.workAuthorization}".`
        : `${blocker.label} — add your work authorization to Profile & Resume to check this.`
    );
  }

  return {
    score,
    matched,
    missing: missing.slice(0, 8),
    bonus,
    breakdown,
    blockers: authorization.blockers,
    requestedCount: requestedList.length,
    reasons
  };
}

// Attach `atsScore`, `atsMatched`, and `atsMissing` to a list of jobs.
// A profile with no skills yields a null score so the UI can prompt the user
// to complete their profile instead of showing a misleading number.
function attachAtsScores(profile = {}, jobs = []) {
  const hasProfile = Boolean(
    (Array.isArray(profile.skills) ? profile.skills.length : String(profile.skills || '').trim()) ||
      profile.professionalTitle
  );

  if (!hasProfile) {
    return jobs.map((job) => ({
      ...job,
      atsScore: null,
      atsMatched: [],
      atsMissing: [],
      atsBonus: [],
      atsBreakdown: null,
      atsReasons: ['Add your skills and target role in Profile & Resume to see ATS scores.']
    }));
  }

  return jobs.map((job) => {
    const result = scoreJob(profile, job);
    return {
      ...job,
      atsScore: result.score,
      atsMatched: result.matched,
      atsMissing: result.missing,
      atsBonus: result.bonus,
      atsBreakdown: result.breakdown,
      atsReasons: result.reasons
    };
  });
}

export {
  scoreJob,
  attachAtsScores,
  extractSkills,
  requiredYears,
  titleOverlap,
  SKILL_DICTIONARY
};
