// Unit tests for tailored resume generation (no database, no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTailoredResume, tailoredFileName, prioritiseSkills } from '../src/resumeBuilder.js';

const profile = {
  name: 'Sathish Reddy', email: 'sathish@example.com', phone: '+1 555 012 3456',
  location: 'Dallas, TX', professionalTitle: 'Java Backend Developer',
  experienceYears: 4, skills: 'Java, Spring Boot, Hibernate, REST, MySQL, Git, Docker, React',
  about: 'Built and maintained microservices.', workAuthorization: 'H1B',
  preferredWorkMode: 'Remote'
};

const job = {
  title: 'Senior Java Developer', company: 'Acme Corp', location: 'Remote', workMode: 'Remote',
  description: '5+ years of Java, Spring Boot, Hibernate, REST APIs, MySQL, Kafka, Docker and Kubernetes.'
};

test('produces a valid PDF', async () => {
  const { buffer } = await buildTailoredResume(profile, job);
  assert.equal(buffer.slice(0, 5).toString(), '%PDF-');
  assert.ok(buffer.length > 1000, 'PDF should have real content');
});

test('returns the job match score and skill gaps', async () => {
  const { score, matched, missing } = await buildTailoredResume(profile, job);
  assert.ok(score > 0 && score <= 99);
  assert.ok(matched.includes('Java'));
  assert.ok(missing.includes('Kafka'));
});

test('promotes job-relevant skills above the rest', () => {
  const { matched, ordered } = prioritiseSkills(
    ['React', 'Java', 'Docker', 'Git'],
    ['Java', 'Docker']
  );
  assert.deepEqual(matched, ['Java', 'Docker']);
  assert.equal(ordered[0], 'Java');
  assert.ok(ordered.indexOf('Java') < ordered.indexOf('React'));
});

test('builds a safe, descriptive file name', () => {
  const name = tailoredFileName(job, 74);
  assert.match(name, /^Senior_Java_Developer_Acme_Corp_74pct\.pdf$/);
  assert.ok(!/[^\w.]/.test(name.replace(/\.pdf$/, '')), 'no unsafe characters');
});

test('works when the profile is sparse', async () => {
  const { buffer, score } = await buildTailoredResume(
    { name: 'A', skills: 'Java' }, job
  );
  assert.equal(buffer.slice(0, 5).toString(), '%PDF-');
  assert.ok(score >= 25);
});
