// Search behaviour rules: never zero results, freshness priority,
// filters always drive the output, and every search scrapes fresh.
import test from 'node:test';
import assert from 'node:assert/strict';

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
let fetchCount = 0;
const realFetch = globalThis.fetch;

// One fake source whose jobs vary by the search text sent to it.
globalThis.fetch = async (url, options = {}) => {
  fetchCount += 1;
  const body = options.body ? JSON.parse(options.body) : {};
  const term = String(body.searchText || '').toLowerCase();

  if (String(url).endsWith('/jobs')) {
    const pool = term.includes('data')
      ? [{ title: 'Data Analyst', externalPath: '/job/Chicago/Data-Analyst_1',
           locationsText: 'Chicago, IL', postedOn: 'Posted Today', bulletFields: [] }]
      : [
          { title: 'Java Developer', externalPath: '/job/Dallas/Java-Dev_1',
            locationsText: 'Dallas, TX', postedOn: 'Posted Today', bulletFields: [] },
          { title: 'Senior Java Developer', externalPath: '/job/Remote/Java-Dev_2',
            locationsText: 'Remote', postedOn: 'Posted 20 Days Ago', bulletFields: [] }
        ];
    return { ok: true, status: 200, json: async () => ({ jobPostings: pool }) };
  }

  if (String(url).includes('/job/')) {
    const old = String(url).includes('_2');
    return { ok: true, status: 200, json: async () => ({ jobPostingInfo: {
      jobDescription: '<p>Java, Spring Boot, REST. Remote friendly.</p>',
      startDate: old ? daysAgo(20) : daysAgo(1),
      location: 'Dallas, TX', timeType: 'Full time'
    }})};
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

process.env.WORKDAY_SOURCES = JSON.stringify([
  { name: 'TestCo', url: 'https://test.wd5.myworkdayjobs.com/Careers' }
]);

const { fetchAllowedJobs } = await import('../jobSources.js');

test('a search never returns zero results', async () => {
  // Deliberately impossible combination.
  const { jobs } = await fetchAllowedJobs({
    role: 'Java Developer', city: 'Antarctica', workMode: 'Hybrid',
    minSalary: 900000, experienceYears: 25, forceFresh: true
  });

  assert.ok(jobs.length > 0, 'search returned an empty list');
  assert.ok(jobs[0].relaxedFilters?.length, 'widening was not labelled');
});

test('fresh jobs rank above old ones', async () => {
  const { jobs } = await fetchAllowedJobs({ role: 'Java Developer', forceFresh: true });
  const fresh = jobs.findIndex((j) => j.title === 'Java Developer');
  const old = jobs.findIndex((j) => j.title === 'Senior Java Developer');

  if (fresh !== -1 && old !== -1) {
    assert.ok(fresh < old, 'a 20-day-old job outranked a 1-day-old job');
  }
});

test('old jobs are still shown, not hidden', async () => {
  const { jobs } = await fetchAllowedJobs({ role: 'Java Developer', forceFresh: true });
  assert.ok(jobs.length >= 2, 'older job was dropped instead of ranked lower');
});

test('different filters produce different results', async () => {
  const a = await fetchAllowedJobs({ role: 'Java Developer', search: 'java', forceFresh: true });
  const b = await fetchAllowedJobs({ role: 'Data Analyst', search: 'data', forceFresh: true });

  const titlesA = a.jobs.map((j) => j.title).join('|');
  const titlesB = b.jobs.map((j) => j.title).join('|');
  assert.notEqual(titlesA, titlesB, 'changing filters returned identical results');
});

test('every search scrapes live rather than reusing results', async () => {
  const query = { role: 'Java Developer', search: 'java', forceFresh: true };

  await fetchAllowedJobs(query);
  const before = fetchCount;
  await fetchAllowedJobs(query);

  assert.ok(fetchCount > before, 'second identical search did not re-scrape');
});

test.after(() => { globalThis.fetch = realFetch; });
