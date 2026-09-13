import { type ChildProcess, fork } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OutputBuffer } from "../output.ts";
import { type PythonJobMessage, PythonMessage } from "./protocol.ts";

const HOST_FILE = fileURLToPath(new URL("./host.mts", import.meta.url));
const HOST_DIR = path.dirname(HOST_FILE);
const STARTUP_TIMEOUT_MS = 30_000;

export interface ReadyInfo {
  loadMs: number;
  rssMb: number;
}

/** The folder of the installed Pyodide package (a real path, not a symlink), or undefined when it is not installed. */
export function pyodideDir(): string | undefined {
  try {
    return path.dirname(createRequire(import.meta.url).resolve("pyodide"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "MODULE_NOT_FOUND") return undefined;
    throw error;
  }
}

/**
 * Node flags for the sandbox process (ADR-0005). With `--permission`, everything not explicitly allowed is denied:
 * reads outside Pyodide and the host folder, all writes, network, child processes, workers, native addons, WASI.
 */
export function sandboxFlags(pyodideFolder: string): string[] {
  return [
    "--permission",
    `--allow-fs-read=${pyodideFolder}`,
    `--allow-fs-read=${HOST_DIR}`,
    "--disallow-code-generation-from-strings",
  ];
}

/** One sandbox process: it loads Pyodide, runs one job, and is killed. */
export class PythonProcess {
  readonly ready: Promise<ReadyInfo>;
  private readonly child: ChildProcess | undefined;
  private readonly log = new OutputBuffer(16 * 1024);
  private onMessageListener: ((message: PythonMessage) => void) | undefined;
  private onExitListener: ((reason: string) => void) | undefined;
  private exited = false;

  constructor() {
    const { promise, resolve, reject } = Promise.withResolvers<ReadyInfo>();
    this.ready = promise;
    // Callers await `ready`. This handler only keeps an unused spare's failure from becoming an unhandled rejection.
    promise.catch(() => undefined);

    const folder = pyodideDir();
    if (folder === undefined) {
      this.child = undefined;
      this.exited = true;
      reject(new Error("the pyodide package is not installed"));
      return;
    }

    const child = fork(HOST_FILE, [], {
      execArgv: sandboxFlags(folder),
      // An empty environment: nothing from the server (such as API keys) reaches the sandbox.
      env: { ROOTWARD_PYODIDE_URL: pathToFileURL(path.join(folder, "pyodide.mjs")).href },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      serialization: "json",
    });
    this.child = child;
    child.stdout?.on("data", (chunk: Buffer) => this.log.write(chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => this.log.write(chunk.toString("utf8")));

    const startupTimer = setTimeout(() => {
      reject(new Error(`Pyodide did not load within ${STARTUP_TIMEOUT_MS} ms`));
      this.close();
    }, STARTUP_TIMEOUT_MS);

    child.on("message", (raw: unknown) => {
      const parsed = PythonMessage.safeParse(raw);
      if (!parsed.success) {
        reject(new Error("the sandbox sent an invalid message"));
        this.onExitListener?.("the sandbox sent an invalid message");
        this.close();
        return;
      }
      if (parsed.data.type === "ready") {
        clearTimeout(startupTimer);
        resolve({ loadMs: parsed.data.loadMs, rssMb: parsed.data.rssMb });
        return;
      }
      this.onMessageListener?.(parsed.data);
    });
    child.on("exit", (code, signal) => {
      this.exited = true;
      clearTimeout(startupTimer);
      const reason = `exit code ${code ?? "none"}, signal ${signal ?? "none"}`;
      reject(new Error(`the sandbox exited before it was ready (${reason}): ${this.log.toString().slice(-800)}`));
      this.onExitListener?.(reason);
    });
    child.on("error", (error) => {
      reject(error);
      this.onExitListener?.(error.message);
    });
  }

  onMessage(listener: (message: PythonMessage) => void): void {
    this.onMessageListener = listener;
  }

  onExit(listener: (reason: string) => void): void {
    this.onExitListener = listener;
  }

  send(job: PythonJobMessage): void {
    this.child?.send(job);
  }

  /**
   * Resident memory of the sandbox process in MB, read from /proc on Linux. Best effort: undefined elsewhere or if
   * the process is gone; the CPU and wall-clock limits still apply.
   */
  rssMb(): number | undefined {
    const pid = this.child?.pid;
    if (process.platform !== "linux" || pid === undefined || this.exited) return undefined;
    let status: string;
    try {
      status = readFileSync(`/proc/${pid}/status`, "utf8");
    } catch {
      // The process can exit between the check above and this read.
      return undefined;
    }
    const match = /VmRSS:\s+(\d+)\s+kB/.exec(status);
    return match?.[1] === undefined ? undefined : Number(match[1]) / 1024;
  }

  /** Stop the process and forget listeners. Safe to call more than once. */
  close(): void {
    this.onMessageListener = undefined;
    this.onExitListener = undefined;
    if (this.child && !this.exited) this.child.kill("SIGKILL");
  }
}
