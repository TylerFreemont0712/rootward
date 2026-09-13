import { z } from "zod";
import { Id, NonEmptyString } from "./primitives.ts";

export const CardKind = z.enum(["qa", "code-reading", "one-liner"]);
export type CardKind = z.infer<typeof CardKind>;

/** One spaced-repetition review card. Its global id is `<node>#<id>`. */
export const ReviewCard = z.strictObject({
  id: Id,
  q: NonEmptyString,
  a: NonEmptyString,
  kind: CardKind.default("qa"),
});
export type ReviewCard = z.infer<typeof ReviewCard>;

/** `cards/*.yaml`: review cards for one skill node. */
export const CardsFile = z.strictObject({
  node: Id,
  cards: z.array(ReviewCard).min(1),
});
export type CardsFile = z.infer<typeof CardsFile>;
