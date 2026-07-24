# Job sources — what works out of the box, what needs a key

**Short answer: you do NOT need any API key.** Seven of the ten job sources are
public and work the moment you start the app. The rest are optional.

## Works immediately — no key, no signup

| Source | What it provides |
|---|---|
| **RemoteOK** | Remote tech jobs |
| **Remotive** | Remote jobs, searchable |
| **Arbeitnow** | European + remote jobs |
| **Jobicy** | Remote jobs, searchable |
| **Greenhouse** | Real company career boards (defaults included) |
| **Lever** | Real company career boards (defaults included) |
| **Ashby** | Real company career boards (defaults included) |
| **Workday** | Real employer career sites incl. full job descriptions (defaults included) |

If a source is unreachable, it is skipped with a warning and the others still
return results. Nothing crashes.

### Adding more companies (optional, still no key)
In `backend/.env`:
```
GREENHOUSE_COMPANIES=airbnb,databricks,stripe
LEVER_COMPANIES=netlify,postman
ASHBY_COMPANIES=ramp,linear
```
These are just company slugs from their public job-board URLs.

## Optional — only if you want these extra sources

### The Muse
- Sign up: https://www.themuse.com/developers/api/v2
- Free tier available
- Add to `backend/.env`:
```
THE_MUSE_API_KEY=your_key
```

### USAJOBS (US federal government jobs)
- Sign up: https://developer.usajobs.gov/APIRequest
- Free
- Needs **both** values, or the source is skipped:
```
USAJOBS_API_KEY=your_key
USAJOBS_USER_AGENT=your_registered_email@example.com
```

## Workday — how it works (no key)

Workday needs **no API key**. It uses each employer's public Candidate
Experience (CXS) endpoints:

| Step | Endpoint | Public? |
|---|---|---|
| List jobs | `POST /wday/cxs/{tenant}/{site}/jobs` | Yes |
| Full description | `GET /wday/cxs/{tenant}/{site}/job/{externalPath}` | Yes |
| Apply | The employer's posting page | Browsing is public; **submitting requires the candidate to sign in there** |

That matches how OPUS works everywhere else: **Apply** sends the user to the
employer's own posting page, they sign in and apply on Workday, then return to
OPUS and confirm "Yes, I applied."

OPUS ships with default Workday employers, so it works with no configuration.
To use your own instead, set in `backend/.env`:

```
WORKDAY_SOURCES=[{"name":"Acme","url":"https://acme.wd5.myworkdayjobs.com/Careers"}]
```

The `url` is any public Workday career site — copy it from the browser address
bar of the employer's job board. Multiple entries are allowed.

**Note on speed:** the full description needs one extra request per job, so OPUS
fetches descriptions for the first 12 listings per employer and falls back to
the listing summary for the rest. If a description call fails, the job is still
returned.

## What is NOT needed

| | Needed? |
|---|---|
| OpenAI / ChatGPT API key | ❌ No |
| Anthropic / Claude API key | ❌ No |
| Google Gemini API key | ❌ No |
| Any paid service | ❌ No |

ATS scoring and Resume Rewrite are both pure code running on your server. They
work offline, cost nothing, and have no rate limit.

## The only keys you genuinely need for full functionality

These are not job sources — they are for the app itself:

| Setting | Why | Required? |
|---|---|---|
| `MONGODB_URI` | The database | **Yes** |
| `JWT_SECRET`, `APPROVAL_TOKEN_SECRET` | Session security (generate locally, not from a vendor) | **Yes** |
| `SMTP_USER` / `SMTP_PASS` | Sending verification, approval, and interview emails | Only if you want real emails |

**Gmail SMTP setup:** enable 2-Step Verification on your Google account, then
create an App Password at https://myaccount.google.com/apppasswords and use it
as `SMTP_PASS`. Without SMTP, the app still runs — emails are skipped and links
are printed to the backend console in development.

## Optional: Gmail response detection
The dashboard has an optional feature that scans your Gmail for recruiter
replies. It needs Google OAuth credentials:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:5000/api/gmail/callback
```
Created free at https://console.cloud.google.com — the rest of the app works
fine without it.
