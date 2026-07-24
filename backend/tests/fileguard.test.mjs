// Upload-guard tests: real files pass, disguised malware is rejected.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { verifyResumeFile } from '../src/fileGuard.js';

function tmp(bytes) {
  const p = path.join(os.tmpdir(), `guard-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(p, Buffer.from(bytes));
  return p;
}

test('accepts a genuine PDF', () => {
  const f = tmp([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
  assert.equal(verifyResumeFile(f).ok, true);
  fs.unlinkSync(f);
});

test('accepts a genuine DOCX (zip container)', () => {
  const f = tmp([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
  assert.equal(verifyResumeFile(f).ok, true);
  fs.unlinkSync(f);
});

test('accepts a legacy DOC', () => {
  const f = tmp([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  assert.equal(verifyResumeFile(f).ok, true);
  fs.unlinkSync(f);
});

test('REJECTS a Windows .exe renamed to resume.pdf', () => {
  const f = tmp([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ
  const r = verifyResumeFile(f);
  assert.equal(r.ok, false);
  assert.match(r.reason, /[Ee]xecutable/);
  fs.unlinkSync(f);
});

test('REJECTS a Linux ELF binary', () => {
  const f = tmp([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
  assert.equal(verifyResumeFile(f).ok, false);
  fs.unlinkSync(f);
});

test('REJECTS a shell script', () => {
  const f = tmp([0x23, 0x21, 0x2f, 0x62, 0x69, 0x6e, 0x2f, 0x73]); // #!/bin/s
  assert.equal(verifyResumeFile(f).ok, false);
  fs.unlinkSync(f);
});

test('REJECTS a plain-text file pretending to be a resume', () => {
  const f = tmp([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x0a]); // "hello\n"
  assert.equal(verifyResumeFile(f).ok, false);
  fs.unlinkSync(f);
});

test('REJECTS an empty file', () => {
  const f = tmp([]);
  assert.equal(verifyResumeFile(f).ok, false);
  fs.unlinkSync(f);
});
