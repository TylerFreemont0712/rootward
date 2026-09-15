import type {
  IoTestCaseSpec,
  IoTestSpec,
  RunJob,
  RunKind,
  Runner,
  RunResult,
  RunStatus,
  TestResult,
} from "../contract.ts";
import { compareOutput } from "../io/compare.ts";
import { pyodideDir, PythonProcess } from "./process.ts";
import type { PythonCaseDone } from "./protocol.ts";

/** Extra time for a sandbox process to load Pyodide on top of the job's wall-clock limit. */
const DEFAULT_STARTUP_ALLOWANCE_MS = 5000;
/** Slack between a case's CPU budget and the moment the process is killed. */
const CASE_GRACE_MS = 250;
const MEMORY_POLL_MS = 100;
const MAX_STARTUP_ATTEMPTS = 2;

export interface WasmPythonRunnerOptions {
  /** Keep sandbox processes loaded and waiting, so a Probe does not pay Pyodide's start-up (about 1.5 s). */
  warm?: boolean;
  /**
   * How many loaded processes to keep waiting (default 1). Every job still gets a fresh process of its own; more spares
   * only mean that jobs arriving in quick succession (a Shardrun cast, then the next previews) never wait for one to load.
   */
  spares?: number;
  startupAllowanceMs?: number;
}

interface Stop {
  status: RunStatus;
  message: string;
}

interface BatchOutcome {
  results: TestResult[];
  stop?: Stop;
}

/**
 * Runs Python io tests in Pyodide inside a separate, permission-restricted Node process (ADR-0005). Expected outputs
 * never enter the sandbox: it returns what the program printed and this class compares. A case that times out, runs
 * out of memory, or crashes the interpreter costs that process; the remaining cases continue in a fresh one.
 */
export class WasmPythonRunner implements Runner {
  readonly id = "wasm-python";
  readonly languages: readonly string[] = ["python"];
  readonly kinds: readonly RunKind[] = ["tests"];
  readonly tier = "wasm";
  private readonly warm: boolean;
  private readonly spareCount: number;
  private readonly startupAllowanceMs: number;
  private readonly live = new Set<PythonProcess>();
  /** Loaded processes waiting for a job, oldest first. */
  private readonly spares: PythonProcess[] = [];
  private disposed = false;

  constructor(options: WasmPythonRunnerOptions = {}) {
    this.warm = options.warm ?? true;
    this.spareCount = Math.max(1, options.spares ?? 1);
    this.startupAllowanceMs = options.startupAllowanceMs ?? DEFAULT_STARTUP_ALLOWANCE_MS;
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(pyodideDir() !== undefined);
  }

  /** Start the spare processes now instead of on the first job. */
  prewarm(): void {
    if (!this.warm || this.disposed) return;
    while (this.spares.length < this.spareCount) this.spares.push(new PythonProcess());
  }

  dispose(): Promise<void> {
    this.disposed = true;
    for (const spare of this.spares.splice(0)) spare.close();
    for (const sandbox of this.live) sandbox.close();
    this.live.clear();
    return Promise.resolve();
  }

  async run(job: RunJob, signal: AbortSignal): Promise<RunResult> {
    const started = performance.now();
    const spec = job.testSpec;
    const entry = job.entry;
    if (!spec || entry === undefined) {
      return { status: "sandbox-error", stdout: "", stderr: "wasm-python runs io test jobs with an entry file", metrics: { wallMs: 0 } };
    }

    const deadline = started + job.limits.wallMs + this.startupAllowanceMs;
    const results: TestResult[] = [];
    let stop: Stop | undefined;
    let startupFailures = 0;
    while (results.length < spec.cases.length && !stop) {
      const remaining = spec.cases.slice(results.length);
      const batch = await this.runBatch(this.acquire(), job, entry, spec, remaining, deadline, signal);
      results.push(...batch.results);
      if (batch.stop) {
        const failedToStart = batch.results.length === 0 && batch.stop.status === "sandbox-error" && !signal.aborted;
        startupFailures += failedToStart ? 1 : 0;
        if (!failedToStart || startupFailures >= MAX_STARTUP_ATTEMPTS) stop = batch.stop;
      }
    }
    if (stop) {
      for (const rest of spec.cases.slice(results.length)) results.push(failure(rest, stop.status, stop.message));
    }
    const compileError = results.some((r) => r.status === "compile-error");
    return {
      status: stop?.status ?? (compileError ? "compile-error" : "ok"),
      stdout: "",
      stderr: stop?.message ?? "",
      tests: results,
      metrics: { wallMs: performance.now() - started },
    };
  }

  private acquire(): PythonProcess {
    // LEARN: the oldest spare has had the longest to load, so it is the most likely to be ready right now.
    const sandbox = this.spares.shift() ?? new PythonProcess();
    this.live.add(sandbox);
    this.prewarm();
    return sandbox;
  }

  /** Run cases in one process until they are all done or something ends the process. */
  private runBatch(
    sandbox: PythonProcess,
    job: RunJob,
    entry: string,
    spec: IoTestSpec,
    cases: readonly IoTestCaseSpec[],
    deadline: number,
    signal: AbortSignal,
  ): Promise<BatchOutcome> {
    return new Promise((resolve) => {
      const results: TestResult[] = [];
      const cpuMs = job.limits.cpuMs ?? job.limits.wallMs;
      let baselineRssMb = 0;
      let current: IoTestCaseSpec | undefined;
      let caseTimer: NodeJS.Timeout | undefined;
      let memoryTimer: NodeJS.Timeout | undefined;
      let settled = false;

      const stopWatching = () => {
        clearTimeout(caseTimer);
        clearInterval(memoryTimer);
      };
      const finish = (stop?: Stop) => {
        if (settled) return;
        settled = true;
        stopWatching();
        clearTimeout(wallTimer);
        signal.removeEventListener("abort", onAbort);
        sandbox.close();
        this.live.delete(sandbox);
        resolve(stop ? { results, stop } : { results });
      };
      const failCurrent = (status: RunStatus, message: string) => {
        if (current) results.push(failure(current, status, message));
        current = undefined;
      };

      const wallMessage = `the run took longer than ${job.limits.wallMs} ms and was stopped`;
      const wallTimer = setTimeout(
        () => {
          failCurrent("timeout", wallMessage);
          finish({ status: "timeout", message: wallMessage });
        },
        Math.max(0, deadline - performance.now()),
      );
      const onAbort = () => {
        failCurrent("sandbox-error", "the run was cancelled");
        finish({ status: "sandbox-error", message: "the run was cancelled" });
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });

      sandbox.onExit((reason) => {
        if (current) {
          failCurrent("runtime-error", "the Python sandbox stopped unexpectedly");
          finish();
        } else {
          finish({ status: "sandbox-error", message: `the Python sandbox stopped (${reason})` });
        }
      });

      sandbox.onMessage((message) => {
        if (message.type === "case-start") {
          const expected = cases[results.length];
          if (expected?.id !== message.id) {
            finish({ status: "sandbox-error", message: "the Python sandbox ran cases out of order" });
            return;
          }
          current = expected;
          caseTimer = setTimeout(() => {
            failCurrent("timeout", `took longer than ${cpuMs} ms`);
            finish();
          }, cpuMs + CASE_GRACE_MS);
          memoryTimer = setInterval(() => {
            const rss = sandbox.rssMb();
            if (rss !== undefined && rss - baselineRssMb > job.limits.memMb) {
              failCurrent("oom", `used more than ${job.limits.memMb} MB of memory`);
              finish();
            }
          }, MEMORY_POLL_MS);
        } else if (message.type === "case-done") {
          stopWatching();
          if (current?.id !== message.id) {
            finish({ status: "sandbox-error", message: "the Python sandbox reported an unexpected result" });
            return;
          }
          results.push(toTestResult(current, message, spec));
          current = undefined;
          if (message.status === "compile-error") {
            // The same source fails to compile for every case, so do not run it again.
            const reason = message.message ?? "syntax error";
            for (const rest of cases.slice(results.length)) results.push(failure(rest, "compile-error", reason));
          }
          if (results.length === cases.length) finish();
        } else if (message.type === "fatal") {
          stopWatching();
          failCurrent("runtime-error", describeFatal(message.message));
          finish();
        }
      });

      sandbox.ready.then(
        (ready) => {
          if (settled) return;
          baselineRssMb = ready.rssMb;
          sandbox.send({
            type: "job",
            files: job.files,
            entry,
            cases: cases.map((c) => ({ id: c.id, stdin: c.stdin })),
            outputChars: job.limits.outputKb * 1024,
          });
        },
        (error: unknown) => {
          finish({ status: "sandbox-error", message: `the Python sandbox failed to start: ${String(error)}` });
        },
      );
    });
  }
}

function toTestResult(testCase: IoTestCaseSpec, done: PythonCaseDone, spec: IoTestSpec): TestResult {
  const comparison = compareOutput(done.stdout, testCase.expectedStdout, spec.normalize);
  const result: TestResult = {
    id: testCase.id,
    name: testCase.name,
    passed: done.status === "ok" && comparison.passed,
    status: done.status,
    expected: comparison.expected,
    actual: comparison.actual,
    durationMs: done.durationMs,
  };
  if (done.stderr !== "") result.stderr = done.stderr;
  if (done.message !== undefined) result.message = done.message;
  else if (comparison.firstDifferentLine !== undefined) {
    result.message = `output differs starting at line ${comparison.firstDifferentLine}`;
  }
  return result;
}

function failure(testCase: IoTestCaseSpec, status: RunStatus, message: string): TestResult {
  return { id: testCase.id, name: testCase.name, passed: false, status, message, durationMs: 0 };
}

/** Turn a permission-model denial into a message a player can act on. */
function describeFatal(raw: string): string {
  if (raw.includes("--allow-child-process")) return "blocked by the sandbox: programs cannot start other processes";
  if (raw.includes("--allow-fs")) return "blocked by the sandbox: that file is outside your program's files";
  if (raw.includes("--allow-net")) return "blocked by the sandbox: there is no network";
  return `the Python runtime stopped: ${raw.split("\n")[0] ?? raw}`;
}
