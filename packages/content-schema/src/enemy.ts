import { z } from "zod";
import { Id, NonEmptyString } from "./primitives.ts";

export const EnemyTier = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal("elite"),
  z.literal("boss"),
  z.literal("special"),
]);
export type EnemyTier = z.infer<typeof EnemyTier>;

/** A weighted reference to a move in the engine's move registry. `params` are validated by that move. */
export const EnemyMoveRef = z.strictObject({
  move: Id,
  weight: z.number().positive(),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type EnemyMoveRef = z.infer<typeof EnemyMoveRef>;

/** `enemies/<id>.yaml`: an enemy template (PROMPT.md Appendix A). */
export const Enemy = z.strictObject({
  id: Id,
  name: NonEmptyString,
  tier: EnemyTier,
  realm_affinity: z.array(Id).min(1),
  /** Strike damage per failing test; falls back to `enemy_moves.strike_atk_by_tier` in balance.yaml. */
  base_atk: z.int().min(0).optional(),
  /** Display-only joke: the HP shown is the real HP plus this offset while the enemy is alive. */
  hp_display_offset: z.int().default(0),
  moves: z.array(EnemyMoveRef).min(1),
  loot_table: Id,
  flavor: z.strictObject({
    intro: NonEmptyString,
    taunt: z.array(NonEmptyString).default([]),
    defeat: NonEmptyString,
  }),
  /** Optional ASCII art for the enemy card. */
  art: z.string().optional(),
});
export type Enemy = z.infer<typeof Enemy>;
