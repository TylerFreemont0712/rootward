import { describe, expect, it } from "vitest";
import { planDungeon } from "../src/planner/plan.ts";
import type { DungeonPlan, PlannerCatalog, PlannerChallenge, PlanResult } from "../src/index.ts";
import { EMPTY_LEARNER, planRequest } from "./planner-fixtures.ts";

const VALUES = "py.basics.values";

function fight(id: string, concept: string, difficulty: number, languages = ["python", "javascript"]): PlannerChallenge {
  return { id, kind: "encounter", realm: "foundry", concepts: [concept], difficulty, languages };
}

/** One root concept with nine fights of difficulty 1-9 and a Shrine lesson. */
function valuesCatalog(): PlannerCatalog {
  return {
    nodes: [
      { id: VALUES, realm: "foundry", tier: 0, prerequisites: [] },
      { id: "py.control.loops", realm: "foundry", tier: 0, prerequisites: [VALUES] },
    ],
    challenges: Array.from({ length: 9 }, (_, i) => fight(`values-d${i + 1}`, VALUES, i + 1)),
    puzzles: [],
    lessons: new Set([VALUES]),
  };
}

function learnerAt(mastery: number, extras: Partial<typeof EMPTY_LEARNER> = {}) {
  return { ...EMPTY_LEARNER, nodes: new Map([[VALUES, { mastery, rating: 1000, rotting: false }]]), ...extras };
}

function expectPlan(result: PlanResult): DungeonPlan {
  if (!result.ok) throw new Error(`expected a plan, got ${result.error.code}: ${result.error.message}`);
  return result.plan;
}

describe("planDungeon", () => {
  it("puts a Shrine directly before the first fight of a brand-new concept", () => {
    const plan = expectPlan(planDungeon(planRequest({ catalog: valuesCatalog(), length: "short" })));
    const shrine = plan.rooms.find((room) => room.kind === "shrine");
    expect(shrine).toMatchObject({ floor: 0, nodeId: VALUES });
    expect(plan.floors[0]).toHaveLength(1);
    const next = plan.rooms.filter((room) => room.floor === 1);
    expect(next.every((room) => room.nodeId === VALUES && (room.kind === "encounter" || room.kind === "elite"))).toBe(true);
  });

  it("chooses the fight whose expected success is closest to the frontier target", () => {
    // Rating 1000 vs difficulty 3 (rating 800) gives about 76% success, the closest to the 75% target.
    const plan = expectPlan(planDungeon(planRequest({ catalog: valuesCatalog(), learner: learnerAt(1), length: "short" })));
    const frontier = plan.rooms.find((room) => room.purpose === "frontier" && room.kind === "encounter");
    expect(frontier?.challengeId).toBe("values-d3");
    expect(frontier?.expectedSuccess).toBeCloseTo(0.76, 2);
  });

  it("sends due cards to a Rest that is never the first room", () => {
    const dueCards = [1, 2, 3].map((n) => ({ cardId: `${VALUES}#c${n}`, nodeId: VALUES }));
    const plan = expectPlan(planDungeon(planRequest({ catalog: valuesCatalog(), learner: learnerAt(1, { dueCards }) })));
    const rest = plan.rooms.find((room) => room.kind === "rest");
    expect(rest?.cardIds).toEqual(dueCards.map((card) => card.cardId));
    expect(rest?.floor).toBeGreaterThan(0);
  });

  it("skips recently seen fights while fresh ones remain", () => {
    const learner = learnerAt(1, { recentChallenges: new Set(["values-d3"]) });
    const plan = expectPlan(planDungeon(planRequest({ catalog: valuesCatalog(), learner, length: "short" })));
    const frontier = plan.rooms.find((room) => room.purpose === "frontier" && room.kind === "encounter");
    expect(frontier?.challengeId).toBe("values-d2");
  });

  it("lets a JavaScript player practice a concept through another language's challenge", () => {
    const catalog: PlannerCatalog = {
      nodes: [
        { id: "concept.mappings", realm: "foundry", tier: 1, prerequisites: [] },
        { id: "py.collections.dict", realm: "foundry", tier: 1, prerequisites: [], transfersTo: "concept.mappings" },
      ],
      challenges: [fight("tally-wisp", "py.collections.dict", 3), fight("python-only", "py.collections.dict", 3, ["python"])],
      puzzles: [],
      lessons: new Set(),
    };
    const plan = expectPlan(planDungeon(planRequest({ catalog, language: "javascript" })));
    expect(plan.rooms.find((room) => room.kind === "encounter")).toMatchObject({
      nodeId: "concept.mappings",
      challengeId: "tally-wisp",
    });
    expect(plan.rooms.some((room) => room.challengeId === "python-only")).toBe(false);
  });

  it("shortens the expedition and explains why when content is thin", () => {
    const catalog: PlannerCatalog = { ...valuesCatalog(), challenges: [fight("only-fight", VALUES, 3)], lessons: new Set() };
    const plan = expectPlan(planDungeon(planRequest({ catalog, learner: learnerAt(1) })));
    expect(plan.floors).toHaveLength(2);
    expect(plan.rooms.map((room) => room.kind)).toEqual(["encounter", "boss"]);
    const fallbacks = plan.rationale.filter((entry) => entry.kind === "fallback").map((entry) => entry.text);
    expect(fallbacks.some((text) => text.includes("shorter than usual"))).toBe(true);
    expect(fallbacks.some((text) => text.includes("repeats"))).toBe(true);
  });

  it("refuses to plan when nothing is playable in the chosen language", () => {
    const result = planDungeon(planRequest({ catalog: valuesCatalog(), language: "go" }));
    expect(result).toMatchObject({ ok: false, error: { code: "no-content" } });
  });

  it("produces the same plan for the same seed", () => {
    const request = planRequest({ catalog: valuesCatalog(), learner: learnerAt(1) });
    expect(planDungeon(request)).toEqual(planDungeon(request));
  });
});
