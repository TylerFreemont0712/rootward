import type { Balance } from "@rootward/content-schema";
import { z } from "zod";

// The planner's output is saved with a run, so it is defined as zod schemas (like run events). Its inputs are plain
// snapshots built by the server from content and the learner model; the planner itself never reads files or clocks.

export const SessionLength = z.enum(["short", "standard", "long"]);
export type SessionLength = z.infer<typeof SessionLength>;

export const RoomKind = z.enum(["encounter", "elite", "shrine", "puzzle", "rest", "boss"]);
export type RoomKind = z.infer<typeof RoomKind>;

/** Why a room is in the dungeon. Shown in the plan rationale and used to style the map. */
export const RoomPurpose = z.enum(["frontier", "practice", "review", "stretch", "interleave", "boss"]);
export type RoomPurpose = z.infer<typeof RoomPurpose>;

export const PlanRoom = z.strictObject({
  id: z.string(),
  floor: z.int().min(0),
  kind: RoomKind,
  purpose: RoomPurpose,
  /** The skill node the room teaches or reviews. */
  nodeId: z.string().optional(),
  challengeId: z.string().optional(),
  /** P(success) the planner aimed for, and what it expects for the chosen challenge. */
  targetSuccess: z.number().min(0).max(1).optional(),
  expectedSuccess: z.number().min(0).max(1).optional(),
  cardIds: z.array(z.string()).optional(),
  puzzleIds: z.array(z.string()).optional(),
});
export type PlanRoom = z.infer<typeof PlanRoom>;

export const RationaleKind = z.enum(["review", "frontier", "stretch", "interleave", "boss", "fallback"]);
export type RationaleKind = z.infer<typeof RationaleKind>;

export const RationaleEntry = z.strictObject({
  kind: RationaleKind,
  text: z.string(),
  nodeId: z.string().optional(),
});
export type RationaleEntry = z.infer<typeof RationaleEntry>;

export const DungeonPlan = z.strictObject({
  seed: z.string(),
  length: SessionLength,
  language: z.string(),
  /** Room ids per floor, top to bottom. The last floor holds only the boss. */
  floors: z.array(z.array(z.string()).min(1)),
  rooms: z.array(PlanRoom),
  /** [from room id, to room id], always from one floor to the next. */
  edges: z.array(z.tuple([z.string(), z.string()])),
  rationale: z.array(RationaleEntry),
});
export type DungeonPlan = z.infer<typeof DungeonPlan>;

// ---- Inputs ----

export interface PlannerNode {
  id: string;
  realm: string;
  tier: number;
  prerequisites: readonly string[];
  transfersTo?: string;
}

export interface PlannerChallenge {
  id: string;
  kind: "encounter" | "boss";
  realm: string;
  concepts: readonly string[];
  difficulty: number;
  languages: readonly string[];
}

export interface PlannerPuzzle {
  id: string;
  concepts: readonly string[];
  difficulty: number;
}

/** What content exists, reduced to what planning needs. */
export interface PlannerCatalog {
  nodes: readonly PlannerNode[];
  challenges: readonly PlannerChallenge[];
  puzzles: readonly PlannerPuzzle[];
  /** Nodes that have Shrine lesson content. */
  lessons: ReadonlySet<string>;
}

export interface NodeProgress {
  mastery: number;
  rating: number;
  rotting: boolean;
}

/** What the learner model knows, reduced to what planning needs. Dates are resolved by the caller. */
export interface LearnerSnapshot {
  nodes: ReadonlyMap<string, NodeProgress>;
  /** Review cards due now, most overdue first. */
  dueCards: readonly { cardId: string; nodeId: string }[];
  /** Challenges seen within the recency window (`planner.recency_exclusion_days`). */
  recentChallenges: ReadonlySet<string>;
}

export interface PlanRequest {
  seed: string;
  length: SessionLength;
  language: string;
  catalog: PlannerCatalog;
  learner: LearnerSnapshot;
  /** Realm id -> weight from the active Oath. */
  oathRealms: Readonly<Record<string, number>>;
  /** Realm id -> weight from the character's class. */
  classAffinity: Readonly<Record<string, number>>;
  balance: Balance;
}
