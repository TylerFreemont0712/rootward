import type { RunJob, RunLimits } from "../src/index.ts";

export const defaultLimits: RunLimits = { wallMs: 5000, cpuMs: 2000, memMb: 64, outputKb: 64 };

export interface CaseInput {
  stdin: string;
  expected: string;
}

/** Build a JavaScript io job with one file (`main.js`) and numbered cases. */
export function ioJob(source: string, cases: CaseInput[], limits: Partial<RunLimits> = {}): RunJob {
  return {
    language: "javascript",
    kind: "tests",
    entry: "main.js",
    files: { "main.js": source },
    limits: { ...defaultLimits, ...limits },
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

export const emptyCase: CaseInput = { stdin: "", expected: "" };
