// OPUS backend entry point — composed from the Step 2 modular split.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PORT, FRONTEND_URL } from './src/config.js';
import {
  connectMongo,
  disconnectMongo
} from './src/mongo.js';
import { csrfProtection } from './src/security.js';
import registerAuthRoutes from './src/routes/auth.js';
import registerAccountRoutes from './src/routes/account.js';
import registerSuperAdminRoutes from './src/routes/superAdmin.js';
import registerAdminRoutes from './src/routes/admin.js';
import registerRecruiterRoutes from './src/routes/recruiter.js';
import registerHealthRoutes from './src/routes/health.js';
import registerUserRoutes from './src/routes/user.js';
import registerGmailRoutes from './src/routes/gmail.js';
import registerDocumentRoutes from './src/routes/documents.js';
import registerExportRoutes from './src/routes/exports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

// Security headers. CSP is disabled here because the SPA is served by Vite's
// build with inline module scripts; tighten via a report-only policy later.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));

// Minimal structured request log (method, path, status, ms). Avoids logging
// bodies or query strings so secrets and tokens never reach the logs.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (process.env.LOG_REQUESTS === 'false') return;
    const ms = Date.now() - start;
    console.log(JSON.stringify({
      t: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms
    }));
  });
  next();
});

const allowedOrigins = String(
  process.env.CORS_ORIGINS || FRONTEND_URL
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin is not allowed by OPUS CORS policy.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token']
  })
);

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0'
    });
  }
  next();
});

app.use('/api', csrfProtection);

registerAuthRoutes(app);
registerAccountRoutes(app);
registerSuperAdminRoutes(app);
registerAdminRoutes(app);
registerRecruiterRoutes(app);
registerHealthRoutes(app);
registerUserRoutes(app);
registerGmailRoutes(app);
registerDocumentRoutes(app);
registerExportRoutes(app);

app.use(express.static(FRONTEND_DIST));

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      message: `API route not found: ${req.method} ${req.path}`
    });
  }

  const indexFile = path.join(FRONTEND_DIST, 'index.html');

  if (fsSync.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }

  return res.status(404).json({
    message: 'Frontend build not found. Run npm run build before deployment.'
  });
});

export default app;

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url);

if (isMain) {
  // Fail fast: never accept requests until MongoDB is connected.
  await connectMongo();

  const server = app.listen(
    PORT,
    () => {
      console.log(
        `OPUS API running on http://localhost:${PORT}`
      );
    }
  );

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    console.log(
      `${signal} received, shutting down gracefully...`
    );

    const forceExit = setTimeout(
      () => process.exit(1),
      10000
    );

    forceExit.unref();

    server.close(async (error) => {
      try {
        await disconnectMongo();
      } catch (databaseError) {
        console.error(
          `MongoDB shutdown error: ${databaseError.message}`
        );
      }

      clearTimeout(forceExit);

      if (error) {
        console.error(
          `HTTP shutdown error: ${error.message}`
        );

        process.exit(1);
      }

      process.exit(0);
    });
  }

  process.on(
    'SIGTERM',
    () => shutdown('SIGTERM')
  );

  process.on(
    'SIGINT',
    () => shutdown('SIGINT')
  );
}