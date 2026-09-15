import { z } from "zod";
import { Language } from "./languages.ts";
import { Id, NonEmptyString, Tag } from "./primitives.ts";

// Shardrun (ADR-0012, ADR-0013): a roguelite mode where spells are pipelines of found code. A shard is a real function
// in Python or JavaScript that takes a list of bolts and the battle and returns bolts; a spell runs its shards in slot
// order, and the engine resolves whatever bolts come out. Every key a shard's code can see is a single word, so the
// same names read naturally in YAML, Python, and JavaScript.

const PositiveInt = z.int().positive();

export const ELEMENTS = ["none", "fire", "frost", "spark"] as const;
export const Element = z.enum(ELEMENTS);
export type Element = z.infer<typeof Element>;

export const BOLT_TARGETS = ["front", "back", "weakest", "strongest", "all"] as const;
export const BoltTarget = z.enum(BOLT_TARGETS);
export type BoltTarget = z.infer<typeof BoltTarget>;

/** What a spell fires. The engine decides what a bolt does; a shard can only change these fields. */
export const Bolt = z.strictObject({
  power: z.number(),
  element: Element,
  target: BoltTarget,
  /** Ignores shields. */
  pierce: z.boolean(),
  /** Becomes block for the Maintainer instead of hitting anything. */
  ward: z.boolean(),
});
export type Bolt = z.infer<typeof Bolt>;

/** The battle as a shard's code sees it: living foes in order, the Maintainer, and the turn. */
export const ShardBattle = z.strictObject({
  turn: PositiveInt,
  me: z.strictObject({ hp: z.int(), max: z.int(), block: z.int(), mana: z.int() }),
  foes: z.array(
    z.strictObject({
      name: NonEmptyString,
      hp: z.int(),
      max: z.int(),
      shield: z.int(),
      weak: z.array(Element),
      resist: z.array(Element),
    }),
  ),
});
export type ShardBattle = z.infer<typeof ShardBattle>;

/** The battle shard examples run against when they do not give one. */
export const DEFAULT_SHARD_BATTLE: ShardBattle = {
  turn: 1,
  me: { hp: 30, max: 30, block: 0, mana: 6 },
  foes: [{ name: "Training Dummy", hp: 20, max: 20, shield: 0, weak: [], resist: [] }],
};

export const SHARD_RARITIES = ["common", "uncommon", "rare"] as const;
export const ShardRarity = z.enum(SHARD_RARITIES);
export type ShardRarity = z.infer<typeof ShardRarity>;

/** A worked example: these bolts in, those bolts out. Validation runs every example in every language. */
export const ShardExample = z.strictObject({
  name: NonEmptyString,
  bolts: z.array(Bolt),
  battle: ShardBattle.optional(),
  expect: z.array(Bolt),
});
export type ShardExample = z.infer<typeof ShardExample>;

/** `shardrun/shards/<id>.yaml` */
export const Shard = z.strictObject({
  id: Id,
  name: NonEmptyString,
  rarity: ShardRarity,
  /** Mana added to every cast of a spell holding this shard. */
  cost: z.int().min(0).max(9),
  /** Plain words for what the code does. Beginner runs show it; harder runs show only the code. */
  summary: NonEmptyString,
  /** The function the code defines; the pipeline calls it with (bolts, battle). */
  function: z.string().regex(/^[a-z][a-z0-9_]*$/, { error: "function names are lowercase snake_case" }),
  code: z.partialRecord(Language, NonEmptyString),
  tags: z.array(Tag).default([]),
  /** Offered as a reward after fights. Forge results are not. */
  draftable: z.boolean().default(true),
  /** What the forge turns this shard into: an upgrade, or the repaired version of a buggy shard. */
  forge: z.strictObject({ into: Id, verb: z.enum(["upgrade", "repair"]) }).optional(),
  /** Integrity lost every time a spell holding this shard is cast. */
  curse: z.strictObject({ integrity: PositiveInt }).optional(),
  examples: z.array(ShardExample).min(1),
});
export type Shard = z.infer<typeof Shard>;

export const FoeIntent = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("strike"), power: PositiveInt }),
  z.strictObject({ kind: z.literal("multi"), power: PositiveInt, times: z.int().min(2).max(6) }),
  z.strictObject({ kind: z.literal("shield"), amount: PositiveInt }),
  /** The foe's next strike deals double. */
  z.strictObject({ kind: z.literal("stoke") }),
  z.strictObject({ kind: z.literal("heal"), amount: PositiveInt }),
]);
export type FoeIntent = z.infer<typeof FoeIntent>;

/** Rules a foe bends. Each one is built around a habit worth learning. */
export const FoeTrait = z.discriminatedUnion("kind", [
  /** The first bolt that hits it each turn does nothing. */
  z.strictObject({ kind: z.literal("nullify-first") }),
  /** Bolts weaker than `threshold` glance off. */
  z.strictObject({ kind: z.literal("thick-hide"), threshold: PositiveInt }),
  /** Its weakness moves through `cycle`, one element per turn. */
  z.strictObject({ kind: z.literal("shifting-weakness"), cycle: z.array(Element).min(2) }),
  /** Only bolts of this turn's element in `pattern` hit at full strength. */
  z.strictObject({ kind: z.literal("pattern-ward"), pattern: z.array(Element).min(2) }),
]);
export type FoeTrait = z.infer<typeof FoeTrait>;

/** `shardrun/foes/<id>.yaml` */
export const ShardrunFoe = z.strictObject({
  id: Id,
  name: NonEmptyString,
  /** Art id of its creature sprite. */
  sprite: Id,
  hp: PositiveInt,
  weak: z.array(Element).default([]),
  resist: z.array(Element).default([]),
  trait: FoeTrait.optional(),
  /** Played in order, one per turn, then repeated. */
  intents: z.array(FoeIntent).min(1),
  flavor: NonEmptyString,
});
export type ShardrunFoe = z.infer<typeof ShardrunFoe>;

export const RELIC_RARITIES = ["common", "uncommon", "rare", "boss"] as const;
export const RelicRarity = z.enum(RELIC_RARITIES);
export type RelicRarity = z.infer<typeof RelicRarity>;

/** What a relic changes. The first seven apply all run long; the last two apply once, when the relic is claimed. */
export const RelicEffect = z.discriminatedUnion("kind", [
  /** Added to every bolt after its spell's last shard. */
  z.strictObject({ kind: z.literal("bolt-power"), add: z.number() }),
  /** Every hit's damage is multiplied by this. */
  z.strictObject({ kind: z.literal("damage-multiplier"), factor: z.number().positive() }),
  /** Added to the weakness multiplier. */
  z.strictObject({ kind: z.literal("weak-bonus"), add: z.number().positive() }),
  z.strictObject({ kind: z.literal("mana-per-turn"), add: z.int() }),
  /** The first spell cast each turn costs this much less. */
  z.strictObject({ kind: z.literal("first-cast-discount"), amount: PositiveInt }),
  /** Block gained at the start of every turn. */
  z.strictObject({ kind: z.literal("turn-block"), amount: PositiveInt }),
  z.strictObject({ kind: z.literal("heal-after-fight"), amount: PositiveInt }),
  z.strictObject({ kind: z.literal("spell-capacity"), add: PositiveInt }),
  z.strictObject({ kind: z.literal("max-integrity"), add: PositiveInt }),
]);
export type RelicEffect = z.infer<typeof RelicEffect>;

/** `shardrun/relics/<id>.yaml`: a passive item that bends the rules for the rest of a run. */
export const Relic = z.strictObject({
  id: Id,
  name: NonEmptyString,
  rarity: RelicRarity,
  /** Art id of its icon (`shardrun/relic-<icon>`). */
  icon: Id,
  summary: NonEmptyString,
  flavor: NonEmptyString,
  effects: z.array(RelicEffect).min(1),
});
export type Relic = z.infer<typeof Relic>;

export const SHARDRUN_NODE_KINDS = ["fight", "elite", "boss", "rest", "forge", "treasure"] as const;
export const ShardrunNodeKind = z.enum(SHARDRUN_NODE_KINDS);
export type ShardrunNodeKind = z.infer<typeof ShardrunNodeKind>;

/** Room kinds a map row can hold; the boss always has a row of its own at the top. */
export const MapRoomKind = z.enum(["fight", "elite", "rest", "forge", "treasure"]);
export type MapRoomKind = z.infer<typeof MapRoomKind>;

const FoeGroups = z.array(z.array(Id).min(1).max(4)).min(1);
const ShardWeights = z.record(ShardRarity, z.number().min(0));
const RelicWeights = z.record(RelicRarity, z.number().min(0));

/** A layer of the Salvage: one generated map, its foes, and a boss at the top. */
export const ShardrunLayer = z.strictObject({
  id: Id,
  name: NonEmptyString,
  flavor: NonEmptyString,
  /** Art id of the battle backdrop (`backgrounds/<id>`). */
  backdrop: Id,
  /** Rows of rooms below the boss. */
  rows: z.int().min(3).max(15),
  columns: z.int().min(2).max(7),
  /** Paths drawn upward from the bottom row; more paths mean more branches. */
  paths: z.int().min(1).max(8),
  /** Rows whose rooms are all one kind: row numbers from the bottom, or negative from the top ("-1" is the row under the boss). */
  fixed_rows: z.record(z.string().regex(/^-?\d+$/), MapRoomKind).default({}),
  /** How likely each kind is in every other row. */
  weights: z.record(MapRoomKind, z.number().min(0)),
  /** Elites never appear below this row. */
  elite_from_row: z.int().min(0).default(3),
  /** Foe HP in this layer is multiplied by this. */
  foe_hp: z.number().positive().default(1),
  encounters: z.strictObject({ fight: FoeGroups, elite: FoeGroups, boss: FoeGroups }),
  /** A new, empty spell granted for beating this layer's boss. */
  boss_spell: z.strictObject({ name: NonEmptyString, capacity: z.int().min(1).max(8) }).optional(),
});
export type ShardrunLayer = z.infer<typeof ShardrunLayer>;

/** How much a run explains itself, and how hard its foes are. */
export const ShardrunDifficulty = z.strictObject({
  id: Id,
  name: NonEmptyString,
  summary: NonEmptyString,
  /** Show what each shard does in plain words. Without it, the code is the only description. */
  show_summaries: z.boolean(),
  /** Show predicted damage and block before casting. Without it, you find out by reading the code, or by casting. */
  show_predictions: z.boolean(),
  /** Foe HP is multiplied by this (after the layer's own multiplier). */
  foe_hp: z.number().positive(),
});
export type ShardrunDifficulty = z.infer<typeof ShardrunDifficulty>;

/** `shardrun/run.yaml`: the loadout a run starts with, its difficulties, its layers, and its rewards. */
export const ShardrunConfig = z.strictObject({
  start: z.strictObject({
    spells: z.array(z.strictObject({ name: NonEmptyString, capacity: z.int().min(1).max(8), shards: z.array(Id) })).min(1).max(4),
    inventory: z.array(Id).default([]),
    relics: z.array(Id).default([]),
  }),
  difficulties: z.array(ShardrunDifficulty).min(1),
  layers: z.array(ShardrunLayer).min(1),
  rewards: z.strictObject({
    /** How likely each shard rarity is when a won fight offers shards. */
    shards: z.strictObject({ fight: ShardWeights, elite: ShardWeights, boss: ShardWeights }),
    /** How likely each relic rarity is in each place relics are found. */
    relics: z.strictObject({ elite: RelicWeights, treasure: RelicWeights, boss: RelicWeights }),
  }),
});
export type ShardrunConfig = z.infer<typeof ShardrunConfig>;
