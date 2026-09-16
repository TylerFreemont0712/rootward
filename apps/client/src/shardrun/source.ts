import type { BoltOutcomeView, BoltView, ShardView, SpellRunView } from "@rootward/shared";

// The whole spell as one program (WIP: "the function as a whole"). A spell is its shards' functions followed by a cast
// function that calls them in slot order; this composes that source for the run's language and plans a playback that
// walks through it line by line. Values only ever change at the points the server really measured: the base bolt,
// after each shard returns, and the final result. Between those, the cursor just walks the lines being run.

export type SourceLineKind = "comment" | "blank" | "def" | "body" | "start" | "call" | "return";

export interface SourceLine {
  /** 1-based, as shown in the gutter. */
  number: number;
  text: string;
  kind: SourceLineKind;
  /** For def and body lines: whose function this is. */
  shard?: string;
}

export interface SpellSource {
  lines: SourceLine[];
  /** The line that makes the starting bolt. */
  startLine: number;
  /** One call per slot, in order. */
  calls: { line: number; shard: string }[];
  returnLine: number;
  /** Shard id -> its function's first line and the lines of its body. */
  functions: Map<string, { defLine: number; body: number[] }>;
}

export const CODE_SPEEDS = {
  slow: { line: 380, pause: 700 },
  normal: { line: 160, pause: 380 },
  fast: { line: 55, pause: 150 },
} as const;
export type CodeSpeed = "off" | keyof typeof CODE_SPEEDS;

export interface Frame {
  /** Milliseconds from the start of playback. */
  at: number;
  line: number;
  mark?: "start" | "step" | "result" | "error";
  /** Which call just returned, for a step. */
  step?: number;
  bolts?: BoltView[];
  outcome?: BoltOutcomeView;
}

export function composeSpell(
  language: string,
  spellName: string,
  shardIds: readonly string[],
  shards: Readonly<Record<string, ShardView>>,
  basePower: number,
): SpellSource {
  const python = language === "python";
  const comment = python ? "#" : "//";
  const lines: SourceLine[] = [];
  const add = (text: string, kind: SourceLineKind, shard?: string): number => {
    lines.push({ number: lines.length + 1, text, kind, ...(shard === undefined ? {} : { shard }) });
    return lines.length;
  };
  const functions = new Map<string, { defLine: number; body: number[] }>();

  const names = shardIds.map((id) => shards[id]?.name ?? id);
  add(`${comment} ${spellName}: ${names.length > 0 ? names.join(" → ") : "one plain bolt"}`, "comment");
  add("", "blank");

  // The cast comes first: it is what the spell is, and each call below leads down into the shard it names. Order does
  // not change how it runs (Python calls these only when the cast is called; JavaScript hoists declarations).
  const start = python
    ? `    bolts = [{"power": ${basePower}, "element": "none", "target": "front", "pierce": False, "ward": False, "mult": 1}]`
    : `  let bolts = [{ power: ${basePower}, element: "none", target: "front", pierce: false, ward: false, mult: 1 }];`;
  const castName = python ? `cast_${snakeCase(spellName)}` : `cast${pascalCase(spellName)}`;
  add(python ? `def ${castName}(battle):` : `function ${castName}(battle) {`, "def");
  const startLine = add(start, "start");
  const calls = shardIds.map((id) => {
    const name = shards[id]?.function ?? id;
    return { line: add(python ? `    bolts = ${name}(bolts, battle)` : `  bolts = ${name}(bolts, battle);`, "call"), shard: id };
  });
  const returnLine = add(python ? "    return bolts" : "  return bolts;", "return");
  if (!python) add("}", "body");

  for (const id of new Set(shardIds)) {
    add("", "blank");
    const shard = shards[id];
    if (!shard) {
      add(`${comment} ${id}: this shard is missing`, "comment");
      continue;
    }
    const sourceLines = shard.code.replace(/\s+$/, "").split("\n");
    let defLine = 0;
    const body: number[] = [];
    for (const text of sourceLines) {
      const isDef = defLine === 0 && (python ? text.startsWith(`def ${shard.function}(`) : text.startsWith(`function ${shard.function}(`));
      const line = add(text, isDef ? "def" : "body", id);
      if (isDef) defLine = line;
      // The cursor walks only lines that run: blank lines, closing braces, and comments are skipped.
      else if (defLine !== 0 && !/^(|}|#.*|\/\/.*)$/.test(text.trim())) body.push(line);
    }
    functions.set(id, { defLine: defLine || (lines.length - sourceLines.length + 1), body });
  }
  return { lines, startLine, calls, returnLine, functions };
}

/**
 * When each line lights up. Each call pauses on its line, walks the shard's body, then returns to the call with the
 * bolts that shard really passed on. A misfire stops on the failing line when the server reported one.
 */
export function playbackFrames(source: SpellSource, run: SpellRunView, speed: keyof typeof CODE_SPEEDS): Frame[] {
  const { line: lineMs, pause } = CODE_SPEEDS[speed];
  const frames: Frame[] = [];
  let at = 0;
  const push = (frame: Omit<Frame, "at">, dwell: number) => {
    frames.push({ at, ...frame });
    at += dwell;
  };

  push({ line: source.startLine, mark: "start", bolts: run.base.bolts, ...(run.base.outcome ? { outcome: run.base.outcome } : {}) }, pause);
  const failing = run.misfire ? (run.misfire.shard === undefined ? -1 : run.steps.length) : undefined;
  if (failing === -1) {
    // No shard to blame (a timeout, say): the whole cast stops where it began.
    push({ line: source.startLine, mark: "error" }, pause * 2);
    return frames;
  }
  for (const [index, call] of source.calls.entries()) {
    const step = run.steps[index];
    const fn = source.functions.get(call.shard);
    push({ line: call.line }, lineMs);
    if (index === failing) {
      const errorLine = fn && run.misfire?.line !== undefined ? fn.defLine + run.misfire.line - 1 : undefined;
      for (const line of fn?.body ?? []) {
        if (errorLine !== undefined && line >= errorLine) break;
        push({ line }, lineMs);
      }
      push({ line: errorLine ?? fn?.body.at(-1) ?? call.line, mark: "error" }, pause * 2);
      return frames;
    }
    if (!step) break;
    for (const line of fn?.body ?? []) push({ line }, lineMs);
    push({ line: call.line, mark: "step", step: index, bolts: step.bolts, ...(step.outcome ? { outcome: step.outcome } : {}) }, pause);
  }
  push({ line: source.returnLine, mark: "result", ...(run.result ? { outcome: run.result } : {}) }, pause * 1.6);
  return frames;
}

/** Total playback time, including the final pause. */
export function playbackLength(frames: readonly Frame[], speed: keyof typeof CODE_SPEEDS): number {
  return (frames.at(-1)?.at ?? 0) + CODE_SPEEDS[speed].pause * 1.6;
}

function snakeCase(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "spell";
}

function pascalCase(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase())
    .join("") || "Spell";
}
