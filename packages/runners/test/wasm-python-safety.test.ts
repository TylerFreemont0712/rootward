import { afterAll, describe, expect, it } from "vitest";
import { type RunJob, WasmPythonRunner } from "../src/index.ts";
import { PYTHON_TIMEOUT, pyJob } from "./python-helpers.ts";

// The malicious-code suite for the wasm-python tier (ADR-0005). Pyodide on Node is not a sandbox by itself (for
// example os.system really runs a shell); these tests prove the permission-restricted process holds.
const runner = new WasmPythonRunner({ warm: true, startupAllowanceMs: 3000 });
const run = (job: RunJob) => runner.run(job, new AbortController().signal);
const ok = { stdin: "fine", expected: "ok" };

afterAll(async () => {
  await runner.dispose();
});

describe("wasm-python sandbox safety", () => {
  it("times out an infinite loop and still runs the next case", PYTHON_TIMEOUT, async () => {
    const source = "import sys\nif sys.stdin.read() == 'loop':\n    while True:\n        pass\nprint('ok')";
    const result = await run(pyJob(source, [{ stdin: "loop", expected: "ok" }, ok], { cpuMs: 1000 }));
    expect(result.tests?.map((t) => t.status)).toEqual(["timeout", "ok"]);
    expect(result.tests?.[1]?.passed).toBe(true);
  });

  it("blocks os.system, which would otherwise run a real shell, and recovers", PYTHON_TIMEOUT, async () => {
    const source = "import os, sys\nif sys.stdin.read() == 'escape':\n    os.system('echo pwned')\nprint('ok')";
    const result = await run(pyJob(source, [{ stdin: "escape", expected: "ok" }, ok]));
    expect(result.tests?.[0]).toMatchObject({ passed: false, status: "runtime-error" });
    expect(result.tests?.[0]?.message).toContain("blocked by the sandbox");
    expect(result.tests?.[1]).toMatchObject({ passed: true, status: "ok" });
  });

  it("gives Python no JavaScript bridge, host files, processes, or network", PYTHON_TIMEOUT, async () => {
    const source = [
      "def attempt(label, action):",
      "    try:",
      "        action()",
      "        print(label, 'ALLOWED')",
      "    except BaseException as error:",
      "        print(label, 'blocked')",
      "def run_js_escape():",
      "    from pyodide.code import run_js",
      "    run_js('1')",
      "def js_process():",
      "    import js",
      "    js.process.exit",
      "def read_host_file():",
      "    open('/etc/passwd').read()",
      "def spawn():",
      "    import subprocess",
      "    subprocess.run(['id'])",
      "def connect():",
      "    import socket",
      "    socket.create_connection(('127.0.0.1', 80), timeout=1)",
      "attempt('run_js', run_js_escape)",
      "attempt('js.process', js_process)",
      "attempt('host file', read_host_file)",
      "attempt('subprocess', spawn)",
      "attempt('socket', connect)",
    ].join("\n");
    const expected = "run_js blocked\njs.process blocked\nhost file blocked\nsubprocess blocked\nsocket blocked";
    const result = await run(pyJob(source, [{ stdin: "", expected }]));
    expect(result.tests?.[0]).toMatchObject({ passed: true, actual: expected });
  });

  it("stops a runaway printer at the output limit", PYTHON_TIMEOUT, async () => {
    const result = await run(pyJob("while True:\n    print('spam spam spam')", [{ stdin: "", expected: "" }], { outputKb: 8 }));
    expect(result.tests?.[0]).toMatchObject({ status: "runtime-error", message: "output limit exceeded" });
    expect(result.tests?.[0]?.actual?.length).toBeLessThanOrEqual(8 * 1024);
  });

  it("turns runaway recursion into a runtime error", PYTHON_TIMEOUT, async () => {
    const result = await run(pyJob("def f(n):\n    return f(n + 1)\nf(0)", [{ stdin: "", expected: "" }]));
    expect(result.tests?.[0]?.status).toBe("runtime-error");
    expect(result.tests?.[0]?.message).toContain("RecursionError");
  });

  it.skipIf(process.platform !== "linux")("kills a memory balloon at the memory limit", PYTHON_TIMEOUT, async () => {
    const source = "chunks = []\nwhile True:\n    chunks.append(bytearray(4 * 1024 * 1024))";
    const result = await run(pyJob(source, [{ stdin: "", expected: "" }], { memMb: 64, cpuMs: 20_000, wallMs: 20_000 }));
    expect(result.tests?.[0]?.status).toBe("oom");
  });

  it("stops the whole job at the wall-clock limit", PYTHON_TIMEOUT, async () => {
    const loops = Array.from({ length: 3 }, () => ({ stdin: "", expected: "" }));
    const result = await run(pyJob("while True:\n    pass", loops, { wallMs: 1000, cpuMs: 1500 }));
    expect(result.status).toBe("timeout");
    expect(result.tests?.every((t) => !t.passed)).toBe(true);
  });

  it("stops when the caller cancels", PYTHON_TIMEOUT, async () => {
    const controller = new AbortController();
    const pending = runner.run(pyJob("while True:\n    pass", [{ stdin: "", expected: "" }], { cpuMs: 20_000 }), controller.signal);
    setTimeout(() => {
      controller.abort();
    }, 300);
    const result = await pending;
    expect(result.status).toBe("sandbox-error");
    expect(result.metrics.wallMs).toBeLessThan(10_000);
  });
});
