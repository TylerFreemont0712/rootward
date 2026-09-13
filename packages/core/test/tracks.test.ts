import { describe, expect, it } from "vitest";
import { isLanguageNode, viewForLanguage } from "../src/planner/tracks.ts";
import type { LearnerSnapshot, PlannerCatalog, PlannerNode } from "../src/planner/types.ts";

const node = (id: string, prerequisites: string[] = [], transfersTo?: string): PlannerNode => ({
  id,
  realm: "foundry",
  tier: 0,
  prerequisites,
  ...(transfersTo !== undefined ? { transfersTo } : {}),
});

const catalog: PlannerCatalog = {
  nodes: [
    node("concept.values"),
    node("concept.mappings", ["concept.values"]),
    node("concept.recursion", ["concept.values"]),
    node("py.basics.values", [], "concept.values"),
    node("py.collections.dict", ["py.basics.values"], "concept.mappings"),
    node("js.basics.values", [], "concept.values"),
  ],
  challenges: [],
  puzzles: [],
  lessons: new Set(),
};

function learner(mastery: Record<string, number>): LearnerSnapshot {
  return {
    nodes: new Map(Object.entries(mastery).map(([id, m]) => [id, { mastery: m, rating: 1000, rotting: false }])),
    dueCards: [],
    recentChallenges: new Set(),
  };
}

describe("language tracks", () => {
  it("tells language nodes from shared nodes", () => {
    expect(isLanguageNode("py.collections.dict")).toBe(true);
    expect(isLanguageNode("concept.mappings")).toBe(false);
  });

  it("schedules a language's own nodes plus shared nodes it has no equivalent for", () => {
    const python = viewForLanguage(catalog, learner({}), "python", 1000);
    expect(python.applicable.map((n) => n.id)).toEqual([
      "concept.recursion",
      "py.basics.values",
      "py.collections.dict",
    ]);
    const javascript = viewForLanguage(catalog, learner({}), "javascript", 1000);
    expect(javascript.applicable.map((n) => n.id)).toEqual(["concept.mappings", "concept.recursion", "js.basics.values"]);
  });

  it("gives a shared node the best mastery of its language nodes", () => {
    const view = viewForLanguage(catalog, learner({ "py.basics.values": 4 }), "javascript", 1000);
    expect(view.progress("concept.values").mastery).toBe(4);
    expect(view.progress("js.basics.values").mastery).toBe(0);
    expect(view.prerequisitesMet("concept.mappings", 3)).toBe(true);
  });

  it("keeps two lessons of the same track apart, even when they share a concept", () => {
    const strings: PlannerCatalog = {
      ...catalog,
      nodes: [
        node("concept.strings"),
        node("py.strings.basics", [], "concept.strings"),
        node("py.strings.split", ["py.strings.basics"], "concept.strings"),
        node("js.strings.basics", [], "concept.strings"),
      ],
    };
    const python = viewForLanguage(strings, learner({}), "python", 1000);
    expect([...python.equivalents("py.strings.split")].sort()).toEqual([
      "concept.strings",
      "js.strings.basics",
      "py.strings.split",
    ]);

    // A JavaScript player who has met strings in Python has met them through the shared concept.
    const javascript = viewForLanguage(strings, learner({ "py.strings.split": 2 }), "javascript", 1000);
    expect(javascript.mastery("py.strings.basics")).toBe(2);
    expect(javascript.mastery("js.strings.basics")).toBe(0);
  });

  it("treats challenges for other languages' equivalent nodes as practice", () => {
    const view = viewForLanguage(catalog, learner({}), "javascript", 1000);
    expect([...view.equivalents("concept.mappings")].sort()).toEqual(["concept.mappings", "py.collections.dict"]);
    expect([...view.equivalents("js.basics.values")].sort()).toEqual([
      "concept.values",
      "js.basics.values",
      "py.basics.values",
    ]);
  });
});
