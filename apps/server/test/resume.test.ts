import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner } from "@rootward/runners";
import { type EncounterView, RunResponse, type RunView } from "@rootward/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { type GameContent, loadGameContent } from "../src/content.ts";
import { openDatabase } from "../src/db/database.ts";
import { SqliteAttemptStore } from "../src/runs/attempts.ts";
import { RunService } from "../src/runs/service.ts";
import { SqliteEventStore } from "../src/runs/sqlite-event-store.ts";
import { Sandbox } from "../src/sandbox.ts";

// M1 definition of done: "runs resume after app restart". Two separate server instances share one database file.
const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const dataDir = mkdtempSync(path.join(os.tmpdir(), "rootward-resume-"));
let content: GameContent;

beforeAll(async () => {
  content = await loadGameContent(rootDir);
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function bootServer(): Promise<{ app: FastifyInstance; stop: () => Promise<void> }> {
  const db = openDatabase(path.join(dataDir, "rootward.db"));
  const sandbox = new Sandbox(content.balance, [new WasmJsRunner()]);
  const service = new RunService({
    content,
    sandbox,
    store: new SqliteEventStore(db),
    attempts: new SqliteAttemptStore(db),
  });
  const app = await buildApp({ service, sandbox });
  return {
    app,
    stop: async () => {
      await app.close();
      await sandbox.dispose();
      db.close();
    },
  };
}

async function request(app: FastifyInstance, method: "GET" | "POST", url: string, payload?: object): Promise<RunView> {
  const response = await app.inject(payload === undefined ? { method, url } : { method, url, payload });
  expect(response.statusCode, response.body).toBe(200);
  return RunResponse.parse(response.json()).run;
}

function encounterOf(run: RunView): EncounterView {
  if (!run.encounter) throw new Error(`run ${run.runId} has no encounter`);
  return run.encounter;
}

function solutionFor(encounter: EncounterView): Record<string, string> {
  const files = content.index.challenges.get(encounter.challenge.id)?.solution.javascript;
  if (!files) throw new Error(`${encounter.challenge.id} has no JavaScript solution`);
  return files;
}

describe("resuming after a server restart", () => {
  it("restores the fight, the editor, the test results, and the log from SQLite", { timeout: 60_000 }, async () => {
    const first = await bootServer();
    const started = encounterOf(
      await request(first.app, "POST", "/api/encounters", {
        challengeId: "foundry.py.dict-word-count",
        language: "javascript",
        seed: "resume-test",
      }),
    );
    const draft = { "main.js": `${started.starterFiles["main.js"] ?? ""}\n// work in progress\n` };
    await request(first.app, "POST", `/api/runs/${started.runId}/actions`, { type: "probe", files: draft });
    const before = encounterOf(await request(first.app, "POST", `/api/runs/${started.runId}/actions`, { type: "hint" }));
    await first.stop();

    const second = await bootServer();
    const resumed = encounterOf(await request(second.app, "GET", `/api/runs/${started.runId}`));
    expect(resumed.player).toEqual(before.player);
    expect(resumed.editorFiles).toEqual(draft);
    expect(resumed.tests).toEqual(before.tests);
    expect(resumed.hints).toEqual(before.hints);
    expect(resumed.lastRun).toEqual(before.lastRun);
    expect(resumed.log).toEqual(before.log);

    const won = encounterOf(
      await request(second.app, "POST", `/api/runs/${started.runId}/actions`, {
        type: "cast",
        files: solutionFor(started),
      }),
    );
    expect(won.status).toBe("won");
    await second.stop();
  });

  it("restores an expedition mid-room, and the next room starts from its own starter files", { timeout: 60_000 }, async () => {
    const first = await bootServer();
    const started = await request(first.app, "POST", "/api/expeditions", { language: "javascript", seed: "resume-map" });
    const room = started.expedition?.rooms.find((candidate) => candidate.state === "open");
    if (!room) throw new Error("the expedition has no open room");
    const entered = encounterOf(await request(first.app, "POST", `/api/runs/${started.runId}/rooms`, { roomId: room.id }));
    const draft = { "main.js": `${entered.starterFiles["main.js"] ?? ""}\n// first room\n` };
    await request(first.app, "POST", `/api/runs/${started.runId}/actions`, { type: "probe", files: draft });
    await first.stop();

    const second = await bootServer();
    const resumed = await request(second.app, "GET", `/api/runs/${started.runId}`);
    expect(resumed.expedition?.currentRoomId).toBe(room.id);
    expect(encounterOf(resumed).editorFiles).toEqual(draft);

    const cleared = await request(second.app, "POST", `/api/runs/${started.runId}/actions`, {
      type: "cast",
      files: solutionFor(entered),
    });
    expect(cleared.expedition?.lastClearedRoomId).toBe(room.id);
    const next = cleared.expedition?.rooms.find((candidate) => candidate.state === "open");
    if (!next) throw new Error("no room opened after the first one was cleared");
    const nextRoom = encounterOf(await request(second.app, "POST", `/api/runs/${started.runId}/rooms`, { roomId: next.id }));
    expect(nextRoom.editorFiles).toEqual(nextRoom.starterFiles);
    expect(nextRoom.lastRun).toBeUndefined();
    expect(nextRoom.log).toEqual([]);
    await second.stop();
  });
});
