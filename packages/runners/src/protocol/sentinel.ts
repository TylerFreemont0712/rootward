import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { TestResult } from "../contract.ts";

// The sentinel protocol (ideas/solutions/test-harness-per-language.md). A harness running inside a sandbox reports
// each test by printing one line: `__ROOTWARD_<nonce>__ {"id":"t1","name":"...","passed":true,"ms":1.2}` and ends
// with `__ROOTWARD_END_<nonce>__ {"total":7,"passed":5,"ms":42}`.
// LEARN: the nonce is random per run and is injected only into the harness, so player code that prints a fake
// result line cannot know the prefix, and its line is treated as ordinary program output.

export function createNonce(): string {
  return randomBytes(12).toString("hex");
}

export function resultPrefix(nonce: string): string {
  return `__ROOTWARD_${nonce}__ `;
}

export function endPrefix(nonce: string): string {
  return `__ROOTWARD_END_${nonce}__ `;
}

const SentinelResult = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  passed: z.boolean(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  message: z.string().optional(),
  ms: z.number().min(0),
});

const SentinelEnd = z.strictObject({
  total: z.int().min(0),
  passed: z.int().min(0),
  ms: z.number().min(0),
});

export interface ParsedHarnessOutput {
  tests: TestResult[];
  /** Every line that was not a sentinel line: the program's own output. */
  programOutput: string;
  /** True when the end line arrived. False means the harness crashed or was killed partway. */
  completed: boolean;
  /** Prefixed lines that did not parse, or repeated test ids. These indicate a harness bug. */
  malformed: string[];
}

export function parseHarnessOutput(stdout: string, nonce: string): ParsedHarnessOutput {
  const resultTag = resultPrefix(nonce);
  const endTag = endPrefix(nonce);
  const tests: TestResult[] = [];
  const seen = new Set<string>();
  const program: string[] = [];
  const malformed: string[] = [];
  let completed = false;

  for (const line of stdout.split("\n")) {
    if (line.startsWith(resultTag)) {
      const parsed = parseJsonLine(line.slice(resultTag.length), SentinelResult);
      if (!parsed || seen.has(parsed.id)) {
        malformed.push(line);
        continue;
      }
      seen.add(parsed.id);
      // The summary line is never trusted over individual results; each test stands on its own line.
      const result: TestResult = {
        id: parsed.id,
        name: parsed.name,
        passed: parsed.passed,
        status: "ok",
        durationMs: parsed.ms,
      };
      if (parsed.expected !== undefined) result.expected = parsed.expected;
      if (parsed.actual !== undefined) result.actual = parsed.actual;
      if (parsed.message !== undefined) result.message = parsed.message;
      tests.push(result);
    } else if (line.startsWith(endTag)) {
      if (parseJsonLine(line.slice(endTag.length), SentinelEnd)) completed = true;
      else malformed.push(line);
    } else {
      program.push(line);
    }
  }
  return { tests, programOutput: program.join("\n"), completed, malformed };
}

function parseJsonLine<T extends z.ZodType>(text: string, schema: T): z.output<T> | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Not JSON: the caller records the whole line as malformed, so nothing is lost.
    return undefined;
  }
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}
