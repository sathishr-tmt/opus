// Extracted from the original backend/server.js during the Step 2 modular split.
// Code is moved unchanged; only imports/exports were added.

import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, FRONTEND_URL } from '../config.js';
import { listApplications, getGmailAccount, upsertGmailAccount } from '../repos.js';
import { escapeHtml } from '../email.js';
import { getHeader, extractMessageBody, textMatchesApplication, getGmailOAuthClient } from '../gmailUtil.js';
import { requireAuth, requireRole } from '../security.js';

export default function registerGmailRoutes(app) {
  app.get(
    '/api/gmail/status',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const account = await getGmailAccount(req.user.id);

      return res.json({
        connected: Boolean(account.tokens),
        connectedAt: account.status.connectedAt || null,
        lastCheckedAt: account.status.lastCheckedAt || null,
        alerts: account.status.alerts || []
      });
    }
  );

  app.get(
    '/api/gmail/auth-url',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(400).json({
          message:
            'Gmail OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.'
        });
      }

      const oauth2Client = getGmailOAuthClient();
      const state = jwt.sign(
        {
          purpose: 'gmail_oauth',
          userId: req.user.id
        },
        JWT_SECRET,
        { expiresIn: '10m' }
      );

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        state,
        scope: ['https://www.googleapis.com/auth/gmail.readonly']
      });

      return res.json({ authUrl });
    }
  );

  app.get('/api/gmail/callback', async (req, res) => {
    try {
      const code = String(req.query.code || '');
      const state = String(req.query.state || '');

      if (!code || !state) {
        return res.status(400).send('Missing Gmail authorization information.');
      }

      const decodedState = jwt.verify(state, JWT_SECRET);

      if (
        decodedState.purpose !== 'gmail_oauth' ||
        !decodedState.userId
      ) {
        return res.status(400).send('Invalid Gmail authorization state.');
      }

      const oauth2Client = getGmailOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);
      const currentAccount = await getGmailAccount(decodedState.userId);

      await upsertGmailAccount(decodedState.userId, {
        tokens,
        status: {
          ...currentAccount.status,
          connected: true,
          connectedAt: new Date().toISOString(),
          alerts: currentAccount.status.alerts || []
        }
      });

      return res.send(`
        <!doctype html>
        <html>
          <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
            <div style="max-width:560px;margin:70px auto;padding:24px;">
              <div style="background:#fff;border:1px solid #e2e8f0;border-radius:22px;padding:32px;text-align:center;">
                <div style="font-size:13px;font-weight:800;color:#7c3aed;letter-spacing:.08em;text-transform:uppercase;">OPUS</div>
                <h1 style="margin:16px 0 10px;">Gmail connected successfully</h1>
                <p style="color:#475569;line-height:1.7;">Return to the OPUS dashboard and select Check Email Responses.</p>
                <a href="${escapeHtml(`${FRONTEND_URL}/dashboard`)}" style="display:inline-block;margin-top:18px;padding:13px 20px;border-radius:12px;background:#7c3aed;color:#fff;text-decoration:none;font-weight:800;">Return to OPUS</a>
              </div>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Gmail callback failed:', error);

      return res.status(500).send(`
        <!doctype html>
        <html>
          <body style="font-family:Arial;padding:40px;">
            <h2>Gmail connection failed</h2>
            <p>${escapeHtml(error.message || 'Unknown Gmail OAuth error.')}</p>
          </body>
        </html>
      `);
    }
  });

  app.get(
    '/api/gmail/check-responses',
    requireAuth,
    requireRole('user'),
    async (req, res) => {
      const account = await getGmailAccount(req.user.id);

      if (!account.tokens) {
        return res.status(400).json({
          message: 'Gmail is not connected yet.'
        });
      }

      const applications = await listApplications({ userId: req.user.id });

      if (!applications.length) {
        const nextStatus = {
          ...account.status,
          connected: true,
          lastCheckedAt: new Date().toISOString(),
          alerts: []
        };

        await upsertGmailAccount(req.user.id, {
          tokens: account.tokens,
          status: nextStatus
        });

        return res.json({
          message: 'No applications are being tracked yet.',
          alerts: []
        });
      }

      try {
        const oauth2Client = getGmailOAuthClient();
        oauth2Client.setCredentials(account.tokens);

        const gmail = google.gmail({
          version: 'v1',
          auth: oauth2Client
        });

        const listResponse = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 25,
          q: 'newer_than:30d (interview OR recruiter OR application OR opportunity OR schedule OR availability OR call OR hiring)'
        });

        const messages = listResponse.data.messages || [];
        const alerts = [];

        for (const message of messages) {
          const messageResponse = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });

          const payload = messageResponse.data.payload;
          const headers = payload?.headers || [];
          const subject = getHeader(headers, 'Subject');
          const from = getHeader(headers, 'From');
          const body = extractMessageBody(payload);
          const snippet = messageResponse.data.snippet || '';
          const combinedText = `${subject} ${from} ${snippet} ${body}`;

          const matchedApplication = applications.find((application) =>
            textMatchesApplication(combinedText, application)
          );

          if (matchedApplication) {
            alerts.push({
              id: message.id,
              subject,
              from,
              snippet,
              title: matchedApplication.title,
              company: matchedApplication.company,
              detectedAt: new Date().toISOString()
            });
          }
        }

        const nextStatus = {
          ...account.status,
          connected: true,
          lastCheckedAt: new Date().toISOString(),
          alerts
        };

        await upsertGmailAccount(req.user.id, {
          tokens: account.tokens,
          status: nextStatus
        });

        return res.json({
          message: alerts.length
            ? `${alerts.length} recruiter response(s) detected.`
            : 'No recruiter responses detected yet.',
          alerts
        });
      } catch (error) {
        console.error('Gmail check failed:', error);

        return res.status(500).json({
          message: error.message || 'Failed to check Gmail responses.'
        });
      }
    }
  );
}
