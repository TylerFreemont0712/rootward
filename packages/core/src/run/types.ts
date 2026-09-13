import { type ClassDef, type Enemy, EnemyTier } from "@rootward/content-schema";
import { z } from "zod";
import { DungeonPlan } from "../planner/types.ts";

// Engine state, events, and commands for a run. Runtime data uses camelCase; content files are snake_case (ADR-0002).
//
// LEARN: events are stored as JSON (ADR-0006), and JSON read back from a database is external input. So the event and
// state shapes are defined once, as zod schemas, and the TypeScript types are inferred from them. The event store
// parses every stored event with `RunEvent` before folding, and the two can never drift apart.

export const TestVisibility = z.enum(["visible", "hidden"]);
export type TestVisibility = z.infer<typeof TestVisibility>;

export const EncounterTest = z.strictObject({
  id: z.string(),
  name: z.string(),
  visibility: TestVisibility,
  category: z.string().optional(),
  weight: z.number().min(0),
  /** Whether the test passed at the most recent Cast; false before the first Cast. */
  passing: z.boolean(),
  /** The enemy move that added this test mid-fight, if any. */
  revealedBy: z.string().optional(),
});
export type EncounterTest = z.infer<typeof EncounterTest>;

/** A hidden test held back until an enemy move reveals it. */
export const ReserveTest = z.strictObject({
  id: z.string(),
  name: z.string(),
  category: z.string(),
});
export type ReserveTest = z.infer<typeof ReserveTest>;

export const EnemySnapshot = z.strictObject({
  id: z.string(),
  name: z.string(),
  tier: EnemyTier,
  atk: z.number().min(0),
  hpDisplayOffset: z.number(),
  moves: z.array(z.strictObject({ move: z.string(), weight: z.number(), params: z.record(z.string(), z.unknown()) })),
  taunts: z.array(z.string()),
});
export type EnemySnapshot = z.infer<typeof EnemySnapshot>;

/** One test's result as far as the rules care. The server keeps full output separately. */
export const TestOutcome = z.strictObject({
  id: z.string(),
  passed: z.boolean(),
  durationMs: z.number().min(0),
});
export type TestOutcome = z.infer<typeof TestOutcome>;

export const BonusId = z.enum(["crit", "true_sight", "efficiency", "elegance", "unaided"]);
export type BonusId = z.infer<typeof BonusId>;

export const EncounterRewards = z.strictObject({
  bonuses: z.array(BonusId),
  commits: z.number().min(0),
  cycles: z.number().min(0),
});
export type EncounterRewards = z.infer<typeof EncounterRewards>;

export const StrikeAction = z.strictObject({
  move: z.literal("strike"),
  damage: z.number().min(0),
  fallbackFrom: z.string().optional(),
  taunt: z.string().optional(),
});

export const EdgeCaseAction = z.strictObject({
  move: z.literal("edge-case"),
  testId: z.string(),
  category: z.string(),
  taunt: z.string().optional(),
});

export const EnemyAction = z.discriminatedUnion("move", [StrikeAction, EdgeCaseAction]);
export type EnemyAction = z.infer<typeof EnemyAction>;

export const EncounterStatus = z.enum(["active", "won", "retreated", "exhausted", "kernel-panic"]);
export type EncounterStatus = z.infer<typeof EncounterStatus>;

export const Scoring = z.strictObject({ crit: z.boolean(), efficiency: z.boolean(), elegance: z.boolean() });
export type Scoring = z.infer<typeof Scoring>;

export const EncounterState = z.strictObject({
  roomId: z.string(),
  challengeId: z.string(),
  language: z.string(),
  difficulty: z.number(),
  retreatable: z.boolean(),
  scoring: Scoring,
  enemy: EnemySnapshot,
  tests: z.array(EncounterTest),
  reserve: z.array(ReserveTest),
  focus: z.number(),
  focusMax: z.number(),
  casts: z.number(),
  probes: z.number(),
  hintsTaken: z.number(),
  /** Cycles for each hint level, already adjusted for the player's mastery of the concept. */
  hintCosts: z.array(z.number()),
  inspected: z.boolean(),
  status: EncounterStatus,
  lastProbe: z.array(TestOutcome).optional(),
  lastCast: z.array(TestOutcome).optional(),
  lastEnemyAction: EnemyAction.optional(),
  rewards: EncounterRewards.optional(),
});
export type EncounterState = z.infer<typeof EncounterState>;

/** How the run ended: the boss fell, Integrity hit 0, the player retreated from the boss, or gave up. */
export const RunEndReason = z.enum(["kernel-panic", "completed", "retreated", "abandoned"]);
export type RunEndReason = z.infer<typeof RunEndReason>;

export const RoomOutcome = z.enum(["won", "retreated", "exhausted"]);
export type RoomOutcome = z.infer<typeof RoomOutcome>;

export const RoomRecord = z.strictObject({ roomId: z.string(), outcome: RoomOutcome });
export type RoomRecord = z.infer<typeof RoomRecord>;

export const RunState = z.strictObject({
  runId: z.string(),
  seed: z.string(),
  classId: z.string(),
  status: z.enum(["active", "ended"]),
  endReason: RunEndReason.optional(),
  integrity: z.number(),
  integrityMax: z.number(),
  cycles: z.number(),
  focusBase: z.number(),
  critLootMultiplier: z.number(),
  /** The expedition's dungeon. Absent for a single practice fight. */
  plan: DungeonPlan.optional(),
  /** The plan room being played right now. */
  currentRoomId: z.string().optional(),
  /** Rooms finished so far, in order; the last one is where the path continues from. */
  clearedRooms: z.array(RoomRecord),
  encounter: EncounterState.optional(),
});
export type RunState = z.infer<typeof RunState>;

// Events record facts, including the values that resulted (focus after a Cast, integrity after a Strike). Folding
// them is simple assignment, so an old run replays exactly as it happened even after the rules change.
export const RunEvent = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("RunStarted"),
    runId: z.string(),
    seed: z.string(),
    classId: z.string(),
    integrityMax: z.number(),
    cycles: z.number(),
    focusBase: z.number(),
    critLootMultiplier: z.number(),
    plan: DungeonPlan.optional(),
  }),
  z.strictObject({ type: z.literal("RoomEntered"), roomId: z.string() }),
  z.strictObject({ type: z.literal("RoomCleared"), roomId: z.string(), outcome: RoomOutcome }),
  z.strictObject({ type: z.literal("EncounterStarted"), encounter: EncounterState }),
  z.strictObject({ type: z.literal("Probed"), roomId: z.string(), results: z.array(TestOutcome) }),
  z.strictObject({
    type: z.literal("CastResolved"),
    roomId: z.string(),
    results: z.array(TestOutcome),
    damage: z.number(),
    heal: z.number(),
    focus: z.number(),
  }),
  z.strictObject({ type: z.literal("EnemyStruck"), roomId: z.string(), action: StrikeAction, integrity: z.number() }),
  z.strictObject({ type: z.literal("EdgeCaseRevealed"), roomId: z.string(), action: EdgeCaseAction, test: EncounterTest }),
  z.strictObject({
    type: z.literal("HintTaken"),
    roomId: z.string(),
    level: z.number(),
    cost: z.number(),
    cycles: z.number(),
  }),
  z.strictObject({ type: z.literal("Retreated"), roomId: z.string() }),
  z.strictObject({ type: z.literal("Exhausted"), roomId: z.string() }),
  z.strictObject({ type: z.literal("EncounterWon"), roomId: z.string(), rewards: EncounterRewards, cycles: z.number() }),
  z.strictObject({ type: z.literal("RunEnded"), reason: RunEndReason }),
]);
export type RunEvent = z.infer<typeof RunEvent>;

// Commands are not stored, so they stay plain TypeScript types.

export interface EncounterChallenge {
  id: string;
  language: string;
  difficulty: number;
  retreatable: boolean;
  scoring: Scoring;
}

/** Everything the rules need to start a fight; the server fills it from content. */
export interface EncounterSetup {
  challenge: EncounterChallenge;
  enemy: Enemy;
  tests: readonly { id: string; name: string; visibility: TestVisibility; category?: string }[];
  reserve: readonly ReserveTest[];
  /** Mastery (0-5) of the challenge's primary concept; prices hints. */
  mastery: number;
}

export type RunCommand =
  | { type: "StartRun"; runId: string; seed: string; classDef: ClassDef; plan?: DungeonPlan }
  /** A single fight outside an expedition (practice). */
  | ({ type: "StartEncounter"; roomId: string } & EncounterSetup)
  /** Step into a plan room. Fight rooms (encounter, elite, boss) need their setup. */
  | { type: "EnterRoom"; roomId: string; encounter?: EncounterSetup }
  | { type: "AbandonRun" }
  | { type: "Probe"; results: TestOutcome[] }
  | {
      type: "Cast";
      results: TestOutcome[];
      /** Large-input timings measured on the same runner, when the challenge has any. */
      timing?: { playerMs: number; referenceMs: number };
    }
  | { type: "TakeHint" }
  | { type: "Retreat" };
