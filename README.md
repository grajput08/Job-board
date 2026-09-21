# QA Job Finder — NCR + Remote

A static (plain HTML/CSS/JS, no build step) job board that surfaces **fresh QA /
Testing / Automation / SDET roles** matching a strict eligibility rule set. Jobs
are supplied through **pluggable feed adapters**, so the data source can change
without touching the filtering engine.

This is **Phase 1** (the QA skill set). Phase 2 will add a frontend-developer
profile and a richer UI.

## Run it

No build, no install. Either:

- **Open directly:** double-click `index.html` (the built-in demo feed works from
  `file://`).
- **Serve it** (needed for the *JSON feed* adapter, which uses `fetch`):
  ```bash
  cd Job-board
  python3 -m http.server 8000
  # then open http://localhost:8000
  ```

## The eligibility rule (FINAL ELIGIBILITY RULE)

A job is eligible **only when all five hold**:

1. **Fresh** — LinkedIn post is ≤ **7 days** old.
2. **Experience** — *minimum* required experience is **< 3 years** (no maximum limit,
   so `0–5`, `2–8`, `1–10` all pass; `3+`, `3–7`, `5+` do not).
3. **Role** — title is a QA / Quality / Testing / Automation / SDET role.
4. **Location** — **NCR** (Noida, Greater Noida, Delhi, New Delhi, Gurgaon/Gurugram,
   Delhi NCR) **or Remote-India** (Remote, Remote India, WFH, Work From Home, Fully
   Remote, Pan India Remote, Anywhere in India).
5. **Verifiable** — a usable LinkedIn post URL is present. Unverifiable jobs are
   **excluded, never guessed**.

All rules live in `js/config.js` — edit that file to tune them; no engine changes
needed. Excluded jobs are shown (with the reason) in a collapsible panel so you can
see exactly why anything was dropped.

## Live job data (real postings)

The board reads real jobs through `/api/jobs` — a small Vercel serverless proxy
that calls a data provider **server-side** (so the API token stays secret and
there are no browser CORS/timeout issues) and normalizes results into the board's
job shape. The static front-end just fetches `/api/jobs`.

Two providers are supported (set `JOBS_PROVIDER`):

| Provider  | Env vars needed            | Notes |
| --------- | -------------------------- | ----- |
| `apify`   | `APIFY_TOKEN` (+ optional `APIFY_ACTOR`, `APIFY_INPUT`) | Runs a LinkedIn jobs actor on [Apify](https://apify.com). Free tier gives ~$5/mo credits; most LinkedIn actors are pay-per-result, so heavy use needs a paid plan. |
| `jsearch` | `RAPIDAPI_KEY`             | [JSearch on RapidAPI](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) aggregates Google-for-Jobs (incl. LinkedIn-sourced posts). Free tier ~200 req/mo, fast, ToS-clean — **recommended**. |

### Setup

1. Get a key: an [Apify API token](https://console.apify.com/account/integrations)
   **or** a [RapidAPI/JSearch key](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch).
2. In Vercel: **Project → Settings → Environment Variables**, add the relevant
   vars from [`.env.example`](./.env.example) (e.g. `JOBS_PROVIDER=jsearch` and
   `RAPIDAPI_KEY=…`), then redeploy.
3. Open the site — the **Live jobs** feed is selected by default. Until a token is
   configured it shows a notice and falls back to labelled demo data.

### Why real jobs still get filtered

Real LinkedIn posts have **no structured minimum-experience field**, so the proxy
parses experience from the description and LinkedIn's seniority level. Per the
spec, a job whose experience (or posting date, or post URL) can't be determined is
**excluded, not guessed** — so expect the live feed to legitimately drop some
postings. The "Filtered out" panel shows exactly why.

> **LinkedIn note:** LinkedIn itself has no open Jobs API and blocks direct
> scraping in its Terms of Service. That's why data comes via a third-party
> provider you have credentials for, not from scraping LinkedIn directly.

## Project layout

```
index.html          Board UI (NCR + Remote tables, recruiter tracking, controls)
css/styles.css      Styling (light/dark)
api/jobs.js         Serverless proxy: calls Apify/JSearch server-side, normalizes to job shape
js/config.js        The QA "skill set": roles, locations, skills, experience & freshness rules
js/eligibility.js   Pure filtering engine (experience/location/role/date/verify + dedupe + recruiter stats)
js/adapters.js      Pluggable feed-adapter interface + LiveApiAdapter + SampleAdapter + JsonUrlAdapter
js/data.js          Synthetic demo jobs (includes deliberately-excluded examples)
js/render.js        Renders the spec's output format
js/app.js           Wires adapter -> engine -> UI (live feed default, demo fallback)
.env.example        Env vars for the live feed proxy
```

## Adding a real feed adapter

Every data source is an object with `id`, `label`, and `async fetchJobs()` that
returns jobs in the **normalized shape** (documented at the top of `js/adapters.js`):

```js
import { registerAdapter, BaseAdapter } from "./adapters.js";

class MyFeedAdapter extends BaseAdapter {
  constructor() { super("my-feed", "My jobs API"); }
  async fetchJobs() {
    const raw = await fetch("https://my-api.example.com/jobs").then(r => r.json());
    // Map the API's fields onto the normalized shape:
    return raw.map(j => ({
      id: j.id, title: j.role, company: j.org,
      experience: j.exp, location: j.city, workMode: j.mode,
      skills: j.tags, postedDate: j.posted_at,
      recruiterName: j.recruiter, recruiterProfile: j.recruiter_url,
      postUrl: j.source_url, applicationMethod: j.apply_how,
      applicationContact: j.apply_to, source: j.poster_type,
    }));
  }
}
registerAdapter(new MyFeedAdapter());
```

Nothing in `eligibility.js` or `render.js` changes. The included **JSON feed**
adapter already lets you load any URL that returns a JSON array of normalized jobs —
useful for a manually-maintained export or a serverless endpoint.

## Roadmap

- **Phase 1 (done):** QA eligibility engine, pluggable adapters, NCR/Remote tables,
  recruiter tracking, duplicate handling, exclusion transparency.
- **Phase 2 (planned):** frontend-developer skill profile, profile switcher, saved
  jobs, richer UI.
