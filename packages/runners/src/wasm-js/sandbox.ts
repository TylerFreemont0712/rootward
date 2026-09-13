import type { QuickJSContext, QuickJSHandle, QuickJSRuntime, QuickJSWASMModule } from "quickjs-emscripten-core";
import type { RunStatus } from "../contract.ts";
import { OutputBuffer } from "../output.ts";
import { PRELUDE } from "./prelude.ts";

export interface ProgramSpec {
  /** Every file of the job; the entry is one of them. */
  files: Readonly<Record<string, string>>;
  entry: string;
  stdin: string;
  cpuMs: number;
  memoryBytes: number;
  stackBytes: number;
  outputBytes: number;
}

export interface ProgramOutcome {
  status: RunStatus;
  stdout: string;
  stderr: string;
  /** Time spent running the player's code, excluding sandbox setup. */
  durationMs: number;
  /** Plain-language reason when status is not "ok". */
  message?: string;
  /**
   * True when QuickJS failed to clean up after the program. Its memory may be inconsistent, so the caller must create
   * a fresh WASM module before running anything else.
   */
  poisoned: boolean;
}

type Outcome = Omit<ProgramOutcome, "poisoned">;

interface Io {
  stdout: OutputBuffer;
  stderr: OutputBuffer;
  limits: { outputExceeded: boolean; deadline: number };
}

interface DumpedError {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  exitCode?: unknown;
}

/**
 * Run one JavaScript program in a fresh QuickJS runtime with memory, stack, CPU-time, and output limits.
 * Call this only inside a worker thread: exhausting the native stack can still crash the thread that calls QuickJS.
 */
export function executeProgram(quickjs: QuickJSWASMModule, spec: ProgramSpec): ProgramOutcome {
  const io: Io = {
    stdout: new OutputBuffer(spec.outputBytes),
    stderr: new OutputBuffer(spec.outputBytes),
    limits: { outputExceeded: false, deadline: Number.POSITIVE_INFINITY },
  };
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(spec.memoryBytes);
  runtime.setMaxStackSize(spec.stackBytes);
  // LEARN: QuickJS calls this handler periodically while bytecode runs. Returning true raises an uncatchable
  // "interrupted" error inside the VM, which stops an infinite loop without killing the thread.
  runtime.setInterruptHandler(() => io.limits.outputExceeded || performance.now() > io.limits.deadline);
  const vm = runtime.newContext();

  let outcome: Outcome;
  try {
    outcome = runEntry(vm, runtime, spec, io);
  } catch (error) {
    // Host-side failure (a bug in the prelude or the bindings), reported as a sandbox error rather than blamed on
    // the player's code.
    const message = error instanceof Error ? error.message : String(error);
    outcome = { status: "sandbox-error", stdout: io.stdout.toString(), stderr: io.stderr.toString(), durationMs: 0, message };
  }

  let poisoned = false;
  try {
    vm.dispose();
    runtime.dispose();
  } catch {
    // Reported through `poisoned`: the worker replaces the WASM module before the next program.
    poisoned = true;
  }
  return { ...outcome, poisoned };
}

function runEntry(vm: QuickJSContext, runtime: QuickJSRuntime, spec: ProgramSpec, io: Io): Outcome {
  const source = spec.files[spec.entry];
  if (source === undefined) {
    return { status: "sandbox-error", stdout: "", stderr: "", durationMs: 0, message: `missing entry ${spec.entry}` };
  }
  installPrelude(vm, spec, (fd, text) => {
    const buffer = fd === 2 ? io.stderr : io.stdout;
    if (!buffer.write(text)) io.limits.outputExceeded = true;
  });
  const started = performance.now();
  io.limits.deadline = started + spec.cpuMs;
  const error = evaluate(vm, source, spec.entry) ?? drainJobs(vm, runtime);
  return toOutcome(error, io, spec, source, performance.now() - started);
}

function installPrelude(vm: QuickJSContext, spec: ProgramSpec, write: (fd: number, text: string) => void): void {
  const preludeResult = vm.evalCode(PRELUDE, "rootward-prelude.js");
  if (preludeResult.error) throw new Error(`sandbox prelude failed: ${dumpAndDispose(vm, preludeResult.error)}`);

  const handles: QuickJSHandle[] = [preludeResult.value];
  try {
    const host = vm.newObject();
    handles.push(host);
    const writeFn = vm.newFunction("write", (fd, text) => {
      write(vm.getNumber(fd), vm.getString(text));
    });
    const readStdinFn = vm.newFunction("readStdin", () => vm.newString(spec.stdin));
    const readFileFn = vm.newFunction("readFile", (path) => {
      const contents = spec.files[vm.getString(path)];
      return contents === undefined ? vm.undefined : vm.newString(contents);
    });
    const entryPath = vm.newString(spec.entry);
    handles.push(writeFn, readStdinFn, readFileFn, entryPath);
    vm.setProp(host, "write", writeFn);
    vm.setProp(host, "readStdin", readStdinFn);
    vm.setProp(host, "readFile", readFileFn);

    const called = vm.callFunction(preludeResult.value, vm.undefined, host, entryPath);
    if (called.error) throw new Error(`sandbox prelude failed: ${dumpAndDispose(vm, called.error)}`);
    called.value.dispose();
  } finally {
    for (const handle of handles) handle.dispose();
  }
}

function dumpAndDispose(vm: QuickJSContext, handle: QuickJSHandle): string {
  const dumped: unknown = vm.dump(handle);
  handle.dispose();
  return JSON.stringify(dumped);
}

/** Evaluate the entry file as a script. Returns the thrown value, or undefined on success. */
function evaluate(vm: QuickJSContext, source: string, filename: string): DumpedError | undefined {
  const result = vm.evalCode(source, filename);
  if (result.error) {
    const dumped: unknown = vm.dump(result.error);
    result.error.dispose();
    return asDumpedError(dumped);
  }
  result.value.dispose();
  return undefined;
}

/** Run queued promise callbacks so async code finishes. Returns the first thrown value, if any. */
function drainJobs(vm: QuickJSContext, runtime: QuickJSRuntime): DumpedError | undefined {
  while (runtime.hasPendingJob()) {
    const result = runtime.executePendingJobs();
    if (result.error) {
      const dumped: unknown = vm.dump(result.error);
      result.error.dispose();
      return asDumpedError(dumped);
    }
  }
  return undefined;
}

function asDumpedError(value: unknown): DumpedError {
  return typeof value === "object" && value !== null ? value : { name: "Uncaught", message: String(value) };
}

function toOutcome(error: DumpedError | undefined, io: Io, spec: ProgramSpec, source: string, durationMs: number): Outcome {
  const stdout = io.stdout.toString();
  if (!error) return { status: "ok", stdout, stderr: io.stderr.toString(), durationMs };

  const name = typeof error.name === "string" ? error.name : "Error";
  const message = typeof error.message === "string" ? error.message : String(error.message);
  const stack = typeof error.stack === "string" ? error.stack : "";
  const report = (status: RunStatus, reason: string): Outcome => ({
    status,
    stdout,
    stderr: `${io.stderr.toString()}${name}: ${message}\n${stack}`,
    durationMs,
    message: reason,
  });

  if (name === "RootwardExit") {
    const code = typeof error.exitCode === "number" ? error.exitCode : 0;
    if (code === 0) return { status: "ok", stdout, stderr: io.stderr.toString(), durationMs };
    return { status: "runtime-error", stdout, stderr: io.stderr.toString(), durationMs, message: `process.exit(${code})` };
  }
  if (name === "InternalError" && message === "interrupted") {
    return io.limits.outputExceeded
      ? report("runtime-error", `output limit exceeded (${Math.round(spec.outputBytes / 1024)} KB)`)
      : report("timeout", `took longer than ${spec.cpuMs} ms`);
  }
  if (name === "InternalError" && message === "out of memory") {
    return report("oom", `used more than ${Math.round(spec.memoryBytes / (1024 * 1024))} MB of memory`);
  }
  if (name === "InternalError" && message === "stack overflow") {
    return report("runtime-error", "stack overflow: the recursion went too deep (is a base case missing?)");
  }
  if (name === "SyntaxError") {
    const esm = /^\s*(import|export)\s/m.test(source) ? " ES module syntax is not supported yet; use require()." : "";
    return report("compile-error", `syntax error: ${message}.${esm}`);
  }
  return report("runtime-error", `${name}: ${message}`);
}
