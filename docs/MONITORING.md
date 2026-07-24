# OPUS Monitoring Recommendations

## Built-in endpoints
- `GET /api/health` — liveness (process up, uptime). Use as the platform health check.
- `GET /api/ready` — readiness (verifies a DB query). Returns 503 if the database is unreachable; use for load-balancer readiness and deploy gating.

## Logs
The backend emits one structured JSON line per request: `{ t, method, path, status, ms }`. It deliberately excludes bodies, query strings, headers, and tokens. Ship stdout to your platform's log aggregator (Render logs, CloudWatch, Loki, etc.). Set `LOG_REQUESTS=false` to silence per-request logs if noisy.

## What to alert on
- `/api/ready` failing (database down) — page immediately.
- Error-rate: sustained 5xx on `/api` routes.
- Auth anomalies: spikes in `ACCOUNT_LOGIN_FAILED` audit events (possible credential stuffing) — the rate limiter already blocks, but a spike is worth a look.
- Job-source health: the Admin > Job Sources page and `job_source_health` table show per-source status; a source failing continuously is safe (isolated) but worth noting.
- Latency: the `ms` field per request; watch p95 on search and list endpoints.

## Recommended external tooling (all have free tiers)
- Uptime: UptimeRobot / BetterStack hitting `/api/health`.
- Errors: Sentry (add `@sentry/node` in `server.js` if desired).
- Metrics/logs: your host's built-in dashboard is enough to start.

## Audit trail
Security-relevant actions (login, approval, permission changes, downloads, deletions) are written to `audit_logs` and viewable by the Super Admin (with CSV export). This is your primary forensic record — retain it and consider periodic export to cold storage.
