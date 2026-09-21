// =============================================================================
// App entry point — wires adapter -> engine -> UI.
// =============================================================================

import { QA_CONFIG } from "./config.js";
import { processJobs } from "./eligibility.js";
import { listAdapters, getAdapter, JsonUrlAdapter, registerAdapter } from "./adapters.js";
import { renderResults, renderError, renderLoading } from "./render.js";

const els = {
  results: document.getElementById("results"),
  adapter: document.getElementById("adapter-select"),
  urlRow: document.getElementById("url-row"),
  urlInput: document.getElementById("feed-url"),
  refresh: document.getElementById("refresh-btn"),
  search: document.getElementById("search-input"),
  updated: document.getElementById("updated-at"),
};

let lastResults = null;

function populateAdapters() {
  els.adapter.innerHTML = listAdapters()
    .map((a) => `<option value="${a.id}">${a.label}</option>`)
    .join("");
}

function applySearch(results, term) {
  const q = (term || "").trim().toLowerCase();
  if (!q) return results;
  const match = (j) =>
    [j.title, j.company, j.location, j.recruiterName, (j.skills || []).join(" ")]
      .join(" ").toLowerCase().includes(q);
  return {
    ...results,
    ncr: results.ncr.filter(match),
    remote: results.remote.filter(match),
    total: results.ncr.filter(match).length + results.remote.filter(match).length,
  };
}

async function loadJobs() {
  const adapterId = els.adapter.value;
  let adapter = getAdapter(adapterId);

  // For the JSON-URL adapter, rebuild it with the current URL each load.
  if (adapterId === "json-url") {
    adapter = registerAdapter(new JsonUrlAdapter(els.urlInput.value.trim()));
  }

  renderLoading(els.results);
  try {
    const jobs = await adapter.fetchJobs();
    lastResults = processJobs(jobs, QA_CONFIG, new Date());
    renderResults(els.results, applySearch(lastResults, els.search.value), {
      sourceLabel: adapter.label,
    });
    els.updated.textContent = `Updated ${new Date().toLocaleString()}`;
  } catch (err) {
    renderError(els.results, `Could not load feed: ${err.message}`);
  }
}

function wireEvents() {
  els.adapter.addEventListener("change", () => {
    els.urlRow.hidden = els.adapter.value !== "json-url";
    loadJobs();
  });
  els.refresh.addEventListener("click", loadJobs);
  els.urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadJobs();
  });
  els.search.addEventListener("input", () => {
    if (lastResults) {
      renderResults(els.results, applySearch(lastResults, els.search.value), {
        sourceLabel: getAdapter(els.adapter.value)?.label,
      });
    }
  });
}

populateAdapters();
wireEvents();
loadJobs();
