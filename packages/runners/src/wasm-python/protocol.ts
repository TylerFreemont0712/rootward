import { z } from "zod";
import { RunStatus } from "../contract.ts";

// Messages between the wasm-python runner (parent) and its sandbox process (host.mts). The parent validates every
// message from the child with these schemas: the child runs untrusted code, so its messages are external input.

/** Parent -> child. Expected outputs are deliberately absent: the sandbox never sees them; the parent compares. */
export interface PythonJobMessage {
  type: "job";
  files: Record<string, string>;
  entry: string;
  cases: { id: string; stdin: string }[];
  outputChars: number;
}

export const PythonReady = z.strictObject({
  type: z.literal("ready"),
  loadMs: z.number().min(0),
  rssMb: z.number().min(0),
});

export const PythonCaseStart = z.strictObject({
  type: z.literal("case-start"),
  id: z.string(),
});

export const PythonCaseDone = z.strictObject({
  type: z.literal("case-done"),
  id: z.string(),
  status: RunStatus,
  stdout: z.string(),
  stderr: z.string(),
  message: z.string().optional(),
  durationMs: z.number().min(0),
});

/** Pyodide stopped working (for example after the permission model denied an operation). The process exits. */
export const PythonFatal = z.strictObject({
  type: z.literal("fatal"),
  id: z.string().optional(),
  message: z.string(),
});

export const PythonMessage = z.discriminatedUnion("type", [PythonReady, PythonCaseStart, PythonCaseDone, PythonFatal]);
export type PythonMessage = z.infer<typeof PythonMessage>;
export type PythonCaseDone = z.infer<typeof PythonCaseDone>;
