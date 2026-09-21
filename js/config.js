// =============================================================================
// QA Skill-Set Configuration
// -----------------------------------------------------------------------------
// This file encodes the "QA skill set" the board filters against. It is the
// single source of truth for the eligibility rules. Editing this file changes
// what the board considers a matching job — no engine changes required.
//
// Phase 2 (frontend developer) can ship a second config object with the same
// shape and let the user pick a profile.
// =============================================================================

export const QA_CONFIG = {
  id: "qa",
  label: "QA / Testing / Automation / SDET",

  // --- 1. Experience -------------------------------------------------------
  // A job is eligible only when its MINIMUM required experience is below this
  // many years. There is deliberately NO maximum-experience limit.
  maxAllowedMinExperienceExclusive: 3, // min experience must be < 3 years

  // --- 2. Location ---------------------------------------------------------
  // Matching is done on normalized (lowercased, trimmed) tokens found anywhere
  // in a job's location string.
  ncrLocations: [
    "noida",
    "greater noida",
    "delhi",
    "new delhi",
    "gurgaon",
    "gurugram",
    "delhi ncr",
    "ncr",
  ],
  remoteLocations: [
    "remote",
    "remote india",
    "work from home",
    "wfh",
    "fully remote",
    "pan india remote",
    "anywhere in india",
  ],

  // --- 3. Post date --------------------------------------------------------
  // Only posts published within this many days are eligible.
  freshnessDays: 7,

  // --- Roles ---------------------------------------------------------------
  // A job's title must contain at least one of these role signals. Multi-word
  // entries are matched as substrings; short/ambiguous ones (like "qa" and
  // "sdet") are matched on word boundaries to avoid false positives.
  roleKeywords: [
    "qa engineer",
    "quality analyst",
    "quality assurance",
    "software qa",
    "qa analyst",
    "junior qa",
    "qa trainee",
    "qa associate",
    "software tester",
    "test engineer",
    "testing engineer",
    "software testing",
    "test analyst",
    "manual tester",
    "manual qa",
    "manual testing",
    "qa automation",
    "automation test",
    "automation qa",
    "automation tester",
    "junior automation",
    "software development engineer in test",
    "associate sdet",
  ],
  // Matched on word boundaries only (see eligibility.js).
  roleWordBoundaryKeywords: ["qa", "sdet", "tester"],

  // --- Technologies (used for display/highlighting, not for eligibility) ---
  skills: [
    "Selenium", "Playwright", "Cypress", "Appium", "Postman", "API Testing",
    "REST API", "Java", "JavaScript", "TypeScript", "Python", "SQL",
    "Manual Testing", "Automation Testing", "Functional Testing",
    "Regression Testing", "Integration Testing", "Performance Testing",
    "Jenkins", "CI/CD", "Git", "GitHub", "GitLab",
  ],

  // --- Recruiter tracking --------------------------------------------------
  // A recruiter is considered "active" when they have this many or more
  // matching posts in the freshness window.
  activeRecruiterMinPosts: 2,
};

// Registry so Phase 2 can add more profiles (e.g. FRONTEND_CONFIG).
export const PROFILES = {
  [QA_CONFIG.id]: QA_CONFIG,
};
