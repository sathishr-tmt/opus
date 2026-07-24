// Extracted from the original backend/server.js during the Step 2 modular split.
// Code is moved unchanged; only imports/exports were added.

import { google } from 'googleapis';

function decodeBase64Url(value = '') {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function getHeader(headers = [], name = '') {
  const found = headers.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return found?.value || '';
}

function extractMessageBody(payload) {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts?.length) {
    return payload.parts.map((part) => extractMessageBody(part)).join('\n');
  }

  return '';
}

function textMatchesApplication(text = '', application = {}) {
  const lowerText = text.toLowerCase();

  const titleWords = String(application.title || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3);

  const company = String(application.company || '').toLowerCase();

  const companyMatch = company && lowerText.includes(company);
  const titleMatch = titleWords.some((word) => lowerText.includes(word));

  return companyMatch || titleMatch;
}

function getGmailOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/gmail/callback'
  );
}

export {
  decodeBase64Url,
  getHeader,
  extractMessageBody,
  textMatchesApplication,
  getGmailOAuthClient
};
