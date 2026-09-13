import type { RunJob, RunLimits } from "../src/index.ts";
import type { CaseInput } from "./helpers.ts";

/** A Python io job whose entry is `main.py`, with numbered cases. */
export function pyJob(source: string, cases: CaseInput[], limits: Partial<RunLimits> = {}): RunJob {
  return {
    language: "python",
    kind: "tests",
    entry: "main.py",
    files: { "main.py": source },
    limits: { wallMs: 10_000, cpuMs: 3000, memMb: 128, outputKb: 64, ...limits },
    testSpec: {
      form: "io",
      normalize: { trailingWhitespace: true, newlines: true },
      cases: cases.map((c, index) => ({
        id: `t${index + 1}`,
        name: `case ${index + 1}`,
        stdin: c.stdin,
        expectedStdout: c.expected,
      })),
    },
  };
}

/** Pyodide takes a second or two to load per sandbox process. */
export const PYTHON_TIMEOUT = { timeout: 60_000 };
