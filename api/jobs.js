// =============================================================================
// /api/jobs — serverless job feed proxy (Vercel Node function)
// -----------------------------------------------------------------------------
// Why this exists: the board is a static site, but calling a jobs provider from
// the browser would (a) expose the API token in page source and (b) hit CORS /
// long-run timeouts. This function holds the token as a SECRET env var, calls
// the provider, normalizes results into the board's job shape, and returns JSON
// that the front-end LiveApiAdapter consumes.
//
// PROVIDERS (set JOBS_PROVIDER):
//   "apify"   (default) — runs a LinkedIn jobs actor on Apify.
//                         Requires: APIFY_TOKEN
//                         Optional: APIFY_ACTOR (default bebity~linkedin-jobs-scraper),
//                                   APIFY_INPUT (raw JSON to match your actor's schema)
//   "jsearch"           — JSearch on RapidAPI (aggregates Google-for-Jobs incl.
//                         LinkedIn). Requires: RAPIDAPI_KEY
//
// Query overrides: ?provider=jsearch  ?q=QA  ?location=India  ?rows=50
//
// Experience is parsed from the description / seniority — never invented. Jobs
// with no determinable experience or no post URL are returned but will be
// excluded by the eligibility engine (spec: only verifiable jobs count).
// =============================================================================

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = req.query || {};
  const provider = String(q.provider || process.env.JOBS_PROVIDER || "apify").toLowerCase();
  const params = { q: q.q, location: q.location, rows: q.rows };

  try {
    const jobs = provider === "jsearch"
      ? await fetchJSearch(params)
      : await fetchApify(params);
    return res.status(200).json({ provider, configured: true, count: jobs.length, jobs });
  } catch (err) {
    if (err && err.notConfigured) {
      // Soft failure: front-end shows a helpful message and falls back to demo data.
      return res.status(200).json({ provider, configured: false, error: err.message, jobs: [] });
    }
    return res.status(502).json({ provider, configured: true, error: String(err.message || err), jobs: [] });
  }
};

// Allow long-running Apify actor runs (Vercel caps: 60s Hobby, up to 300s Pro).
module.exports.config = { maxDuration: 60 };

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------
async function fetchApify(params) {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    const e = new Error("APIFY_TOKEN is not set. Add it as a Vercel project environment variable.");
    e.notConfigured = true;
    throw e;
  }
  const actor = String(process.env.APIFY_ACTOR || "bebity~linkedin-jobs-scraper").replace("/", "~");

  let input;
  if (process.env.APIFY_INPUT) {
    try { input = JSON.parse(process.env.APIFY_INPUT); }
    catch { throw new Error("APIFY_INPUT is not valid JSON"); }
  } else {
    input = {
      title: params.q || "QA",
      location: params.location || "India",
      rows: Number(params.rows) || 50,
      publishedAt: "r604800", // LinkedIn "past week" filter (7 days, in seconds)
    };
  }

  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Apify actor run failed (${r.status}). ${t.slice(0, 300)}`);
  }
  const items = await r.json();
  return (Array.isArray(items) ? items : []).map(normApify).filter((j) => j.title && j.postUrl);
}

async function fetchJSearch(params) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    const e = new Error("RAPIDAPI_KEY is not set. Add it as a Vercel project environment variable.");
    e.notConfigured = true;
    throw e;
  }
  const host = process.env.JSEARCH_HOST || "jsearch.p.rapidapi.com";
  const query = params.q || "QA Engineer OR SDET OR Software Tester in India";
  const numPages = Number(params.rows) > 10 ? 2 : 1;
  const url = `https://${host}/search?query=${encodeURIComponent(query)}&page=1&num_pages=${numPages}&date_posted=week`;
  const r = await fetch(url, {
    headers: {
      "x-rapidapi-key": key,
      "x-rapidapi-host": host,
    },
  });
  const bodyText = await r.text().catch(() => "");
  // Diagnostics -> Vercel runtime logs (never logs the key itself).
  console.log(JSON.stringify({
    tag: "jsearch",
    url: url.replace(/query=[^&]*/, "query=***"),
    status: r.status,
    server: r.headers.get("server") || "",
    keyLen: key.length,
    bodyPreview: bodyText.slice(0, 200),
  }));
  if (!r.ok) {
    throw new Error(`JSearch request failed (${r.status}). ${bodyText.slice(0, 300)}`);
  }
  let data;
  try { data = JSON.parse(bodyText); } catch { throw new Error("JSearch returned non-JSON"); }
  return (Array.isArray(data.data) ? data.data : []).map(normJSearch).filter((j) => j.title && j.postUrl);
}

// ---------------------------------------------------------------------------
// Normalizers -> board job shape
// ---------------------------------------------------------------------------
function normApify(it) {
  const desc = it.description || it.descriptionText || stripHtml(it.descriptionHtml) || "";
  const experience =
    extractExperience(`${it.title || ""} ${desc}`) ||
    mapSeniority(it.experienceLevel || it.seniority || it.seniorityLevel) || "";
  const modeRaw = `${it.workType || it.workplaceType || it.contractType || ""} ${it.location || ""}`;
  const remote = /remote|work from home|wfh/i.test(modeRaw);
  return {
    id: String(it.id || it.jobId || it.link || it.jobUrl || Math.random()),
    title: it.title || it.jobTitle || "",
    company: it.companyName || it.company || "",
    experience,
    location: it.location || it.formattedLocation || "",
    workMode: it.workType || it.workplaceType || it.contractType || (remote ? "Remote" : ""),
    skills: tagSkills(`${it.title || ""} ${desc}`),
    postedDate: toISO(it.postedAt || it.postedTime || it.publishedAt || it.postedDate || it.listedAt),
    recruiterName: it.posterName || it.recruiterName || "",
    recruiterProfile: it.posterProfileUrl || it.recruiterProfileUrl || "",
    postUrl: it.link || it.jobUrl || it.url || "",
    applicationMethod: "Apply on LinkedIn",
    applicationContact: it.applyUrl || "",
    source: "linkedin",
  };
}

function normJSearch(it) {
  const highlights = it.job_highlights || {};
  const quals = highlights.Qualifications || highlights.qualifications || [];
  const qualText = Array.isArray(quals) ? quals.join(" ") : "";
  const desc = it.job_description || "";
  const remote = !!it.job_is_remote;
  const loc = remote
    ? "Remote India"
    : [it.job_city, it.job_state, it.job_country].filter(Boolean).join(", ");
  return {
    id: String(it.job_id || Math.random()),
    title: it.job_title || "",
    company: it.employer_name || "",
    experience: extractExperience(`${qualText} ${desc}`),
    location: loc,
    workMode: remote ? "Remote" : (it.job_employment_type || ""),
    skills: tagSkills(`${it.job_title || ""} ${qualText} ${desc}`),
    postedDate: toISO(
      it.job_posted_at_datetime_utc ||
      (it.job_posted_at_timestamp ? new Date(it.job_posted_at_timestamp * 1000).toISOString() : "")
    ),
    recruiterName: "",
    recruiterProfile: "",
    postUrl: it.job_apply_link || it.job_google_link || "",
    applicationMethod: it.job_publisher ? `Apply via ${it.job_publisher}` : "Apply link",
    applicationContact: it.job_apply_link || "",
    source: it.job_publisher || "jsearch",
  };
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------
const SKILL_LIST = [
  "Selenium", "Playwright", "Cypress", "Appium", "Postman", "API Testing",
  "REST API", "Java", "JavaScript", "TypeScript", "Python", "SQL",
  "Manual Testing", "Automation Testing", "Functional Testing",
  "Regression Testing", "Integration Testing", "Performance Testing",
  "Jenkins", "CI/CD", "Git", "GitHub", "GitLab", "TestNG", "JUnit", "Cucumber",
  "JMeter", "Rest Assured", "Katalon", "Jira",
];

function tagSkills(text) {
  const t = String(text || "").toLowerCase();
  return SKILL_LIST.filter((s) => t.includes(s.toLowerCase()));
}

function extractExperience(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return "";
  let m = t.match(/(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*\+?\s*(?:years|yrs|year)/);
  if (m) return `${m[1]}-${m[2]} years`;
  m = t.match(/(?:minimum|min\.?|at least)\s*(\d{1,2})\s*(?:\+)?\s*(?:years|yrs)/);
  if (m) return `${m[1]}+ years`;
  m = t.match(/(\d{1,2})\s*\+\s*(?:years|yrs|year)/);
  if (m) return `${m[1]}+ years`;
  m = t.match(/(\d{1,2})\s*(?:years|yrs)\s*(?:of\s*)?(?:experience|exp)/);
  if (m) return `${m[1]} years`;
  if (/\bfresher\b|\bentry[-\s]?level\b|\b0\s*-\s*1\b|\bno experience\b/.test(t)) return "Fresher";
  return "";
}

// LinkedIn "seniority" -> a numeric-ish phrase the engine can read. Conservative:
// mid/senior maps to 3+ (excluded) unless the description gave a real number.
function mapSeniority(level) {
  const l = String(level || "").toLowerCase();
  if (!l) return "";
  if (/intern|entry|trainee/.test(l)) return "0-1 years";
  if (/associate/.test(l)) return "1-3 years";
  if (/mid|senior|director|executive|lead|principal/.test(l)) return "3+ years";
  return "";
}

function toISO(v) {
  if (!v) return "";
  if (v instanceof Date) return isNaN(v) ? "" : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const low = s.toLowerCase();
  const now = new Date();

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  if (/just now|today|hour|minute|second/.test(low)) return now.toISOString().slice(0, 10);
  if (/yesterday/.test(low)) { now.setDate(now.getDate() - 1); return now.toISOString().slice(0, 10); }
  const m = low.match(/(\d+)\s*(day|week|month|year)s?\s*ago/);
  if (m) {
    const mult = { day: 1, week: 7, month: 30, year: 365 }[m[2]];
    now.setDate(now.getDate() - Number(m[1]) * mult);
    return now.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
