import type { Bolt, Element, Shard, ShardrunConfig, ShardrunFoe } from "@rootward/content-schema";
import { describe, expect, it } from "vitest";
import {
  encounterFor,
  normalizeBolts,
  previewCast,
  type ShardrunBalance,
  type ShardrunCatalog,
  type ShardrunCommand,
  type ShardrunState,
  startShardrun,
  stepShardrun,
} from "../src/index.ts";

const BALANCE: ShardrunBalance = {
  integrity_start: 30,
  mana_per_turn: 6,
  spell_base_cost: 1,
  work_per_mana: 8,
  base_bolt_power: 4,
  max_bolts: 4,
  max_pipeline_bolts: 16,
  max_bolt_power: 20,
  weak_multiplier: 1.5,
  resist_multiplier: 0.5,
  scatter_multiplier: 0.5,
  pattern_off_multiplier: 0.25,
  rest_heal_fraction: 0.5,
  reward_choices: 2,
};

function shard(id: string, extra: Partial<Shard> = {}): Shard {
  return {
    id,
    name: id,
    rarity: "common",
    cost: 1,
    summary: "A test shard.",
    function: id.replaceAll("-", "_"),
    code: { python: "def f(bolts, battle):\n    return bolts\n" },
    tags: [],
    draftable: true,
    examples: [{ name: "nothing", bolts: [], expect: [] }],
    ...extra,
  };
}

function foe(id: string, extra: Partial<ShardrunFoe> = {}): ShardrunFoe {
  return { id, name: id, sprite: id, hp: 20, weak: [], resist: [], intents: [{ kind: "strike", power: 5 }], flavor: "A test foe.", ...extra };
}

const SHARDS = [
  shard("amplify", { forge: { into: "amplify-plus", verb: "upgrade" } }),
  shard("amplify-plus", { draftable: false }),
  shard("fork"),
  shard("chill", { rarity: "uncommon" }),
  shard("overclock", { rarity: "rare", cost: 0, curse: { integrity: 2 } }),
];

const CONFIG: ShardrunConfig = {
  start: {
    spells: [
      { name: "Bolt", capacity: 2, shards: ["amplify"] },
      { name: "Ward", capacity: 2, shards: [] },
    ],
    inventory: ["fork"],
  },
  floors: [["fight"], ["rest", "forge"], ["boss"]],
  encounters: { fight: [["dummy"]], elite: [["dummy"]], boss: [["brick"]] },
  rewards: { fight: { common: 1, uncommon: 1, rare: 0 }, elite: { common: 1, uncommon: 1, rare: 1 }, boss: { common: 1, uncommon: 1, rare: 1 } },
};

function catalog(encounters: Partial<ShardrunConfig["encounters"]> = {}): ShardrunCatalog {
  return {
    config: { ...CONFIG, encounters: { ...CONFIG.encounters, ...encounters } },
    shards: new Map(SHARDS.map((s) => [s.id, s])),
    foes: new Map(
      [
        foe("dummy", { weak: ["fire"], resist: ["frost"] }),
        foe("wraith", { hp: 10, trait: { kind: "nullify-first" }, intents: [{ kind: "shield", amount: 3 }] }),
        foe("brick", { hp: 30, trait: { kind: "thick-hide", threshold: 5 }, intents: [{ kind: "strike", power: 2 }] }),
      ].map((f) => [f.id, f]),
    ),
    balance: BALANCE,
  };
}

const CATALOG = catalog();

function bolt(power: number, element: Element = "none", extra: Partial<Bolt> = {}): Bolt {
  return { power, element, target: "front", pierce: false, ward: false, ...extra };
}

/** Apply commands in order, failing the test on any refusal. */
function play(state: ShardrunState, commands: ShardrunCommand[], using: ShardrunCatalog = CATALOG): ShardrunState {
  return commands.reduce((current, command) => {
    const result = stepShardrun(current, command, using);
    if (!result.ok) throw new Error(`${command.type} refused: ${result.error.code}`);
    return result.state;
  }, state);
}

const cast = (bolts: Bolt[], spellId = "spell-1", work = 0): ShardrunCommand => ({ type: "cast", spellId, outcome: { ok: true, bolts, work } });

function inFight(using: ShardrunCatalog = CATALOG): ShardrunState {
  return play(startShardrun(using, "seed-1", "python"), [{ type: "enter", nodeId: "f0-0" }], using);
}

describe("shardrun runs", () => {
  it("starts on the map with the configured loadout", () => {
    const state = startShardrun(CATALOG, "seed-1", "python");
    expect(state.status).toBe("map");
    expect(state.integrity).toBe(30);
    expect(state.spells.map((spell) => spell.shards)).toEqual([["amplify"], []]);
    expect(state.floors.map((floor) => floor.length)).toEqual([1, 2, 1]);
  });

  it("refuses rooms that are not on the next floor and leaves the state untouched", () => {
    const state = startShardrun(CATALOG, "seed-1", "python");
    const before = structuredClone(state);
    const result = stepShardrun(state, { type: "enter", nodeId: "f1-0" }, CATALOG);
    expect(result.ok ? undefined : result.error.code).toBe("unreachable-node");
    expect(state).toEqual(before);
  });

  it("fixes encounters by the seed", () => {
    const groups = [["a"], ["b"], ["c"], ["d"]];
    const config = { ...CONFIG, encounters: { ...CONFIG.encounters, fight: groups } };
    const node = { id: "f0-0", floor: 0, kind: "fight" as const };
    expect(encounterFor("seed-1", node, config)).toEqual(encounterFor("seed-1", node, config));
    const seen = new Set(Array.from({ length: 20 }, (_, i) => encounterFor(`seed-${i}`, node, config).join()));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("shardrun casting", () => {
  it("pays for the base, each shard, and the work, then hits weaknesses harder", () => {
    const state = play(inFight(), [cast([bolt(7, "fire")], "spell-1", 9)]);
    // 1 base + 1 amplify + floor(9 work / 8)
    expect(state.battle?.mana).toBe(3);
    expect(state.battle?.foes[0]?.hp).toBe(20 - 10);
    expect(state.log.find((entry) => entry.kind === "hit")?.amount).toBe(10);
    const again = stepShardrun(state, cast([bolt(7)]), CATALOG);
    expect(again.ok ? undefined : again.error.code).toBe("already-cast");
  });

  it("refuses a cast that costs more mana than is left", () => {
    const result = stepShardrun(inFight(), cast([bolt(4)], "spell-1", 80), CATALOG);
    expect(result.ok ? undefined : result.error.code).toBe("not-enough-mana");
  });

  it("clamps power, caps the bolt count, and drops malformed bolts", () => {
    const { bolts, fizzled } = normalizeBolts([bolt(99), { power: "lots" }, bolt(2.6), bolt(-3), bolt(1), bolt(1)], BALANCE);
    expect(bolts.map((b) => b.power)).toEqual([20, 3, 0, 1]);
    expect(fizzled).toBe(2);
  });

  it("lets shields absorb bolts unless they pierce, and halves resisted elements", () => {
    const state = inFight();
    const foeState = state.battle?.foes[0];
    if (!foeState) throw new Error("no foe");
    foeState.shield = 5;
    const after = play(state, [cast([bolt(8), bolt(8, "none", { pierce: true }), bolt(8, "frost")])]);
    expect(after.battle?.foes[0]?.hp).toBe(20 - 3 - 8 - 4);
    expect(after.battle?.foes[0]?.shield).toBe(0);
  });

  it("swallows the first bolt against nullify, and ignores weak bolts against thick hide", () => {
    const wraithCatalog = catalog({ fight: [["wraith"]] });
    expect(play(inFight(wraithCatalog), [cast([bolt(3), bolt(3)])], wraithCatalog).battle?.foes[0]?.hp).toBe(7);
    const brickCatalog = catalog({ fight: [["brick"]] });
    expect(play(inFight(brickCatalog), [cast([bolt(4), bolt(5)])], brickCatalog).battle?.foes[0]?.hp).toBe(25);
  });

  it("predicts a cast without changing the state", () => {
    const state = inFight();
    const before = structuredClone(state);
    const preview = previewCast(state, "spell-1", { ok: true, bolts: [bolt(7, "fire")], work: 0 }, CATALOG);
    expect(preview).toEqual({ cost: 2, affordable: true, bolts: 1, damage: 10, block: 0 });
    expect(state).toEqual(before);
  });

  it("charges only the base cost when a spell's code fails", () => {
    const state = play(inFight(), [{ type: "cast", spellId: "spell-1", outcome: { ok: false, reason: "NameError" } }]);
    expect(state.battle?.mana).toBe(5);
    expect(state.log[0]?.kind).toBe("fizzle");
  });
});

describe("shardrun turns and rooms", () => {
  it("lets foes act at the end of a turn, soaks their hits with block, and refills mana", () => {
    const state = play(inFight(), [cast([bolt(3, "none", { ward: true })]), { type: "end-turn" }]);
    expect(state.integrity).toBe(30 - 2);
    expect(state.battle).toMatchObject({ turn: 2, mana: 6, block: 0, cast: [] });
  });

  it("offers distinct draftable shards after a win and adds the one taken", () => {
    const won = play(inFight(), [cast([bolt(20, "fire")])]);
    expect(won.status).toBe("reward");
    const choices = won.reward?.choices ?? [];
    expect(new Set(choices).size).toBe(2);
    for (const choice of choices) expect(["amplify", "fork", "chill"]).toContain(choice);
    const taken = play(won, [{ type: "take", shardId: choices[0] ?? null }]);
    expect(taken.status).toBe("map");
    expect(taken.inventory).toContain(choices[0]);
  });

  it("rearranges shards between fights but never creates or destroys them", () => {
    const state = startShardrun(CATALOG, "seed-1", "python");
    const moved = play(state, [{ type: "arrange", spells: [{ id: "spell-1", shards: ["amplify", "fork"] }, { id: "spell-2", shards: [] }], inventory: [] }]);
    expect(moved.spells[0]?.shards).toEqual(["amplify", "fork"]);
    const duplicated = stepShardrun(state, { type: "arrange", spells: [{ id: "spell-1", shards: ["amplify", "amplify"] }, { id: "spell-2", shards: [] }], inventory: [] }, CATALOG);
    expect(duplicated.ok ? undefined : duplicated.error.code).toBe("shards-changed");
    const crowded = stepShardrun(state, { type: "arrange", spells: [{ id: "spell-1", shards: [] }, { id: "spell-2", shards: ["amplify", "fork", "fork"] }], inventory: [] }, CATALOG);
    expect(crowded.ok ? undefined : crowded.error.code).toBe("over-capacity");
    const midFight = stepShardrun(inFight(), { type: "arrange", spells: [{ id: "spell-1", shards: [] }, { id: "spell-2", shards: ["amplify"] }], inventory: ["fork"] }, CATALOG);
    expect(midFight.ok ? undefined : midFight.error.code).toBe("cannot-arrange");
  });

  it("upgrades a held shard at the forge and heals at a rest", () => {
    const cleared = play(inFight(), [cast([bolt(20, "fire")]), { type: "take", shardId: null }]);
    const forged = play(cleared, [{ type: "enter", nodeId: "f1-1" }, { type: "forge", shardId: "amplify" }]);
    expect(forged.spells[0]?.shards).toEqual(["amplify-plus"]);
    const resting = play(cleared, [{ type: "enter", nodeId: "f1-0" }]);
    resting.integrity = 10;
    expect(play(resting, [{ type: "rest" }]).integrity).toBe(25);
  });

  it("burns Integrity for cursed shards and ends the run at zero", () => {
    const state = inFight();
    const spell = state.spells[1];
    if (!spell) throw new Error("no second spell");
    spell.shards = ["overclock"];
    state.integrity = 2;
    const lost = play(state, [cast([bolt(1)], "spell-2")]);
    expect(lost.status).toBe("lost");
    const after = stepShardrun(lost, { type: "end-turn" }, CATALOG);
    expect(after.ok ? undefined : after.error.code).toBe("run-over");
  });
});
