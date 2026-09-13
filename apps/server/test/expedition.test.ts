import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner } from "@rootward/runners";
import { ErrorResponse, RunResponse, type RunView } from "@rootward/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { type GameContent, loadGameContent } from "../src/content.ts";
import { buildPlannerCatalog } from "../src/planning.ts";
import { RunService } from "../src/runs/service.ts";
import { InMemoryEventStore } from "../src/runs/store.ts";
import { Sandbox } from "../src/sandbox.ts";

// Expeditions through the HTTP API (ADR-0008). These tests walk whatever dungeon the planner builds from the real
// content, so they keep holding as content grows.
const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const SLOW = { timeout: 120_000 };

let app: FastifyInstance;
let sandbox: Sandbox;
let content: GameContent;

beforeAll(async () => {
  content = await loadGameContent(rootDir);
  sandbox = new Sandbox(content.balance, [new WasmJsRunner()]);
  app = await buildApp({ service: new RunService({ content, sandbox, store: new InMemoryEventStore() }), sandbox });
});

afterAll(async () => {
  await app.close();
  await sandbox.dispose();
});

async function send(method: "GET" | "POST", url: string, payload?: object): Promise<RunResponse> {
  const response = await app.inject(payload === undefined ? { method, url } : { method, url, payload });
  expect(response.statusCode, response.body).toBe(200);
  return RunResponse.parse(response.json());
}

async function startExpedition(seed: string): Promise<RunView> {
  return (await send("POST", "/api/expeditions", { language: "javascript", seed })).run;
}

function firstOpenRoom(run: RunView) {
  const room = run.expedition?.rooms.find((candidate) => candidate.state === "open");
  if (!room) throw new Error(`run ${run.runId} has no open room`);
  return room;
}

function solutionFor(run: RunView): Record<string, string> {
  const id = run.encounter?.challenge.id;
  const files = id === undefined ? undefined : content.index.challenges.get(id)?.solution.javascript;
  if (!files) throw new Error(`no JavaScript solution for ${id ?? "a run without an encounter"}`);
  return files;
}

describe("expeditions", () => {
  it("builds the planner catalog from the content packs", () => {
    const catalog = buildPlannerCatalog(content.index);
    expect(catalog.nodes).toContainEqual(expect.objectContaining({ id: "py.collections.dict", transfersTo: "concept.mappings" }));
    expect(catalog.challenges).toContainEqual(
      expect.objectContaining({ id: "foundry.py.dict-word-count", kind: "encounter", languages: ["python", "javascript"] }),
    );
  });

  it("starts on a laid-out map where only the first floor is open, without sending the seed", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/expeditions",
      payload: { language: "javascript", seed: "seed-stays-home" },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).not.toContain("seed-stays-home");

    const { run } = RunResponse.parse(response.json());
    const expedition = run.expedition;
    if (!expedition) throw new Error("an expedition must have a dungeon");
    expect(run).toMatchObject({ status: "active", player: { className: "Artificer", integrity: 100 } });
    expect(run.encounter).toBeUndefined();
    expect(expedition.length).toBe(content.balance.planner.default_session);
    expect(expedition.tiles).toHaveLength(expedition.height);
    expect(expedition.rooms.at(-1)).toMatchObject({ kind: "boss", floor: expedition.floorCount - 1 });

    const firstFloor = expedition.rooms.filter((room) => room.floor === 0);
    const deeper = expedition.rooms.filter((room) => room.floor > 0);
    expect(firstFloor.map((room) => [room.state, typeof room.details?.title])).toEqual(firstFloor.map(() => ["open", "string"]));
    expect(deeper.map((room) => [room.state, room.details])).toEqual(deeper.map(() => ["ahead", undefined]));
  });

  it("refuses doors that are not on the path, unknown rooms, and bad requests", async () => {
    const run = await startExpedition("locked-doors");
    const ahead = run.expedition?.rooms.find((room) => room.state === "ahead");
    if (!ahead) throw new Error("expected a room further down");
    expect((await send("POST", `/api/runs/${run.runId}/rooms`, { roomId: ahead.id })).refused?.code).toBe("unreachable");
    expect((await send("POST", `/api/runs/${run.runId}/rooms`, { roomId: "f99-r0" })).refused?.code).toBe("unknown-room");

    const malformed = await app.inject({ method: "POST", url: `/api/runs/${run.runId}/rooms`, payload: {} });
    expect(malformed.statusCode).toBe(400);

    const practice = await send("POST", "/api/encounters", { challengeId: "foundry.py.dict-word-count", language: "javascript" });
    expect((await send("POST", `/api/runs/${practice.run.runId}/rooms`, { roomId: "f0-r0" })).refused?.code).toBe("no-plan");

    const noRunner = await app.inject({ method: "POST", url: "/api/expeditions", payload: { language: "rust" } });
    expect(noRunner.statusCode).toBe(409);
    expect(ErrorResponse.parse(noRunner.json()).error.code).toBe("no-runner");
    const unknown = await app.inject({ method: "POST", url: "/api/expeditions", payload: { language: "klingon" } });
    expect(ErrorResponse.parse(unknown.json()).error.code).toBe("unsupported-language");
  });

  it("plays every floor down to the boss and completes the run", SLOW, async () => {
    let run = await startExpedition("full-descent");
    const floors = run.expedition?.floorCount ?? 0;
    expect(floors).toBeGreaterThan(1);
    for (let floor = 0; floor < floors; floor++) {
      const room = firstOpenRoom(run);
      expect(room.floor).toBe(floor);
      run = (await send("POST", `/api/runs/${run.runId}/rooms`, { roomId: room.id })).run;
      expect(run.expedition?.currentRoomId).toBe(room.id);
      expect(run.encounter).toMatchObject({ roomId: room.id, status: "active", casts: 0, log: [] });
      expect(run.encounter?.editorFiles).toEqual(run.encounter?.starterFiles);

      run = (await send("POST", `/api/runs/${run.runId}/actions`, { type: "cast", files: solutionFor(run) })).run;
      expect(run.encounter?.status).toBe("won");
    }
    expect(run).toMatchObject({ status: "ended", endReason: "completed" });
    expect(run.encounter?.enemy.tier).toBe("boss");
    expect(run.encounter?.log.at(-1)?.text).toContain("expedition is complete");
    expect(run.expedition?.rooms.filter((room) => room.state === "cleared")).toHaveLength(floors);
  });

  it("continues after a retreat, and retreating from the boss ends the run", async () => {
    let run = await startExpedition("retreats");
    const floors = run.expedition?.floorCount ?? 0;
    for (let floor = 0; floor < floors; floor++) {
      run = (await send("POST", `/api/runs/${run.runId}/rooms`, { roomId: firstOpenRoom(run).id })).run;
      run = (await send("POST", `/api/runs/${run.runId}/actions`, { type: "retreat" })).run;
      expect(Object.keys(run.encounter?.retreat?.solutionFiles ?? {})).toEqual(["main.js"]);
    }
    expect(run).toMatchObject({ status: "ended", endReason: "retreated" });
    const cleared = run.expedition?.rooms.filter((room) => room.state === "cleared") ?? [];
    expect(cleared.map((room) => room.outcome)).toEqual(Array.from({ length: floors }, () => "retreated"));
  });

  it("can be abandoned, after which every door is sealed", async () => {
    const run = await startExpedition("abandon");
    const ended = (await send("POST", `/api/runs/${run.runId}/actions`, { type: "abandon" })).run;
    expect(ended).toMatchObject({ status: "ended", endReason: "abandoned" });
    expect(ended.expedition?.rooms.every((room) => room.state === "sealed")).toBe(true);
    const refused = await send("POST", `/api/runs/${run.runId}/rooms`, { roomId: firstOpenRoom(run).id });
    expect(refused.refused?.code).toBe("run-ended");
  });
});
