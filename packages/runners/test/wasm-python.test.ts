import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { type RunJob, WasmPythonRunner } from "../src/index.ts";
import { PYTHON_TIMEOUT, pyJob } from "./python-helpers.ts";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const tallyWisp = path.join(repoRoot, "content/packs/core/challenges/foundry/tally-wisp");
const runner = new WasmPythonRunner({ warm: true });
const run = (job: RunJob) => runner.run(job, new AbortController().signal);

afterAll(async () => {
  await runner.dispose();
});

describe("WasmPythonRunner with io tests", () => {
  const cases = [
    { stdin: "The cat and the hat. The end!\n", expected: "the 3\nand 1\ncat 1\nend 1\nhat 1\n" },
    { stdin: "", expected: "" },
  ];

  it("passes the Tally Wisp reference solution", PYTHON_TIMEOUT, async () => {
    const source = readFileSync(path.join(tallyWisp, "solution/python/main.py"), "utf8");
    const result = await run(pyJob(source, cases));
    expect(result.status).toBe("ok");
    expect(result.tests?.map((t) => [t.passed, t.status])).toEqual([
      [true, "ok"],
      [true, "ok"],
    ]);
  });

  it("fails the Tally Wisp starter with a pointer to the first wrong line", PYTHON_TIMEOUT, async () => {
    const source = readFileSync(path.join(tallyWisp, "starter/python/main.py"), "utf8");
    const result = await run(pyJob(source, cases));
    expect(result.tests?.[0]).toMatchObject({ passed: false, status: "ok" });
    expect(result.tests?.[0]?.message).toContain("line");
  });

  it("supports input() and importing the player's own modules", PYTHON_TIMEOUT, async () => {
    const job = pyJob("from helper import shout\nprint(shout(input()))", [{ stdin: "hello\n", expected: "HELLO!" }]);
    job.files["helper.py"] = "def shout(text):\n    return text.upper() + '!'\n";
    const result = await run(job);
    expect(result.tests?.[0]).toMatchObject({ passed: true, status: "ok" });
  });

  it("reports a syntax error once as a compile error for every case", PYTHON_TIMEOUT, async () => {
    const result = await run(pyJob("def broken(:\n    pass\n", [{ stdin: "", expected: "" }, { stdin: "", expected: "" }]));
    expect(result.status).toBe("compile-error");
    expect(result.tests?.map((t) => t.status)).toEqual(["compile-error", "compile-error"]);
    expect(result.tests?.[0]?.message).toContain("syntax error");
  });

  it("shows a traceback from the player's code on a runtime error", PYTHON_TIMEOUT, async () => {
    const result = await run(pyJob("def lookup(d):\n    return d['missing']\n\nlookup({})\n", [{ stdin: "", expected: "" }]));
    const test = result.tests?.[0];
    expect(test).toMatchObject({ passed: false, status: "runtime-error", message: "KeyError: 'missing'" });
    expect(test?.stderr).toContain('File "main.py", line 2, in lookup');
    expect(test?.stderr).not.toContain("rootward-harness");
  });

  it("treats a non-zero sys.exit as a runtime error", PYTHON_TIMEOUT, async () => {
    const result = await run(pyJob("import sys\nprint('partial')\nsys.exit(2)", [{ stdin: "", expected: "partial" }]));
    expect(result.tests?.[0]).toMatchObject({ passed: false, status: "runtime-error", message: "exited with code 2" });
  });

  it("resets builtins and modules between cases", PYTHON_TIMEOUT, async () => {
    const source = "import builtins, sys\nprint(hasattr(builtins, 'leak'), 'leaky' in sys.modules)\nbuiltins.leak = 1\nsys.modules['leaky'] = sys\n";
    const result = await run(pyJob(source, [{ stdin: "", expected: "False False" }, { stdin: "", expected: "False False" }]));
    expect(result.tests?.map((t) => t.passed)).toEqual([true, true]);
  });
});
