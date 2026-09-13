import { z } from "zod";
import { Id, NonEmptyString, Tag } from "./primitives.ts";

export const IoNormalize = z.strictObject({
  /** Ignore whitespace at the end of each line and blank lines at the end of the output. */
  trailing_whitespace: z.boolean().default(true),
  /** Treat \r\n and \n as the same line break. */
  newlines: z.boolean().default(true),
});
export type IoNormalize = z.infer<typeof IoNormalize>;

/** Builds large stdin without storing it in the file: `repeat` concatenated `times` times. */
export const IoGenerator = z.strictObject({
  repeat: z.string().min(1),
  times: z.int().positive().max(1_000_000),
});
export type IoGenerator = z.infer<typeof IoGenerator>;

export const IoCase = z
  .strictObject({
    id: Id,
    name: NonEmptyString,
    /** Hidden tests are shown to the player only by category ("boundary #2"). */
    category: Tag.optional(),
    stdin: z.string().optional(),
    generator: IoGenerator.optional(),
    expected_stdout: z.string(),
    /** Held back for the Edge Case enemy move: not part of the fight until an enemy reveals it. Hidden file only. */
    reserve: z.boolean().default(false),
  })
  .refine((c) => (c.stdin === undefined) !== (c.generator === undefined), {
    error: "give exactly one of `stdin` or `generator`",
  });
export type IoCase = z.infer<typeof IoCase>;

/** `tests/io.yaml` (visible) and `hidden/io.yaml` (backend-only). */
export const IoTestFile = z.strictObject({
  form: z.literal("io"),
  normalize: IoNormalize.prefault({}),
  cases: z.array(IoCase).min(1),
});
export type IoTestFile = z.infer<typeof IoTestFile>;

/** Resolve a case's stdin, expanding a generator if present. */
export function resolveStdin(c: IoCase): string {
  if (c.generator) return c.generator.repeat.repeat(c.generator.times);
  return c.stdin ?? "";
}
