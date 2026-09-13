import type { EnemyTier } from "@rootward/content-schema";
import type { BonusId, RunEndReason, RunEvent } from "../run/types.ts";

// The learner model (PROMPT.md sections 9.2 and 14.3, ADR-0009). Evidence is read from run events, and the model is a
// fold over that evidence. Nothing sets mastery directly, so a changed rule followed by a refold rebuilds the whole
// history under the new rule.

/** A stored run event and when the event store appended it. */
export interface TimedEvent {
  event: RunEvent;
  /** ISO 8601 timestamp. */
  at: string;
}

export type FightOutcome = "won" | "retreated" | "exhausted" | "kernel-panic";

/** One finished fight: the raw evidence that mastery is derived from (ideas/pedagogy/assessment-and-difficulty.md). */
export interface FightEvidence {
  kind: "fight";
  runId: string;
  roomId: string;
  challengeId: string;
  language: string;
  /** The challenge's concept tags when the fight started. */
  concepts: readonly string[];
  difficulty: number;
  /** The fight's tier as the room set it. */
  tier: EnemyTier;
  outcome: FightOutcome;
  hintsTaken: number;
  bonuses: readonly BonusId[];
  commits: number;
  /** Categories of hidden tests still failing when a lost fight ended, if the player cast at least once. */
  failingCategories: readonly string[];
  at: string;
}

/** An expedition ended. A practice fight has no dungeon, so it never produces one. */
export interface DungeonEvidence {
  kind: "dungeon";
  runId: string;
  outcome: RunEndReason;
  at: string;
}

export type Evidence = FightEvidence | DungeonEvidence;

export interface NodeState {
  /** 0 Unseen, 1 Seen, 2 Assisted, 3 Unaided, 4 Retained, 5 Mastered (PROMPT.md section 9.2). */
  mastery: number;
  rating: number;
  commits: number;
  attempts: number;
  wins: number;
  /** When a fight last exercised the node. */
  lastSeen: string;
  /** When each unaided win happened; two far enough apart make the node Retained. */
  unaidedWins: readonly string[];
}

/** The Maintainer's level, as semver (PROMPT.md section 9.4). */
export interface Version {
  major: number;
  minor: number;
  patch: number;
}

export interface LearnerModel {
  nodes: ReadonlyMap<string, NodeState>;
  /** Hidden-test categories that lost fights ended on, with counts. */
  weakSpots: ReadonlyMap<string, number>;
  /** When each challenge was last played. */
  lastPlayed: ReadonlyMap<string, string>;
  version: Version;
  fights: number;
  dungeonsCleared: number;
}
