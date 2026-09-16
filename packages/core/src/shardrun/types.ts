import { Element, FoeIntent, FoeTrait, ShardrunNodeKind } from "@rootward/content-schema";
import { z } from "zod";

// Shardrun state (ADR-0012, ADR-0013). A run is saved as one validated snapshot after every command rather than as an
// event log: the mode is young and its rules will change, and a snapshot keeps an old run readable where replaying old
// events under new rules would not. Runtime keys are camelCase; the few that shard code sees are single words.

export const FoeState = z.strictObject({
  uid: z.string(),
  id: z.string(),
  name: z.string(),
  sprite: z.string(),
  hp: z.int().min(0),
  max: z.int().positive(),
  shield: z.int().min(0),
  weak: z.array(Element),
  resist: z.array(Element),
  trait: FoeTrait.optional(),
  /** This turn's favored element, for a pattern ward. */
  pattern: Element.optional(),
  /** Copied from content when the fight starts, so editing a foe never changes a fight in progress. */
  intents: z.array(FoeIntent).min(1),
  intentIndex: z.int().min(0),
  stoked: z.boolean(),
  /** Whether nullify-first has already eaten a bolt this turn. */
  nullified: z.boolean(),
  flavor: z.string(),
});
export type FoeState = z.infer<typeof FoeState>;

export const BattleKind = z.enum(["fight", "elite", "boss"]);
export type BattleKind = z.infer<typeof BattleKind>;

export const BattleState = z.strictObject({
  kind: BattleKind,
  turn: z.int().positive(),
  mana: z.int().min(0),
  block: z.int().min(0),
  foes: z.array(FoeState).min(1),
  /** Spell ids already cast this turn, in order. */
  cast: z.array(z.string()),
});
export type BattleState = z.infer<typeof BattleState>;

export const SpellState = z.strictObject({
  id: z.string(),
  name: z.string(),
  capacity: z.int().positive(),
  /** Shard ids in slot order; duplicates are separate copies. */
  shards: z.array(z.string()),
});
export type SpellState = z.infer<typeof SpellState>;

/** A room on a layer's map. Row 0 is the bottom; the boss is alone in the top row. */
export const MapNode = z.strictObject({ id: z.string(), row: z.int().min(0), col: z.int().min(0), kind: ShardrunNodeKind });
export type MapNode = z.infer<typeof MapNode>;

export const LayerMap = z.strictObject({
  nodes: z.array(MapNode).min(1),
  /** Paths upward, from a room to a room one row higher. */
  edges: z.array(z.tuple([z.string(), z.string()])),
});
export type LayerMap = z.infer<typeof LayerMap>;

export const LOG_KINDS = [
  "enter",
  "turn",
  "cast",
  "hit",
  "absorb",
  "glance",
  "ward",
  "defeat",
  "fizzle",
  "curse",
  "enemy",
  "shield",
  "stoke",
  "heal",
  "victory",
  "loss",
  "reward",
  "relic",
  "spell",
  "layer",
  "rest",
  "forge",
  "note",
] as const;

/** What one command did, in order: the client plays these back as animation. */
export const LogEntry = z.strictObject({
  kind: z.enum(LOG_KINDS),
  text: z.string(),
  /** A foe's uid. */
  foe: z.string().optional(),
  spell: z.string().optional(),
  amount: z.int().optional(),
  element: Element.optional(),
});
export type LogEntry = z.infer<typeof LogEntry>;

/** What is waiting to be claimed after a won fight or in a treasure room. Each part is claimed (or left) on its own. */
export const RewardState = z.strictObject({
  shards: z.array(z.string()).optional(),
  relics: z.array(z.string()).optional(),
  spell: z.strictObject({ name: z.string(), capacity: z.int().positive() }).optional(),
});
export type RewardState = z.infer<typeof RewardState>;

export const SHARDRUN_STATUSES = ["map", "battle", "reward", "rest", "forge", "won", "lost", "abandoned"] as const;
export const ShardrunStatus = z.enum(SHARDRUN_STATUSES);
export type ShardrunStatus = z.infer<typeof ShardrunStatus>;

export const ShardrunState = z.strictObject({
  /** Snapshots from older rules do not load; the service reports them as runs that can no longer continue. */
  version: z.literal(2),
  seed: z.string(),
  language: z.string(),
  difficulty: z.string(),
  status: ShardrunStatus,
  integrity: z.int().min(0),
  integrityMax: z.int().positive(),
  /** Index into the run's layers. */
  layer: z.int().min(0),
  map: LayerMap,
  /** The room the Maintainer is in or just left; null before the first room of a layer. */
  position: z.string().nullable(),
  /** Rooms entered on this layer, in order. */
  visited: z.array(z.string()),
  spells: z.array(SpellState),
  inventory: z.array(z.string()),
  relics: z.array(z.string()),
  battle: BattleState.optional(),
  reward: RewardState.optional(),
  /** Counts accepted commands, so a view computed for an older state can be told apart from the current one. */
  revision: z.int().min(0),
  /** A dev sandbox run (ADR-0013): the same rules, plus commands that grant and set things. Never true by accident. */
  sandbox: z.boolean().default(false),
  /** What the most recent command did. */
  log: z.array(LogEntry),
  stats: z.strictObject({
    fights: z.int().min(0),
    turns: z.int().min(0),
    casts: z.int().min(0),
    damage: z.int().min(0),
    shards: z.int().min(0),
    relics: z.int().min(0),
    layers: z.int().min(0),
    // Added after the first runs existed, so they default rather than making an older snapshot unreadable.
    manaSpent: z.int().min(0).default(0),
    /** Bolts that actually flew, after the cap. */
    bolts: z.int().min(0).default(0),
    fizzled: z.int().min(0).default(0),
    /** Spell id -> damage it has dealt this run. */
    damageBySpell: z.record(z.string(), z.int().min(0)).default({}),
  }),
});
export type ShardrunState = z.infer<typeof ShardrunState>;
