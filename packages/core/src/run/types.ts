import type { ClassDef, Enemy, EnemyTier } from "@rootward/content-schema";

// Engine state, events, and commands for a run. Runtime state uses camelCase; content files are snake_case
// (ADR-0002). Everything here is plain data, so it serializes to JSON for the event store as-is.

export type TestVisibility = "visible" | "hidden";

export interface EncounterTest {
  id: string;
  name: string;
  visibility: TestVisibility;
  category?: string;
  weight: number;
  /** Whether the test passed at the most recent Cast; false before the first Cast. */
  passing: boolean;
  /** The enemy move that added this test mid-fight, if any. */
  revealedBy?: string;
}

/** A hidden test held back until an enemy move reveals it. */
export interface ReserveTest {
  id: string;
  name: string;
  category: string;
}

export interface EnemySnapshot {
  id: string;
  name: string;
  tier: EnemyTier;
  atk: number;
  hpDisplayOffset: number;
  moves: readonly { move: string; weight: number; params: Readonly<Record<string, unknown>> }[];
  taunts: readonly string[];
}

/** One test's result as far as the rules care. The server keeps full output separately. */
export interface TestOutcome {
  id: string;
  passed: boolean;
  durationMs: number;
}

export type BonusId = "crit" | "true_sight" | "efficiency" | "elegance" | "unaided";

export interface EncounterRewards {
  bonuses: BonusId[];
  commits: number;
  cycles: number;
}

export type EnemyAction =
  | { move: "strike"; damage: number; fallbackFrom?: string; taunt?: string }
  | { move: "edge-case"; testId: string; category: string; taunt?: string };

export type EncounterStatus = "active" | "won" | "retreated" | "exhausted" | "kernel-panic";

export interface EncounterState {
  roomId: string;
  challengeId: string;
  language: string;
  difficulty: number;
  retreatable: boolean;
  scoring: { crit: boolean; efficiency: boolean; elegance: boolean };
  enemy: EnemySnapshot;
  tests: EncounterTest[];
  reserve: ReserveTest[];
  focus: number;
  focusMax: number;
  casts: number;
  probes: number;
  hintsTaken: number;
  /** Cycles for each hint level, already adjusted for the player's mastery of the concept. */
  hintCosts: readonly number[];
  inspected: boolean;
  status: EncounterStatus;
  lastProbe?: readonly TestOutcome[];
  lastCast?: readonly TestOutcome[];
  lastEnemyAction?: EnemyAction;
  rewards?: EncounterRewards;
}

export type RunEndReason = "kernel-panic" | "completed" | "abandoned";

export interface RunState {
  runId: string;
  seed: string;
  classId: string;
  status: "active" | "ended";
  endReason?: RunEndReason;
  integrity: number;
  integrityMax: number;
  cycles: number;
  focusBase: number;
  critLootMultiplier: number;
  encounter?: EncounterState;
}

// Events record facts, including the values that resulted (focus after a Cast, integrity after a Strike). Folding
// them is simple assignment, so an old run replays exactly as it happened even after the rules change.
export type RunEvent =
  | {
      type: "RunStarted";
      runId: string;
      seed: string;
      classId: string;
      integrityMax: number;
      cycles: number;
      focusBase: number;
      critLootMultiplier: number;
    }
  | { type: "EncounterStarted"; encounter: EncounterState }
  | { type: "Probed"; roomId: string; results: TestOutcome[] }
  | { type: "CastResolved"; roomId: string; results: TestOutcome[]; damage: number; heal: number; focus: number }
  | { type: "EnemyStruck"; roomId: string; action: Extract<EnemyAction, { move: "strike" }>; integrity: number }
  | { type: "EdgeCaseRevealed"; roomId: string; action: Extract<EnemyAction, { move: "edge-case" }>; test: EncounterTest }
  | { type: "HintTaken"; roomId: string; level: number; cost: number; cycles: number }
  | { type: "Retreated"; roomId: string }
  | { type: "Exhausted"; roomId: string }
  | { type: "EncounterWon"; roomId: string; rewards: EncounterRewards; cycles: number }
  | { type: "RunEnded"; reason: RunEndReason };

export interface EncounterChallenge {
  id: string;
  language: string;
  difficulty: number;
  retreatable: boolean;
  scoring: { crit: boolean; efficiency: boolean; elegance: boolean };
}

export type RunCommand =
  | { type: "StartRun"; runId: string; seed: string; classDef: ClassDef }
  | {
      type: "StartEncounter";
      roomId: string;
      challenge: EncounterChallenge;
      enemy: Enemy;
      tests: readonly { id: string; name: string; visibility: TestVisibility; category?: string }[];
      reserve: readonly ReserveTest[];
      /** Mastery (0-5) of the challenge's primary concept; prices hints. */
      mastery: number;
    }
  | { type: "Probe"; results: TestOutcome[] }
  | {
      type: "Cast";
      results: TestOutcome[];
      /** Large-input timings measured on the same runner, when the challenge has any. */
      timing?: { playerMs: number; referenceMs: number };
    }
  | { type: "TakeHint" }
  | { type: "Retreat" };
