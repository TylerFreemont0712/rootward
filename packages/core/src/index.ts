// @rootward/core: the pure, deterministic engine. No I/O, no clocks, no Math.random.
export * from "./result.ts";
export * from "./rng.ts";
export { critLootMultiplier, type DecideContext, decide } from "./run/decide.ts";
export { evolve, foldRun } from "./run/evolve.ts";
export { type MoveDefinition, MOVES } from "./run/moves.ts";
export {
  currentRoom,
  displayedEnemyHp,
  enemyHp,
  enemyHpMax,
  reachableRoomIds,
  retreatSuggested,
} from "./run/queries.ts";
export { computeRewards, type RewardInput } from "./run/rewards.ts";
export * from "./run/types.ts";

// Planner v1 (docs/PLANNER.md, ADR-0007)
export { challengeRating, expectedSuccess, type RatingOutcome, updateRating } from "./planner/elo.ts";
export { planDungeon, type PlanResult } from "./planner/plan.ts";
export { type ChallengePick, type ChallengeQuery, familiarConcepts, rankChallenges } from "./planner/select.ts";
export { isLanguageNode, LANGUAGE_TRACKS, trackOf, type TrackView, viewForLanguage } from "./planner/tracks.ts";
export * from "./planner/types.ts";

// The learner model (ADR-0009)
export { creditedNodes } from "./learner/credit.ts";
export { evidenceFromRun } from "./learner/evidence.ts";
export {
  applyEvidence,
  buildLearnerModel,
  emptyLearnerModel,
  formatVersion,
  type LearnerContext,
  learnerSnapshot,
  MASTERY,
} from "./learner/model.ts";
export type * from "./learner/types.ts";

// The walkable world: zones, dialogue, and quests (ADR-0011)
export { type Footprint, isAdjacent, zoneCollision } from "./world/collision.ts";
export * from "./world/conditions.ts";
export {
  type ConditionCheck,
  type OfferedChoice,
  offeredChoices,
  openingNode,
  questsOffered,
} from "./world/dialogue.ts";
export { applyEffects, type EffectOutcome, type EffectResult } from "./world/effects.ts";

// The walkable map laid over a plan
export { layoutDungeon } from "./map/layout.ts";
export { findPath, isWalkable, tileAt } from "./map/path.ts";
export * from "./map/types.ts";
