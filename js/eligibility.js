// =============================================================================
// Eligibility Engine
// -----------------------------------------------------------------------------
// Pure functions that implement the FINAL ELIGIBILITY RULE:
//
//   A job is eligible ONLY when ALL are true:
//     1. LinkedIn post is <= freshnessDays old
//     2. Minimum required experience < maxAllowedMinExperienceExclusive years
//     3. Role is QA / Testing / Automation / SDET related
//     4. Location is NCR (Noida/Greater Noida/Delhi/Gurugram/...) OR Remote-India
//     5. The LinkedIn post is verifiable (a usable post URL is present)
//
// Nothing here touches the DOM or the network — it takes a normalized job
// object + config and returns a verdict. That makes it trivial to unit test and
// to reuse for a second (frontend-developer) profile in Phase 2.
// =============================================================================

// ---------------------------------------------------------------------------
// Experience parsing
// ---------------------------------------------------------------------------
// Returns { min, max, raw }. `min`/`max` are numbers (years); `max` is null for
// open-ended ranges like "3+ years". `min` is null when it cannot be verified.
export function parseExperience(raw) {
  const result = { min: null, max: null, raw: raw == null ? "" : String(raw) };
  if (raw == null) return result;

  const text = String(raw).toLowerCase().trim();
  if (!text) return result;

  // Fresher / entry-level phrasing => minimum is 0.
  if (/\b(fresher|fresh|entry[-\s]?level|no experience|0 exp)\b/.test(text)) {
    result.min = 0;
  }

  const numbers = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const hasPlus = /\+/.test(text);

  if (numbers.length >= 2) {
    // A range like "0-3 years" / "2 to 5 yrs".
    result.min = Math.min(numbers[0], numbers[1]);
    result.max = Math.max(numbers[0], numbers[1]);
  } else if (numbers.length === 1) {
    if (hasPlus) {
      // "3+ years" => min 3, open-ended.
      result.min = numbers[0];
      result.max = null;
    } else {
      // A single number like "2 years".
      result.min = result.min === 0 ? 0 : numbers[0];
      result.max = numbers[0];
    }
  }
  // If we detected "fresher" but no numbers, min stays 0 and max stays null.

  return result;
}

export function experiencePasses(raw, config) {
  const { min } = parseExperience(raw);
  if (min == null) return { ok: false, reason: "Experience could not be verified" };
  if (min < config.maxAllowedMinExperienceExclusive) return { ok: true };
  return { ok: false, reason: `Minimum experience is ${min} yrs (must be < ${config.maxAllowedMinExperienceExclusive})` };
}

// ---------------------------------------------------------------------------
// Location parsing / categorization
// ---------------------------------------------------------------------------
function normalize(str) {
  return String(str || "").toLowerCase().replace(/[\/,|]+/g, " ").replace(/\s+/g, " ").trim();
}

// Returns { ok, category: "NCR" | "Remote" | null, reason }.
export function matchLocation(location, workMode, config) {
  const haystack = normalize(`${location} ${workMode || ""}`);
  if (!haystack) return { ok: false, category: null, reason: "No location given" };

  const containsAny = (terms) =>
    terms.some((t) => {
      const term = normalize(t);
      // Word-ish boundary match so "delhi" doesn't hit inside another word.
      const re = new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
      return re.test(haystack);
    });

  const isNcr = containsAny(config.ncrLocations);
  const isRemote = containsAny(config.remoteLocations);

  // NCR takes precedence for categorization (a "Gurgaon / Remote" job is an
  // NCR job that also allows remote); pure remote-India goes to Remote.
  if (isNcr) return { ok: true, category: "NCR", reason: "" };
  if (isRemote) return { ok: true, category: "Remote", reason: "" };
  return { ok: false, category: null, reason: "Location is not NCR or Remote-India" };
}

// ---------------------------------------------------------------------------
// Role matching
// ---------------------------------------------------------------------------
export function matchRole(title, config) {
  const text = normalize(title);
  if (!text) return { ok: false, reason: "No job title" };

  for (const kw of config.roleKeywords) {
    if (text.includes(normalize(kw))) return { ok: true };
  }
  for (const kw of config.roleWordBoundaryKeywords) {
    const re = new RegExp(`(^|\\s)${normalize(kw)}(\\s|$)`);
    if (re.test(text)) return { ok: true };
  }
  return { ok: false, reason: "Title is not a QA/Testing/Automation/SDET role" };
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------
// Returns { ok, ageDays, reason }. `now` is injectable for testing.
export function checkFreshness(postedDate, config, now = new Date()) {
  if (!postedDate) return { ok: false, ageDays: null, reason: "No posting date" };
  const posted = postedDate instanceof Date ? postedDate : new Date(postedDate);
  if (isNaN(posted.getTime())) return { ok: false, ageDays: null, reason: "Posting date could not be parsed" };

  const msPerDay = 24 * 60 * 60 * 1000;
  // Compare on calendar days so "today" is age 0.
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ageDays = Math.round((startOf(now) - startOf(posted)) / msPerDay);

  if (ageDays < 0) return { ok: false, ageDays, reason: "Posting date is in the future" };
  if (ageDays > config.freshnessDays) return { ok: false, ageDays, reason: `Post is ${ageDays} days old (older than ${config.freshnessDays})` };
  return { ok: true, ageDays, reason: "" };
}

export function ageLabel(ageDays) {
  if (ageDays == null) return "Unknown";
  if (ageDays <= 0) return "Today";
  if (ageDays === 1) return "Yesterday";
  return `${ageDays} days ago`;
}

// ---------------------------------------------------------------------------
// Verifiability
// ---------------------------------------------------------------------------
export function isVerifiable(job) {
  const url = (job.postUrl || "").trim();
  if (!url) return { ok: false, reason: "No LinkedIn post URL (cannot verify)" };
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: "Post URL is not http(s)" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "Post URL is not a valid URL" };
  }
}

// ---------------------------------------------------------------------------
// Full evaluation of one job
// ---------------------------------------------------------------------------
export function evaluateJob(job, config, now = new Date()) {
  const checks = {
    fresh: checkFreshness(job.postedDate, config, now),
    experience: experiencePasses(job.experience, config),
    role: matchRole(job.title, config),
    location: matchLocation(job.location, job.workMode, config),
    verifiable: isVerifiable(job),
  };

  const reasons = [];
  if (!checks.fresh.ok) reasons.push(checks.fresh.reason);
  if (!checks.experience.ok) reasons.push(checks.experience.reason);
  if (!checks.role.ok) reasons.push(checks.role.reason);
  if (!checks.location.ok) reasons.push(checks.location.reason);
  if (!checks.verifiable.ok) reasons.push(checks.verifiable.reason);

  return {
    eligible: reasons.length === 0,
    category: checks.location.category, // "NCR" | "Remote" | null
    ageDays: checks.fresh.ageDays,
    parsedExperience: parseExperience(job.experience),
    reasons, // why it was excluded (empty when eligible)
    checks,
  };
}

// ---------------------------------------------------------------------------
// Duplicate handling
// ---------------------------------------------------------------------------
// Same vacancy across multiple posts: prefer the recruiter/hiring-manager post,
// keep an alternate only when it offers a different application method.
const SOURCE_PRIORITY = {
  recruiter: 5,
  "hiring manager": 5,
  "talent acquisition": 4,
  hr: 4,
  "technical recruiter": 4,
  "qa lead": 3,
  "recruitment agency": 2,
  employee: 1,
  unknown: 0,
};

function sourceRank(job) {
  const key = normalize(job.source || "unknown");
  return SOURCE_PRIORITY[key] != null ? SOURCE_PRIORITY[key] : 0;
}

function dedupe(jobs) {
  const byVacancy = new Map();
  for (const job of jobs) {
    const key = `${normalize(job.title)}::${normalize(job.company)}::${normalize(job.location)}`;
    const existing = byVacancy.get(key);
    if (!existing) {
      byVacancy.set(key, job);
      continue;
    }
    const sameApply = normalize(existing.applicationMethod) === normalize(job.applicationMethod) &&
      normalize(existing.applicationContact) === normalize(job.applicationContact);
    if (sameApply) {
      // True duplicate — keep the higher-priority source.
      if (sourceRank(job) > sourceRank(existing)) byVacancy.set(key, job);
    } else {
      // Different application method — keep both under distinct keys.
      byVacancy.set(`${key}::${normalize(job.applicationContact || job.applicationMethod)}`, job);
    }
  }
  return [...byVacancy.values()];
}

// ---------------------------------------------------------------------------
// Top-level: evaluate, dedupe, categorize, and build recruiter stats.
// ---------------------------------------------------------------------------
export function processJobs(jobs, config, now = new Date()) {
  const evaluated = jobs.map((job) => ({ job, verdict: evaluateJob(job, config, now) }));

  const eligibleRaw = evaluated.filter((e) => e.verdict.eligible).map((e) => ({ ...e.job, _verdict: e.verdict }));
  const excluded = evaluated.filter((e) => !e.verdict.eligible).map((e) => ({ ...e.job, _verdict: e.verdict }));

  const eligible = dedupe(eligibleRaw);

  const ncr = eligible.filter((j) => j._verdict.category === "NCR")
    .sort((a, b) => a._verdict.ageDays - b._verdict.ageDays);
  const remote = eligible.filter((j) => j._verdict.category === "Remote")
    .sort((a, b) => a._verdict.ageDays - b._verdict.ageDays);

  // Active recruiters: those with >= activeRecruiterMinPosts eligible posts.
  const recruiterMap = new Map();
  for (const j of eligible) {
    const name = (j.recruiterName || "").trim();
    if (!name) continue;
    const key = normalize(name);
    if (!recruiterMap.has(key)) {
      recruiterMap.set(key, {
        name,
        company: j.company || "",
        profile: j.recruiterProfile || "",
        count: 0,
      });
    }
    recruiterMap.get(key).count += 1;
  }
  const activeRecruiters = [...recruiterMap.values()]
    .filter((r) => r.count >= config.activeRecruiterMinPosts)
    .sort((a, b) => b.count - a.count);

  return {
    total: eligible.length,
    ncr,
    remote,
    excluded,
    activeRecruiters,
  };
}
