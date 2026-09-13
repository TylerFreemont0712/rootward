import type { EnemyTier } from "@rootward/content-schema";

// balance.yaml keys its tables by strings ("1", "boss"). These helpers turn engine values into those keys with the
// exact literal types, so a lookup such as `cycles_by_tier[tierKey(tier)]` typechecks without casts.

const DIFFICULTY_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
const MASTERY_KEYS = ["0", "1", "2", "3", "4", "5"] as const;

export function difficultyKey(difficulty: number): (typeof DIFFICULTY_KEYS)[number] {
  return pick(DIFFICULTY_KEYS, Math.round(difficulty) - 1, `difficulty ${difficulty}`);
}

export function masteryKey(mastery: number): (typeof MASTERY_KEYS)[number] {
  return pick(MASTERY_KEYS, Math.round(mastery), `mastery ${mastery}`);
}

export function tierKey(tier: EnemyTier): "1" | "2" | "3" | "elite" | "boss" | "special" {
  if (tier === 1) return "1";
  if (tier === 2) return "2";
  if (tier === 3) return "3";
  return tier;
}

function pick<T>(keys: readonly T[], index: number, label: string): T {
  const key = keys[Math.min(keys.length - 1, Math.max(0, index))];
  if (key === undefined) throw new Error(`no balance key for ${label}`);
  return key;
}
