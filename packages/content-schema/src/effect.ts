import { z } from "zod";

// LEARN: an effect is data, not code: `{ type: revealHiddenTest, count: 1 }`. The engine maps each `type` to an
// implementation that owns its parameter schema, so abilities and artifacts compose existing primitives in YAML and
// only a genuinely new primitive needs TypeScript (ideas/solutions/plugin-architecture.md).
export const EFFECT_TYPE_PATTERN = /^[a-z][A-Za-z0-9]*$/;

export const Effect = z.looseObject({
  type: z.string().regex(EFFECT_TYPE_PATTERN, { error: "effect types are camelCase, e.g. revealHiddenTest" }),
});
export type Effect = z.infer<typeof Effect>;
