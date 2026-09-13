import { z } from "zod";
import { Language } from "./languages.ts";
import { Id, NonEmptyString, Tag } from "./primitives.ts";

/** A learning goal: weights over realms and tags that steer the planner (PROMPT.md section 9.5). */
export const Oath = z.strictObject({
  id: Id,
  name: NonEmptyString,
  description: NonEmptyString,
  weights: z.strictObject({
    realms: z.record(Id, z.number().min(0)).default({}),
    tags: z.record(Tag, z.number().min(0)).default({}),
  }),
  target_language: Language.optional(),
});
export type Oath = z.infer<typeof Oath>;

/** `oaths.yaml`. Custom Oaths are created at runtime and stored in the profile, not in packs. */
export const OathsFile = z.strictObject({
  oaths: z.array(Oath).min(1),
});
export type OathsFile = z.infer<typeof OathsFile>;
