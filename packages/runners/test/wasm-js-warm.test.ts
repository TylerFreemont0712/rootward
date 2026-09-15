import { afterAll, describe, expect, it } from "vitest";
import { WasmJsRunner } from "../src/index.ts";
import type { RunJob } from "../src/index.ts";

// A warm runner starts each job's worker ahead of time (ADR-0013). Every job must still get a worker of its own.

const limits = { wallMs: 5000, cpuMs: 2000, memMb: 64, pids: 16, outputKb: 64 };

function job(source: string, stdin = ""): RunJob {
  return {
    language: "javascript",
    kind: "tests",
    entry: "main.js",
    files: { "main.js": source },
    limits,
    testSpec: {
      form: "io",
      normalize: { trailingWhitespace: true, newlines: true },
      cases: [{ id: "c1", name: "c1", stdin, expectedStdout: "ok" }],
    },
  };
}

const runner = new WasmJsRunner({ warm: true });
afterAll(async () => {
  await runner.dispose();
});

describe("a warm WasmJsRunner", () => {
  it("runs jobs back to back, each in a fresh worker", async () => {
    runner.prewarm();
    const leak = job('globalThis.leaked = (globalThis.leaked ?? 0) + 1; console.log(globalThis.leaked === 1 ? "ok" : "shared");');
    for (let i = 0; i < 3; i++) {
      const result = await runner.run(leak, AbortSignal.timeout(10_000));
      expect(result.tests?.[0]).toMatchObject({ passed: true, actual: "ok" });
    }
  });

  it("still reads stdin and enforces limits in a worker started before its job", async () => {
    const echo = await runner.run(job('console.log(require("fs").readFileSync(0, "utf8").trim());', "ok"), AbortSignal.timeout(10_000));
    expect(echo.tests?.[0]).toMatchObject({ passed: true });
    const loop = await runner.run(job("while (true) {}"), AbortSignal.timeout(10_000));
    expect(loop.tests?.[0]?.status).toBe("timeout");
  });
});
