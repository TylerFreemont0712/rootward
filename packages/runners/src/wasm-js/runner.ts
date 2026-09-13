import { Worker } from "node:worker_threads";
import type { RunJob, RunKind, Runner, RunResult, RunStatus, TestResult } from "../contract.ts";
import { OutputBuffer } from "../output.ts";
import { WORKER_HEAP_MB, WORKER_STACK_MB, WORKER_STARTUP_GRACE_MS } from "./constants.ts";
import { WorkerMessage } from "./messages.ts";

const WORKER_URL = new URL("./worker.ts", import.meta.url);

/**
 * Runs JavaScript in QuickJS compiled to WebAssembly, one worker thread per job (PROMPT.md section 12.2, tier 1).
 * Isolation comes from three layers: QuickJS has no I/O except what the prelude exposes; QuickJS enforces memory,
 * stack, and CPU-time limits; and the host terminates the worker when the wall-clock limit passes.
 */
export class WasmJsRunner implements Runner {
  readonly id = "wasm-js";
  readonly languages: readonly string[] = ["javascript"];
  readonly kinds: readonly RunKind[] = ["tests", "script"];
  readonly tier = "wasm";

  isAvailable(): Promise<boolean> {
    // The WASM build ships inside the npm package, so there is nothing to detect.
    return Promise.resolve(true);
  }

  run(job: RunJob, signal: AbortSignal): Promise<RunResult> {
    return new Promise((resolve) => {
      const started = performance.now();
      const tests: TestResult[] = [];
      // Output the worker itself prints (for example a WebAssembly abort) helps explain sandbox errors.
      const workerLog = new OutputBuffer(16 * 1024);
      let settled = false;

      const worker = new Worker(WORKER_URL, {
        workerData: job,
        resourceLimits: { stackSizeMb: WORKER_STACK_MB, maxOldGenerationSizeMb: WORKER_HEAP_MB },
        stdout: true,
        stderr: true,
      });
      worker.stdout.on("data", (chunk: Buffer) => workerLog.write(chunk.toString("utf8")));
      worker.stderr.on("data", (chunk: Buffer) => workerLog.write(chunk.toString("utf8")));

      const finish = (status: RunStatus, stdout: string, stderr: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        void worker.terminate();
        const result: RunResult = { status, stdout, stderr, metrics: { wallMs: performance.now() - started } };
        if (job.testSpec) result.tests = tests;
        resolve(result);
      };
      const onAbort = (): void => {
        finish("sandbox-error", "", "the run was cancelled");
      };
      const timer = setTimeout(() => {
        finish("timeout", "", `the run took longer than ${job.limits.wallMs} ms and was stopped`);
      }, job.limits.wallMs + WORKER_STARTUP_GRACE_MS);

      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });

      worker.on("message", (raw: unknown) => {
        const parsed = WorkerMessage.safeParse(raw);
        if (!parsed.success) {
          finish("sandbox-error", "", `the sandbox sent an invalid message: ${parsed.error.message}`);
          return;
        }
        const message = parsed.data;
        if (message.type === "case") tests.push(message.result);
        else if (message.type === "done") finish(message.status, message.stdout, message.stderr);
        else finish("sandbox-error", "", `the sandbox failed: ${message.message}`);
      });
      worker.on("error", (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        finish("sandbox-error", "", `the sandbox worker crashed: ${reason}\n${workerLog.toString()}`);
      });
      worker.on("exit", (code) => {
        finish("sandbox-error", "", `the sandbox worker exited (code ${code}) before finishing\n${workerLog.toString()}`);
      });
    });
  }
}
