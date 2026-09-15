import type { Bolt, Shard, ShardBattle } from "@rootward/content-schema";
import type { RunJob, RunLimits, RunResult } from "@rootward/runners";
import { z } from "zod";

// The Shardrun pipeline harness (ADR-0012). A spell's shards are real functions; this builds one program that loads
// each shard in its own namespace, feeds the bolts through them in slot order, and prints what came out. It runs as an
// ordinary io job, one case per input, so the same sandboxes and limits that grade challenges also contain shards: an
// infinite loop in a shard is a timeout, not a hung server.

export const SHARDRUN_LANGUAGES = ["python", "javascript"] as const;
export type ShardrunLanguage = (typeof SHARDRUN_LANGUAGES)[number];

export function isShardrunLanguage(language: string): language is ShardrunLanguage {
  return (SHARDRUN_LANGUAGES as readonly string[]).includes(language);
}

export interface PipelineInput {
  bolts: readonly Bolt[];
  battle: ShardBattle;
  /** A shard's output is cut to this many bolts before the next shard sees it. */
  limit: number;
}

/** Marks the harness's result line, so whatever a shard prints itself cannot be mistaken for it. */
const MARKER = "@@shardrun@@";

const TraceStep = z.strictObject({ shard: z.string(), given: z.int().min(0), returned: z.int().min(0) });
export type TraceStep = z.infer<typeof TraceStep>;
const HarnessOutput = z.strictObject({ bolts: z.array(z.unknown()), trace: z.array(TraceStep) });

export type PipelineRun =
  | { ok: true; bolts: unknown[]; trace: TraceStep[]; work: number; console: string }
  | { ok: false; reason: string; console: string };

/** The name a shard's function has in `language`: snake_case in Python, camelCase in JavaScript. */
export function shardFunctionName(shard: Shard, language: ShardrunLanguage): string {
  return language === "python" ? shard.function : shard.function.replace(/_([a-z0-9])/g, (_, next: string) => next.toUpperCase());
}

/**
 * A job that runs `shards` in order once per input. Undefined when a shard has no code in `language`.
 * LEARN: the shard list is embedded as a JSON string inside a JSON string. A JSON string literal is also a valid Python
 * and JavaScript string literal, so `json.loads("...")` and `JSON.parse("...")` read it back with no escaping bugs.
 */
export function pipelineJob(
  language: ShardrunLanguage,
  shards: readonly Shard[],
  inputs: readonly PipelineInput[],
  limits: RunLimits,
): RunJob | undefined {
  const embedded: { id: string; name: string; source: string }[] = [];
  for (const shard of shards) {
    const source = shard.code[language];
    if (source === undefined) return undefined;
    embedded.push({ id: shard.id, name: shardFunctionName(shard, language), source });
  }
  const literal = JSON.stringify(JSON.stringify(embedded));
  const entry = language === "python" ? "spell.py" : "spell.js";
  const program = language === "python" ? pythonHarness(literal) : javascriptHarness(literal);
  return {
    language,
    kind: "tests",
    entry,
    files: { [entry]: program },
    limits,
    testSpec: {
      form: "io",
      normalize: { trailingWhitespace: true, newlines: true },
      cases: inputs.map((input, index) => ({
        id: `cast-${index + 1}`,
        name: `cast ${index + 1}`,
        stdin: JSON.stringify(input),
        // Nothing is expected: the job only needs what the spell printed, and every case "fails" the comparison.
        expectedStdout: MARKER,
      })),
    },
  };
}

/** What each input's run produced, in input order. */
export function readPipelineRuns(result: RunResult, count: number): PipelineRun[] {
  const tests = result.tests ?? [];
  return Array.from({ length: count }, (_, index): PipelineRun => {
    const test = tests[index];
    if (!test) return { ok: false, reason: describeStatus(result.status, result.stderr), console: "" };
    const lines = (test.actual ?? "").split("\n");
    const markerAt = lines.findLastIndex((line) => line.startsWith(MARKER));
    const printed = lines.slice(0, markerAt < 0 ? lines.length : markerAt).join("\n").trim();
    if (test.status !== "ok" || markerAt < 0) {
      return { ok: false, reason: describeStatus(test.status, test.stderr ?? test.message ?? ""), console: printed };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[markerAt]?.slice(MARKER.length) ?? "");
    } catch {
      return { ok: false, reason: "the spell produced something that is not a list of bolts", console: printed };
    }
    const output = HarnessOutput.safeParse(parsed);
    if (!output.success) return { ok: false, reason: "the spell produced something that is not a list of bolts", console: printed };
    const work = output.data.trace.reduce((sum, step) => sum + step.given, 0);
    return { ok: true, bolts: output.data.bolts, trace: output.data.trace, work, console: printed };
  });
}

function describeStatus(status: RunResult["status"], detail: string): string {
  switch (status) {
    case "timeout":
      return "it ran out of time (a loop that never ends?)";
    case "oom":
      return "it ran out of memory";
    case "sandbox-error":
      return "the sandbox failed to run it";
    default: {
      // The last line of a traceback or stack names the actual error; the frames above it are the harness's.
      const last = detail
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("at "))
        .at(-1);
      return last ?? (status === "compile-error" ? "a shard has a syntax error" : "a shard raised an error");
    }
  }
}

function pythonHarness(literal: string): string {
  return `import json
import sys

SHARDS = json.loads(${literal})


def load(shard):
    # Each shard gets its own namespace, so two shards can both define a helper called \`clamp\` without colliding.
    namespace = {"__name__": "shard_" + shard["name"]}
    exec(compile(shard["source"], shard["id"] + ".py", "exec"), namespace)
    function = namespace.get(shard["name"])
    if not callable(function):
        raise NameError("shard " + shard["id"] + " does not define " + shard["name"] + "(bolts, battle)")
    return function


def main():
    data = json.loads(sys.stdin.read())
    bolts = data["bolts"]
    trace = []
    for shard in SHARDS:
        function = load(shard)
        given = len(bolts)
        result = function(bolts, json.loads(json.dumps(data["battle"])))
        if not isinstance(result, list):
            raise TypeError(shard["name"] + " must return a list of bolts, not " + type(result).__name__)
        trace.append({"shard": shard["id"], "given": given, "returned": len(result)})
        bolts = result[: data["limit"]]
    print(${JSON.stringify(MARKER)} + json.dumps({"bolts": bolts, "trace": trace}, allow_nan=False))


main()
`;
}

function javascriptHarness(literal: string): string {
  return `const SHARDS = JSON.parse(${literal});

function load(shard) {
  // Each shard is compiled in its own function scope, so helpers in two shards never collide.
  const fn = new Function(shard.source + "\\nreturn typeof " + shard.name + " === \\"function\\" ? " + shard.name + " : undefined;")();
  if (typeof fn !== "function") throw new Error("shard " + shard.id + " does not define " + shard.name + "(bolts, battle)");
  return fn;
}

const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
let bolts = data.bolts;
const trace = [];
for (const shard of SHARDS) {
  const fn = load(shard);
  const given = bolts.length;
  const result = fn(bolts, JSON.parse(JSON.stringify(data.battle)));
  if (!Array.isArray(result)) throw new TypeError(shard.name + " must return an array of bolts, not " + typeof result);
  trace.push({ shard: shard.id, given, returned: result.length });
  bolts = result.slice(0, data.limit);
}
console.log(${JSON.stringify(MARKER)} + JSON.stringify({ bolts, trace }));
`;
}
