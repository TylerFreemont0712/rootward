import type { Balance } from "@rootward/content-schema";
import type { EncounterState } from "./types.ts";

/** Enemy HP is the total weight of tests that are not passing (PROMPT.md section 7.1). */
export function enemyHp(encounter: EncounterState): number {
  return encounter.tests.reduce((sum, test) => sum + (test.passing ? 0 : test.weight), 0);
}

export function enemyHpMax(encounter: EncounterState): number {
  return encounter.tests.reduce((sum, test) => sum + test.weight, 0);
}

/** What the enemy card shows. Some enemies lie: the Off-By-One Goblin always shows one more than it has. */
export function displayedEnemyHp(encounter: EncounterState): number {
  const hp = enemyHp(encounter);
  return hp === 0 ? 0 : hp + encounter.enemy.hpDisplayOffset;
}

/** Lint suggests Retreat after a number of Casts that did not win (section 7.2). */
export function retreatSuggested(encounter: EncounterState, balance: Balance): boolean {
  return encounter.status === "active" && encounter.casts >= balance.encounter.suggest_retreat_after_failed_casts;
}
