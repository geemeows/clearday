// First-run seed for the Career feature. Hardcoded TS data — no fixtures
// table. Replaces the empty-state create-form with a small but useful tree
// so a brand-new user lands on something real instead of a blank slate.
//
// Shape mirrors the store's nested level → competency → criterion → indicator
// shape. Evidence is intentionally empty — the user adds their own. Targets
// and scores stay in 1–4 (post-0029 rescale); score is implicit at 1 from
// createIndicator's seed. The seeder generates fresh ids per row so multiple
// runs (in tests) don't collide.

export type SampleIndicator = {
  description: string;
  code?: string;
  notes?: string;
};

export type SampleCriterion = {
  name: string;
  target: number;
  indicators: SampleIndicator[];
};

export type SampleCompetency = {
  name: string;
  criteria: SampleCriterion[];
};

export type SampleTemplate = {
  title: string;
  competencies: SampleCompetency[];
};

export const SAMPLE_TEMPLATE: SampleTemplate = {
  title: "Sample",
  competencies: [
    {
      name: "Engineering Excellence",
      criteria: [
        {
          name: "Code review depth",
          target: 3,
          indicators: [
            { code: "A", description: "Reviews land within 24h" },
            { code: "B", description: "Catches non-trivial design issues" },
          ],
        },
        {
          name: "Production reliability",
          target: 3,
          indicators: [
            { code: "A", description: "Owns one critical service end-to-end" },
            { code: "B", description: "Holds on-call without escalating routine issues" },
          ],
        },
      ],
    },
    {
      name: "Collaboration",
      criteria: [
        {
          name: "Mentoring",
          target: 2,
          indicators: [
            { code: "A", description: "Pairs weekly with a junior teammate" },
          ],
        },
        {
          name: "Cross-team alignment",
          target: 2,
          indicators: [
            { code: "A", description: "Drives one cross-team doc per quarter" },
          ],
        },
      ],
    },
  ],
};
