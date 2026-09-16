import type {
  Bolt,
  Element,
  Relic,
  Shard,
  ShardrunConfig,
  ShardrunFoe,
  ShardrunLayer,
} from "@rootward/content-schema";
import { describe, expect, it } from "vitest";
import {
  billWork,
  boltCap,
  bossId,
  encounterFor,
  manaPerTurn,
  generateLayerMap,
  nextRooms,
  normalizeBolts,
  pipelineWork,
  previewBolts,
  previewCast,
  type ShardrunBalance,
  type ShardrunCatalog,
  type ShardrunCommand,
  type ShardrunState,
  startShardrun,
  stepShardrun,
  workUnits,
} from "../src/index.ts";

const BALANCE: ShardrunBalance = {
  integrity_start: 30,
  mana_per_turn: { base: 6, per_layer: 3 },
  spell_base_cost: 1,
  // Linear billing in the fixture, so a cost is easy to read by hand; the curves get their own test.
  work_billing: { curve: "linear", per_mana: 8, log_base: 2 },
  base_bolt_power: 4,
  bolt_cap: { base: 4, per_layer: 2, max: 8 },
  max_pipeline_bolts: 16,
  max_bolt_power: 20,
  max_bolt_mult: 25,
  weak_multiplier: 1.5,
  resist_multiplier: 0.5,
  scatter_multiplier: 0.5,
  pattern_off_multiplier: 0.25,
  rest_heal_fraction: 0.5,
  reward_choices: 2,
  elite_relic_choices: 1,
  treasure_relic_choices: 2,
  boss_relic_choices: 2,
  max_spells: 4,
  max_spell_capacity: 3,
  layer_heal_fraction: 0.5,
  trace_bolts: 4,
};

function shard(id: string, extra: Partial<Shard> = {}): Shard {
  return {
    id,
    name: id,
    rarity: "common",
    cost: 1,
    complexity: "linear",
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
  return {
    id,
    name: id,
    sprite: id,
    hp: 20,
    weak: [],
    resist: [],
    intents: [{ kind: "strike", power: 5 }],
    flavor: "A test foe.",
    ...extra,
  };
}

function relic(id: string, effects: Relic["effects"], rarity: Relic["rarity"] = "common"): Relic {
  return { id, name: id, rarity, icon: id, summary: "A test relic.", flavor: "Test.", effects };
}

const SHARDS = [
  shard("amplify", { forge: { into: "amplify-plus", verb: "upgrade" } }),
  shard("amplify-plus", { draftable: false }),
  shard("fork"),
  shard("chill", { rarity: "uncommon" }),
  shard("overclock", { rarity: "rare", cost: 0, curse: { integrity: 2 } }),
  shard("dedupe", { rarity: "rare", complexity: "quadratic" }),
  shard("spark", { complexity: "constant" }),
];

const RELICS = [
  relic("duck", [{ kind: "bolt-power", add: 1 }]),
  relic("wall", [{ kind: "turn-block", amount: 3 }]),
  relic("cache", [{ kind: "first-cast-discount", amount: 1 }], "uncommon"),
  relic("page", [{ kind: "spell-capacity", add: 1 }], "rare"),
  relic("capacitor", [{ kind: "mana-per-turn", add: 1 }], "boss"),
  relic("core", [{ kind: "damage-multiplier", factor: 2 }], "boss"),
  relic("grimoire", [{ kind: "spell-slot", add: 1 }], "rare"),
  relic("ledger", [{ kind: "work-billing", curve: "log" }], "rare"),
  relic("aperture", [{ kind: "bolt-cap", add: 3 }], "uncommon"),
];

function layer(id: string, extra: Partial<ShardrunLayer> = {}): ShardrunLayer {
  return {
    id,
    name: id,
    flavor: "A test layer.",
    backdrop: id,
    rows: 4,
    columns: 3,
    paths: 3,
    fixed_rows: { "0": "fight", "-1": "rest" },
    weights: { fight: 1, elite: 1, rest: 0, forge: 1, treasure: 1 },
    elite_from_row: 1,
    foe_hp: 1,
    encounters: { fight: [["dummy"]], elite: [["dummy"]], boss: [["brick"]] },
    ...extra,
  };
}

const CONFIG: ShardrunConfig = {
  start: {
    spells: [
      { name: "Bolt", capacity: 2, shards: ["amplify"] },
      { name: "Ward", capacity: 2, shards: [] },
    ],
    inventory: ["fork"],
    relics: [],
  },
  spell_slots: { names: ["Volley", "Requiem"], capacity: 2 },
  difficulties: [
    {
      id: "normal",
      name: "Normal",
      summary: "Test.",
      show_summaries: true,
      show_predictions: true,
      foe_hp: 1,
    },
    { id: "soft", name: "Soft", summary: "Test.", show_summaries: true, show_predictions: true, foe_hp: 0.5 },
  ],
  layers: [layer("first", { boss_spell: { name: "Surge", capacity: 2 } }), layer("second")],
  rewards: {
    shards: {
      fight: { common: 1, uncommon: 1, rare: 0 },
      elite: { common: 1, uncommon: 1, rare: 1 },
      boss: { common: 1, uncommon: 1, rare: 1 },
    },
    relics: {
      elite: { common: 1, uncommon: 0, rare: 0, boss: 0 },
      treasure: { common: 1, uncommon: 1, rare: 1, boss: 0 },
      boss: { common: 0, uncommon: 0, rare: 0, boss: 1 },
    },
  },
};

function catalog(
  overrides: { config?: Partial<ShardrunConfig>; firstLayer?: Partial<ShardrunLayer> } = {},
): ShardrunCatalog {
  const config: ShardrunConfig = { ...CONFIG, ...overrides.config };
  if (overrides.firstLayer)
    config.layers = [layer("first", { ...overrides.firstLayer }), ...CONFIG.layers.slice(1)];
  return {
    config,
    shards: new Map(SHARDS.map((s) => [s.id, s])),
    foes: new Map(
      [
        foe("dummy", { weak: ["fire"], resist: ["frost"] }),
        foe("wraith", { hp: 10, trait: { kind: "nullify-first" }, intents: [{ kind: "shield", amount: 3 }] }),
        foe("brick", {
          hp: 30,
          trait: { kind: "thick-hide", threshold: 5 },
          intents: [{ kind: "strike", power: 2 }],
        }),
      ].map((f) => [f.id, f]),
    ),
    relics: new Map(RELICS.map((r) => [r.id, r])),
    balance: BALANCE,
  };
}

const CATALOG = catalog();

function layerAt(using: ShardrunConfig, index: number): ShardrunLayer {
  const found = using.layers[index];
  if (!found) throw new Error(`no layer ${index}`);
  return found;
}

function bolt(power: number, element: Element = "none", extra: Partial<Bolt> = {}): Bolt {
  return { power, element, target: "front", pierce: false, ward: false, mult: 1, ...extra };
}

/** Apply commands in order, failing the test on any refusal. */
function play(
  state: ShardrunState,
  commands: ShardrunCommand[],
  using: ShardrunCatalog = CATALOG,
): ShardrunState {
  return commands.reduce((current, command) => {
    const result = stepShardrun(current, command, using);
    if (!result.ok) throw new Error(`${command.type} refused: ${result.error.code}`);
    return result.state;
  }, state);
}

/** `work` is the bolts one linear shard (Amplify, which costs 1) was handed; 0 means no shard ran at all. */
const cast = (bolts: Bolt[], spellId = "spell-1", work = 0): ShardrunCommand => ({
  type: "cast",
  spellId,
  outcome: { ok: true, bolts, work: work === 0 ? [] : [{ shard: "amplify", given: work }] },
});
const start = (using: ShardrunCatalog = CATALOG, difficulty = "normal") =>
  startShardrun(using, { seed: "seed-1", language: "python", difficulty });

function firstRoom(state: ShardrunState): string {
  const room = nextRooms(state.map, state.position)[0];
  if (!room) throw new Error("no room to enter");
  return room.id;
}

function inFight(using: ShardrunCatalog = CATALOG, difficulty = "normal"): ShardrunState {
  const state = start(using, difficulty);
  return play(state, [{ type: "enter", nodeId: firstRoom(state) }], using);
}

/** A state standing in a room of the given kind on the current layer, as if walked there. */
function standingAt(state: ShardrunState, kind: string, using: ShardrunCatalog = CATALOG): ShardrunState {
  const node = state.map.nodes.find((candidate) => candidate.kind === kind);
  if (!node) throw new Error(`no ${kind} room on this map`);
  const below = state.map.edges.find(([, to]) => to === node.id)?.[0] ?? null;
  const placed: ShardrunState = { ...structuredClone(state), position: node.row === 0 ? null : below };
  return play(placed, [{ type: "enter", nodeId: node.id }], using);
}

describe("layer maps", () => {
  const CHECKED = catalog({
    firstLayer: {
      rows: 8,
      columns: 5,
      paths: 5,
      fixed_rows: { "0": "fight", "3": "treasure", "-1": "rest" },
    },
  });

  it("climbs one row per step without crossing, and every room reaches the boss", () => {
    for (let seed = 0; seed < 50; seed++) {
      const map = generateLayerMap(`seed-${seed}`, 0, layerAt(CHECKED.config, 0));
      const rows = new Map(map.nodes.map((node) => [node.id, node]));
      const moves = new Set<string>();
      for (const [from, to] of map.edges) {
        const a = rows.get(from);
        const b = rows.get(to);
        if (!a || !b) throw new Error("an edge names a missing room");
        expect(b.row).toBe(a.row + 1);
        if (b.kind !== "boss") {
          expect(Math.abs(b.col - a.col)).toBeLessThanOrEqual(1);
          moves.add(`${a.row}:${a.col}>${b.col}`);
        }
      }
      for (const move of moves) {
        const [row, cols] = move.split(":") as [string, string];
        const [from, to] = cols.split(">").map(Number) as [number, number];
        if (to !== from) expect(moves.has(`${row}:${to}>${from}`)).toBe(false);
      }
      // Walk up from the bottom row: every room is reachable and the boss is at the top.
      const reached = new Set(map.nodes.filter((node) => node.row === 0).map((node) => node.id));
      for (const [from, to] of [...map.edges].sort(
        (x, y) => (rows.get(x[0])?.row ?? 0) - (rows.get(y[0])?.row ?? 0),
      )) {
        if (reached.has(from)) reached.add(to);
      }
      expect(reached.size).toBe(map.nodes.length);
      expect(reached.has(bossId(0))).toBe(true);
    }
  });

  it("pins fixed rows, keeps elites above their first row, and is the same map for the same seed", () => {
    const layerDef = layerAt(CHECKED.config, 0);
    const map = generateLayerMap("seed-7", 0, layerDef);
    expect(map.nodes.filter((node) => node.row === 0).every((node) => node.kind === "fight")).toBe(true);
    expect(map.nodes.filter((node) => node.row === 3).every((node) => node.kind === "treasure")).toBe(true);
    expect(map.nodes.filter((node) => node.row === 7).every((node) => node.kind === "rest")).toBe(true);
    expect(
      map.nodes.filter((node) => node.kind === "elite").every((node) => node.row >= layerDef.elite_from_row),
    ).toBe(true);
    expect(generateLayerMap("seed-7", 0, layerDef)).toEqual(map);
  });

  it("only lets the Maintainer enter rooms along a path, and leaves a refused state untouched", () => {
    const state = start();
    const before = structuredClone(state);
    const top = state.map.nodes.find((node) => node.row === 2);
    const result = stepShardrun(state, { type: "enter", nodeId: top?.id ?? "" }, CATALOG);
    expect(result.ok ? undefined : result.error.code).toBe("unreachable-node");
    expect(state).toEqual(before);
    const entered = play(state, [{ type: "enter", nodeId: firstRoom(state) }]);
    expect(entered.revision).toBe(1);
  });

  it("fixes encounters by the seed", () => {
    const groups = [["a"], ["b"], ["c"], ["d"]];
    const def = layer("x", { encounters: { fight: groups, elite: groups, boss: groups } });
    const node = { id: "l0-r0-c0", row: 0, col: 0, kind: "fight" as const };
    expect(encounterFor("seed-1", node, def)).toEqual(encounterFor("seed-1", node, def));
    const seen = new Set(Array.from({ length: 20 }, (_, i) => encounterFor(`seed-${i}`, node, def).join()));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("casting", () => {
  it("pays for the base, each shard, and the work, then hits weaknesses harder", () => {
    const state = play(inFight(), [cast([bolt(7, "fire")], "spell-1", 9)]);
    expect(state.battle?.mana).toBe(3);
    expect(state.battle?.foes[0]?.hp).toBe(20 - 10);
    const again = stepShardrun(state, cast([bolt(7)]), CATALOG);
    expect(again.ok ? undefined : again.error.code).toBe("already-cast");
  });

  it("counts what a run spends and what each spell deals", () => {
    // Five bolts with a cap of four: one fizzles, and the rest land.
    const state = play(inFight(), [cast([bolt(3), bolt(3), bolt(3), bolt(3), bolt(3)], "spell-1", 16)]);
    expect(state.stats).toMatchObject({ casts: 1, bolts: 4, fizzled: 1, manaSpent: 4, damage: 12 });
    expect(state.stats.damageBySpell).toEqual({ "spell-1": 12 });
    const after = play(state, [{ type: "end-turn" }, cast([bolt(5)], "spell-1")]);
    expect(after.stats.damageBySpell).toEqual({ "spell-1": 17 });
  });

  it("clamps power, caps the bolt count, and drops malformed bolts", () => {
    const { bolts, fizzled } = normalizeBolts(
      [bolt(99), { power: "lots" }, bolt(2.6), bolt(-3), bolt(1), bolt(1)],
      BALANCE,
      4,
    );
    expect(bolts.map((b) => b.power)).toEqual([20, 3, 0, 1]);
    expect(fizzled).toBe(2);
  });

  it("prices a step by its shard's complexity class", () => {
    expect(workUnits("constant", 16)).toBe(1);
    expect(workUnits("linear", 16)).toBe(16);
    // 16 * log2(17), rounded up: a sort is dearer than a walk and far cheaper than a pairwise pass.
    expect(workUnits("linearithmic", 16)).toBe(66);
    expect(workUnits("quadratic", 16)).toBe(256);
    // An unknown shard is billed as one pass, so a snapshot naming a retired shard still costs something sane.
    // Each known shard also bills its own cost as work: 1 mana is 8 units here. The unknown one bills a pass and nothing else.
    expect(
      pipelineWork(
        [
          { shard: "dedupe", given: 8 },
          { shard: "spark", given: 8 },
          { shard: "gone", given: 8 },
        ],
        CATALOG,
      ),
    ).toBe(64 + 8 + (1 + 8) + 8);
  });

  it("bills work on a curve, and a relic buys a cheaper one", () => {
    // 2 048 units, 8 to the mana: 256 linear, 16 amortized, 8 logarithmic. The curve is the whole difference.
    expect(billWork(2048, "linear", BALANCE)).toBe(256);
    expect(billWork(2048, "sqrt", BALANCE)).toBe(16);
    expect(billWork(2048, "log", BALANCE)).toBe(8);
    expect(billWork(0, "linear", BALANCE)).toBe(0);

    // The same quadratic pipeline, priced without and with the ledger.
    const heavy: ShardrunCommand = {
      type: "cast",
      spellId: "spell-1",
      outcome: { ok: true, bolts: [bolt(4)], work: [{ shard: "dedupe", given: 16 }] },
    };
    const plain = previewCast(
      inFight(),
      "spell-1",
      { ok: true, bolts: [bolt(4)], work: [{ shard: "dedupe", given: 16 }] },
      CATALOG,
    );
    expect(plain?.cost).toBe(1 + 33);
    const withLedger = inFight();
    withLedger.relics.push("ledger");
    expect(
      previewCast(
        withLedger,
        "spell-1",
        { ok: true, bolts: [bolt(4)], work: [{ shard: "dedupe", given: 16 }] },
        CATALOG,
      )?.cost,
    ).toBe(1 + 5);
    // And the engine charges what the preview promised.
    expect(stepShardrun(inFight(), heavy, CATALOG).ok).toBe(false);
  });

  it("grows the mana a turn gives and the bolts that land as the run descends", () => {
    const state = inFight();
    expect(manaPerTurn(state, CATALOG)).toBe(6);
    expect(boltCap(state, CATALOG)).toBe(4);
    const deeper = { ...state, layer: 1 };
    expect(manaPerTurn(deeper, CATALOG)).toBe(9);
    expect(boltCap(deeper, CATALOG)).toBe(6);
    // Relics stack on top, and the cap never passes its maximum.
    expect(boltCap({ ...deeper, relics: ["aperture"] }, CATALOG)).toBe(8);
    expect(boltCap({ ...state, layer: 9, relics: ["aperture"] }, CATALOG)).toBe(8);
  });

  it("lets shields absorb bolts unless they pierce, and halves resisted elements", () => {
    const state = inFight();
    const target = state.battle?.foes[0];
    if (!target) throw new Error("no foe");
    target.shield = 5;
    const after = play(state, [cast([bolt(8), bolt(8, "none", { pierce: true }), bolt(8, "frost")])]);
    expect(after.battle?.foes[0]?.hp).toBe(20 - 3 - 8 - 4);
  });

  it("swallows the first bolt against nullify, and ignores weak bolts against thick hide", () => {
    const wraiths = catalog({
      firstLayer: { encounters: { fight: [["wraith"]], elite: [["wraith"]], boss: [["brick"]] } },
    });
    expect(play(inFight(wraiths), [cast([bolt(3), bolt(3)])], wraiths).battle?.foes[0]?.hp).toBe(7);
    const bricks = catalog({
      firstLayer: { encounters: { fight: [["brick"]], elite: [["brick"]], boss: [["brick"]] } },
    });
    expect(play(inFight(bricks), [cast([bolt(4), bolt(5)])], bricks).battle?.foes[0]?.hp).toBe(25);
  });

  it("predicts casts and intermediate bolts without changing the state", () => {
    const state = inFight();
    const before = structuredClone(state);
    // One linear shard handed one bolt: 1 unit of work plus the 8 that its own 1 mana of cost is priced at, billed
    // linearly in the fixture, so 1 mana on top of the base.
    const oneStep = [{ shard: "amplify", given: 1 }];
    expect(
      previewCast(state, "spell-1", { ok: true, bolts: [bolt(7, "fire")], work: oneStep }, CATALOG),
    ).toEqual({
      cost: 2,
      affordable: true,
      bolts: 1,
      damage: 10,
      block: 0,
    });
    expect(previewBolts(state, [bolt(4), bolt(3, "none", { ward: true })], CATALOG)).toEqual({
      bolts: 2,
      damage: 4,
      block: 3,
    });
    expect(state).toEqual(before);
  });

  it("charges only the base cost when a spell's code fails, and burns Integrity for curses", () => {
    const fizzled = play(inFight(), [
      { type: "cast", spellId: "spell-1", outcome: { ok: false, reason: "NameError" } },
    ]);
    expect(fizzled.battle?.mana).toBe(5);
    const cursed = inFight();
    const spell = cursed.spells[1];
    if (!spell) throw new Error("no second spell");
    spell.shards = ["overclock"];
    cursed.integrity = 2;
    const lost = play(cursed, [cast([bolt(1)], "spell-2")]);
    expect(lost.status).toBe("lost");
  });

  it("softens foes on an easier difficulty", () => {
    expect(inFight(CATALOG, "soft").battle?.foes[0]?.max).toBe(10);
  });
});

describe("relics", () => {
  const withRelics = (ids: string[]) => catalog({ config: { start: { ...CONFIG.start, relics: ids } } });

  it("adds bolt power, block, and mana, and discounts the first cast of a turn", () => {
    const using = withRelics(["duck", "wall", "cache", "capacitor"]);
    const fight = inFight(using);
    expect(fight.battle).toMatchObject({ mana: 7, block: 3 });
    const first = play(fight, [cast([bolt(4)], "spell-1", 1)], using);
    // Cost 2 (the base, plus Amplify's own cost billed as work) minus the first-cast discount; the duck makes the bolt 5.
    expect(first.battle?.mana).toBe(6);
    expect(first.battle?.foes[0]?.hp).toBe(15);
    // spell-2 holds no shards at all, so there is nothing to bill beyond the base and no discount left.
    const second = play(first, [cast([bolt(4)], "spell-2")], using);
    expect(second.battle?.mana).toBe(5);
  });

  it("multiplies damage, and applies one-time effects when claimed", () => {
    const core = withRelics(["core"]);
    expect(play(inFight(core), [cast([bolt(4)])], core).battle?.foes[0]?.hp).toBe(12);
    const page = withRelics(["page"]);
    expect(start(page).spells.map((spell) => spell.capacity)).toEqual([3, 3]);
  });
});

describe("rooms and rewards", () => {
  it("ends a turn with the foes acting, soaks their hits with block, and refills mana", () => {
    const state = play(inFight(), [cast([bolt(3, "none", { ward: true })]), { type: "end-turn" }]);
    expect(state.integrity).toBe(30 - 2);
    expect(state.battle).toMatchObject({ turn: 2, mana: 6, block: 0, cast: [] });
  });

  it("offers shards after a fight, and takes one into the inventory", () => {
    const won = play(inFight(), [cast([bolt(20, "fire")])]);
    expect(won.status).toBe("reward");
    const choices = won.reward?.shards ?? [];
    expect(new Set(choices).size).toBe(2);
    for (const choice of choices) expect(["amplify", "fork", "chill"]).toContain(choice);
    const taken = play(won, [{ type: "take", shardId: choices[0] ?? null }]);
    expect(taken.status).toBe("map");
    expect(taken.inventory).toContain(choices[0]);
  });

  it("gives an elite's relic alongside its shards, each claimed on its own", () => {
    const elite = standingAt(start(), "elite");
    const won = play(elite, [cast([bolt(20, "fire")])]);
    expect(won.reward?.relics).toEqual(["duck"]);
    const claimed = play(won, [{ type: "claim-relic", relicId: "duck" }]);
    expect(claimed.status).toBe("reward");
    expect(claimed.relics).toEqual(["duck"]);
    expect(play(claimed, [{ type: "take", shardId: null }]).status).toBe("map");
  });

  it("opens a treasure room into a choice of relics", () => {
    const treasure = standingAt(start(), "treasure");
    expect(treasure.status).toBe("reward");
    expect(treasure.reward?.relics).toHaveLength(2);
    const left = play(treasure, [{ type: "leave" }]);
    expect(left.status).toBe("map");
    expect(left.relics).toEqual([]);
  });

  it("forges an upgrade or widens a spell, and heals at a rest", () => {
    const forge = standingAt(start(), "forge");
    expect(play(forge, [{ type: "forge", shardId: "amplify" }]).spells[0]?.shards).toEqual(["amplify-plus"]);
    expect(play(forge, [{ type: "widen", spellId: "spell-2" }]).spells[1]?.capacity).toBe(3);
    const rest = standingAt(start(), "rest");
    rest.integrity = 10;
    expect(play(rest, [{ type: "rest" }]).integrity).toBe(25);
  });

  it("descends to the next layer after its boss, with a new spell and a fresh map", () => {
    const boss = standingAt(start(), "boss");
    boss.integrity = 10;
    const won = play(boss, [cast([bolt(20), bolt(20)])]);
    expect(won.status).toBe("reward");
    expect(won.reward?.spell).toEqual({ name: "Surge", capacity: 2 });
    const next = play(won, [
      { type: "claim-spell" },
      { type: "claim-relic", relicId: won.reward?.relics?.[0] ?? "" },
      { type: "take", shardId: null },
    ]);
    expect(next).toMatchObject({ status: "map", layer: 1, position: null, visited: [] });
    expect(next.spells.map((spell) => spell.name)).toEqual(["Bolt", "Ward", "Surge"]);
    expect(next.integrity).toBe(25);
    expect(next.map.nodes.some((node) => node.id.startsWith("l1-"))).toBe(true);
  });

  it("wins the run after the last layer's boss", () => {
    const last = start();
    last.layer = 1;
    last.map = generateLayerMap(last.seed, 1, layerAt(CONFIG, 1));
    const boss = standingAt(last, "boss");
    const won = play(boss, [cast([bolt(20), bolt(20)])]);
    const finished = play(won, [{ type: "leave" }]);
    expect(finished.status).toBe("won");
    const after = stepShardrun(finished, { type: "end-turn" }, CATALOG);
    expect(after.ok ? undefined : after.error.code).toBe("run-over");
  });

  it("rearranges shards between fights but never creates or destroys them", () => {
    const state = start();
    const moved = play(state, [
      {
        type: "arrange",
        spells: [
          { id: "spell-1", shards: ["amplify", "fork"] },
          { id: "spell-2", shards: [] },
        ],
        inventory: [],
      },
    ]);
    expect(moved.spells[0]?.shards).toEqual(["amplify", "fork"]);
    const duplicated = stepShardrun(
      state,
      {
        type: "arrange",
        spells: [
          { id: "spell-1", shards: ["amplify", "amplify"] },
          { id: "spell-2", shards: [] },
        ],
        inventory: [],
      },
      CATALOG,
    );
    expect(duplicated.ok ? undefined : duplicated.error.code).toBe("shards-changed");
    const midFight = stepShardrun(
      inFight(),
      {
        type: "arrange",
        spells: [
          { id: "spell-1", shards: [] },
          { id: "spell-2", shards: ["amplify"] },
        ],
        inventory: ["fork"],
      },
      CATALOG,
    );
    expect(midFight.ok ? undefined : midFight.error.code).toBe("cannot-arrange");
  });
});

describe("the dev sandbox", () => {
  // The sandbox is a run like any other, plus the commands below. Ordinary runs must never answer one of them, which is
  // the guarantee these tests exist to hold: content can be granted freely, but only where the run says so.
  const sandbox = (using: ShardrunCatalog = CATALOG) =>
    startShardrun(using, { seed: "seed-1", language: "python", difficulty: "normal", sandbox: true });

  it("refuses every dev command on an ordinary run", () => {
    const state = start();
    expect(state.sandbox).toBe(false);
    for (const command of [
      { type: "dev-grant-shard", shardId: "fork" },
      { type: "dev-grant-relic", relicId: "duck" },
      { type: "dev-set", integrity: 1 },
      { type: "dev-goto-layer", layer: 1 },
    ] satisfies ShardrunCommand[]) {
      expect(stepShardrun(state, command, CATALOG)).toMatchObject({
        ok: false,
        error: { code: "not-a-sandbox" },
      });
    }
  });

  it("grants and removes shards and relics", () => {
    const granted = play(sandbox(), [
      { type: "dev-grant-shard", shardId: "chill" },
      { type: "dev-grant-relic", relicId: "duck" },
    ]);
    expect(granted.inventory).toContain("chill");
    expect(granted.relics).toContain("duck");

    const removed = play(granted, [
      { type: "dev-remove-shard", shardId: "chill" },
      { type: "dev-remove-relic", relicId: "duck" },
    ]);
    expect(removed.inventory).not.toContain("chill");
    expect(removed.relics).not.toContain("duck");
  });

  it("grants a relic's effect, not just its name", () => {
    const granted = play(sandbox(), [{ type: "dev-grant-relic", relicId: "page" }]);
    // A spell-capacity relic widens the spells already held, exactly as claiming it in a run would.
    expect(granted.spells[0]?.capacity).toBe(3);
    expect(stepShardrun(granted, { type: "dev-grant-relic", relicId: "page" }, CATALOG)).toMatchObject({
      ok: false,
      error: { code: "already-held" },
    });
  });

  it("refuses what the content does not have", () => {
    const state = sandbox();
    expect(stepShardrun(state, { type: "dev-grant-shard", shardId: "nope" }, CATALOG)).toMatchObject({
      error: { code: "unknown-shard" },
    });
    expect(stepShardrun(state, { type: "dev-grant-relic", relicId: "nope" }, CATALOG)).toMatchObject({
      error: { code: "unknown-relic" },
    });
    expect(stepShardrun(state, { type: "dev-goto-layer", layer: 9 }, CATALOG)).toMatchObject({
      error: { code: "unknown-layer" },
    });
    expect(stepShardrun(state, { type: "dev-spawn", kind: "fight", foes: ["nope"] }, CATALOG)).toMatchObject({
      error: { code: "unknown-foe" },
    });
    expect(stepShardrun(state, { type: "dev-end-battle", outcome: "win" }, CATALOG)).toMatchObject({
      error: { code: "not-in-battle" },
    });
  });

  it("sets Integrity within the run's own limits, and mana only in a fight", () => {
    const hurt = play(sandbox(), [{ type: "dev-set", integrity: 5 }]);
    expect(hurt.integrity).toBe(5);
    expect(play(hurt, [{ type: "dev-set", integrity: 9999 }]).integrity).toBe(hurt.integrityMax);

    const fight = play(sandbox(), [
      { type: "dev-spawn", kind: "fight", foes: ["dummy"] },
      { type: "dev-set", mana: 40 },
    ]);
    expect(fight.battle?.mana).toBe(40);
  });

  it("spawns a fight of any foes, and ends one either way", () => {
    const fight = play(sandbox(), [{ type: "dev-spawn", kind: "elite", foes: ["wraith", "wraith"] }]);
    expect(fight.status).toBe("battle");
    expect(fight.battle?.kind).toBe("elite");
    expect(fight.battle?.foes.map((foe) => foe.id)).toEqual(["wraith", "wraith"]);
    // Two of the same foe are still two foes: separate uids, and different steps of the intent pattern.
    expect(new Set(fight.battle?.foes.map((foe) => foe.uid)).size).toBe(2);

    expect(play(fight, [{ type: "dev-end-battle", outcome: "win" }]).status).not.toBe("battle");
    const lost = play(fight, [{ type: "dev-end-battle", outcome: "lose" }]);
    expect(lost.status).toBe("lost");
    expect(lost.integrity).toBe(0);
  });

  it("adds a spell, and jumps to a layer leaving the fight behind", () => {
    const withSpell = play(sandbox(), [{ type: "dev-grant-spell", name: "Scratch", capacity: 4 }]);
    expect(withSpell.spells.at(-1)).toMatchObject({ name: "Scratch", capacity: 4, shards: [] });

    const jumped = play(withSpell, [
      { type: "dev-spawn", kind: "fight", foes: ["dummy"] },
      { type: "dev-goto-layer", layer: 1 },
    ]);
    expect(jumped.layer).toBe(1);
    expect(jumped.status).toBe("map");
    expect(jumped.battle).toBeUndefined();
    expect(jumped.position).toBeNull();
  });

  it("plays by the ordinary rules once something is granted", () => {
    const fight = play(sandbox(), [
      { type: "dev-grant-relic", relicId: "core" },
      { type: "dev-spawn", kind: "fight", foes: ["dummy"] },
    ]);
    const before = fight.battle?.foes[0]?.hp ?? 0;
    const after = play(fight, [cast([bolt(5)])]);
    // The damage-multiplier relic doubles a granted cast exactly as a claimed one would.
    expect(before - (after.battle?.foes[0]?.hp ?? 0)).toBe(10);
  });
});

describe("spell slots", () => {
  // A run can hold `max_spells` spells (4 here), starting with two, and the pool below offers two more names.
  it("binds a new spell at a forge, one name at a time, until there is no room left", () => {
    const bound = play(standingAt(start(), "forge"), [{ type: "bind" }]);
    expect(bound.spells.map((spell) => spell.name)).toEqual(["Bolt", "Ward", "Volley"]);
    expect(bound.spells.at(-1)).toMatchObject({ capacity: 2, shards: [] });

    const again = play(standingAt(bound, "forge"), [{ type: "bind" }]);
    expect(again.spells.map((spell) => spell.name)).toEqual(["Bolt", "Ward", "Volley", "Requiem"]);

    // Now neither a free name nor room in the book is left.
    expect(stepShardrun(standingAt(again, "forge"), { type: "bind" }, CATALOG)).toMatchObject({
      ok: false,
      error: { code: "cannot-bind" },
    });
  });

  it("refuses a bind anywhere but a forge", () => {
    expect(stepShardrun(start(), { type: "bind" }, CATALOG)).toMatchObject({
      ok: false,
      error: { code: "no-forge" },
    });
  });

  it("grants a spell the moment a spell-slot relic is claimed", () => {
    const state = startShardrun(CATALOG, {
      seed: "seed-1",
      language: "python",
      difficulty: "normal",
      sandbox: true,
    });
    const granted = play(state, [{ type: "dev-grant-relic", relicId: "grimoire" }]);
    expect(granted.spells.map((spell) => spell.name)).toEqual(["Bolt", "Ward", "Volley"]);
    expect(granted.spells.at(-1)).toMatchObject({ capacity: 2, shards: [] });
  });
});

describe("the multiplier axis (ADR-0014)", () => {
  // A bolt deals power x mult. The multiplier is the axis a build grows on, so these tests pin how it is read,
  // clamped, and defaulted — the last of those is what lets every shard written before ADR-0014 keep its meaning.
  it("multiplies power by the multiplier", () => {
    const fight = inFight();
    expect(previewBolts(fight, [bolt(5, "none", { mult: 3 })], CATALOG).damage).toBe(15);
    expect(previewBolts(fight, [bolt(5, "none", { mult: 1 })], CATALOG).damage).toBe(5);
  });

  it("treats a bolt that never mentions a multiplier as times one", () => {
    // Shards written before this existed return bolts with no `mult` key at all.
    const older = { power: 7, element: "none", target: "front", pierce: false, ward: false };
    expect(previewBolts(inFight(), [older], CATALOG).damage).toBe(7);
  });

  it("clamps the multiplier, because it is player code's number", () => {
    const fight = inFight();
    // Measured as ward block, not damage: damage *dealt* is capped by the foe's remaining HP, so a working clamp and a
    // missing one would both report 20 here and the test would prove nothing.
    expect(previewBolts(fight, [bolt(2, "none", { ward: true, mult: 1000 })], CATALOG).block).toBe(
      2 * BALANCE.max_bolt_mult,
    );
    expect(previewBolts(fight, [bolt(4, "none", { ward: true, mult: -5 })], CATALOG).block).toBe(0);
    expect(
      previewBolts(fight, [bolt(4, "none", { ward: true, mult: Number.POSITIVE_INFINITY })], CATALOG).block,
    ).toBe(0);
  });

  it("raises a ward's block by the multiplier too", () => {
    expect(previewBolts(inFight(), [bolt(6, "none", { ward: true, mult: 2 })], CATALOG).block).toBe(12);
  });

  it("lets a relic add to every bolt's multiplier", () => {
    // A catalog local to this test: a relic added to the shared one would join the common pool and change which
    // relic the seeded elite and treasure draws pick, which other tests assert by id.
    const tuner = relic("tuner", [{ kind: "bolt-mult", add: 1 }]);
    const using: ShardrunCatalog = { ...CATALOG, relics: new Map([...CATALOG.relics, [tuner.id, tuner]]) };
    const state = startShardrun(using, {
      seed: "seed-1",
      language: "python",
      difficulty: "normal",
      sandbox: true,
    });
    const armed = play(
      state,
      [
        { type: "dev-grant-relic", relicId: "tuner" },
        { type: "dev-spawn", kind: "fight", foes: ["dummy"] },
      ],
      using,
    );
    // The bolt asks for mult 1; the relic makes it 2, so 5 power lands as 10.
    expect(previewBolts(armed, [bolt(5, "none", { mult: 1 })], using).damage).toBe(10);
  });
});
