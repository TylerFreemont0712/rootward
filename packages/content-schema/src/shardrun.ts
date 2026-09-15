import { z } from "zod";
import { Language } from "./languages.ts";
import { Id, NonEmptyString, Tag } from "./primitives.ts";

// Shardrun (ADR-0012): a roguelite mode where spells are pipelines of found code. A shard is a real function in Python
// or JavaScript that takes a list of bolts and the battle and returns bolts; a spell runs its shards in slot order, and
// the engine resolves whatever bolts come out. Every key a shard's code can see is a single word, so the same names read
// naturally in YAML, Python, and JavaScript.

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

export const SHARDRUN_NODE_KINDS = ["fight", "elite", "boss", "rest", "forge"] as const;
export const ShardrunNodeKind = z.enum(SHARDRUN_NODE_KINDS);
export type ShardrunNodeKind = z.infer<typeof ShardrunNodeKind>;

const FoeGroups = z.array(z.array(Id).min(1).max(4)).min(1);
const RarityWeights = z.record(ShardRarity, z.number().min(0));

/** `shardrun/run.yaml`: the loadout a run starts with, its floors, and what can be met on them. */
export const ShardrunConfig = z.strictObject({
  start: z.strictObject({
    spells: z.array(z.strictObject({ name: NonEmptyString, capacity: z.int().min(1).max(8), shards: z.array(Id) })).min(1).max(4),
    inventory: z.array(Id).default([]),
  }),
  /** One entry per floor: the kinds of room to choose between. */
  floors: z.array(z.array(ShardrunNodeKind).min(1).max(4)).min(2),
  encounters: z.strictObject({ fight: FoeGroups, elite: FoeGroups, boss: FoeGroups }),
  /** How likely each rarity is when a fight of that kind offers shards. */
  rewards: z.strictObject({ fight: RarityWeights, elite: RarityWeights, boss: RarityWeights }),
});
export type ShardrunConfig = z.infer<typeof ShardrunConfig>;
