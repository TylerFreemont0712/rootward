import { Element, FoeIntent, FoeTrait, ShardrunNodeKind } from "@rootward/content-schema";
import { z } from "zod";

// Shardrun state (ADR-0012). A run is saved as one validated snapshot after every command rather than as an event log:
// the mode is young and its rules will change, and a snapshot keeps an old run playable where replaying old events under
// new rules would not. Runtime keys are camelCase; the few that shard code sees are single words.

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
  /** Spell ids already cast this turn. */
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

export const MapNode = z.strictObject({ id: z.string(), floor: z.int().min(0), kind: ShardrunNodeKind });
export type MapNode = z.infer<typeof MapNode>;

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

export const SHARDRUN_STATUSES = ["map", "battle", "reward", "rest", "forge", "won", "lost", "abandoned"] as const;
export const ShardrunStatus = z.enum(SHARDRUN_STATUSES);
export type ShardrunStatus = z.infer<typeof ShardrunStatus>;

export const ShardrunState = z.strictObject({
  version: z.literal(1),
  seed: z.string(),
  language: z.string(),
  status: ShardrunStatus,
  integrity: z.int().min(0),
  integrityMax: z.int().positive(),
  floors: z.array(z.array(MapNode)),
  /** Node ids entered so far, one per floor. */
  path: z.array(z.string()),
  spells: z.array(SpellState),
  inventory: z.array(z.string()),
  battle: BattleState.optional(),
  reward: z.strictObject({ choices: z.array(z.string()) }).optional(),
  /** What the most recent command did. */
  log: z.array(LogEntry),
  stats: z.strictObject({
    fights: z.int().min(0),
    turns: z.int().min(0),
    casts: z.int().min(0),
    damage: z.int().min(0),
    shards: z.int().min(0),
  }),
});
export type ShardrunState = z.infer<typeof ShardrunState>;
