import type { Balance } from "@rootward/content-schema";
import { difficultyKey, tierKey } from "./keys.ts";
import type { BonusId, EncounterRewards, EncounterState } from "./types.ts";

export interface RewardInput {
  /** The encounter as it stands after the winning Cast. */
  encounter: EncounterState;
  balance: Balance;
  critLootMultiplier: number;
  timing?: { playerMs: number; referenceMs: number };
}

/**
 * Bonuses, Commits, and Cycles for a won encounter (PROMPT.md section 7.4). Commits are the base for the challenge's
 * difficulty times the multiplier of every bonus earned. Elegance needs the Reviewer (M2) or a deterministic linter,
 * so it is never awarded yet.
 */
export function computeRewards({ encounter, balance, critLootMultiplier, timing }: RewardInput): EncounterRewards {
  const bonuses: BonusId[] = [];
  if (encounter.scoring.crit && encounter.casts === 1) bonuses.push("crit");
  if (!encounter.inspected && encounter.tests.some((test) => test.visibility === "hidden")) bonuses.push("true_sight");
  if (
    encounter.scoring.efficiency &&
    timing !== undefined &&
    timing.playerMs <= timing.referenceMs * balance.bonuses.efficiency_max_ratio_vs_reference
  ) {
    bonuses.push("efficiency");
  }
  if (encounter.hintsTaken === 0) bonuses.push("unaided");

  const base = balance.commits.base_by_difficulty[difficultyKey(encounter.difficulty)];
  const multiplier = bonuses.reduce((product, bonus) => product * balance.bonuses.commits_multiplier[bonus], 1);
  const cycleBase = balance.bonuses.cycles_by_tier[tierKey(encounter.enemy.tier)];
  const lootMultiplier = bonuses.includes("crit") ? critLootMultiplier : 1;
  return {
    bonuses,
    commits: Math.round(base * multiplier),
    cycles: Math.round(cycleBase * lootMultiplier),
  };
}
