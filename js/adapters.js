// =============================================================================
// Pluggable Job-Feed Adapters
// -----------------------------------------------------------------------------
// The board does not know or care WHERE jobs come from. Every data source is an
// "adapter": an object with an async `fetchJobs()` method that returns an array
// of jobs in the NORMALIZED SHAPE below. The eligibility engine then filters
// whatever the adapter returns.
//
// NORMALIZED JOB SHAPE
// {
//   id:                 string   (stable unique id)
//   title:              string   ("QA Automation Engineer")
//   company:            string
//   experience:         string   ("0-3 years", "Fresher", "2+ years", ...)
//   location:           string   ("Noida", "Remote India", "Gurgaon / Remote")
//   workMode:           string   ("On-site" | "Hybrid" | "Remote")
//   skills:             string[] (["Selenium", "Java", ...])
//   postedDate:         string   (ISO date, e.g. "2026-09-20")
//   recruiterName:      string
//   recruiterProfile:   string   (LinkedIn profile URL)
//   postUrl:            string   (direct LinkedIn post URL — REQUIRED to verify)
//   applicationMethod:  string   ("Apply on post" | "Email CV" | "DM recruiter")
//   applicationContact: string   (email or link, if publicly provided)
//   source:             string   ("recruiter" | "hiring manager" | "hr" | ...)
// }
//
// TO ADD A REAL FEED LATER (e.g. a paid jobs API or a CSV export):
//   1. Write a class/object with `async fetchJobs()` that returns the shape above.
//   2. Map the feed's fields onto the normalized fields (that's the only glue).
//   3. Register it with `registerAdapter(new MyAdapter(...))`.
// Nothing in eligibility.js or render.js needs to change.
//
// NOTE ON LINKEDIN: LinkedIn cannot be legally/technically scraped from a static
// site (login required, blocked by ToS, no open jobs API). A real feed adapter
// must therefore point at a source you are allowed to use — a jobs API you have
// a key for, a CSV/JSON you maintain, or manual entries you export.
// =============================================================================

import { SAMPLE_JOBS } from "./data.js";

// The adapter "interface" as documentation. Adapters just need `id`, `label`,
// and `fetchJobs()`.
export class BaseAdapter {
  constructor(id, label) {
    this.id = id;
    this.label = label;
  }
  // eslint-disable-next-line class-methods-use-this
  async fetchJobs() {
    throw new Error("fetchJobs() not implemented");
  }
}

// --- Sample adapter: ships with the board so it works out of the box ---------
// Dates in the sample set are given as `daysAgo` and converted to real ISO
// dates at fetch time, so the freshness filter always has something to show.
export class SampleAdapter extends BaseAdapter {
  constructor() {
    super("sample", "Sample QA feed (built-in demo)");
  }
  async fetchJobs() {
    const now = new Date();
    return SAMPLE_JOBS.map((job) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (job.daysAgo ?? 0));
      const iso = d.toISOString().slice(0, 10);
      const { daysAgo, ...rest } = job;
      return { ...rest, postedDate: iso };
    });
  }
}

// --- JSON URL adapter: fetches a JSON array of normalized jobs from a URL -----
// Works when the page is served over http(s). Point it at any endpoint that
// returns the normalized shape (an exported feed, a serverless function, etc.).
export class JsonUrlAdapter extends BaseAdapter {
  constructor(url) {
    super("json-url", "JSON feed (custom URL)");
    this.url = url;
  }
  async fetchJobs() {
    if (!this.url) throw new Error("No feed URL provided");
    const res = await fetch(this.url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Feed responded ${res.status}`);
    const data = await res.json();
    const jobs = Array.isArray(data) ? data : data.jobs;
    if (!Array.isArray(jobs)) throw new Error("Feed did not return a jobs array");
    return jobs;
  }
}

// --- Adapter registry --------------------------------------------------------
const registry = new Map();

export function registerAdapter(adapter) {
  registry.set(adapter.id, adapter);
  return adapter;
}
export function getAdapter(id) {
  return registry.get(id);
}
export function listAdapters() {
  return [...registry.values()];
}

// Register the built-in adapter by default.
registerAdapter(new SampleAdapter());
