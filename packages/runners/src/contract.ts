import { z } from "zod";

// The runner contract from PROMPT.md section 12.1. These are zod schemas, not just interfaces, because results cross
// real boundaries (a worker thread today, a container tomorrow) and are validated when they arrive.
// Runtime contracts use camelCase; content files use snake_case (ADR-0002).

export const RUN_KINDS = ["tests", "script", "terminal-check"] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export const RunStatus = z.enum(["ok", "compile-error", "runtime-error", "timeout", "oom", "sandbox-error"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const RunLimits = z.strictObject({
  /** Hard wall-clock limit for the whole job; the sandbox is killed when it passes. */
  wallMs: z.int().positive(),
  /** Per-execution CPU budget (for io tests: per case). */
  cpuMs: z.int().positive().optional(),
  memMb: z.int().positive(),
  pids: z.int().positive().optional(),
  outputKb: z.int().positive(),
});
export type RunLimits = z.infer<typeof RunLimits>;

export const IoTestCaseSpec = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  stdin: z.string(),
  expectedStdout: z.string(),
});
export type IoTestCaseSpec = z.infer<typeof IoTestCaseSpec>;

export const IoTestSpec = z.strictObject({
  form: z.literal("io"),
  cases: z.array(IoTestCaseSpec),
  normalize: z.strictObject({ trailingWhitespace: z.boolean(), newlines: z.boolean() }),
});
export type IoTestSpec = z.infer<typeof IoTestSpec>;

/** Test forms a runner can execute. `unit` and `check` join this union when their harnesses exist. */
export const TestSpec = z.discriminatedUnion("form", [IoTestSpec]);
export type TestSpec = z.infer<typeof TestSpec>;

export const RunJob = z.strictObject({
  language: z.string().min(1),
  kind: z.enum(RUN_KINDS),
  /** Relative path -> contents. Runners never receive host paths (PROMPT.md section 12.5). */
  files: z.record(z.string(), z.string()),
  entry: z.string().optional(),
  stdin: z.string().optional(),
  limits: RunLimits,
  testSpec: TestSpec.optional(),
});
export type RunJob = z.infer<typeof RunJob>;

export const TestResult = z.strictObject({
  id: z.string(),
  name: z.string(),
  passed: z.boolean(),
  /** How this test's own execution ended; "ok" means it ran to completion (and may still have failed). */
  status: RunStatus,
  expected: z.string().optional(),
  actual: z.string().optional(),
  stderr: z.string().optional(),
  message: z.string().optional(),
  durationMs: z.number().min(0),
});
export type TestResult = z.infer<typeof TestResult>;

export const RunResult = z.strictObject({
  status: RunStatus,
  stdout: z.string(),
  stderr: z.string(),
  tests: z.array(TestResult).optional(),
  metrics: z.strictObject({
    wallMs: z.number().min(0),
    peakMemMb: z.number().min(0).optional(),
  }),
});
export type RunResult = z.infer<typeof RunResult>;

export type RunnerTier = "wasm" | "container" | "process";

export interface Runner {
  readonly id: string;
  readonly languages: readonly string[];
  readonly kinds: readonly RunKind[];
  readonly tier: RunnerTier;
  isAvailable(): Promise<boolean>;
  run(job: RunJob, signal: AbortSignal): Promise<RunResult>;
}
