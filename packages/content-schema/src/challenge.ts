import { z } from "zod";
import { Language } from "./languages.ts";
import { Id, NonEmptyString, RelativePath, Tag, Tier } from "./primitives.ts";

export const ChallengeKind = z.enum(["code", "terminal", "sql", "tests", "fix", "readcode", "parsons", "predict", "design"]);
export type ChallengeKind = z.infer<typeof ChallengeKind>;

export const TestForm = z.enum(["io", "unit", "check"]);
export type TestForm = z.infer<typeof TestForm>;

/** Where Forge-generated content came from (PROMPT.md section 11.3). */
export const Provenance = z.strictObject({
  model: NonEmptyString,
  provider: NonEmptyString,
  prompt_hash: NonEmptyString,
  validated_at: NonEmptyString,
  validator_version: NonEmptyString,
  review: z.unknown().optional(),
});
export type Provenance = z.infer<typeof Provenance>;

/** `challenges/<realm>/<id>/challenge.yaml` (PROMPT.md section 13.2). */
export const ChallengeManifest = z
  .strictObject({
    id: Id,
    title: NonEmptyString,
    /** Bump when tests or the prompt change materially; attempts record the version. */
    version: z.int().positive(),
    realm: Id,
    kind: ChallengeKind,
    concepts: z.array(Id).min(1),
    tags: z.array(Tag).default([]),
    /** 1-10; drives the Elo-style challenge rating. */
    difficulty: z.int().min(1).max(10),
    tier: Tier,
    languages: z.array(Language).min(1),
    estimated_minutes: z.number().positive(),
    enemy: z.strictObject({
      template: Id,
      hp_override: z.int().positive().nullable().default(null),
    }),
    constraints: z
      .strictObject({
        /** Counts non-blank, non-comment lines. */
        max_lines: z.int().positive().optional(),
        banned_tokens: z.array(NonEmptyString).default([]),
      })
      .prefault({}),
    targets: z
      .strictObject({
        time_ms: z.number().positive().optional(),
        complexity: NonEmptyString.optional(),
      })
      .prefault({}),
    retreatable: z.boolean(),
    scoring: z
      .strictObject({
        crit: z.boolean().default(true),
        efficiency: z.boolean().default(true),
        elegance: z.boolean().default(true),
      })
      .prefault({}),
    tests: z.strictObject({
      form: TestForm,
      /** Must match the number of cases in tests/ (drift is a validation error). */
      visible: z.int().min(0),
      /** Must match the number of non-reserve cases in hidden/. */
      hidden: z.int().min(0),
      /** Entry file per language, relative to starter/<language>/ (io form). */
      entry: z.partialRecord(Language, RelativePath).default({}),
    }),
    flavor: z.strictObject({
      intro: NonEmptyString,
      defeat: NonEmptyString,
    }),
    author: NonEmptyString,
    generated: Provenance.nullable().default(null),
    deprecated: z.boolean().default(false),
    replaced_by: Id.optional(),
  })
  .superRefine((challenge, ctx) => {
    if (new Set(challenge.languages).size !== challenge.languages.length) {
      ctx.addIssue({ code: "custom", path: ["languages"], message: "languages must not repeat" });
    }
    if (challenge.tests.form === "io") {
      for (const language of challenge.languages) {
        if (challenge.tests.entry[language] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["tests", "entry", language],
            message: `io tests need an entry file for ${language}`,
          });
        }
      }
    }
  });
export type ChallengeManifest = z.infer<typeof ChallengeManifest>;
