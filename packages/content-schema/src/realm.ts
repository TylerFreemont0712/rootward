import { z } from "zod";
import { Id, NonEmptyString, Tier } from "./primitives.ts";

export const Realm = z.strictObject({
  id: Id,
  name: NonEmptyString,
  tier_range: z.tuple([Tier, Tier]).refine(([min, max]) => min <= max, {
    error: "tier_range must be [min, max] with min <= max",
  }),
  flavor: NonEmptyString,
});
export type Realm = z.infer<typeof Realm>;

/** `realms.yaml`: the layers of the Machine. */
export const RealmsFile = z.strictObject({
  realms: z.array(Realm).min(1),
});
export type RealmsFile = z.infer<typeof RealmsFile>;
