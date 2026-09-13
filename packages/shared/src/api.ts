import { z } from "zod";

// The HTTP contract between client and server. Both sides parse with these schemas: the server before it answers
// (which also strips anything the schema does not list), the client when a response arrives. This file must stay
// browser-safe: zod only, no Node imports.

export const RUN_STATUSES = ["ok", "compile-error", "runtime-error", "timeout", "oom", "sandbox-error"] as const;
export const RunStatus = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatus>;

const MAX_FILE_BYTES = 200_000;
const MAX_FILES = 20;

/** Files the player submits: relative path -> contents. */
export const FileMap = z
  .record(z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9_\-./]+$/), z.string().max(MAX_FILE_BYTES))
  .refine((files) => Object.keys(files).length <= MAX_FILES, { error: `at most ${MAX_FILES} files` });
export type FileMap = z.infer<typeof FileMap>;

export const ChallengeSummary = z.strictObject({
  id: z.string(),
  title: z.string(),
  realm: z.string(),
  difficulty: z.number(),
  estimatedMinutes: z.number(),
  languages: z.array(z.string()),
  /** Languages that have a runner on this machine right now. */
  playableLanguages: z.array(z.string()),
  enemyName: z.string(),
});
export type ChallengeSummary = z.infer<typeof ChallengeSummary>;

export const ChallengeListResponse = z.strictObject({ challenges: z.array(ChallengeSummary) });
export type ChallengeListResponse = z.infer<typeof ChallengeListResponse>;

export const StartEncounterRequest = z.strictObject({
  challengeId: z.string().min(1),
  language: z.string().min(1),
  seed: z.string().min(1).max(100).optional(),
});
export type StartEncounterRequest = z.infer<typeof StartEncounterRequest>;

export const ActionRequest = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("probe"), files: FileMap }),
  z.strictObject({ type: z.literal("cast"), files: FileMap }),
  z.strictObject({ type: z.literal("hint") }),
  z.strictObject({ type: z.literal("retreat") }),
]);
export type ActionRequest = z.infer<typeof ActionRequest>;

export const TestView = z.strictObject({
  id: z.string(),
  /** Visible tests show their name. Hidden tests only ever show a category label such as "boundary #1". */
  label: z.string(),
  visibility: z.enum(["visible", "hidden"]),
  status: z.enum(["idle", "pass", "fail"]),
  revealed: z.boolean(),
  durationMs: z.number().optional(),
  runStatus: RunStatus.optional(),
  /** Visible tests only: the input, expected and actual output, and the failure message. */
  input: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  message: z.string().optional(),
});
export type TestView = z.infer<typeof TestView>;

export const EnemyActionView = z.strictObject({
  move: z.string(),
  damage: z.number().optional(),
  category: z.string().optional(),
  fallbackFrom: z.string().optional(),
  taunt: z.string().optional(),
});
export type EnemyActionView = z.infer<typeof EnemyActionView>;

export const LogEntry = z.strictObject({
  kind: z.enum(["probe", "cast", "enemy", "hint", "retreat", "won", "exhausted", "panic", "refused"]),
  text: z.string(),
});
export type LogEntry = z.infer<typeof LogEntry>;

export const EncounterView = z.strictObject({
  runId: z.string(),
  roomId: z.string(),
  status: z.enum(["active", "won", "retreated", "exhausted", "kernel-panic"]),
  challenge: z.strictObject({
    id: z.string(),
    title: z.string(),
    realm: z.string(),
    prompt: z.string(),
    intro: z.string(),
    difficulty: z.number(),
    estimatedMinutes: z.number(),
    concepts: z.array(z.string()),
    language: z.string(),
    languages: z.array(z.string()),
    entry: z.string(),
    maxLines: z.number().optional(),
    bannedTokens: z.array(z.string()),
    targetComplexity: z.string().optional(),
  }),
  enemy: z.strictObject({
    name: z.string(),
    tier: z.union([z.number(), z.string()]),
    art: z.string().optional(),
    intro: z.string(),
    defeat: z.string(),
    hp: z.number(),
    hpMax: z.number(),
    hpDisplayed: z.number(),
    lastAction: EnemyActionView.optional(),
  }),
  player: z.strictObject({
    className: z.string(),
    integrity: z.number(),
    integrityMax: z.number(),
    focus: z.number(),
    focusMax: z.number(),
    cycles: z.number(),
  }),
  starterFiles: FileMap,
  /** The most recently submitted files, so a resumed fight restores the editor. */
  editorFiles: FileMap,
  tests: z.array(TestView),
  hints: z.strictObject({
    total: z.number(),
    taken: z.array(z.strictObject({ level: z.number(), name: z.string(), text: z.string(), cost: z.number() })),
    nextCost: z.number().optional(),
  }),
  casts: z.number(),
  retreatSuggested: z.boolean(),
  lastRun: z
    .strictObject({
      kind: z.enum(["probe", "cast"]),
      status: RunStatus,
      console: z.string(),
      wallMs: z.number(),
    })
    .optional(),
  rewards: z.strictObject({ bonuses: z.array(z.string()), commits: z.number(), cycles: z.number() }).optional(),
  /** Present after a Retreat or when Focus ran out: the reference solution and its explanation. */
  retreat: z.strictObject({ solutionFiles: FileMap, explanation: z.string().optional() }).optional(),
  log: z.array(LogEntry),
});
export type EncounterView = z.infer<typeof EncounterView>;

export const ApiError = z.strictObject({ code: z.string(), message: z.string() });
export type ApiError = z.infer<typeof ApiError>;

export const EncounterResponse = z.strictObject({
  view: EncounterView,
  /** Set when the action was refused by the rules; the view is still current. */
  refused: ApiError.optional(),
});
export type EncounterResponse = z.infer<typeof EncounterResponse>;

export const ErrorResponse = z.strictObject({ error: ApiError });
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const HealthResponse = z.strictObject({
  ok: z.literal(true),
  engineVersion: z.string(),
  runners: z.array(z.strictObject({ id: z.string(), languages: z.array(z.string()), available: z.boolean() })),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
