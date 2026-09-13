// @rootward/core: the pure, deterministic engine. No I/O, no clocks, no Math.random.
export * from "./result.ts";
export * from "./rng.ts";
export { critLootMultiplier, type DecideContext, decide } from "./run/decide.ts";
export { evolve, foldRun } from "./run/evolve.ts";
export { type MoveDefinition, MOVES } from "./run/moves.ts";
export { displayedEnemyHp, enemyHp, enemyHpMax, retreatSuggested } from "./run/queries.ts";
export { computeRewards, type RewardInput } from "./run/rewards.ts";
export * from "./run/types.ts";
