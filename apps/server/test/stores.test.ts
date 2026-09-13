import path from "node:path";
import { fileURLToPath } from "node:url";
import { decide, evolve, foldRun, type RunCommand, type RunEvent, type RunState } from "@rootward/core";
import type { RunResult } from "@rootward/runners";
import { beforeAll, describe, expect, it } from "vitest";
import { type GameContent, loadGameContent } from "../src/content.ts";
import { MEMORY, openDatabase } from "../src/db/database.ts";
import type { RunArtifacts } from "../src/runs/artifacts.ts";
import { applyAttempt, type Attempt, SqliteAttemptStore } from "../src/runs/attempts.ts";
import { SqliteEventStore } from "../src/runs/sqlite-event-store.ts";
import { InMemoryEventStore } from "../src/runs/store.ts";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const NOW = () => "2026-09-14T00:00:00.000Z";

let content: GameContent;
let events: RunEvent[];

/** Real events from the real rules: start a run, enter the Tally Wisp fight, Probe, buy a hint, and Cast badly. */
function playTallyWisp(): RunEvent[] {
  const challenge = content.index.challenges.get("foundry.py.dict-word-count");
  const enemy = content.index.enemies.get("tally-wisp")?.value;
  const classDef = content.index.classes.get("artificer")?.def;
  if (!challenge || !enemy || !classDef) throw new Error("seed content is missing");
  const visible = challenge.visibleTests?.cases ?? [];
  const hidden = (challenge.hiddenTests?.cases ?? []).filter((c) => !c.reserve);
  const fail = (ids: string[]) => ids.map((id) => ({ id, passed: false, durationMs: 1 }));

  const commands: RunCommand[] = [
    { type: "StartRun", runId: "run-1", seed: "store-test", classDef },
    {
      type: "StartEncounter",
      roomId: "room-1",
      challenge: {
        id: challenge.manifest.id,
        concepts: challenge.manifest.concepts,
        language: "javascript",
        difficulty: 3,
        retreatable: true,
        scoring: challenge.manifest.scoring,
      },
      enemy,
      tests: [
        ...visible.map((c) => ({ id: c.id, name: c.name, visibility: "visible" as const })),
        ...hidden.map((c) => ({ id: c.id, name: c.name, visibility: "hidden" as const })),
      ],
      reserve: [],
      mastery: 0,
    },
    { type: "Probe", results: fail(visible.map((c) => c.id)) },
    { type: "TakeHint" },
    { type: "Cast", results: fail([...visible, ...hidden].map((c) => c.id)) },
  ];

  let state: RunState | undefined;
  const produced: RunEvent[] = [];
  for (const command of commands) {
    const decision = decide(state, command, { balance: content.balance });
    if (!decision.ok) throw new Error(decision.error.message);
    for (const event of decision.events) {
      state = evolve(state, event);
      produced.push(event);
    }
  }
  return produced;
}

beforeAll(async () => {
  content = await loadGameContent(rootDir);
  events = playTallyWisp();
});

describe("SqliteEventStore", () => {
  it("round-trips events so they fold to the same state", async () => {
    const store = new SqliteEventStore(openDatabase(MEMORY), NOW);
    await store.create("run-1", events.slice(0, 2));
    await store.append("run-1", 2, events.slice(2));
    const loaded = await store.load("run-1");
    expect(loaded).toEqual(events);
    expect(foldRun(loaded ?? [])).toEqual(foldRun(events));
  });

  it("rejects an append made from a stale view of the log", async () => {
    const store = new SqliteEventStore(openDatabase(MEMORY), NOW);
    await store.create("run-1", events.slice(0, 2));
    await store.append("run-1", 2, events.slice(2, 3));
    await expect(store.append("run-1", 2, events.slice(3, 4))).rejects.toThrow("changed concurrently");
  });

  it("returns undefined for a run that does not exist", async () => {
    const store = new SqliteEventStore(openDatabase(MEMORY), NOW);
    expect(await store.load("no-such-run")).toBeUndefined();
  });

  it("lists every run with append times, oldest run first", async () => {
    let tick = 0;
    const clock = () => new Date(Date.UTC(2026, 8, 14) + tick++ * 1000).toISOString();
    for (const store of [new SqliteEventStore(openDatabase(MEMORY), clock), new InMemoryEventStore(clock)]) {
      tick = 0;
      await store.create("run-b", events.slice(0, 2));
      await store.create("run-a", events.slice(0, 2));
      await store.append("run-b", 2, events.slice(2));
      const all = await store.loadAll();
      expect(all.map((run) => run.runId)).toEqual(["run-b", "run-a"]);
      expect(all[0]?.events.map((timed) => timed.event)).toEqual(events);
      expect(all[0]?.events.map((timed) => timed.at)).toEqual([
        "2026-09-14T00:00:00.000Z",
        "2026-09-14T00:00:00.000Z",
        ...events.slice(2).map(() => "2026-09-14T00:00:02.000Z"),
      ]);
    }
  });

  it("fails loudly when a stored event is corrupted", async () => {
    const db = openDatabase(MEMORY);
    const store = new SqliteEventStore(db, NOW);
    await store.create("run-1", events);
    db.prepare("UPDATE run_events SET payload = ? WHERE run_id = ? AND seq = 1").run('{"type":"EncounterStarted"}', "run-1");
    await expect(store.load("run-1")).rejects.toThrow("event 1 is not a valid event");
  });
});

describe("SqliteAttemptStore", () => {
  const result = (passed: boolean): RunResult => ({
    status: "ok",
    stdout: "",
    stderr: "",
    tests: [
      { id: "v1", name: "counts", passed, status: "ok", durationMs: 1 },
      { id: "h1", name: "empty input", passed, status: "ok", durationMs: 2, actual: "hidden output" },
    ],
    metrics: { wallMs: 5 },
  });
  const attempt = (seq: number, kind: Attempt["kind"], source: string, passed: boolean): Attempt => ({
    seq,
    kind,
    language: "javascript",
    files: { "main.js": source },
    result: result(passed),
  });

  it("round-trips attempts in order, and replaying them rebuilds the artifacts", async () => {
    const db = openDatabase(MEMORY);
    await new SqliteEventStore(db, NOW).create("run-1", events.slice(0, 2));
    const store = new SqliteAttemptStore(db, NOW);
    await store.record("run-1", attempt(2, "probe", "first draft", false));
    await store.record("run-1", attempt(3, "cast", "second draft", true));

    const listed = await store.list("run-1");
    expect(listed).toEqual([attempt(2, "probe", "first draft", false), attempt(3, "cast", "second draft", true)]);

    const artifacts: RunArtifacts = { files: { "main.js": "starter" }, latest: new Map() };
    for (const stored of listed) applyAttempt(artifacts, stored, new Set(["v1"]));
    expect(artifacts.files).toEqual({ "main.js": "second draft" });
    expect(artifacts.latest.get("h1")?.passed).toBe(true);
    expect(artifacts.lastRun?.kind).toBe("cast");
  });

  it("refuses an attempt for a run that does not exist", async () => {
    const store = new SqliteAttemptStore(openDatabase(MEMORY), NOW);
    await expect(store.record("ghost", attempt(0, "probe", "x", false))).rejects.toThrow("FOREIGN KEY");
  });
});
