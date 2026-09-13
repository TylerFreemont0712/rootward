import { z } from "zod";
import { NonEmptyString } from "./primitives.ts";

/** Nudge, concept reminder, plan, partial solution (ideas/pedagogy/hint-design.md). */
export const HINT_LEVELS = 4;
export const HINT_LEVEL_NAMES = ["nudge", "concept", "plan", "partial"] as const;

export const HintLadder = z.array(NonEmptyString).length(HINT_LEVELS, {
  error: `hints.md must have exactly ${HINT_LEVELS} levels separated by lines containing only ---`,
});
export type HintLadder = z.infer<typeof HintLadder>;

// LEARN: hints.md stays plain markdown so authors can write freely. The ladder is split on lines that contain only
// `---`; empty levels are kept (not filtered) so validation can point at the empty one.
const SEPARATOR = /^---[ \t]*$/m;

export function splitHintLadder(markdown: string): string[] {
  return markdown.split(SEPARATOR).map((level) => level.trim());
}
