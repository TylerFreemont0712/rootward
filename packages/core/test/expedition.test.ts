import { describe, expect, it } from "vitest";
import {
  decide,
  type DungeonPlan,
  type EncounterSetup,
  foldRun,
  reachableRoomIds,
  type RunCommand,
  RunEvent,
} from "../src/index.ts";
import { ALL_FAIL, ALL_PASS, balance, ctx, encounterOf, makeClass, play, type Scenario, strikeOnly, TESTS } from "./fixtures.ts";

// A small hand-made dungeon: two choices on floor 0, one fight on floor 1, and the boss.
const plan: DungeonPlan = {
  seed: "expedition",
  length: "short",
  language: "javascript",
  floors: [["f0-r0", "f0-r1"], ["f1-r0"], ["f2-r0"]],
  rooms: [
    { id: "f0-r0", floor: 0, kind: "encounter", purpose: "frontier", challengeId: "c1" },
    { id: "f0-r1", floor: 0, kind: "elite", purpose: "stretch", challengeId: "c2" },
    { id: "f1-r0", floor: 1, kind: "encounter", purpose: "practice", challengeId: "c3" },
    { id: "f2-r0", floor: 2, kind: "boss", purpose: "boss", challengeId: "c4" },
  ],
  edges: [
    ["f0-r0", "f1-r0"],
    ["f0-r1", "f1-r0"],
    ["f1-r0", "f2-r0"],
  ],
  rationale: [],
};

const setup = (challengeId: string): EncounterSetup => ({
  challenge: {
    id: challengeId,
    language: "javascript",
    difficulty: 3,
    retreatable: true,
    scoring: { crit: true, efficiency: true, elegance: true },
  },
  enemy: strikeOnly(4),
  tests: TESTS,
  reserve: [],
  mastery: 0,
});

function startExpedition(integrity = 100, dungeon: DungeonPlan = plan): Scenario {
  return play([{ type: "StartRun", runId: "run-x", seed: "expedition", classDef: makeClass({ integrity }), plan: dungeon }]);
}

describe("an expedition over a plan", () => {
  it("only lets the player enter rooms on a path from the last cleared room", () => {
    let scenario = startExpedition();
    expect(reachableRoomIds(scenario.state)).toEqual(["f0-r0", "f0-r1"]);
    expect(decide(scenario.state, { type: "EnterRoom", roomId: "f1-r0", encounter: setup("c3") }, ctx)).toMatchObject({
      ok: false,
      error: { code: "unreachable" },
    });

    scenario = play([{ type: "EnterRoom", roomId: "f0-r0", encounter: setup("c1") }], scenario);
    expect(scenario.state.currentRoomId).toBe("f0-r0");
    expect(encounterOf(scenario.state).roomId).toBe("f0-r0");
    expect(reachableRoomIds(scenario.state)).toEqual([]);
    expect(decide(scenario.state, { type: "EnterRoom", roomId: "f0-r1", encounter: setup("c2") }, ctx)).toMatchObject({
      ok: false,
      error: { code: "room-active" },
    });

    scenario = play([{ type: "Cast", results: ALL_PASS }], scenario);
    expect(scenario.events.at(-1)).toEqual({ type: "RoomCleared", roomId: "f0-r0", outcome: "won" });
    expect(scenario.state.currentRoomId).toBeUndefined();
    expect(reachableRoomIds(scenario.state)).toEqual(["f1-r0"]);
    expect(decide(scenario.state, { type: "EnterRoom", roomId: "f0-r1", encounter: setup("c2") }, ctx)).toMatchObject({
      ok: false,
      error: { code: "unreachable" },
    });
  });

  it("continues past a retreat and completes the run by beating the boss", () => {
    const scenario = play(
      [
        { type: "EnterRoom", roomId: "f0-r1", encounter: setup("c2") },
        { type: "Cast", results: ALL_PASS },
        { type: "EnterRoom", roomId: "f1-r0", encounter: setup("c3") },
        { type: "Retreat" },
        { type: "EnterRoom", roomId: "f2-r0", encounter: setup("c4") },
        { type: "Cast", results: ALL_PASS },
      ],
      startExpedition(),
    );
    expect(scenario.state.clearedRooms).toEqual([
      { roomId: "f0-r1", outcome: "won" },
      { roomId: "f1-r0", outcome: "retreated" },
      { roomId: "f2-r0", outcome: "won" },
    ]);
    expect(scenario.state).toMatchObject({ status: "ended", endReason: "completed" });
    expect(scenario.events.at(-1)).toEqual({ type: "RunEnded", reason: "completed" });
  });

  it("fights Elite and Boss rooms at the room's tier, whatever the enemy template says", () => {
    const elite = play(
      [
        { type: "EnterRoom", roomId: "f0-r1", encounter: setup("c2") },
        { type: "Cast", results: ALL_PASS },
      ],
      startExpedition(),
    );
    expect(encounterOf(elite.state).enemy.tier).toBe("elite");
    expect(elite.events.findLast((event) => event.type === "EncounterWon")).toMatchObject({
      rewards: { cycles: balance.bonuses.cycles_by_tier.elite * 2 },
    });

    const boss = play(
      [
        { type: "EnterRoom", roomId: "f1-r0", encounter: setup("c3") },
        { type: "Cast", results: ALL_PASS },
        { type: "EnterRoom", roomId: "f2-r0", encounter: setup("c4") },
        { type: "Cast", results: ALL_PASS },
      ],
      elite,
    );
    expect(encounterOf(boss.state).enemy.tier).toBe("boss");
    expect(boss.events.findLast((event) => event.type === "EncounterWon")).toMatchObject({
      rewards: { cycles: balance.bonuses.cycles_by_tier.boss * 2 },
    });
  });

  it("ends the run when the player retreats from the boss", () => {
    const scenario = play(
      [
        { type: "EnterRoom", roomId: "f0-r0", encounter: setup("c1") },
        { type: "Cast", results: ALL_PASS },
        { type: "EnterRoom", roomId: "f1-r0", encounter: setup("c3") },
        { type: "Cast", results: ALL_PASS },
        { type: "EnterRoom", roomId: "f2-r0", encounter: setup("c4") },
        { type: "Retreat" },
      ],
      startExpedition(),
    );
    expect(scenario.state).toMatchObject({ status: "ended", endReason: "retreated" });
  });

  it("ends the run in a Kernel Panic without clearing the room", () => {
    const scenario = play(
      [
        { type: "EnterRoom", roomId: "f0-r0", encounter: setup("c1") },
        { type: "Cast", results: ALL_FAIL },
      ],
      startExpedition(10),
    );
    expect(scenario.state).toMatchObject({ status: "ended", endReason: "kernel-panic", currentRoomId: "f0-r0" });
    expect(scenario.state.clearedRooms).toEqual([]);
  });

  it("refuses practice fights, missing or mismatched setups, and unknown rooms", () => {
    const { state } = startExpedition();
    const practice: RunCommand = { type: "StartEncounter", roomId: "room-1", ...setup("c1") };
    const refusal = (command: RunCommand) => decide(state, command, ctx);
    expect(refusal(practice)).toMatchObject({ ok: false, error: { code: "in-expedition" } });
    expect(refusal({ type: "EnterRoom", roomId: "f0-r0", encounter: setup("c2") })).toMatchObject({
      ok: false,
      error: { code: "wrong-challenge" },
    });
    expect(refusal({ type: "EnterRoom", roomId: "f0-r0" })).toMatchObject({ ok: false, error: { code: "missing-setup" } });
    expect(refusal({ type: "EnterRoom", roomId: "f9-r9" })).toMatchObject({ ok: false, error: { code: "unknown-room" } });
  });

  it("refuses rooms the engine cannot play yet", () => {
    const withShrine: DungeonPlan = {
      ...plan,
      rooms: [{ id: "f0-r0", floor: 0, kind: "shrine", purpose: "frontier" }, ...plan.rooms.slice(1)],
    };
    const { state } = startExpedition(100, withShrine);
    expect(decide(state, { type: "EnterRoom", roomId: "f0-r0" }, ctx)).toMatchObject({
      ok: false,
      error: { code: "unsupported-room" },
    });
  });

  it("can be abandoned, which closes every door", () => {
    const scenario = play([{ type: "AbandonRun" }], startExpedition());
    expect(scenario.state).toMatchObject({ status: "ended", endReason: "abandoned" });
    expect(reachableRoomIds(scenario.state)).toEqual([]);
  });

  it("stores events that parse back and fold to the same state", () => {
    const scenario = play(
      [
        { type: "EnterRoom", roomId: "f0-r0", encounter: setup("c1") },
        { type: "Cast", results: ALL_PASS },
      ],
      startExpedition(),
    );
    const roundTripped = scenario.events.map((event) => RunEvent.parse(JSON.parse(JSON.stringify(event))));
    expect(foldRun(roundTripped)).toEqual(scenario.state);
  });
});
