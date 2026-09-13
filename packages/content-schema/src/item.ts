import { z } from "zod";
import { Effect } from "./effect.ts";
import { Id, NonEmptyString } from "./primitives.ts";

export const Rarity = z.enum(["common", "uncommon", "rare", "legendary"]);
export type Rarity = z.infer<typeof Rarity>;

/** `items/<id>.yaml`: an Artifact (PROMPT.md Appendix B). */
export const Item = z.strictObject({
  id: Id,
  name: NonEmptyString,
  rarity: Rarity,
  description: NonEmptyString,
  effects: z.array(Effect).default([]),
  /** Survives a Kernel Panic. */
  persistent: z.boolean().default(false),
  consumable: z.boolean().default(false),
  /** False until the engine implements every effect; the UI shows unimplemented items as "coming soon". */
  implemented: z.boolean().default(false),
  flavor: z.string().optional(),
});
export type Item = z.infer<typeof Item>;
