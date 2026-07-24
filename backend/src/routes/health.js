// Health and readiness endpoints (Step 6).

import {
  PORT
} from '../config.js';

import {
  getDb,
  isMongoReady
} from '../mongo.js';

export default function registerHealthRoutes(
  app
) {
  // Liveness: process is running. This does not query the database.
  app.get(
    '/api/health',
    (req, res) => {
      res.json({
        status: 'ok',
        service: 'OPUS API',
        port: PORT,
        uptime: process.uptime()
      });
    }
  );

  // Readiness: verify that MongoDB can answer a database command.
  app.get(
    '/api/ready',
    async (req, res) => {
      try {
        if (!isMongoReady()) {
          throw new Error(
            'MongoDB is not connected.'
          );
        }

        await getDb()
          .admin()
          .ping();

        return res.json({
          status: 'ready',
          database: 'connected'
        });
      } catch {
        return res
          .status(503)
          .json({
            status: 'not-ready',
            database: 'unavailable'
          });
      }
    }
  );
}