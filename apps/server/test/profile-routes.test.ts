import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner } from "@rootward/runners";
import {
  LearnerResponse,
  MoveWorldResponse,
  ProfileListResponse,
  ProfileResponse,
  RunResponse,
  WorldActionResponse,
  WorldResponse,
  WorldStatusResponse,
} from "@rootward/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { type GameContent, loadGameContent } from "../src/content.ts";
import { MEMORY, openDatabase } from "../src/db/database.ts";
import { ProfileService } from "../src/profiles/service.ts";
import { RunServiceRegistry } from "../src/runs/registry.ts";
import { RunService } from "../src/runs/service.ts";
import { InMemoryEventStore } from "../src/runs/store.ts";
import { Sandbox } from "../src/sandbox.ts";
import { WorldService } from "../src/world/service.ts";

// Profile-scoped routes and the world (ADR-0010, ADR-0011), through the same HTTP surface expedition.test.ts and
// api.test.ts exercise for the unscoped routes -- those are untouched; this proves the mirrored, per-character path.
const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const SLOW = { timeout: 60_000 };

let app: FastifyInstance;
let sandbox: Sandbox;
let content: GameContent;

beforeAll(async () => {
  content = await loadGameContent(rootDir);
  sandbox = new Sandbox(content.balance, [new WasmJsRunner()]);
  const db = openDatabase(MEMORY);
  const registry = new RunServiceRegistry({ content, sandbox, db });
  app = await buildApp({
    service: new RunService({ content, sandbox, store: new InMemoryEventStore() }),
    sandbox,
    profiles: { profileService: new ProfileService({ db }), registry, world: new WorldService({ db, content, registry }), content },
  });
});

afterAll(async () => {
  await app.close();
  await sandbox.dispose();
});

async function createProfile(name: string): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/api/profiles", payload: { name } });
  expect(response.statusCode, response.body).toBe(200);
  return ProfileResponse.parse(response.json()).profile.id;
}

function solutionFor(challengeId: string | undefined): Record<string, string> {
  const files = challengeId === undefined ? undefined : content.index.challenges.get(challengeId)?.solution.javascript;
  if (!files) throw new Error(`no javascript solution for ${challengeId ?? "a run without an encounter"}`);
  return files;
}

describe("profile-scoped routes", () => {
  it("creates and lists characters", async () => {
    const ada = await createProfile("Ada");
    const grace = await createProfile("Grace");
    const listed = ProfileListResponse.parse((await app.inject({ method: "GET", url: "/api/profiles" })).json());
    expect(listed.profiles.map((p) => p.id)).toEqual(expect.arrayContaining([ada, grace]));
    expect(listed.summaries[ada]).toMatchObject({ className: "Artificer", fights: 0, questsActive: 0, questsDone: 0 });
    expect(listed.summaries[ada]?.zoneName).toBeUndefined();
    expect(listed.startingClass).toMatchObject({ id: "artificer", name: "Artificer" });
    // Every class is listed for the picker, the playable one first; planned classes cannot be chosen yet.
    expect(listed.classes[0]).toMatchObject({ id: "artificer", playable: true });
    const warden = listed.classes.find((card) => card.id === "warden");
    expect(warden?.playable).toBe(false);
    expect(warden?.discipline).toContain("Linux");
    const planned = await app.inject({ method: "POST", url: "/api/profiles", payload: { name: "Wren", classId: "warden" } });
    expect(planned.statusCode).toBe(400);
    expect(planned.json()).toMatchObject({ error: { code: "class-not-playable" } });
    const unknown = await app.inject({ method: "POST", url: "/api/profiles", payload: { name: "Wren", classId: "bard" } });
    expect(unknown.json()).toMatchObject({ error: { code: "unknown-class" } });
  });

  it("scopes practice fights and mastery per character", SLOW, async () => {
    const ada = await createProfile("Ada-practice");
    const bob = await createProfile("Bob-practice");

    const started = await app.inject({
      method: "POST",
      url: `/api/profiles/${ada}/encounters`,
      payload: { challengeId: "foundry.py.dict-word-count", language: "javascript" },
    });
    const { run } = RunResponse.parse(started.json());
    const cast = await app.inject({
      method: "POST",
      url: `/api/profiles/${ada}/runs/${run.runId}/actions`,
      payload: { type: "cast", files: solutionFor("foundry.py.dict-word-count") },
    });
    expect(RunResponse.parse(cast.json()).run.encounter?.status).toBe("won");

    const adaLearner = LearnerResponse.parse((await app.inject({ method: "GET", url: `/api/profiles/${ada}/learner` })).json());
    const bobLearner = LearnerResponse.parse((await app.inject({ method: "GET", url: `/api/profiles/${bob}/learner` })).json());
    expect(adaLearner.learner.fights).toBeGreaterThan(0);
    expect(bobLearner.learner.fights).toBe(0);
  });

  it("plays an expedition to completion and reads its debrief, scoped to one character", SLOW, async () => {
    const ada = await createProfile("Ada-expedition");
    const started = await app.inject({
      method: "POST",
      url: `/api/profiles/${ada}/expeditions`,
      payload: { language: "javascript", seed: "profile-route-test" },
    });
    let run = RunResponse.parse(started.json()).run;
    const floors = run.expedition?.floorCount ?? 0;
    expect(floors).toBeGreaterThan(0);
    for (let floor = 0; floor < floors; floor++) {
      const room = run.expedition?.rooms.find((candidate) => candidate.state === "open");
      if (!room) throw new Error("no open room");
      const entered = await app.inject({
        method: "POST",
        url: `/api/profiles/${ada}/runs/${run.runId}/rooms`,
        payload: { roomId: room.id },
      });
      run = RunResponse.parse(entered.json()).run;
      const cast = await app.inject({
        method: "POST",
        url: `/api/profiles/${ada}/runs/${run.runId}/actions`,
        payload: { type: "cast", files: solutionFor(run.encounter?.challenge.id) },
      });
      run = RunResponse.parse(cast.json()).run;
    }
    expect(run).toMatchObject({ status: "ended", endReason: "completed" });

    const debrief = await app.inject({ method: "GET", url: `/api/profiles/${ada}/runs/${run.runId}/debrief` });
    expect(debrief.statusCode, debrief.body).toBe(200);
  });

  it("arrives in the world, walks, and talks through the HTTP API", async () => {
    const ada = await createProfile("Ada-world");
    const url = (suffix: string) => `/api/profiles/${ada}/world${suffix}`;

    const before = WorldStatusResponse.parse((await app.inject({ method: "GET", url: url("") })).json());
    expect(before.world).toBeNull();

    const started = await app.inject({ method: "POST", url: url("/start"), payload: { language: "javascript" } });
    expect(started.statusCode, started.body).toBe(200);
    expect(WorldResponse.parse(started.json()).world.zone.id).toBe("bastion");

    const moved = await app.inject({ method: "POST", url: url("/move"), payload: { x: 20, y: 17 } });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(MoveWorldResponse.parse(moved.json()).position).toEqual({ x: 20, y: 17 });

    const wall = await app.inject({ method: "POST", url: url("/move"), payload: { x: 0, y: 0 } });
    expect(wall.statusCode).toBe(400);

    const talked = await app.inject({ method: "POST", url: url("/talk"), payload: { npcId: "lint" } });
    expect(talked.statusCode, talked.body).toBe(200);
    const conversation = WorldActionResponse.parse(talked.json()).conversation;
    const start = conversation?.choices.find((choice) => choice.text === "Where do I start?");
    if (!conversation?.nodeId || !start) throw new Error("Lint did not offer to start");

    const chosen = await app.inject({
      method: "POST",
      url: url("/choose"),
      payload: { npcId: "lint", nodeId: conversation.nodeId, choice: start.index },
    });
    expect(chosen.statusCode, chosen.body).toBe(200);
    expect(WorldActionResponse.parse(chosen.json()).world.quests.map((quest) => quest.id)).toEqual(["report-to-the-guild"]);

    const after = WorldStatusResponse.parse((await app.inject({ method: "GET", url: url("") })).json());
    expect(after.world?.position).toEqual({ x: 20, y: 17 });

    const listed = ProfileListResponse.parse((await app.inject({ method: "GET", url: "/api/profiles" })).json());
    expect(listed.summaries[ada]).toMatchObject({ zoneName: "The Bastion", questsActive: 1 });
  });
});
