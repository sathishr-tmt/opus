// Unit tests for the unified saved+applied merge logic.
// Uses a stubbed repos layer so no database is required.
import test from 'node:test';
import assert from 'node:assert/strict';

const savedRows = [
  { jobId: 'j1', createdAt: '2026-07-10T10:00:00Z',
    snapshot: { id:'j1', title:'Java Developer', company:'Acme', location:'Remote',
      description:'Java, Spring Boot, REST, MySQL', skills:['Java'] } },
  { jobId: 'j2', createdAt: '2026-07-12T10:00:00Z',
    snapshot: { id:'j2', title:'Backend Engineer', company:'Stripe', location:'Remote',
      description:'Java, Kafka, Kubernetes' } },
  // saved AND later applied -> must appear once, as applied
  { jobId: 'j3', createdAt: '2026-07-01T10:00:00Z',
    snapshot: { id:'j3', title:'Spring Developer', company:'Databricks' } }
];

const applicationRows = [
  { id:'a1', userId:'u1', jobId:'j3', title:'Spring Developer', company:'Databricks',
    status:'Under Review', appliedAt:'2026-07-14T10:00:00Z', updatedAt:'2026-07-14T10:00:00Z' },
  { id:'a2', userId:'u1', jobId:'j9', title:'Data Analyst', company:'Nova',
    status:'Applied', appliedAt:'2026-07-05T10:00:00Z', updatedAt:'2026-07-05T10:00:00Z' }
];

// Stub the modules myJobs.js imports.
const { register } = await import('node:module');
import { pathToFileURL } from 'node:url';
register('../stub-loader.mjs', import.meta.url);

const { getMyJobs } = await import('../src/myJobs.js');
globalThis.__stub = { savedRows, applicationRows };

const profile = { professionalTitle:'Java Backend Developer', experienceYears:4,
  skills:'Java, Spring Boot, REST, MySQL' };

test('merges saved and applied, newest first', async () => {
  const r = await getMyJobs('u1', profile, { limit: 20 });
  assert.equal(r.total, 4, 'j1,j2 saved + j3,j9 applied');
  assert.equal(r.entries[0].jobId, 'j3', 'newest is the j3 application');
});

test('a saved job that was applied to appears once, as applied', async () => {
  const r = await getMyJobs('u1', profile, { limit: 20 });
  const j3 = r.entries.filter((e) => e.jobId === 'j3');
  assert.equal(j3.length, 1);
  assert.equal(j3[0].kind, 'applied');
});

test('counts saved and applied separately', async () => {
  const r = await getMyJobs('u1', profile, { limit: 20 });
  assert.equal(r.appliedCount, 2);
  assert.equal(r.savedCount, 2);
});

test('saved entries allow rewrite, applied entries do not', async () => {
  const r = await getMyJobs('u1', profile, { limit: 20 });
  for (const e of r.entries) {
    assert.equal(e.canRewrite, e.kind === 'saved', `${e.jobId} canRewrite wrong`);
  }
});

test('ATS score present on saved, absent on applied', async () => {
  const r = await getMyJobs('u1', profile, { limit: 20 });
  const saved = r.entries.find((e) => e.kind === 'saved');
  const applied = r.entries.find((e) => e.kind === 'applied');
  assert.ok(saved.atsScore > 0, 'saved should be scored');
  assert.equal(applied.atsScore, null, 'applied should not be scored');
});

test('paginates in blocks', async () => {
  const page1 = await getMyJobs('u1', profile, { offset: 0, limit: 2 });
  assert.equal(page1.entries.length, 2);
  assert.equal(page1.hasMore, true);

  const page2 = await getMyJobs('u1', profile, { offset: 2, limit: 2 });
  assert.equal(page2.entries.length, 2);
  assert.equal(page2.hasMore, false);

  const ids = [...page1.entries, ...page2.entries].map((e) => e.entryId);
  assert.equal(new Set(ids).size, 4, 'no duplicates across pages');
});
