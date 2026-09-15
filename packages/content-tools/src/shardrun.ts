import type { Bolt, Shard, ShardBattle } from "@rootward/content-schema";
import type { RunJob, RunLimits, RunResult } from "@rootward/runners";
import { z } from "zod";

// The Shardrun spell harness (ADR-0012, ADR-0013). A spell's shards are real functions; this builds one program that
// runs any number of spells, each shard loaded fresh in its own namespace, and prints one result line per spell with a
// trace of the bolts after every shard. It runs as an ordinary io job, so the same sandboxes and limits that grade
// challenges also contain shards: an infinite loop in a shard is a timeout, not a hung server. Running every spell of a
// turn in one job means one sandbox start instead of one per spell.

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
  /** Bolts kept per step in the trace. */
  traceLimit: number;
}

/** A spell to run: an id to report under, and its shards in slot order. */
export interface SpellProgram {
  id: string;
  shards: readonly Shard[];
}

/** One io case: spells that all start from the same input. */
export interface SpellCase {
  spells: readonly SpellProgram[];
  input: PipelineInput;
}

/** Marks the harness's result lines, so whatever a shard prints itself cannot be mistaken for them. */
const MARKER = "@@shardrun@@";

const TraceStep = z.strictObject({
  shard: z.string(),
  given: z.int().min(0),
  returned: z.int().min(0),
  /** The bolts this shard passed on (the first `traceLimit`), exactly as the next shard received them. */
  bolts: z.array(z.unknown()),
});
export type TraceStep = z.infer<typeof TraceStep>;

const SpellLine = z.discriminatedUnion("ok", [
  z.strictObject({ spell: z.string(), ok: z.literal(true), bolts: z.array(z.unknown()), trace: z.array(TraceStep) }),
  z.strictObject({
    spell: z.string(),
    ok: z.literal(false),
    error: z.string(),
    shard: z.string().optional(),
    line: z.int().optional(),
    trace: z.array(TraceStep),
  }),
]);

export type PipelineRun =
  | { ok: true; bolts: unknown[]; trace: TraceStep[]; work: number; console: string }
  | { ok: false; reason: string; shard?: string; line?: number; trace: TraceStep[]; console: string };

/** The name a shard's function has in `language`: snake_case in Python, camelCase in JavaScript. */
export function shardFunctionName(shard: Shard, language: ShardrunLanguage): string {
  return language === "python" ? shard.function : shard.function.replace(/_([a-z0-9])/g, (_, next: string) => next.toUpperCase());
}

/**
 * A job with one io case per `SpellCase`. Undefined when a shard has no code in `language`.
 * LEARN: the shard sources are embedded as a JSON string inside a JSON string. A JSON string literal is also a valid
 * Python and JavaScript string literal, so `json.loads("...")` and `JSON.parse("...")` read it back with no escaping bugs.
 */
export function spellsJob(language: ShardrunLanguage, cases: readonly SpellCase[], limits: RunLimits): RunJob | undefined {
  const embedded: { id: string; name: string; source: string }[] = [];
  const indexOf = new Map<string, number>();
  for (const spellCase of cases) {
    for (const spell of spellCase.spells) {
      for (const shard of spell.shards) {
        if (indexOf.has(shard.id)) continue;
        const source = shard.code[language];
        if (source === undefined) return undefined;
        indexOf.set(shard.id, embedded.length);
        embedded.push({ id: shard.id, name: shardFunctionName(shard, language), source });
      }
    }
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
      cases: cases.map((spellCase, index) => ({
        id: `case-${index + 1}`,
        name: `case ${index + 1}`,
        stdin: JSON.stringify({
          spells: spellCase.spells.map((spell) => ({ id: spell.id, shards: spell.shards.map((shard) => indexOf.get(shard.id) ?? -1) })),
          bolts: spellCase.input.bolts,
          battle: spellCase.input.battle,
          limit: spellCase.input.limit,
          traceLimit: spellCase.input.traceLimit,
        }),
        // Nothing is expected: the job only needs what the spells printed, and every case "fails" the comparison.
        expectedStdout: MARKER,
      })),
    },
  };
}

/** The run of each spell in case `caseIndex` of a `spellsJob` result, keyed by spell id. */
export function readSpellRuns(result: RunResult, caseIndex: number, spellIds: readonly string[]): Map<string, PipelineRun> {
  const test = result.tests?.[caseIndex];
  const printed: string[] = [];
  const lines = new Map<string, z.infer<typeof SpellLine>>();
  for (const line of (test?.actual ?? "").split("\n")) {
    if (!line.startsWith(MARKER)) {
      printed.push(line);
      continue;
    }
    const parsed = SpellLine.safeParse(parseJson(line.slice(MARKER.length)));
    if (parsed.success) lines.set(parsed.data.spell, parsed.data);
  }
  const console = printed.join("\n").trim();
  const runs = new Map<string, PipelineRun>();
  for (const spellId of spellIds) {
    const line = lines.get(spellId);
    if (line?.ok === true) {
      const work = line.trace.reduce((sum, step) => sum + step.given, 0);
      runs.set(spellId, { ok: true, bolts: line.bolts, trace: line.trace, work, console });
    } else if (line) {
      runs.set(spellId, {
        ok: false,
        reason: line.shard === undefined ? line.error : `${line.shard}${line.line === undefined ? "" : ` line ${line.line}`}: ${line.error}`,
        ...(line.shard === undefined ? {} : { shard: line.shard }),
        ...(line.line === undefined ? {} : { line: line.line }),
        trace: line.trace,
        console,
      });
    } else {
      const reason = test ? describeStatus(test.status, test.stderr ?? test.message ?? "") : describeStatus(result.status, result.stderr);
      runs.set(spellId, { ok: false, reason, trace: [], console });
    }
  }
  return runs;
}

/** Whether a result stopped before every spell reported, the way a timeout or a crash does. */
export function stoppedEarly(result: RunResult, caseIndex: number): boolean {
  const status = result.tests?.[caseIndex]?.status ?? result.status;
  return status === "timeout" || status === "oom" || status === "sandbox-error" || status === "runtime-error";
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A line that is not JSON is reported as a missing result for its spell, with the run's own status as the reason.
    return undefined;
  }
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
import traceback

SHARDS = json.loads(${literal})
MARKER = ${JSON.stringify(MARKER)}


def load(shard):
    # Each shard gets its own namespace, loaded fresh for every spell, so shards cannot collide or keep state.
    namespace = {"__name__": "shard_" + shard["name"]}
    exec(compile(shard["source"], shard["id"] + ".py", "exec"), namespace)
    function = namespace.get(shard["name"])
    if not callable(function):
        raise NameError(shard["id"] + " does not define " + shard["name"] + "(bolts, battle)")
    return function


class ShardFailure(Exception):
    def __init__(self, shard, error):
        super().__init__(str(error))
        self.shard = shard
        self.error = error


def run_spell(spell, data, battle_json, trace):
    bolts = json.loads(json.dumps(data["bolts"]))
    for index in spell["shards"]:
        shard = SHARDS[index]
        try:
            function = load(shard)
            given = len(bolts)
            result = function(bolts, json.loads(battle_json))
            if not isinstance(result, list):
                raise TypeError(shard["name"] + " must return a list of bolts, not " + type(result).__name__)
            # A JSON round trip copies the bolts, so no shard can change another step's bolts afterwards, and it rejects
            # values that are not plain data (like float("inf")) at the shard that made them.
            snapshot = json.dumps(result[: data["limit"]], allow_nan=False)
        except Exception as error:
            raise ShardFailure(shard, error)
        bolts = json.loads(snapshot)
        kept = json.loads(snapshot)[: data["traceLimit"]]
        trace.append({"shard": shard["id"], "given": given, "returned": len(result), "bolts": kept})
    return bolts


def locate(failure):
    error = failure.error
    filename = failure.shard["id"] + ".py"
    line = None
    if isinstance(error, SyntaxError) and error.filename == filename:
        line = error.lineno
    for frame in traceback.extract_tb(error.__traceback__):
        if frame.filename == filename:
            line = frame.lineno
    return line


def main():
    data = json.loads(sys.stdin.read())
    battle_json = json.dumps(data["battle"])
    for spell in data["spells"]:
        trace = []
        try:
            bolts = run_spell(spell, data, battle_json, trace)
            result = {"spell": spell["id"], "ok": True, "bolts": bolts, "trace": trace}
        except ShardFailure as failure:
            error = failure.error
            result = {
                "spell": spell["id"],
                "ok": False,
                "error": type(error).__name__ + ": " + str(error),
                "shard": failure.shard["id"],
                "trace": trace,
            }
            line = locate(failure)
            if line is not None:
                result["line"] = line
        print(MARKER + json.dumps(result))


main()
`;
}

function javascriptHarness(literal: string): string {
  return `const SHARDS = JSON.parse(${literal});
const MARKER = ${JSON.stringify(MARKER)};

function load(shard) {
  // Each shard is compiled in its own function scope, fresh for every spell, so shards never collide or keep state.
  const fn = new Function(shard.source + "\\nreturn typeof " + shard.name + " === \\"function\\" ? " + shard.name + " : undefined;")();
  if (typeof fn !== "function") throw new Error(shard.id + " does not define " + shard.name + "(bolts, battle)");
  return fn;
}

function runSpell(spell, data, battleJson, trace) {
  let bolts = JSON.parse(JSON.stringify(data.bolts));
  for (const index of spell.shards) {
    const shard = SHARDS[index];
    let snapshot;
    let given;
    let returned;
    try {
      const fn = load(shard);
      given = bolts.length;
      const result = fn(bolts, JSON.parse(battleJson));
      if (!Array.isArray(result)) throw new TypeError(shard.name + " must return an array of bolts, not " + typeof result);
      returned = result.length;
      snapshot = JSON.stringify(result.slice(0, data.limit));
    } catch (error) {
      throw { shard, error };
    }
    bolts = JSON.parse(snapshot);
    trace.push({ shard: shard.id, given, returned, bolts: JSON.parse(snapshot).slice(0, data.traceLimit) });
  }
  return bolts;
}

const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
const battleJson = JSON.stringify(data.battle);
for (const spell of data.spells) {
  const trace = [];
  let result;
  try {
    result = { spell: spell.id, ok: true, bolts: runSpell(spell, data, battleJson, trace), trace };
  } catch (failure) {
    const error = failure && failure.error;
    const name = error && error.name ? error.name : "Error";
    const message = error && error.message !== undefined ? error.message : String(error);
    result = { spell: spell.id, ok: false, error: name + ": " + message, shard: failure && failure.shard ? failure.shard.id : undefined, trace };
  }
  console.log(MARKER + JSON.stringify(result));
}
`;
}
