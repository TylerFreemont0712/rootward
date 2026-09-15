import { parentPort, workerData } from "node:worker_threads";
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { RunJob, type TestResult } from "../contract.ts";
import { compareOutput } from "../io/compare.ts";
import { QUICKJS_STACK_BYTES } from "./constants.ts";
import type { WorkerMessage } from "./messages.ts";
import { executeProgram } from "./sandbox.ts";

// Entry point of a wasm-js worker thread. One worker runs one job, then the host terminates it, so nothing a program
// does can outlive its job. A job arrives either as workerData or, for a warm worker started ahead of time, as the
// first message; a warm worker loads QuickJS while it waits.

function post(message: WorkerMessage): void {
  if (!parentPort) throw new Error("the wasm-js worker must run inside a worker thread");
  parentPort.postMessage(message);
}

function loadQuickJS(): Promise<QuickJSWASMModule> {
  // LEARN: the variant package's type declarations describe CommonJS while Node loads its ES module build, so a
  // static default import means different things to TypeScript and to Node. Passing the dynamic `import()` promise is
  // the pattern the library documents; it unwraps `default` itself, which is correct for both.
  return newQuickJSWASMModuleFromVariant(import("@jitl/quickjs-wasmfile-release-sync"));
}

function receiveJob(): Promise<unknown> {
  if (workerData !== null && workerData !== undefined) return Promise.resolve(workerData);
  return new Promise((resolve, reject) => {
    if (!parentPort) {
      reject(new Error("the wasm-js worker must run inside a worker thread"));
      return;
    }
    parentPort.once("message", resolve);
  });
}

async function main(): Promise<void> {
  // LEARN: both start at once. A warm worker spends its idle time loading QuickJS, so a job that arrives later can run
  // immediately; a cold worker loses nothing, since its job is already there.
  const [raw, loaded] = await Promise.all([receiveJob(), loadQuickJS()]);
  const job = RunJob.parse(raw);
  if (job.entry === undefined) throw new Error("wasm-js jobs need an entry file");
  let quickjs = loaded;
  const base = {
    files: job.files,
    entry: job.entry,
    cpuMs: job.limits.cpuMs ?? job.limits.wallMs,
    memoryBytes: job.limits.memMb * 1024 * 1024,
    stackBytes: QUICKJS_STACK_BYTES,
    outputBytes: job.limits.outputKb * 1024,
  };

  const spec = job.testSpec;
  if (!spec) {
    const outcome = executeProgram(quickjs, { ...base, stdin: job.stdin ?? "" });
    post({ type: "done", status: outcome.status, stdout: outcome.stdout, stderr: outcome.stderr });
    return;
  }

  let compileError: string | undefined;
  for (const testCase of spec.cases) {
    if (compileError !== undefined) {
      // The same source fails to parse for every case, so skip running it again.
      const result: TestResult = {
        id: testCase.id,
        name: testCase.name,
        passed: false,
        status: "compile-error",
        message: compileError,
        durationMs: 0,
      };
      post({ type: "case", result });
      continue;
    }

    const outcome = executeProgram(quickjs, { ...base, stdin: testCase.stdin });
    if (outcome.poisoned) quickjs = await loadQuickJS();
    const comparison = compareOutput(outcome.stdout, testCase.expectedStdout, spec.normalize);
    const result: TestResult = {
      id: testCase.id,
      name: testCase.name,
      passed: outcome.status === "ok" && comparison.passed,
      status: outcome.status,
      expected: comparison.expected,
      actual: comparison.actual,
      durationMs: outcome.durationMs,
    };
    if (outcome.stderr !== "") result.stderr = outcome.stderr;
    if (outcome.message !== undefined) {
      result.message = outcome.message;
    } else if (comparison.firstDifferentLine !== undefined) {
      result.message = `output differs starting at line ${comparison.firstDifferentLine}`;
    }
    post({ type: "case", result });
    if (outcome.status === "compile-error") compileError = outcome.message ?? "syntax error";
  }
  post({ type: "done", status: compileError === undefined ? "ok" : "compile-error", stdout: "", stderr: "" });
}

main().catch((error: unknown) => {
  post({ type: "fatal", message: error instanceof Error ? (error.stack ?? error.message) : String(error) });
});
