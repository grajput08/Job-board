// =============================================================================
// Rendering
// -----------------------------------------------------------------------------
// Turns the engine's output into the exact output format from the spec:
//   "Found X new QA jobs..." headline, an NCR table, a Remote table, and an
//   Active QA Recruiters list. Also renders a transparency panel showing which
//   jobs were excluded and why (respecting the "never invent, only verifiable"
//   rule — excluded jobs are shown as excluded, not as results).
// =============================================================================

import { ageLabel } from "./eligibility.js";

function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function link(url, text) {
  const u = (url || "").trim();
  if (!u) return `<span class="muted">—</span>`;
  return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text || "Open")}</a>`;
}

function skillChips(skills) {
  if (!Array.isArray(skills) || !skills.length) return `<span class="muted">—</span>`;
  return skills.map((s) => `<span class="chip">${esc(s)}</span>`).join(" ");
}

function applyCell(job) {
  const method = esc(job.applicationMethod || "—");
  const contact = (job.applicationContact || "").trim();
  if (!contact) return method;
  if (/@/.test(contact) && !/^https?:/.test(contact)) {
    return `${method}<br><a href="mailto:${esc(contact)}">${esc(contact)}</a>`;
  }
  return `${method}<br>${link(contact, contact)}`;
}

function jobRow(job) {
  const v = job._verdict;
  return `
    <tr>
      <td><span class="posted posted--${Math.max(0, v.ageDays)}">${esc(ageLabel(v.ageDays))}</span></td>
      <td class="strong">${esc(job.title)}</td>
      <td>${esc(job.company)}</td>
      <td>${esc(job.experience)}</td>
      <td>${esc(job.location)}</td>
      <td>${esc(job.workMode || "—")}</td>
      <td class="skills">${skillChips(job.skills)}</td>
      <td>${esc(job.recruiterName || "—")}${job.recruiterProfile ? `<br>${link(job.recruiterProfile, "Profile")}` : ""}</td>
      <td>${link(job.postUrl, "Post")}</td>
      <td>${applyCell(job)}</td>
    </tr>`;
}

function table(jobs) {
  if (!jobs.length) {
    return `<p class="empty">No matching jobs in this category.</p>`;
  }
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Posted</th><th>Job</th><th>Company</th><th>Experience</th>
            <th>Location</th><th>Work Mode</th><th>Skills</th>
            <th>Recruiter</th><th>LinkedIn Post</th><th>Apply</th>
          </tr>
        </thead>
        <tbody>${jobs.map(jobRow).join("")}</tbody>
      </table>
    </div>`;
}

function recruiterList(recruiters) {
  if (!recruiters.length) {
    return `<p class="empty">No recruiter posted multiple matching jobs in the window.</p>`;
  }
  return `
    <ul class="recruiters">
      ${recruiters.map((r) => `
        <li>
          <span class="strong">${esc(r.name)}</span>
          <span class="muted"> — ${esc(r.company || "—")}</span>
          <span class="badge">${r.count} posts</span>
          ${r.profile ? link(r.profile, "LinkedIn profile") : ""}
        </li>`).join("")}
    </ul>`;
}

function excludedList(excluded) {
  if (!excluded.length) return `<p class="empty">Nothing was filtered out.</p>`;
  return `
    <div class="table-wrap">
      <table class="excluded-table">
        <thead><tr><th>Job</th><th>Company</th><th>Experience</th><th>Location</th><th>Excluded because</th></tr></thead>
        <tbody>
          ${excluded.map((j) => `
            <tr>
              <td>${esc(j.title)}</td>
              <td>${esc(j.company)}</td>
              <td>${esc(j.experience)}</td>
              <td>${esc(j.location)}</td>
              <td class="reasons">${(j._verdict.reasons || []).map((r) => `<span class="reason">${esc(r)}</span>`).join(" ")}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

export function renderResults(root, results, meta = {}) {
  const { total, ncr, remote, activeRecruiters, excluded } = results;
  const noticeHtml = meta.notice
    ? `<div class="notice">${esc(meta.notice)}</div>`
    : "";
  root.innerHTML = `
    ${noticeHtml}
    <p class="headline">Found <strong>${total}</strong> new QA job${total === 1 ? "" : "s"} in the last 7 days
      <span class="meta">(${ncr.length} NCR · ${remote.length} Remote${meta.sourceLabel ? ` · source: ${esc(meta.sourceLabel)}` : ""})</span>
    </p>

    <section class="results-section">
      <h2>NCR Jobs <span class="count">${ncr.length}</span></h2>
      ${table(ncr)}
    </section>

    <section class="results-section">
      <h2>Remote Jobs <span class="count">${remote.length}</span></h2>
      ${table(remote)}
    </section>

    <section class="results-section">
      <h2>Active QA Recruiters</h2>
      ${recruiterList(activeRecruiters)}
    </section>

    <section class="results-section">
      <details>
        <summary>Filtered out (${excluded.length}) — why jobs didn't qualify</summary>
        ${excludedList(excluded)}
      </details>
    </section>`;
}

export function renderError(root, message) {
  root.innerHTML = `<div class="error">⚠️ ${esc(message)}</div>`;
}

export function renderLoading(root) {
  root.innerHTML = `<div class="loading">Loading jobs…</div>`;
}
