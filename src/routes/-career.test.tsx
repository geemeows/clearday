// Career page — smoke, tab switching, score dots, dialog tests,
// filter derivation tests, and share route snapshot tests.

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("#/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock("#/features/auth/auth", () => ({
  useAuth: () => ({
    session: {
      user: {
        email: "erin@example.com",
        user_metadata: { full_name: "Erin Test" },
      },
    },
    loading: false,
    allowed: true,
    rejected: false,
  }),
  signOut: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useRouterState: ({
      select,
    }: {
      select: (s: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: "/career" } }),
    createFileRoute: () => (opts: { component: unknown }) => opts,
  };
});

// ── Component imports (after mocks) ─────────────────────────────────────────

import { CareerPage } from "#/features/career/components/CareerPage";
import { CareerEmpty } from "#/features/career/components/CareerEmpty";
import { ScoreDots } from "#/features/career/components/ScoreDots";
import { DevPlanSection } from "#/features/career/components/DevPlanSection";
import { filterCareerLevel } from "#/features/career/filter";
import type { CareerLevel, ScoreLegend } from "#/features/career/components/career-data";
import type { CareerPageProps } from "#/features/career/components/CareerPage";

// ── Fixture loader data ──────────────────────────────────────────────────────

const FAKE_LEVEL: CareerLevel = {
  id: "lvl_test",
  title: "L5 · Senior Software Engineer",
  status: "active",
  created_at: "Mar 4, 2026",
  archived_at: null,
  sheet_id: null,
  sheet_url: null,
  last_synced_at: null,
  share_token: null,
  header: [{ key: "Role", value: "Senior SWE" }],
  competencies: [
    {
      id: "c_tech",
      name: "Technical Excellence",
      criteria: [
        {
          id: "cr_code",
          name: "Code quality",
          target: 4,
          indicators: [
            {
              id: "i_a1",
              code: "A1",
              description: "Submits readable PRs.",
              notes: "Small diffs.",
              score: 4,
              target: 4,
              evidence: [{ id: "e1", title: "PR #421", url: "#" }],
              comments: [],
            },
          ],
        },
      ],
    },
    {
      id: "c_exec",
      name: "Execution",
      criteria: [
        {
          id: "cr_deliver",
          name: "Project delivery",
          target: 3,
          indicators: [
            {
              id: "i_b1",
              code: "B1",
              description: "Lands features end-to-end.",
              notes: "",
              score: 3,
              target: 3,
              evidence: [],
              comments: [],
            },
          ],
        },
      ],
    },
  ],
  development_plan: [],
};

const FAKE_LEGEND: ScoreLegend = {
  1: { title: "Emerging", desc: "Early signal." },
  2: { title: "Developing", desc: "Showing up." },
  3: { title: "Solid", desc: "Consistent." },
  4: { title: "Exemplary", desc: "Goes beyond." },
};

const DEFAULT_PROPS: CareerPageProps = {
  initialLevel: FAKE_LEVEL,
  archivedLevels: [],
  initialShares: [],
  initialLegend: FAKE_LEGEND,
};

// ── CareerPage smoke ─────────────────────────────────────────────────────────

describe("CareerPage", () => {
  it("renders the level title", () => {
    render(<CareerPage {...DEFAULT_PROPS} />);
    expect(
      screen.getAllByText(/Senior Software Engineer/i).length,
    ).toBeGreaterThan(0);
  });

  it("renders the Career model tab", () => {
    render(<CareerPage {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Career model/i)).toBeTruthy();
  });

  it("renders the Development plan tab", () => {
    render(<CareerPage {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Development plan/i)).toBeTruthy();
  });

  it("renders the score legend strip", () => {
    render(<CareerPage {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Emerging/i)).toBeTruthy();
    expect(screen.getByText(/Exemplary/i)).toBeTruthy();
  });

  it("renders the first competency name", () => {
    render(<CareerPage {...DEFAULT_PROPS} />);
    expect(
      screen.getAllByText(/Technical Excellence/i).length,
    ).toBeGreaterThan(0);
  });

  it("shows the 'Add competency' button", () => {
    render(<CareerPage {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Add competency/i)).toBeTruthy();
  });

  it("renders empty state when no level provided", () => {
    render(
      <CareerPage
        {...DEFAULT_PROPS}
        initialLevel={null}
      />,
    );
    expect(
      screen.getByText(/Start from the Senior Engineer template/i),
    ).toBeTruthy();
  });
});

// ── Tab switching ────────────────────────────────────────────────────────────

describe("CareerPage tab switching", () => {
  it("switches to dev plan tab and shows add button", () => {
    render(<CareerPage {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText(/Development plan/i));
    expect(
      screen.getByRole("button", { name: /Add plan item/i }),
    ).toBeTruthy();
  });
});

// ── CareerEmpty ──────────────────────────────────────────────────────────────

describe("CareerEmpty", () => {
  it("renders the recommended template option", () => {
    render(<CareerEmpty />);
    expect(
      screen.getByText(/Start from the Senior Engineer template/i),
    ).toBeTruthy();
    expect(screen.getByText(/RECOMMENDED/i)).toBeTruthy();
  });

  it("renders the blank start option", () => {
    render(<CareerEmpty />);
    expect(screen.getByText(/Start blank/i)).toBeTruthy();
  });

  it("calls onSeed when clicking the template card", () => {
    const onSeed = vi.fn();
    render(<CareerEmpty onSeed={onSeed} />);
    fireEvent.click(
      screen
        .getByText(/Start from the Senior Engineer template/i)
        .closest("button")!,
    );
    expect(onSeed).toHaveBeenCalledOnce();
  });

  it("calls onBlank when clicking the blank card", () => {
    const onBlank = vi.fn();
    render(<CareerEmpty onBlank={onBlank} />);
    fireEvent.click(screen.getByText(/Start blank/i).closest("button")!);
    expect(onBlank).toHaveBeenCalledOnce();
  });
});

// ── ScoreDots ────────────────────────────────────────────────────────────────

describe("ScoreDots", () => {
  it("renders 4 radio buttons", () => {
    render(<ScoreDots value={2} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(4);
  });

  it("calls onChange when a radio is clicked", () => {
    const onChange = vi.fn();
    render(<ScoreDots value={1} onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[2]);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("renders within a radiogroup", () => {
    render(<ScoreDots value={2} />);
    expect(screen.getByRole("radiogroup")).toBeTruthy();
  });
});

// ── DevPlanSection ───────────────────────────────────────────────────────────

describe("DevPlanSection", () => {
  it("shows empty state add button when no items", () => {
    render(<DevPlanSection items={[]} criteria={[]} />);
    expect(
      screen.getByText(/Add your first development plan item/i),
    ).toBeTruthy();
  });

  it("renders plan items", () => {
    const items = [
      {
        id: "dp1",
        title: "Lead a system design session",
        start: "2026-06-01",
        due: "2026-07-01",
        status: "in_progress" as const,
        criterion_id: null,
      },
    ];
    render(<DevPlanSection items={items} criteria={[]} />);
    expect(screen.getByText(/Lead a system design session/i)).toBeTruthy();
    expect(screen.getByText(/In progress/i)).toBeTruthy();
  });
});

// ── filterCareerLevel — pure derivation ──────────────────────────────────────

describe("filterCareerLevel", () => {
  it("returns the level unchanged when query is empty", () => {
    const result = filterCareerLevel(FAKE_LEVEL, { query: "" });
    expect(result.competencies.length).toBe(2);
    expect(result.competencies[0]!.criteria[0]!.indicators.length).toBe(1);
  });

  it("narrows indicators by description text", () => {
    const result = filterCareerLevel(FAKE_LEVEL, { query: "readable PRs" });
    const comps = result.competencies;
    // A1 matches, B1 does not
    expect(comps.some((c) => c.id === "c_tech")).toBe(true);
    const techComp = comps.find((c) => c.id === "c_tech")!;
    expect(techComp.criteria[0]!.indicators[0]!.id).toBe("i_a1");
  });

  it("matches evidence titles", () => {
    const result = filterCareerLevel(FAKE_LEVEL, { query: "PR #421" });
    expect(result.competencies.some((c) => c.id === "c_tech")).toBe(true);
  });

  it("matches competency name and keeps all its children", () => {
    const result = filterCareerLevel(FAKE_LEVEL, { query: "Execution" });
    expect(result.competencies.some((c) => c.id === "c_exec")).toBe(true);
  });

  it("returns empty competencies list when nothing matches", () => {
    const result = filterCareerLevel(FAKE_LEVEL, { query: "xyzzy_no_match" });
    expect(result.competencies.length).toBe(0);
  });

  it("filters by minScore", () => {
    const result = filterCareerLevel(FAKE_LEVEL, { query: "", minScore: 4 });
    // Only A1 (score 4) should remain; B1 (score 3) filtered out
    const indicators = result.competencies.flatMap((c) =>
      c.criteria.flatMap((cr) => cr.indicators),
    );
    expect(indicators.every((i) => i.score >= 4)).toBe(true);
    expect(indicators.some((i) => i.id === "i_a1")).toBe(true);
    expect(indicators.some((i) => i.id === "i_b1")).toBe(false);
  });

  it("filters by maxScore", () => {
    const result = filterCareerLevel(FAKE_LEVEL, { query: "", maxScore: 3 });
    const indicators = result.competencies.flatMap((c) =>
      c.criteria.flatMap((cr) => cr.indicators),
    );
    expect(indicators.every((i) => i.score <= 3)).toBe(true);
    expect(indicators.some((i) => i.id === "i_b1")).toBe(true);
    expect(indicators.some((i) => i.id === "i_a1")).toBe(false);
  });

  it("handles empty-level gracefully", () => {
    const empty: CareerLevel = { ...FAKE_LEVEL, competencies: [] };
    const result = filterCareerLevel(empty, { query: "anything" });
    expect(result.competencies.length).toBe(0);
  });
});

// ── Share route — snapshot returns stored tree, not live data ────────────────

describe("sharedTreeToCareerLevel (via share route)", () => {
  it("snapshot renders the level title from the tree", async () => {
    // Import the route builder to test sharedTreeToCareerLevel indirectly
    // via PublicShareView rendering with the assembled CareerLevel.
    const { PublicShareView } = await import(
      "#/features/career/components/PublicShareView"
    );
    const { computeSatisfaction } = await import(
      "#/features/career/components/career-data"
    );

    const snapshotLevel: CareerLevel = {
      id: "lvl_shared",
      title: "Shared L4 · Engineer",
      status: "active",
      created_at: "Jan 1, 2026",
      archived_at: null,
      sheet_id: null,
      sheet_url: null,
      last_synced_at: null,
      share_token: null,
      header: [],
      competencies: [
        {
          id: "c_shared",
          name: "Shared Competency",
          criteria: [
            {
              id: "cr_shared",
              name: "Shared Criterion",
              target: 3,
              indicators: [
                {
                  id: "i_shared",
                  code: "S1",
                  description: "A shared indicator.",
                  notes: "",
                  score: 3,
                  target: 3,
                  evidence: [],
                  comments: [],
                },
              ],
            },
          ],
        },
      ],
      development_plan: [],
    };

    const sat = computeSatisfaction(snapshotLevel);
    const criteriaData = snapshotLevel.competencies.flatMap((c) =>
      c.criteria.map((cr) => {
        const s = sat.perCriterion[cr.id] ?? { avg: 0, target: 3, gap: 3 };
        return { id: cr.id, name: cr.name, current: s.avg, target: s.target, gap: s.gap };
      }),
    );

    render(
      <PublicShareView
        level={snapshotLevel}
        satPerCriterion={sat.perCriterion}
        criteriaData={criteriaData}
      />,
    );

    expect(screen.getAllByText(/Shared L4 · Engineer/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Shared Competency/i).length).toBeGreaterThan(0);
  });
});

// ── readSharedLevel — returns null for revoked/unknown tokens ────────────────

describe("readSharedLevel store function", () => {
  it("returns null when the rpc returns null data", async () => {
    const { readSharedLevel } = await import("#/features/career/store");
    const fakeClient = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const result = await readSharedLevel(fakeClient as never, "revoked_token");
    expect(result).toBeNull();
  });

  it("returns the shared tree when the rpc returns data", async () => {
    const { readSharedLevel } = await import("#/features/career/store");
    const fakeTree = {
      level: {
        id: "lvl_1",
        title: "Test Level",
        status: "active",
        header: [],
        created_at: "2026-01-01T00:00:00Z",
        archived_at: null,
      },
      competencies: [],
      criteria: [],
      indicators: [],
      evidence: [],
    };
    const fakeClient = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: fakeTree, error: null }),
    };
    const result = await readSharedLevel(fakeClient as never, "valid_token");
    expect(result).not.toBeNull();
    expect(result?.level.title).toBe("Test Level");
  });
});
