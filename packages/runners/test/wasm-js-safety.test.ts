import { describe, expect, it } from "vitest";
import { type RunJob, WasmJsRunner } from "../src/index.ts";
import { emptyCase, ioJob } from "./helpers.ts";

// The malicious-code suite for the wasm-js tier (ideas/solutions/sandboxing.md, PROMPT.md section 12.5). Every case
// must end with the right status while the test process itself stays alive.
const runner = new WasmJsRunner();
const run = (job: RunJob) => runner.run(job, new AbortController().signal);

describe("wasm-js sandbox safety", () => {
  it("stops an infinite loop at the CPU limit", async () => {
    const result = await run(ioJob("while (true) {}", [emptyCase], { cpuMs: 200 }));
    expect(result.tests?.[0]).toMatchObject({ passed: false, status: "timeout" });
  });

  it("stops a memory balloon at the memory limit", async () => {
    const result = await run(ioJob("const a = []; for (;;) a.push({ n: a.length });", [emptyCase], { memMb: 16 }));
    expect(result.tests?.[0]?.status).toBe("oom");
  });

  it("turns runaway recursion into a runtime error instead of crashing the thread", async () => {
    const result = await run(ioJob("function f(n) { return f(n + 1) + 1; }\nf(0);", [emptyCase]));
    expect(result.tests?.[0]).toMatchObject({ status: "runtime-error" });
    expect(result.tests?.[0]?.message).toContain("stack overflow");
  });

  it("still allows reasonably deep recursion", async () => {
    const source = "function depth(n) { return n === 0 ? 0 : 1 + depth(n - 1); }\nconsole.log(depth(5000));";
    const result = await run(ioJob(source, [{ stdin: "", expected: "5000" }]));
    expect(result.tests?.[0]).toMatchObject({ passed: true, status: "ok" });
  });

  it("truncates a runaway printer and stops it", async () => {
    const result = await run(ioJob('for (;;) console.log("spam spam spam");', [emptyCase], { outputKb: 16 }));
    expect(result.tests?.[0]?.status).toBe("runtime-error");
    expect(result.tests?.[0]?.message).toContain("output limit");
    expect(result.tests?.[0]?.actual?.length).toBeLessThan(20 * 1024);
  });

  it("has no child processes, network modules, network globals, or host files", async () => {
    const source = [
      'for (const name of ["child_process", "net", "http", "node:fs/promises"]) {',
      '  try { require(name); console.log("loaded " + name); } catch { console.log("blocked " + name); }',
      "}",
      'try { require("fs").readFileSync("/etc/passwd"); console.log("read passwd"); } catch { console.log("blocked file"); }',
      "console.log(typeof fetch, typeof XMLHttpRequest, typeof WebSocket);",
    ].join("\n");
    const expected = [
      "blocked child_process",
      "blocked net",
      "blocked http",
      "blocked node:fs/promises",
      "blocked file",
      "undefined undefined undefined",
    ].join("\n");
    const result = await run(ioJob(source, [{ stdin: "", expected }]));
    expect(result.tests?.[0]).toMatchObject({ passed: true, actual: expected });
  });

  it("cannot require files outside the job with ../ paths", async () => {
    const result = await run(ioJob('require("../../../../etc/passwd");', [emptyCase]));
    expect(result.tests?.[0]).toMatchObject({ status: "runtime-error" });
    expect(result.tests?.[0]?.message).toContain("Cannot find module");
  });

  it("kills the whole job when the wall-clock limit passes", async () => {
    const cases = Array.from({ length: 5 }, () => emptyCase);
    const result = await run(ioJob("while (true) {}", cases, { wallMs: 300, cpuMs: 1000 }));
    expect(result.status).toBe("timeout");
    expect(result.tests?.length ?? 0).toBeLessThan(5);
  });

  it("stops when the caller cancels", async () => {
    const controller = new AbortController();
    const pending = runner.run(ioJob("while (true) {}", [emptyCase], { cpuMs: 4000 }), controller.signal);
    setTimeout(() => {
      controller.abort();
    }, 100);
    const result = await pending;
    expect(result.status).toBe("sandbox-error");
    expect(result.metrics.wallMs).toBeLessThan(3000);
  });
});
