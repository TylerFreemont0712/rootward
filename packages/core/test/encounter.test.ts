import { describe, expect, it } from "vitest";
import { decide, displayedEnemyHp, enemyHp, enemyHpMax, evolve, foldRun, retreatSuggested } from "../src/index.ts";
import {
  ALL_FAIL,
  ALL_PASS,
  balance,
  ctx,
  encounterOf,
  makeClass,
  makeEnemy,
  play,
  results,
  startEncounter,
  strikeOnly,
} from "./fixtures.ts";

const { visible: visibleWeight, hidden: hiddenWeight } = balance.encounter.test_weights;
const totalHp = 2 * visibleWeight + 2 * hiddenWeight;
const edgeCase = (category: string) => makeEnemy([{ move: "edge-case", weight: 1, params: { category } }]);

describe("starting an encounter", () => {
  it("weights tests, fills Focus, and prices hints by mastery", () => {
    const { state } = startEncounter({ mastery: 0 });
    const encounter = encounterOf(state);
    expect(enemyHpMax(encounter)).toBe(totalHp);
    expect(enemyHp(encounter)).toBe(totalHp);
    expect(encounter.focus).toBe(5);
    const multiplier = balance.encounter.hint_cost_multiplier_by_mastery["0"];
    expect(encounter.hintCosts).toEqual(balance.encounter.hint_costs_cycles.map((c) => Math.round(c * multiplier)));
    expect(state.cycles).toBe(balance.player.cycles_start);
  });
});

describe("Probe", () => {
  it("records visible results and costs nothing", () => {
    const { state } = play([{ type: "Probe", results: results({ v1: true, v2: false }) }], startEncounter());
    expect(encounterOf(state)).toMatchObject({ probes: 1, focus: 5 });
    expect(enemyHp(encounterOf(state))).toBe(totalHp);
  });

  it("refuses results for hidden tests", () => {
    const { state } = startEncounter();
    expect(decide(state, { type: "Probe", results: ALL_PASS }, ctx)).toMatchObject({
      ok: false,
      error: { code: "results-mismatch" },
    });
  });
});

describe("Cast", () => {
  it("wins on a perfect first Cast with crit, true sight, unaided, and the Artificer's double Cycles", () => {
    const { state, events } = play([{ type: "Cast", results: ALL_PASS }], startEncounter());
    expect(events.slice(-2).map((e) => e.type)).toEqual(["CastResolved", "EncounterWon"]);
    const encounter = encounterOf(state);
    const m = balance.bonuses.commits_multiplier;
    const cycles = balance.bonuses.cycles_by_tier["1"] * 2;
    expect(encounter.status).toBe("won");
    expect(encounter.rewards).toEqual({
      bonuses: ["crit", "true_sight", "unaided"],
      commits: Math.round(balance.commits.base_by_difficulty["3"] * m.crit * m.true_sight * m.unaided),
      cycles,
    });
    expect(state.cycles).toBe(balance.player.cycles_start + cycles);
    expect(displayedEnemyHp(encounter)).toBe(0);
  });

  it("damages for newly passing tests and lets regressions heal the enemy", () => {
    const start = startEncounter({ enemy: strikeOnly(0) });
    const first = play([{ type: "Cast", results: results({ v1: true, v2: false, h1: true, h2: false }) }], start);
    expect(first.events.find((e) => e.type === "CastResolved")).toMatchObject({
      damage: visibleWeight + hiddenWeight,
      heal: 0,
      focus: 4,
    });
    const second = play([{ type: "Cast", results: results({ v1: false, v2: true, h1: true, h2: false }) }], first);
    expect(second.events.filter((e) => e.type === "CastResolved").at(-1)).toMatchObject({
      damage: visibleWeight,
      heal: visibleWeight,
    });
    expect(enemyHp(encounterOf(second.state))).toBe(visibleWeight + hiddenWeight);
  });

  it("is answered by a Strike of failing tests times ATK, capped", () => {
    const small = play([{ type: "Cast", results: ALL_FAIL }], startEncounter({ enemy: strikeOnly(4) }));
    expect(small.state.integrity).toBe(100 - 4 * 4);
    const big = play([{ type: "Cast", results: ALL_FAIL }], startEncounter({ enemy: strikeOnly(50) }));
    expect(big.state.integrity).toBe(100 - balance.enemy_moves.strike_damage_cap);
  });

  it("can reveal a reserve test with Edge Case, which then has to pass", () => {
    const oneFailing = results({ v1: true, v2: true, h1: true, h2: false });
    const after = play([{ type: "Cast", results: oneFailing }], startEncounter({ enemy: edgeCase("empty-input") }));
    const weight = balance.enemy_moves.edge_case_hp_added;
    expect(after.events.at(-1)).toMatchObject({ type: "EdgeCaseRevealed", test: { id: "r1", passing: false, weight } });
    expect(encounterOf(after.state).reserve).toEqual([]);
    expect(enemyHp(encounterOf(after.state))).toBe(hiddenWeight + weight);
    expect(decide(after.state, { type: "Cast", results: ALL_PASS }, ctx)).toMatchObject({
      ok: false,
      error: { code: "results-mismatch" },
    });

    const won = play([{ type: "Cast", results: [...ALL_PASS, { id: "r1", passed: true, durationMs: 1 }] }], after);
    expect(encounterOf(won.state).status).toBe("won");
    expect(encounterOf(won.state).rewards?.bonuses).not.toContain("crit");
  });

  it("falls back to Strike when Edge Case has nothing to reveal", () => {
    const after = play([{ type: "Cast", results: ALL_FAIL }], startEncounter({ enemy: edgeCase("empty-input"), reserve: [] }));
    expect(after.events.at(-1)).toMatchObject({
      type: "EnemyStruck",
      action: { move: "strike", fallbackFrom: "edge-case" },
    });
  });

  it("ends the run in a Kernel Panic when Integrity reaches 0", () => {
    const after = play([{ type: "Cast", results: ALL_FAIL }], startEncounter({ classDef: makeClass({ integrity: 10 }) }));
    expect(after.events.at(-1)).toEqual({ type: "RunEnded", reason: "kernel-panic" });
    expect(after.state).toMatchObject({ status: "ended", endReason: "kernel-panic", integrity: 0 });
    expect(encounterOf(after.state).status).toBe("kernel-panic");
    expect(decide(after.state, { type: "TakeHint" }, ctx)).toMatchObject({ ok: false, error: { code: "run-ended" } });
  });

  it("ends the encounter as exhausted when Focus runs out", () => {
    let scenario = startEncounter({ enemy: strikeOnly(0) });
    for (let cast = 0; cast < 5; cast++) scenario = play([{ type: "Cast", results: ALL_FAIL }], scenario);
    expect(scenario.events.at(-1)).toEqual({ type: "Exhausted", roomId: "room-1" });
    expect(encounterOf(scenario.state).status).toBe("exhausted");
    expect(decide(scenario.state, { type: "Cast", results: ALL_FAIL }, ctx)).toMatchObject({
      ok: false,
      error: { code: "no-encounter" },
    });
  });

  it("awards Efficiency only within the allowed ratio of the reference time", () => {
    const ratio = balance.bonuses.efficiency_max_ratio_vs_reference;
    const fast = play([{ type: "Cast", results: ALL_PASS, timing: { playerMs: 100 * ratio, referenceMs: 100 } }], startEncounter());
    expect(encounterOf(fast.state).rewards?.bonuses).toContain("efficiency");
    const slow = play([{ type: "Cast", results: ALL_PASS, timing: { playerMs: 100 * ratio + 1, referenceMs: 100 } }], startEncounter());
    expect(encounterOf(slow.state).rewards?.bonuses).not.toContain("efficiency");
  });

  it("makes Lint suggest Retreat after enough Casts that did not win", () => {
    let scenario = startEncounter({ enemy: strikeOnly(0) });
    const threshold = balance.encounter.suggest_retreat_after_failed_casts;
    for (let cast = 0; cast < threshold - 1; cast++) scenario = play([{ type: "Cast", results: ALL_FAIL }], scenario);
    expect(retreatSuggested(encounterOf(scenario.state), balance)).toBe(false);
    scenario = play([{ type: "Cast", results: ALL_FAIL }], scenario);
    expect(retreatSuggested(encounterOf(scenario.state), balance)).toBe(true);
  });

  it("chooses enemy moves deterministically from the seed", () => {
    const enemy = makeEnemy([
      { move: "strike", weight: 3 },
      { move: "edge-case", weight: 2, params: { category: "boundary" } },
    ]);
    const reserve = [{ id: "r1", name: "tabs", category: "boundary" }];
    const firstMove = (seed: string) => {
      const { events } = play([{ type: "Cast", results: ALL_FAIL }], startEncounter({ seed, enemy, reserve }));
      return events.at(-1)?.type;
    };
    expect(firstMove("fixed-seed")).toBe(firstMove("fixed-seed"));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => firstMove(`seed-${i}`)));
    expect(seen).toEqual(new Set(["EnemyStruck", "EdgeCaseRevealed"]));
  });
});

describe("hints", () => {
  it("climb the ladder one level at a time until Cycles run out", () => {
    let scenario = startEncounter({ mastery: 0 });
    const costs = encounterOf(scenario.state).hintCosts;
    let spent = 0;
    let level = 0;
    while (level < costs.length && spent + (costs[level] ?? 0) <= balance.player.cycles_start) {
      scenario = play([{ type: "TakeHint" }], scenario);
      spent += costs[level] ?? 0;
      level += 1;
    }
    expect(level).toBeGreaterThan(0);
    expect(encounterOf(scenario.state).hintsTaken).toBe(level);
    expect(scenario.state.cycles).toBe(balance.player.cycles_start - spent);
    expect(decide(scenario.state, { type: "TakeHint" }, ctx)).toMatchObject({ ok: false });
  });

  it("cost the Unaided bonus", () => {
    const { state } = play([{ type: "TakeHint" }, { type: "Cast", results: ALL_PASS }], startEncounter());
    expect(encounterOf(state).rewards?.bonuses).not.toContain("unaided");
  });
});

describe("Retreat", () => {
  it("ends the encounter with no rewards and no damage", () => {
    const { state } = play([{ type: "Retreat" }], startEncounter());
    expect(encounterOf(state)).toMatchObject({ status: "retreated" });
    expect(encounterOf(state).rewards).toBeUndefined();
    expect(state.integrity).toBe(100);
  });

  it("is refused when the challenge is not retreatable", () => {
    const { state } = startEncounter({ retreatable: false });
    expect(decide(state, { type: "Retreat" }, ctx)).toMatchObject({ ok: false, error: { code: "not-retreatable" } });
  });
});

describe("the event log", () => {
  it("folds back into exactly the same state", () => {
    const scenario = play(
      [{ type: "Cast", results: ALL_FAIL }, { type: "TakeHint" }, { type: "Cast", results: ALL_PASS }],
      startEncounter(),
    );
    expect(foldRun(scenario.events)).toEqual(scenario.state);
  });

  it("rejects an event for a room that is not the current one", () => {
    const { state } = startEncounter();
    expect(() => evolve(state, { type: "Retreated", roomId: "somewhere-else" })).toThrow("current room");
  });
});

describe("displayedEnemyHp", () => {
  it("adds the enemy's display offset only while it is alive", () => {
    const goblin = makeEnemy([{ move: "strike", weight: 1 }], { displayOffset: 1 });
    const { state } = startEncounter({ enemy: goblin });
    expect(displayedEnemyHp(encounterOf(state))).toBe(totalHp + 1);
  });
});
