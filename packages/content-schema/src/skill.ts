import { z } from "zod";
import { Id, NonEmptyString, Tag, Tier } from "./primitives.ts";

/** One concept in the skill graph (PROMPT.md section 9.1). */
export const SkillNode = z.strictObject({
  id: Id,
  name: NonEmptyString,
  realm: Id,
  tier: Tier,
  prerequisites: z.array(Id).default([]),
  summary: NonEmptyString,
  /** Challenge tags that count as evidence for this node. */
  evidence_tags: z.array(Tag).min(1),
  /** How many review cards the pack ships for this node. */
  review_cards: z.int().min(0).optional(),
  /** Optional shared, language-agnostic node; mastery there is the max over its language nodes. */
  transfers_to: Id.optional(),
});
export type SkillNode = z.infer<typeof SkillNode>;

/** `skills/*.yaml`: a list of nodes; all files from all packs merge into one graph. */
export const SkillsFile = z.strictObject({
  nodes: z.array(SkillNode).min(1),
});
export type SkillsFile = z.infer<typeof SkillsFile>;
