// Unit tests for the ATS scoring service (no database required).
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreJob, extractSkills, requiredYears, attachAtsScores } from '../src/ats.js';

const javaDev = {
  professionalTitle: 'Java Backend Developer',
  experienceYears: 4,
  skills: 'Java, Spring Boot, Hibernate, REST, MySQL, Git, Docker',
  preferredWorkMode: 'Remote'
};

const perfectJob = { title: 'Java Developer', workMode: 'Remote',
  description: '3+ years Java, Spring Boot, REST, MySQL, Git.' };
const stretchJob = { title: 'Senior Java Developer', workMode: 'Remote',
  description: '5+ years Java, Spring Boot, Kafka, Kubernetes, MySQL.' };
const wrongJob = { title: 'Machine Learning Engineer', workMode: 'Onsite',
  description: 'Python, TensorFlow, PyTorch, Spark. 6+ years.' };

test('extracts skills without false positives', () => {
  assert.ok(extractSkills('We use Java and Spring Boot').includes('Java'));
  assert.deepEqual(extractSkills('reactive streams'), []);
  assert.ok(extractSkills('k8s and postgres').includes('Kubernetes'));
});

test('parses required years', () => {
  assert.equal(requiredYears('5+ years required'), 5);
  assert.equal(requiredYears('3 to 5 years'), 3);
  assert.equal(requiredYears('no numbers here'), null);
});

test('scores a well-matched job highly', () => {
  const r = scoreJob(javaDev, perfectJob);
  assert.ok(r.score >= 85, `expected >=85, got ${r.score}`);
  assert.ok(r.matched.includes('Java'));
});

test('penalises missing skills and unmet experience', () => {
  const strong = scoreJob(javaDev, perfectJob).score;
  const stretch = scoreJob(javaDev, stretchJob).score;
  assert.ok(stretch < strong, 'stretch job should score lower');
  assert.ok(scoreJob(javaDev, stretchJob).missing.includes('Kafka'));
});

test('scores an unrelated job low', () => {
  assert.ok(scoreJob(javaDev, wrongJob).score < 40);
});

test('ranks relevant jobs above irrelevant ones', () => {
  const s = (j) => scoreJob(javaDev, j).score;
  assert.ok(s(perfectJob) > s(stretchJob));
  assert.ok(s(stretchJob) > s(wrongJob));
});

test('score always stays within 25-99', () => {
  for (const job of [perfectJob, stretchJob, wrongJob, {}, { title: '' }]) {
    const { score } = scoreJob(javaDev, job);
    assert.ok(score >= 25 && score <= 99, `out of range: ${score}`);
  }
});

test('returns null score when the profile is empty', () => {
  const [job] = attachAtsScores({}, [perfectJob]);
  assert.equal(job.atsScore, null);
  assert.ok(job.atsReasons[0].includes('Profile'));
});

test('is deterministic', () => {
  assert.equal(scoreJob(javaDev, perfectJob).score, scoreJob(javaDev, perfectJob).score);
});
