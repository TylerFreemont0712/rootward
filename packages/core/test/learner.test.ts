import { describe, expect, it } from "vitest";
import {
  buildLearnerModel,
  creditedNodes,
  type DungeonPlan,
  type EncounterSetup,
  evidenceFromRun,
  type LearnerContext,
  learnerSnapshot,
  type PlannerNode,
  RunEvent,
  type TimedEvent,
} from "../src/index.ts";
import {
  ALL_FAIL,
  ALL_PASS,
  balance,
  type EncounterOptions,
  makeClass,
  play,
  type Scenario,
  startEncounter,
  strikeOnly,
  TESTS,
} from "./fixtures.ts";

const DICT = "py.collections.dict";
const SPLIT = "py.strings.split";
const VALUES = "py.basics.values";

const node = (id: string, tier: number, transfersTo?: string): [string, PlannerNode] => [
  id,
  { id, realm: "foundry", tier, prerequisites: [], ...(transfersTo === undefined ? {} : { transfersTo }) },
];
const ctx: LearnerContext = {
  balance,
  nodes: new Map([
    node(DICT, 1, "concept.mappings"),
    node(SPLIT, 0, "concept.strings"),
    node(VALUES, 0, "concept.values"),
    node("concept.mappings", 1),
    node("concept.strings", 0),
  ]),
};

const DAY_MS = 24 * 60 * 60 * 1000;
const day = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * DAY_MS).toISOString();

/** Stamp a scenario's events as if the store had appended them one second apart, starting at `start`. */
function timed(scenario: Scenario, start: string): TimedEvent[] {
  return scenario.events.map((event, index) => ({ event, at: new Date(Date.parse(start) + index * 1000).toISOString() }));
}

/** A fight played in Python, so Python-tagged concepts are credited as tagged. */
const fightIn = (concepts: string[], options: EncounterOptions = {}) => startEncounter({ concepts, language: "python", ...options });
const win = (concepts: string[]) => play([{ type: "Cast", results: ALL_PASS }], fightIn(concepts));

describe("the learner model", () => {
  it("turns an unaided win, a hinted win, and a retreat into Unaided, Assisted, and Seen", () => {
    const hinted = play([{ type: "TakeHint" }, { type: "Cast", results: ALL_PASS }], fightIn([SPLIT]));
    const retreated = play([{ type: "Retreat" }], fightIn([VALUES]));
    const evidence = [timed(win([DICT]), day(0)), timed(hinted, day(1)), timed(retreated, day(2))].flatMap(evidenceFromRun);
    const model = buildLearnerModel(evidence, ctx);

    expect(model.nodes.get(DICT)?.mastery).toBe(3);
    expect(model.nodes.get(SPLIT)?.mastery).toBe(2);
    expect(model.nodes.get(VALUES)?.mastery).toBe(1);
    expect(model.fights).toBe(3);
    expect(model.version).toEqual({ major: 1, minor: 0, patch: 2 });
  });

  it("moves each concept's rating toward the result", () => {
    const retreated = play([{ type: "Retreat" }], fightIn([SPLIT]));
    const model = buildLearnerModel([...evidenceFromRun(timed(win([DICT]), day(0))), ...evidenceFromRun(timed(retreated, day(0)))], ctx);
    // Difficulty 3 against a fresh rating of 1000 is about 76% expected success, and K is 32 at tiers 0 and 1.
    const expected = 1 / (1 + 10 ** (-200 / 400));
    expect(model.nodes.get(DICT)?.rating).toBeCloseTo(1000 + 32 * (1 - expected), 6);
    expect(model.nodes.get(SPLIT)?.rating).toBeCloseTo(1000 - 32 * expected, 6);
  });

  it("makes a concept Retained only after unaided wins at least a week apart", () => {
    const soon = buildLearnerModel([day(0), day(3)].flatMap((at) => evidenceFromRun(timed(win([DICT]), at))), ctx);
    expect(soon.nodes.get(DICT)?.mastery).toBe(3);
    const spaced = buildLearnerModel([day(0), day(3), day(8)].flatMap((at) => evidenceFromRun(timed(win([DICT]), at))), ctx);
    expect(spaced.nodes.get(DICT)).toMatchObject({ mastery: 4, wins: 3, attempts: 3 });
  });

  it("credits a fight in another language to that language's own node, or else to the shared concept", () => {
    const nodes = new Map([...ctx.nodes, node("js.strings.split", 0, "concept.strings")]);
    expect(creditedNodes([DICT, SPLIT], "python", nodes)).toEqual([DICT, SPLIT]);
    expect(creditedNodes([DICT, SPLIT], "javascript", nodes)).toEqual(["concept.mappings", "js.strings.split"]);
    expect(creditedNodes(["concept.strings"], "javascript", nodes)).toEqual(["concept.strings"]);
  });

  it("counts Commits per concept, and a Kernel Panic as a loss that shows weak spots", () => {
    const won = buildLearnerModel(evidenceFromRun(timed(win([DICT, SPLIT]), day(0))), ctx);
    const commits = won.nodes.get(DICT)?.commits ?? 0;
    expect(commits).toBeGreaterThan(0);
    expect(won.nodes.get(SPLIT)?.commits).toBe(commits);

    const panic = play([{ type: "Cast", results: ALL_FAIL }], fightIn([DICT], { classDef: makeClass({ integrity: 10 }) }));
    const evidence = evidenceFromRun(timed(panic, day(0)));
    expect(evidence).toMatchObject([{ kind: "fight", outcome: "kernel-panic", failingCategories: ["empty-input", "boundary"] }]);
    const lost = buildLearnerModel(evidence, ctx);
    expect(lost.nodes.get(DICT)).toMatchObject({ mastery: 1, commits: 0, wins: 0 });
    expect(Object.fromEntries(lost.weakSpots)).toEqual({ "empty-input": 1, boundary: 1 });
    expect(lost.version.patch).toBe(0);
  });

  it("bumps the patch for each win and the minor for a completed expedition", () => {
    const plan: DungeonPlan = {
      seed: "learner",
      length: "short",
      language: "javascript",
      floors: [["f0-r0"], ["f1-r0"]],
      rooms: [
        { id: "f0-r0", floor: 0, kind: "encounter", purpose: "frontier", challengeId: "c1" },
        { id: "f1-r0", floor: 1, kind: "boss", purpose: "boss", challengeId: "c2" },
      ],
      edges: [["f0-r0", "f1-r0"]],
      rationale: [],
    };
    const setup = (id: string): EncounterSetup => ({
      challenge: { id, concepts: [DICT], language: "javascript", difficulty: 3, retreatable: true, scoring: { crit: true, efficiency: true, elegance: true } },
      enemy: strikeOnly(),
      tests: TESTS,
      reserve: [],
      mastery: 0,
    });
    const run = play([
      { type: "StartRun", runId: "expedition", seed: "learner", classDef: makeClass(), plan },
      { type: "EnterRoom", roomId: "f0-r0", encounter: setup("c1") },
      { type: "Cast", results: ALL_PASS },
      { type: "EnterRoom", roomId: "f1-r0", encounter: setup("c2") },
      { type: "Cast", results: ALL_PASS },
    ]);
    const evidence = evidenceFromRun(timed(run, day(0)));
    expect(evidence.map((item) => item.kind)).toEqual(["fight", "fight", "dungeon"]);
    const model = buildLearnerModel(evidence, ctx);
    expect(model.version).toEqual({ major: 1, minor: 1, patch: 0 });
    expect(model.dungeonsCleared).toBe(1);
    // Played in JavaScript, a Python-tagged fight counts for the shared concept.
    expect(model.nodes.get("concept.mappings")?.wins).toBe(2);
    expect(model.nodes.has(DICT)).toBe(false);
  });

  it("gives the planner mastery, ratings, and the challenges played within the recency window", () => {
    const model = buildLearnerModel(evidenceFromRun(timed(win([DICT]), day(0))), ctx);
    const soon = learnerSnapshot(model, day(1), balance);
    expect(soon.nodes.get(DICT)).toMatchObject({ mastery: 3, rotting: false });
    expect([...soon.recentChallenges]).toEqual(["foundry.py.dict-word-count"]);
    expect(learnerSnapshot(model, day(balance.planner.recency_exclusion_days + 1), balance).recentChallenges.size).toBe(0);
  });

  it("reads fights stored before concepts were recorded as evidence for no concept", () => {
    const serialized = JSON.stringify(win([DICT]).events).replace(`"concepts":["${DICT}"],`, "");
    const events = RunEvent.array().parse(JSON.parse(serialized));
    expect(events.find((event) => event.type === "EncounterStarted")).toMatchObject({ encounter: { concepts: [] } });
    const model = buildLearnerModel(evidenceFromRun(events.map((event) => ({ event, at: day(0) }))), ctx);
    expect(model.nodes.size).toBe(0);
    expect(model.fights).toBe(1);
  });
});
