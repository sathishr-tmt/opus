// Workday source tests. The network is stubbed, so these verify URL
// construction, description extraction and graceful failure - not live data.
import test from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
const realFetch = globalThis.fetch;

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), method: options.method || 'GET' });

  // Job listing endpoint
  if (String(url).endsWith('/jobs')) {
    return { ok: true, status: 200, json: async () => ({
      total: 2,
      jobPostings: [
        { title: 'Senior Java Engineer', externalPath: '/job/Dallas/Senior-Java-Engineer_JR-1001',
          locationsText: 'Dallas, TX', postedOn: 'Posted 3 Days Ago',
          bulletFields: ['JR-1001'] },
        { title: 'Data Analyst', externalPath: '/job/Remote/Data-Analyst_JR-1002',
          locationsText: 'Remote', postedOn: 'Posted Today', bulletFields: ['JR-1002'] }
      ]
    })};
  }

  // Job detail endpoint
  if (String(url).includes('/job/')) {
    if (String(url).includes('JR-1002')) throw new Error('detail unavailable');
    return { ok: true, status: 200, json: async () => ({
      jobPostingInfo: {
        jobDescription: '<p>We need <b>Java</b>, Spring Boot &amp; Kafka.</p><ul><li>5+ years</li></ul>',
        location: 'Dallas, TX', timeType: 'Full time', startDate: '2026-07-01',
        externalUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Dallas/Senior-Java-Engineer_JR-1001'
      }
    })};
  }

  return { ok: false, status: 404, json: async () => ({}) };
};

process.env.WORKDAY_SOURCES = JSON.stringify([
  { name: 'Acme', url: 'https://acme.wd5.myworkdayjobs.com/Careers' }
]);

const { fetchAllowedJobs } = await import('../jobSources.js');

test('calls the documented listing and detail endpoints', async () => {
  calls.length = 0;
  await fetchAllowedJobs({ role: 'Java Developer' });

  const listing = calls.find((c) => c.url.includes('/wday/cxs/acme/Careers/jobs'));
  assert.ok(listing, 'listing endpoint not called');
  assert.equal(listing.method, 'POST', 'listing must be POST');

  const detail = calls.find((c) => c.url.includes('/wday/cxs/acme/Careers/job/'));
  assert.ok(detail, 'detail endpoint not called');
});

test('extracts the real description as clean text', async () => {
  const { jobs } = await fetchAllowedJobs({});
  const job = jobs.find((j) => j.title === 'Senior Java Engineer');

  assert.ok(job, 'job missing');
  assert.match(job.description, /Java/);
  assert.match(job.description, /Spring Boot & Kafka/, 'HTML entities not decoded');
  assert.ok(!/<[a-z]/i.test(job.description), 'HTML tags leaked into description');
});

test('apply URL points at the public posting page', async () => {
  const { jobs } = await fetchAllowedJobs({});
  const job = jobs.find((j) => j.title === 'Senior Java Engineer');

  assert.ok(job.url.startsWith('https://acme.wd5.myworkdayjobs.com/'));
  assert.ok(job.url.includes('JR-1001'));
});

test('a failed detail call still yields a usable job', async () => {
  const { jobs } = await fetchAllowedJobs({});
  const job = jobs.find((j) => j.title === 'Data Analyst');

  assert.ok(job, 'job dropped when detail failed');
  assert.match(job.description, /Data Analyst/, 'no fallback summary');
  assert.ok(job.url.includes('JR-1002'));
});

test('source is labelled Workday', async () => {
  const { jobs } = await fetchAllowedJobs({});
  const job = jobs.find((j) => j.title === 'Senior Java Engineer');
  assert.equal(job.source, 'Workday');
  assert.equal(job.company, 'Acme');
});

test.after(() => { globalThis.fetch = realFetch; });
