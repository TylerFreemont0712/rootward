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

  it("introduces the concepts that build on a thin frontier, each after its prerequisites", () => {
    const VARIABLES = "py.basics.variables";
    const CONDITIONALS = "py.control.conditionals";
    const STRINGS = "py.strings.basics";
    const catalog: PlannerCatalog = {
      nodes: [
        { id: VALUES, realm: "foundry", tier: 0, prerequisites: [] },
        { id: VARIABLES, realm: "foundry", tier: 0, prerequisites: [VALUES] },
        { id: CONDITIONALS, realm: "foundry", tier: 0, prerequisites: [VARIABLES] },
        // Strings also need a concept that is neither mastered nor in this dungeon, so they wait for a later run.
        { id: STRINGS, realm: "foundry", tier: 0, prerequisites: [VARIABLES, "py.basics.io"] },
        { id: "py.basics.io", realm: "foundry", tier: 0, prerequisites: [] },
      ],
      challenges: [VALUES, VARIABLES, CONDITIONALS, STRINGS].flatMap((concept) => [
        fight(`${concept}-a`, concept, 2),
        fight(`${concept}-b`, concept, 3),
      ]),
      puzzles: [],
      lessons: new Set(),
    };
    const plan = expectPlan(planDungeon(planRequest({ catalog })));
    const introduced = (id: string) =>
      Math.min(...plan.rooms.filter((room) => room.nodeId === id && room.purpose === "frontier").map((room) => room.floor));
    expect(introduced(VALUES)).toBe(0);
    expect(introduced(VARIABLES)).toBeGreaterThan(introduced(VALUES));
    expect(introduced(CONDITIONALS)).toBeGreaterThan(introduced(VARIABLES));
    expect(plan.rooms.some((room) => room.nodeId === STRINGS)).toBe(false);
    const explained = plan.rationale.filter((entry) => entry.nodeId === VARIABLES).map((entry) => entry.text);
    expect(explained).toContainEqual(expect.stringMatching(/^Next: py\.basics\.variables builds on py\.basics\.values/));
  });

  it("never picks a fight that also needs a concept the player has not met", () => {
    const DICT = "py.collections.dict";
    const catalog: PlannerCatalog = {
      nodes: [
        { id: VALUES, realm: "foundry", tier: 0, prerequisites: [] },
        { id: DICT, realm: "foundry", tier: 1, prerequisites: ["py.collections.list"] },
      ],
      // The two-concept fight is the better match for the target success rate, but it also needs dictionaries.
      challenges: [fight("values-easy", VALUES, 1), { ...fight("values-and-dict", VALUES, 3), concepts: [VALUES, DICT] }],
      puzzles: [],
      lessons: new Set(),
    };
    const fresh = expectPlan(planDungeon(planRequest({ catalog, length: "short" })));
    expect(fresh.rooms.map((room) => room.challengeId)).not.toContain("values-and-dict");

    const metDicts = { ...EMPTY_LEARNER, nodes: new Map([[DICT, { mastery: 1, rating: 1000, rotting: false }]]) };
    const later = expectPlan(planDungeon(planRequest({ catalog, learner: metDicts, length: "short" })));
    expect(later.rooms.find((room) => room.purpose === "frontier")?.challengeId).toBe("values-and-dict");
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
