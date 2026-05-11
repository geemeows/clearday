// Devy — Career data (Senior Software Engineer L4 → L5 sample)
// Tree shape: Competency → Criterion (target) → Indicator (score 0–4) → Evidence

const CAREER_LEGEND = {
  0: "Not yet",
  1: "Emerging",
  2: "Developing",
  3: "Solid",
  4: "Exemplary",
};

const ACTIVE_LEVEL = {
  id: "lvl_l5",
  title: "L5 · Senior Software Engineer",
  status: "active",
  created_at: "Mar 4, 2026",
  archived_at: null,
  sheet_id: "1Bx9a-cM2v0kP4WnLrTq",
  sheet_url: "https://docs.google.com/spreadsheets/d/1Bx9a-cM2v0kP4WnLrTq",
  last_synced_at: "4m ago",
  share_token: "kxq2-8m9p-r4v0",
  header: [
    { key: "Role", value: "Senior Software Engineer" },
    { key: "Track", value: "IC" },
    { key: "Manager", value: "Priya Mehta" },
    { key: "Started", value: "Mar 2026" },
    { key: "Target review", value: "Q3 2026" },
  ],
  competencies: [
    {
      id: "c_tech", name: "Technical Excellence",
      criteria: [
        {
          id: "cr_code", name: "Code quality", target: 4,
          indicators: [
            { id: "i_a1", code: "A1", description: "Submits readable, well-structured PRs that need minimal stylistic feedback.", notes: "Small diffs, clear commit messages, intentional naming.", score: 4,
              evidence: [
                { id: "e1", title: "PR #421 · order-cache TTL", url: "#", card_id: "card_421" },
                { id: "e2", title: "PR #408 · idempotency middleware", url: "#" },
              ] },
            { id: "i_a2", code: "A2", description: "Refactors opportunistically — leaves the campsite cleaner without scope creep.", notes: "", score: 3,
              evidence: [
                { id: "e3", title: "Cleanup: signal-store types", url: "#" },
              ] },
            { id: "i_a3", code: "A3", description: "Catches subtle correctness issues in code review beyond style.", notes: "", score: 3,
              evidence: [] },
          ],
        },
        {
          id: "cr_sys", name: "System design", target: 3,
          indicators: [
            { id: "i_b1", code: "B1", description: "Designs services with clear boundaries, failure modes, and observability.", notes: "Recently led design of the briefing-cache layer.", score: 3,
              evidence: [
                { id: "e4", title: "RFC: briefing cache", url: "#", card_id: "card_rfc1" },
                { id: "e5", title: "Postmortem: 04-12 incident", url: "#" },
              ] },
            { id: "i_b2", code: "B2", description: "Reasons about tradeoffs across consistency, latency, and cost.", notes: "", score: 2,
              evidence: [] },
          ],
        },
      ],
    },
    {
      id: "c_exec", name: "Execution",
      criteria: [
        {
          id: "cr_deliver", name: "Project delivery", target: 4,
          indicators: [
            { id: "i_c1", code: "C1", description: "Lands medium-sized features end-to-end with minimal supervision.", notes: "", score: 3,
              evidence: [
                { id: "e6", title: "DEV-441 · briefing v2", url: "#", card_id: "card_441" },
              ] },
            { id: "i_c2", code: "C2", description: "Anticipates risk, surfaces blockers early, and adjusts scope to hit dates.", notes: "", score: 3,
              evidence: [] },
            { id: "i_c3", code: "C3", description: "Drives a project across 2+ contributors to a shipped outcome.", notes: "Stretch indicator for L5.", score: 2,
              evidence: [
                { id: "e7", title: "Sources rail rollout (notes)", url: "#" },
              ] },
          ],
        },
        {
          id: "cr_estimate", name: "Estimation", target: 3,
          indicators: [
            { id: "i_d1", code: "D1", description: "Breaks work into estimable chunks; commitments land within ±30%.", notes: "", score: 3,
              evidence: [] },
            { id: "i_d2", code: "D2", description: "Re-estimates aloud as scope changes — no silent slippage.", notes: "", score: 2,
              evidence: [] },
          ],
        },
      ],
    },
    {
      id: "c_collab", name: "Collaboration",
      criteria: [
        {
          id: "cr_review", name: "Code review", target: 3,
          indicators: [
            { id: "i_e1", code: "E1", description: "Turns reviews around within a working day; feedback is specific and kind.", notes: "", score: 4,
              evidence: [
                { id: "e8", title: "Review log · last 30d", url: "#" },
              ] },
            { id: "i_e2", code: "E2", description: "Distinguishes blocking concerns from preferences; explains the why.", notes: "", score: 3,
              evidence: [] },
          ],
        },
        {
          id: "cr_comm", name: "Communication", target: 3,
          indicators: [
            { id: "i_f1", code: "F1", description: "Writes design docs that a stranger can follow without a meeting.", notes: "", score: 3,
              evidence: [
                { id: "e9", title: "RFC: briefing cache", url: "#" },
              ] },
            { id: "i_f2", code: "F2", description: "Async-first — defaults to writing, escalates to meetings when warranted.", notes: "", score: 3,
              evidence: [] },
            { id: "i_f3", code: "F3", description: "Status updates land before they're asked for.", notes: "", score: 2,
              evidence: [] },
          ],
        },
      ],
    },
    {
      id: "c_lead", name: "Leadership",
      criteria: [
        {
          id: "cr_mentor", name: "Mentoring", target: 2,
          indicators: [
            { id: "i_g1", code: "G1", description: "Pairs with juniors on tough problems without taking the keyboard.", notes: "", score: 3,
              evidence: [
                { id: "e10", title: "Mentoring notes · Sam", url: "#" },
              ] },
            { id: "i_g2", code: "G2", description: "Gives feedback that names a behavior, not a person.", notes: "", score: 2,
              evidence: [] },
          ],
        },
        {
          id: "cr_direction", name: "Tech direction", target: 3,
          indicators: [
            { id: "i_h1", code: "H1", description: "Argues for technical positions in writing; updates them when persuaded.", notes: "Stretch for L5.", score: 2,
              evidence: [] },
            { id: "i_h2", code: "H2", description: "Identifies areas of the codebase that need investment, with cost framed.", notes: "", score: 1,
              evidence: [] },
          ],
        },
      ],
    },
    {
      id: "c_impact", name: "Impact",
      criteria: [
        {
          id: "cr_outcomes", name: "Business outcomes", target: 3,
          indicators: [
            { id: "i_j1", code: "J1", description: "Connects technical work to a metric, OKR, or customer outcome.", notes: "", score: 3,
              evidence: [
                { id: "e11", title: "Q1 review notes", url: "#" },
              ] },
            { id: "i_j2", code: "J2", description: "Makes pragmatic tradeoffs when correctness and shipping conflict.", notes: "", score: 3,
              evidence: [] },
          ],
        },
        {
          id: "cr_cross", name: "Cross-team", target: 3,
          indicators: [
            { id: "i_k1", code: "K1", description: "Coordinates with adjacent teams without escalating to managers.", notes: "", score: 2,
              evidence: [] },
            { id: "i_k2", code: "K2", description: "Represents the team well in design reviews and incident calls.", notes: "", score: 2,
              evidence: [] },
          ],
        },
      ],
    },
  ],
};

const ARCHIVED_LEVELS = [
  {
    id: "lvl_l4",
    title: "L4 · Software Engineer",
    status: "archived",
    created_at: "Aug 12, 2024",
    archived_at: "Mar 4, 2026",
    sheet_id: "1Cy7m-aR9zV2tHxKs",
    sheet_url: "#",
    last_synced_at: "archived",
    summary: { competencies: 5, criteria: 11, indicators: 24, evidence: 32, current_avg: 3.4 },
  },
  {
    id: "lvl_l3",
    title: "L3 · Junior Engineer",
    status: "archived",
    created_at: "Jan 4, 2023",
    archived_at: "Aug 12, 2024",
    sheet_id: "1Az3p-bT5hY8wQrLn",
    sheet_url: "#",
    last_synced_at: "archived",
    summary: { competencies: 4, criteria: 9, indicators: 19, evidence: 21, current_avg: 3.1 },
  },
];

// Pure compute — per-competency current avg + per-criterion avg, used by tree badges + wheel.
function computeSatisfaction(level) {
  const out = { perCompetency: [], perCriterion: {} };
  for (const c of level.competencies) {
    let scores = [];
    let targetSum = 0, targetCount = 0;
    for (const cr of c.criteria) {
      const inds = cr.indicators.filter(i => !i.deleted_at);
      const crAvg = inds.length ? inds.reduce((s,i)=>s+i.score,0)/inds.length : 0;
      out.perCriterion[cr.id] = { avg: crAvg, target: cr.target, gap: cr.target - crAvg };
      scores = scores.concat(inds.map(i=>i.score));
      targetSum += cr.target; targetCount += 1;
    }
    const current = scores.length ? scores.reduce((a,b)=>a+b,0) / scores.length : 0;
    const target = targetCount ? targetSum / targetCount : 0;
    out.perCompetency.push({ id: c.id, name: c.name, current, target, gap: target - current });
  }
  return out;
}

window.CareerData = { CAREER_LEGEND, ACTIVE_LEVEL, ARCHIVED_LEVELS, computeSatisfaction };
