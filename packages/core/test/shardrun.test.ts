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
  boltPowerBonus,
  bossId,
  encounterFor,
  manaPerTurn,
  generateLayerMap,
  handSize,
  holdLimit,
  nextRooms,
  normalizeBolts,
  pipelineWork,
  previewBolts,
  previewCast,
  type ShardrunBalance,
  type ShardrunCatalog,
  type ShardrunCommand,
  ShardrunState,
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
  max_foe_hp: 1_000_000,
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
  deck: { hand_size: 3, hold: 1, mana_per_turn: { base: 3, per_layer: 1 }, min_cards: 4 },
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
    size: "medium",
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
    ambience: "dust",
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
  deck: {
    spells: [
      { name: "Left", capacity: 2 },
      { name: "Right", capacity: 2 },
    ],
    cards: ["amplify", "amplify", "fork", "fork", "chill", "spark"],
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

  it("measures a cast by what it could have dealt, not by the part that landed", () => {
    // The dummy has 20 Integrity. A 50-power bolt removes 20 of it and is worth 50, and the run records the 50:
    // without that, every build past the first lethal one reads the same (ADR-0016).
    // Three bolts at the fixture's power cap against a foe holding 20 Integrity: 20 lands, and the volley is worth 60.
    const volley = [bolt(20), bolt(20), bolt(20)];
    const state = play(inFight(), [cast(volley)]);
    expect(state.battle).toBeUndefined();
    expect(state.stats.damage).toBe(20);
    expect(state.stats.bestCast).toBe(60);
    // The preview says the same before the cast, so the number the player watches is the one the rules will record.
    expect(previewBolts(inFight(), volley, CATALOG)).toEqual({ bolts: 3, damage: 20, potential: 60, block: 0 });
    // A resisted volley really is worth less: potential keeps every rule except "cut to what was left to hit".
    expect(previewBolts(inFight(), [bolt(20, "frost")], CATALOG).potential).toBe(10);
  });

  it("clamps a foe's Integrity into the exact integers, however a layer multiplies it", () => {
    const absurd = catalog({ firstLayer: { foe_hp: 1e9 } });
    const hp = inFight(absurd).battle?.foes[0]?.hp ?? 0;
    expect(hp).toBe(BALANCE.max_foe_hp);
    expect(Number.isSafeInteger(hp)).toBe(true);
    // Damage is bounded by HP per hit, so bounding HP is what bounds every number the engine carries.
    expect(BALANCE.bolt_cap.max * BALANCE.max_bolt_power * BALANCE.max_bolt_mult).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it("lets shields absorb bolts unless they pierce, and halves resisted elements", () => {
    const state = inFight();
    const target = state.battle?.foes[0];
    if (!target) throw new Error("no foe");
    target.shield = 5;
    const after = play(state, [cast([bolt(8), bolt(8, "none", { pierce: true }), bolt(8, "frost")])]);
    expect(after.battle?.foes[0]?.hp).toBe(20 - 3 - 8 - 4);
  });

  it("logs the shape of each bolt, so the arena can draw a lance as a lance and a weakness as a weakness (ADR-0019)", () => {
    const state = inFight();
    const target = state.battle?.foes[0];
    if (!target) throw new Error("no foe");
    target.shield = 5;
    const after = play(state, [
      cast([bolt(4, "fire"), bolt(4, "none", { pierce: true, mult: 2 }), bolt(4, "frost"), bolt(3, "none", { ward: true })]),
    ]);
    const shown = after.log.filter((entry) => ["hit", "ward"].includes(entry.kind));
    expect(shown).toMatchObject([
      // Fire is this foe's weakness: 4 x 1.5 = 6, and the shield takes 5 of it.
      { kind: "hit", bolt: 0, target: "front", affinity: "weak", blocked: 5, amount: 1 },
      { kind: "hit", bolt: 1, target: "front", pierce: true, mult: 2, amount: 8 },
      { kind: "hit", bolt: 2, affinity: "resist", amount: 2 },
      { kind: "ward", bolt: 3, amount: 3 },
    ]);
    // Sparse: a plain bolt carries no pierce, no multiplier and no affinity at all.
    expect(shown[1]).not.toHaveProperty("blocked");
    expect(shown[1]).not.toHaveProperty("affinity");
    expect(shown[2]).not.toHaveProperty("pierce");
    expect(shown[2]).not.toHaveProperty("mult");

    // An enemy blow says how much of it the ward's block caught.
    const struck = play(after, [{ type: "end-turn" }]).log.find((entry) => entry.kind === "enemy");
    expect(struck?.blocked).toBe(3);

    // A bolt aimed at every foe lands once on each of them, and every one of those hits names the same bolt.
    const pair = inFight();
    const first = pair.battle?.foes[0];
    if (!first) throw new Error("no foe");
    pair.battle?.foes.push({ ...structuredClone(first), uid: "second" });
    const scattered = play(pair, [cast([bolt(4, "none", { target: "all" })])]).log.filter((entry) => entry.kind === "hit");
    expect(scattered.map((entry) => [entry.foe, entry.bolt, entry.target])).toEqual([
      [first.uid, 0, "all"],
      ["second", 0, "all"],
    ]);
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
      potential: 10,
      block: 0,
    });
    expect(previewBolts(state, [bolt(4), bolt(3, "none", { ward: true })], CATALOG)).toEqual({
      bolts: 2,
      damage: 4,
      potential: 4,
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

describe("the deck playstyle (ADR-0020)", () => {
  // The fixture's deck: six cards, two blank spells of two slots, a hand of three, and 3 mana a turn.
  const startDeck = (using: ShardrunCatalog = CATALOG) =>
    startShardrun(using, { seed: "seed-1", language: "python", difficulty: "normal", playstyle: "deck" });
  const inDeckFight = (using: ShardrunCatalog = CATALOG) => {
    const state = startDeck(using);
    return play(state, [{ type: "enter", nodeId: firstRoom(state) }], using);
  };
  const battleOf = (state: ShardrunState) => {
    if (!state.battle) throw new Error("not in a fight");
    return state.battle;
  };
  /** Every card of a deck run in a fight, wherever it sits. */
  const cardsOf = (state: ShardrunState) => {
    const battle = battleOf(state);
    return [...battle.draw, ...battle.hand, ...battle.held, ...battle.discard, ...state.spells.flatMap((spell) => spell.shards)].sort();
  };
  /** Put the named cards into spells, and keep the rest of the hand. */
  const compose = (state: ShardrunState, placed: Record<string, string[]>): ShardrunCommand => {
    const hand = [...battleOf(state).hand];
    for (const card of Object.values(placed).flat()) hand.splice(hand.indexOf(card), 1);
    return {
      type: "compose",
      spells: state.spells.map((spell) => ({ id: spell.id, shards: placed[spell.id] ?? spell.shards })),
      hand,
      held: [...battleOf(state).held],
    };
  };

  it("starts with blank spells and a deck of cards, and loads a run saved before playstyles as a spellbook run", () => {
    const state = startDeck();
    expect(state.playstyle).toBe("deck");
    expect(state.spells.map((spell) => [spell.name, spell.capacity, spell.shards])).toEqual([
      ["Left", 2, []],
      ["Right", 2, []],
    ]);
    expect(state.inventory).toEqual([]);
    expect(state.deck).toEqual(["amplify", "amplify", "fork", "fork", "chill", "spark"]);

    // A snapshot as it was saved before playstyles existed: the same run, without the two new keys.
    const { playstyle: _playstyle, deck: _deck, ...saved } = start();
    const loaded = ShardrunState.parse(saved);
    expect(loaded.playstyle).toBe("spellbook");
    expect(loaded.deck).toEqual([]);
    expect(() => startShardrun(catalog({ config: { deck: undefined } }), { seed: "s", language: "python", difficulty: "normal", playstyle: "deck" })).toThrow(/no deck playstyle/);
  });

  it("deals a shuffled hand from the whole deck when a fight begins, the same hand for the same run", () => {
    const state = inDeckFight();
    const battle = battleOf(state);
    expect(battle.hand).toHaveLength(3);
    expect(battle.draw).toHaveLength(3);
    expect(battle.discard).toEqual([]);
    expect(battle.mana).toBe(3);
    expect(cardsOf(state)).toEqual([...state.deck].sort());
    expect(battleOf(inDeckFight()).hand).toEqual(battle.hand);
    // A spellbook run has no piles at all.
    expect(battleOf(inFight())).toMatchObject({ draw: [], hand: [], discard: [] });
  });

  it("plays cards from the hand into spells, in order, but never creates, destroys or overfills", () => {
    const state = inDeckFight();
    const [first, second, third] = battleOf(state).hand as [string, string, string];
    const placed = play(state, [compose(state, { "spell-1": [second, first] })]);
    expect(placed.spells[0]?.shards).toEqual([second, first]);
    expect(battleOf(placed).hand).toEqual([third]);
    expect(cardsOf(placed)).toEqual([...placed.deck].sort());
    // And back again: a card can return to the hand.
    const undone = play(placed, [{ type: "compose", spells: [{ id: "spell-1", shards: [first] }, { id: "spell-2", shards: [] }], hand: [third, second], held: [] }]);
    expect(battleOf(undone).hand).toEqual([third, second]);

    const refused = (command: ShardrunCommand, from: ShardrunState = state) => {
      const result = stepShardrun(from, command, CATALOG);
      return result.ok ? "accepted" : result.error.code;
    };
    expect(refused({ type: "compose", spells: [{ id: "spell-1", shards: ["dedupe"] }, { id: "spell-2", shards: [] }], hand: [first, second, third], held: [] })).toBe("cards-changed");
    expect(refused({ type: "compose", spells: [{ id: "spell-1", shards: [first] }, { id: "spell-2", shards: [] }], hand: [first, second, third], held: [] })).toBe("cards-changed");
    expect(refused({ type: "compose", spells: [{ id: "spell-1", shards: [first, second, third] }, { id: "spell-2", shards: [] }], hand: [], held: [] })).toBe("over-capacity");
    expect(refused({ type: "compose", spells: [{ id: "spell-1", shards: [first] }], hand: [second, third], held: [] })).toBe("unknown-spell");
    expect(refused({ type: "compose", spells: [], hand: [], held: [] }, inFight())).toBe("not-a-deck-run");
    expect(refused({ type: "compose", spells: [], hand: [], held: [] }, startDeck())).toBe("not-in-battle");
    expect(refused({ type: "arrange", spells: [], inventory: [] }, startDeck())).toBe("cannot-arrange");
  });

  it("spends a cast spell's cards onto the discard pile, and keeps that spell shut until the next turn", () => {
    const state = inDeckFight();
    const [first, second] = battleOf(state).hand as [string, string];
    const placed = play(state, [compose(state, { "spell-1": [first] })]);
    const cast1 = play(placed, [cast([bolt(1)], "spell-1", 1)]);
    expect(cast1.spells[0]?.shards).toEqual([]);
    expect(battleOf(cast1).discard).toEqual([first]);
    expect(battleOf(cast1).mana).toBe(3 - 2);
    expect(cardsOf(cast1)).toEqual([...cast1.deck].sort());
    const reopened = stepShardrun(cast1, compose(cast1, { "spell-1": [second] }), CATALOG);
    expect(reopened.ok ? "accepted" : reopened.error.code).toBe("already-cast");
    // A blank spell still casts: one plain bolt, for the base cost.
    const plain = play(cast1, [cast([bolt(4)], "spell-2")]);
    expect(battleOf(plain).mana).toBe(0);
  });

  it("lets go of the hand and every uncast card when a turn ends, and shuffles the discard back when the pile runs out", () => {
    const state = inDeckFight();
    const [first] = battleOf(state).hand as [string];
    const turn2 = play(state, [compose(state, { "spell-2": [first] }), { type: "end-turn" }]);
    expect(turn2.spells.every((spell) => spell.shards.length === 0)).toBe(true);
    expect(battleOf(turn2).discard).toHaveLength(3);
    expect(battleOf(turn2).hand).toHaveLength(3);
    expect(battleOf(turn2).draw).toHaveLength(0);
    expect(battleOf(turn2).mana).toBe(3);
    expect(cardsOf(turn2)).toEqual([...turn2.deck].sort());

    const turn3 = play(turn2, [{ type: "end-turn" }]);
    expect(battleOf(turn3).hand).toHaveLength(3);
    expect(battleOf(turn3).draw).toHaveLength(3);
    expect(battleOf(turn3).discard).toEqual([]);
    expect(cardsOf(turn3)).toEqual([...turn3.deck].sort());
  });

  it("adds a won card to the deck, deals it in the next fight, and leaves the spells blank between fights", () => {
    const won = play(inDeckFight(), [cast([bolt(20, "fire")], "spell-1")]);
    expect(won.status).toBe("reward");
    expect(won.spells.every((spell) => spell.shards.length === 0)).toBe(true);
    const choice = won.reward?.shards?.[0];
    if (choice === undefined) throw new Error("no shard offered");
    const taken = play(won, [{ type: "take", shardId: choice }]);
    expect(taken.deck).toHaveLength(7);
    expect(taken.deck).toContain(choice);
    expect(taken.inventory).toEqual([]);
    const next = standingAt(taken, "fight");
    expect(next.status).toBe("battle");
    expect(cardsOf(next)).toEqual([...next.deck].sort());
  });

  it("melts a card down at a forge, never below the smallest deck, and upgrades a card in the deck", () => {
    const forge = standingAt(startDeck(), "forge");
    const melted = play(forge, [{ type: "purge", shardId: "spark" }]);
    expect(melted.deck).toEqual(["amplify", "amplify", "fork", "fork", "chill"]);
    expect(melted.status).toBe("map");

    const tiny = standingAt({ ...startDeck(), deck: ["amplify", "fork", "chill", "spark"] }, "forge");
    const refused = stepShardrun(tiny, { type: "purge", shardId: "spark" }, CATALOG);
    expect(refused.ok ? "accepted" : refused.error.code).toBe("deck-too-small");
    const notHeld = stepShardrun(forge, { type: "purge", shardId: "dedupe" }, CATALOG);
    expect(notHeld.ok ? "accepted" : notHeld.error.code).toBe("not-owned");
    const spellbook = stepShardrun(standingAt(start(), "forge"), { type: "purge", shardId: "amplify" }, CATALOG);
    expect(spellbook.ok ? "accepted" : spellbook.error.code).toBe("not-a-deck-run");

    const upgraded = play(forge, [{ type: "forge", shardId: "amplify" }]);
    expect(upgraded.deck.filter((card) => card === "amplify-plus")).toHaveLength(1);
  });

  it("gives a deck run its own income, which still grows by layer", () => {
    expect(manaPerTurn(startDeck(), CATALOG)).toBe(3);
    expect(manaPerTurn({ ...startDeck(), layer: 1 }, CATALOG)).toBe(4);
    expect(manaPerTurn(start(), CATALOG)).toBe(6);
  });

  it("grants a card into the deck and the hand in a sandbox fight, and removes one from both", () => {
    const sandbox = startShardrun(CATALOG, { seed: "seed-1", language: "python", difficulty: "normal", playstyle: "deck", sandbox: true });
    const fight = play(sandbox, [{ type: "dev-spawn", kind: "fight", foes: ["dummy"] }]);
    expect(battleOf(fight).hand).toHaveLength(3);
    const granted = play(fight, [{ type: "dev-grant-shard", shardId: "dedupe" }]);
    expect(granted.deck).toContain("dedupe");
    expect(battleOf(granted).hand).toContain("dedupe");
    const removed = play(granted, [{ type: "dev-remove-shard", shardId: "dedupe" }]);
    expect(removed.deck).not.toContain("dedupe");
    expect(cardsOf(removed)).toEqual([...removed.deck].sort());
  });

  describe("holding cards, and the relics made for decks", () => {
    const DECK_RELICS = [
      relic("reader", [{ kind: "hand-size", add: 1 }], "uncommon"),
      relic("clip", [{ kind: "hold", add: 1 }]),
      relic("warm", [{ kind: "opening-draw", add: 2 }]),
      relic("generator", [{ kind: "draw-on-cast", min_cards: 2, draw: 1 }], "rare"),
      relic("collector", [{ kind: "reshuffle-block", amount: 5 }], "uncommon"),
      relic("shaker", [{ kind: "small-deck-power", below: 8, per_card: 1 }], "rare"),
      relic("bundle", [{ kind: "add-cards", cards: ["spark", "spark"] }]),
    ];
    const WITH_RELICS: ShardrunCatalog = { ...CATALOG, relics: new Map([...CATALOG.relics, ...DECK_RELICS.map((r): [string, Relic] => [r.id, r])]) };
    const holding = (relics: string[]) => {
      const state = { ...startDeck(WITH_RELICS), relics };
      return play(state, [{ type: "enter", nodeId: firstRoom(state) }], WITH_RELICS);
    };

    it("holds cards into the next turn, up to the hold limit, on top of a full new hand", () => {
      const state = inDeckFight();
      const [first, second, third] = battleOf(state).hand as [string, string, string];
      const held = play(state, [{ type: "compose", spells: [{ id: "spell-1", shards: [] }, { id: "spell-2", shards: [] }], hand: [second, third], held: [first] }]);
      expect(battleOf(held).held).toEqual([first]);
      expect(cardsOf(held)).toEqual([...held.deck].sort());
      const tooMany = stepShardrun(state, { type: "compose", spells: [{ id: "spell-1", shards: [] }, { id: "spell-2", shards: [] }], hand: [third], held: [first, second] }, CATALOG);
      expect(tooMany.ok ? "accepted" : tooMany.error.code).toBe("hold-full");

      const next = play(held, [{ type: "end-turn" }]);
      expect(battleOf(next).held).toEqual([]);
      expect(battleOf(next).hand[0]).toBe(first);
      expect(battleOf(next).hand).toHaveLength(1 + 3);
      expect(battleOf(next).discard).toHaveLength(2);
      expect(cardsOf(next)).toEqual([...next.deck].sort());
      // A relic holds one more.
      expect(holdLimit(startDeck(), CATALOG)).toBe(1);
      expect(holdLimit({ relics: ["clip"] }, WITH_RELICS)).toBe(2);
    });

    it("draws more every turn, or more on a fight's first turn only", () => {
      expect(battleOf(holding(["reader"])).hand).toHaveLength(4);
      const warm = holding(["warm"]);
      expect(battleOf(warm).hand).toHaveLength(5);
      // The next turn is an ordinary one: three cards.
      expect(battleOf(play(warm, [{ type: "end-turn" }], WITH_RELICS)).hand).toHaveLength(3);
      expect(handSize({ relics: ["reader"] }, WITH_RELICS)).toBe(4);
    });

    it("draws a card after a cast of enough cards", () => {
      const state = holding(["generator"]);
      const [first, second, third] = battleOf(state).hand as [string, string, string];
      const placed = play(state, [{ type: "compose", spells: [{ id: "spell-1", shards: [first, second] }, { id: "spell-2", shards: [] }], hand: [third], held: [] }], WITH_RELICS);
      const cast2 = play(placed, [cast([bolt(1)], "spell-1", 1)], WITH_RELICS);
      expect(battleOf(cast2).hand).toHaveLength(2);
      expect(cardsOf(cast2)).toEqual([...cast2.deck].sort());
      // A one-card cast is too small to draw.
      const one = play(state, [{ type: "compose", spells: [{ id: "spell-1", shards: [first] }, { id: "spell-2", shards: [] }], hand: [second, third], held: [] }], WITH_RELICS);
      expect(battleOf(play(one, [cast([bolt(1)], "spell-1", 1)], WITH_RELICS)).hand).toHaveLength(2);
    });

    it("gains block when the discard pile is shuffled into a new draw pile", () => {
      const state = holding(["collector"]);
      const turn2 = play(state, [{ type: "end-turn" }], WITH_RELICS);
      expect(battleOf(turn2).block).toBe(0);
      const turn3 = play(turn2, [{ type: "end-turn" }], WITH_RELICS);
      expect(battleOf(turn3).block).toBe(5);
      expect(turn3.log.some((entry) => entry.text.includes("compacted"))).toBe(true);
    });

    it("gives every bolt power for each card a thin deck is short of, and adds cards when a bundle is claimed", () => {
      // Six cards against a relic that counts below eight: two more power on every bolt.
      expect(boltPowerBonus({ ...startDeck(), relics: ["shaker"] }, WITH_RELICS)).toBe(2);
      const hit = (relics: string[]) => {
        const state = holding(relics);
        const before = battleOf(state).foes[0]?.hp ?? 0;
        return before - (battleOf(play(state, [cast([bolt(4)], "spell-1")], WITH_RELICS)).foes[0]?.hp ?? 0);
      };
      expect(hit(["shaker"]) - hit([])).toBe(2);

      const sandbox = startShardrun(WITH_RELICS, { seed: "seed-1", language: "python", difficulty: "normal", playstyle: "deck", sandbox: true });
      const fight = play(sandbox, [{ type: "dev-spawn", kind: "fight", foes: ["dummy"] }], WITH_RELICS);
      const bundled = play(fight, [{ type: "dev-grant-relic", relicId: "bundle" }], WITH_RELICS);
      expect(bundled.deck.filter((card) => card === "spark")).toHaveLength(3);
      expect(cardsOf(bundled)).toEqual([...bundled.deck].sort());
    });

    it("offers a relic only to runs of the playstyles it names", () => {
      const only = (playstyles: ("spellbook" | "deck")[] | undefined, id: string): Relic => ({ ...relic(id, [{ kind: "bolt-power", add: 1 }]), ...(playstyles ? { playstyles } : {}) });
      const pool: ShardrunCatalog = {
        ...CATALOG,
        relics: new Map([only(["deck"], "deck-only"), only(["spellbook"], "book-only"), only(undefined, "anyone")].map((r) => [r.id, r])),
      };
      const offered = (state: ShardrunState) => standingAt(state, "treasure", pool).reward?.relics ?? [];
      expect(offered(start(pool)).sort()).toEqual(["anyone", "book-only"]);
      expect(offered(startDeck(pool)).sort()).toEqual(["anyone", "deck-only"]);
    });
  });
});

