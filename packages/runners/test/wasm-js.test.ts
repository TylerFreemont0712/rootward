import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type RunJob, WasmJsRunner } from "../src/index.ts";
import { emptyCase, ioJob } from "./helpers.ts";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const tallyWisp = path.join(repoRoot, "content/packs/core/challenges/foundry/tally-wisp");
const runner = new WasmJsRunner();
const run = (job: RunJob) => runner.run(job, new AbortController().signal);

describe("WasmJsRunner with io tests", () => {
  const cases = [
    { stdin: "The cat and the hat. The end!\n", expected: "the 3\nand 1\ncat 1\nend 1\nhat 1\n" },
    { stdin: "", expected: "" },
  ];

  it("passes the Tally Wisp reference solution", async () => {
    const source = readFileSync(path.join(tallyWisp, "solution/javascript/main.js"), "utf8");
    const result = await run(ioJob(source, cases));
    expect(result.status).toBe("ok");
    expect(result.tests?.map((t) => [t.passed, t.status])).toEqual([
      [true, "ok"],
      [true, "ok"],
    ]);
  });

  it("fails the Tally Wisp starter code with a pointer to the first wrong line", async () => {
    const source = readFileSync(path.join(tallyWisp, "starter/javascript/main.js"), "utf8");
    const result = await run(ioJob(source, cases));
    expect(result.tests?.[0]).toMatchObject({ passed: false, status: "ok" });
    expect(result.tests?.[0]?.message).toContain("line");
  });

  it("supports process.stdout.write and requiring the player's own files", async () => {
    const job = ioJob(
      'const { shout } = require("./lib/shout");\nprocess.stdout.write(shout(require("fs").readFileSync(0, "utf8")));',
      [{ stdin: "hi", expected: "HI!" }],
    );
    job.files["lib/shout.js"] = 'module.exports = { shout: (text) => text.toUpperCase() + "!" };';
    const result = await run(job);
    expect(result.tests?.[0]).toMatchObject({ passed: true, status: "ok" });
  });

  it("reports a syntax error as a compile error for every case without re-running", async () => {
    const result = await run(ioJob("function (", [emptyCase, emptyCase]));
    expect(result.status).toBe("compile-error");
    expect(result.tests?.map((t) => t.status)).toEqual(["compile-error", "compile-error"]);
    expect(result.tests?.[0]?.message).toContain("syntax error");
  });

  it("treats a non-zero process.exit as a runtime error", async () => {
    const result = await run(ioJob('console.log("partial"); process.exit(2);', [{ stdin: "", expected: "partial" }]));
    expect(result.tests?.[0]).toMatchObject({ passed: false, status: "runtime-error", message: "process.exit(2)" });
  });

  it("runs a script job and returns its output", async () => {
    const result = await run({
      language: "javascript",
      kind: "script",
      entry: "main.js",
      files: { "main.js": 'console.log("sum", [1, 2, 3].reduce((a, b) => a + b, 0));' },
      limits: { wallMs: 3000, memMb: 32, outputKb: 16 },
    });
    expect(result).toMatchObject({ status: "ok", stdout: "sum 6\n" });
    expect(result.tests).toBeUndefined();
  });
});
