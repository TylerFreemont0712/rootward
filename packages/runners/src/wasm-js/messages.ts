import { z } from "zod";
import { RunStatus, TestResult } from "../contract.ts";

// Messages a wasm-js worker sends back to the host. The host validates every message with these schemas: a worker
// runs untrusted code, so its messages are treated like any other external input.

export const CaseMessage = z.strictObject({
  type: z.literal("case"),
  result: TestResult,
});

export const DoneMessage = z.strictObject({
  type: z.literal("done"),
  status: RunStatus,
  stdout: z.string(),
  stderr: z.string(),
});

export const FatalMessage = z.strictObject({
  type: z.literal("fatal"),
  message: z.string(),
});

export const WorkerMessage = z.discriminatedUnion("type", [CaseMessage, DoneMessage, FatalMessage]);
export type WorkerMessage = z.infer<typeof WorkerMessage>;
