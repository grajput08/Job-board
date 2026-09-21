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

## About LinkedIn data

The board **cannot legally or technically scrape LinkedIn** — LinkedIn requires
login, blocks automated scraping in its Terms of Service, and its Jobs API is
partner-only. So the built-in feed is **synthetic demo data** (clearly labelled in
the UI), and real data must come through an adapter you point at a source you're
allowed to use.

## Project layout

```
index.html          Board UI (NCR + Remote tables, recruiter tracking, controls)
css/styles.css      Styling (light/dark)
js/config.js        The QA "skill set": roles, locations, skills, experience & freshness rules
js/eligibility.js   Pure filtering engine (experience/location/role/date/verify + dedupe + recruiter stats)
js/adapters.js      Pluggable feed-adapter interface + SampleAdapter + JsonUrlAdapter
js/data.js          Synthetic demo jobs (includes deliberately-excluded examples)
js/render.js        Renders the spec's output format
js/app.js           Wires adapter -> engine -> UI
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
