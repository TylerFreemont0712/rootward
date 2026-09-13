// The sandbox process of the wasm-python runner (ADR-0005). process.ts starts it with Node's permission model, so it
// may read only the Pyodide package and this folder, and may not write files, open network connections, start
// processes or workers, or turn strings into code. It runs one job and is then killed.
//
// Runtime imports are limited to Node built-ins and Pyodide (loaded by URL): anything else would need read access to
// more of the disk. For the same reason job messages are checked by hand here instead of with zod; the parent, which
// is not sandboxed, validates everything this process sends with zod.
import { readFileSync } from "node:fs";
import type { PythonJobMessage, PythonMessage } from "./protocol.ts";

type CaseTuple = [status: string, stdout: string, stderr: string, message: string | undefined, durationMs: number];

interface PyProxyLike {
  destroy: () => void;
}

interface PyTuple extends PyProxyLike {
  toJs: () => CaseTuple;
}

/** The small part of Pyodide's API this host uses, typed here so nothing untyped flows into the code below. */
interface SandboxedPyodide {
  runPython: (code: string, options: { filename: string }) => unknown;
  setStdout: (options: { batched: (output: string) => void }) => void;
  setStderr: (options: { batched: (output: string) => void }) => void;
  toPy: (value: unknown) => PyProxyLike;
  globals: { get: (name: string) => unknown };
}

type LoadPyodide = (options: { jsglobals: object }) => Promise<SandboxedPyodide>;
type RunCase = (files: PyProxyLike, entry: string, stdin: string, outputChars: number) => PyTuple;

function hasLoadPyodide(value: unknown): value is { loadPyodide: LoadPyodide } {
  return typeof value === "object" && value !== null && "loadPyodide" in value && typeof value.loadPyodide === "function";
}

function isRunCase(value: unknown): value is RunCase {
  return typeof value === "function";
}

function send(message: PythonMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.send) {
      reject(new Error("the wasm-python host must be started with an IPC channel"));
      return;
    }
    process.send(message, (error: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function isJobMessage(value: unknown): value is PythonJobMessage {
  if (typeof value !== "object" || value === null) return false;
  const job = value as Partial<PythonJobMessage>;
  return (
    job.type === "job" &&
    typeof job.entry === "string" &&
    typeof job.outputChars === "number" &&
    typeof job.files === "object" &&
    Array.isArray(job.cases) &&
    job.cases.every((c) => typeof c.id === "string" && typeof c.stdin === "string")
  );
}

// LEARN: Emscripten's Node filesystem asks the deprecated process.binding("constants") for file flags while starting
// up, and the permission model forbids process.binding outright. Answering only that one question lets Pyodide start
// without handing back anything else.
const fsConstants = process.getBuiltinModule("node:fs").constants;
Object.defineProperty(process, "binding", {
  configurable: true,
  value: (name: string) => {
    if (name === "constants") return { fs: fsConstants };
    throw new Error(`process.binding("${name}") is not available in the sandbox`);
  },
});

// If the runner goes away, so does the sandbox: no orphaned interpreters.
process.on("disconnect", () => process.exit(0));

const pyodideUrl = process.env.ROOTWARD_PYODIDE_URL;
if (pyodideUrl === undefined) throw new Error("ROOTWARD_PYODIDE_URL is not set");

const started = performance.now();
const pyodideModule: unknown = await import(pyodideUrl);
if (!hasLoadPyodide(pyodideModule)) throw new Error("the pyodide package does not export loadPyodide");
// An empty object as `js` means Python code sees no Node globals, and pyodide.code.run_js (which needs js.eval) fails.
const pyodide = await pyodideModule.loadPyodide({ jsglobals: {} });
// Output written straight to file descriptors 1 and 2 bypasses the harness's capture; drop it rather than leak it.
pyodide.setStdout({ batched: () => undefined });
pyodide.setStderr({ batched: () => undefined });
// The permission model does not cover signalling other processes, so remove that ability outright.
Object.defineProperty(process, "kill", {
  configurable: false,
  writable: false,
  value: () => {
    throw new Error("process.kill is not available in the sandbox");
  },
});

pyodide.runPython(readFileSync(new URL("./harness.py", import.meta.url), "utf8"), { filename: "<rootward-harness>" });
const runCase = pyodide.globals.get("run_case");
if (!isRunCase(runCase)) throw new Error("harness.py did not define run_case");
await send({ type: "ready", loadMs: performance.now() - started, rssMb: process.memoryUsage().rss / (1024 * 1024) });

process.on("message", (message: unknown) => {
  if (!isJobMessage(message)) {
    process.exit(2);
  }
  runJob(runCase, message).then(
    () => process.exit(0),
    () => process.exit(1),
  );
});

async function runJob(run: RunCase, job: PythonJobMessage): Promise<void> {
  const files = pyodide.toPy(job.files);
  try {
    for (const testCase of job.cases) {
      await send({ type: "case-start", id: testCase.id });
      let outcome: CaseTuple;
      try {
        const tuple = run(files, job.entry, testCase.stdin, job.outputChars);
        outcome = tuple.toJs();
        tuple.destroy();
      } catch (error) {
        // Anything thrown out of run_case means Pyodide itself failed, for example because the permission model
        // denied an operation. The interpreter cannot be trusted after that, so report it and stop.
        await send({ type: "fatal", id: testCase.id, message: error instanceof Error ? error.message : String(error) });
        return;
      }
      const [status, stdout, stderr, message, durationMs] = outcome;
      // The parent validates `status` with zod; this cast only describes what harness.py returns.
      const done = { type: "case-done", id: testCase.id, status, stdout, stderr, durationMs } as PythonMessage;
      await send(message === undefined ? done : ({ ...done, message } as PythonMessage));
    }
  } finally {
    files.destroy();
  }
}
