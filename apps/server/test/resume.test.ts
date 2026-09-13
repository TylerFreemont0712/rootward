import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner } from "@rootward/runners";
import { EncounterResponse } from "@rootward/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { loadGameContent } from "../src/content.ts";
import { openDatabase } from "../src/db/database.ts";
import { SqliteAttemptStore } from "../src/runs/attempts.ts";
import { RunService } from "../src/runs/service.ts";
import { SqliteEventStore } from "../src/runs/sqlite-event-store.ts";
import { Sandbox } from "../src/sandbox.ts";

// M1 definition of done: "runs resume after app restart". Two separate server instances share one database file.
const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const solution = readFileSync(
  path.join(rootDir, "content/packs/core/challenges/foundry/tally-wisp/solution/javascript/main.js"),
  "utf8",
);
const dataDir = mkdtempSync(path.join(os.tmpdir(), "rootward-resume-"));

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function bootServer(): Promise<{ app: FastifyInstance; stop: () => Promise<void> }> {
  const content = await loadGameContent(rootDir);
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

async function request(app: FastifyInstance, method: "GET" | "POST", url: string, payload?: object) {
  const response = await app.inject(payload === undefined ? { method, url } : { method, url, payload });
  expect(response.statusCode, response.body).toBe(200);
  return EncounterResponse.parse(response.json()).view;
}

describe("resuming after a server restart", () => {
  it("restores the fight, the editor, the test results, and the log from SQLite", { timeout: 60_000 }, async () => {
    const first = await bootServer();
    const started = await request(first.app, "POST", "/api/encounters", {
      challengeId: "foundry.py.dict-word-count",
      language: "javascript",
      seed: "resume-test",
    });
    const draft = { "main.js": `${started.starterFiles["main.js"] ?? ""}\n// work in progress\n` };
    await request(first.app, "POST", `/api/runs/${started.runId}/actions`, { type: "probe", files: draft });
    const before = await request(first.app, "POST", `/api/runs/${started.runId}/actions`, { type: "hint" });
    await first.stop();

    const second = await bootServer();
    const resumed = await request(second.app, "GET", `/api/runs/${started.runId}`);
    expect(resumed.player).toEqual(before.player);
    expect(resumed.editorFiles).toEqual(draft);
    expect(resumed.tests).toEqual(before.tests);
    expect(resumed.hints).toEqual(before.hints);
    expect(resumed.lastRun).toEqual(before.lastRun);
    expect(resumed.log).toEqual(before.log);

    const won = await request(second.app, "POST", `/api/runs/${started.runId}/actions`, {
      type: "cast",
      files: { "main.js": solution },
    });
    expect(won.status).toBe("won");
    await second.stop();
  });
});
