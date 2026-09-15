import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner } from "@rootward/runners";
import {
  LearnerResponse,
  OverworldRealmsResponse,
  OverworldResponse,
  ProfileListResponse,
  ProfileResponse,
  RunResponse,
} from "@rootward/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { type GameContent, loadGameContent } from "../src/content.ts";
import { MEMORY, openDatabase } from "../src/db/database.ts";
import { OverworldService } from "../src/overworld/service.ts";
import { ProfileService } from "../src/profiles/service.ts";
import { RunServiceRegistry } from "../src/runs/registry.ts";
import { RunService } from "../src/runs/service.ts";
import { InMemoryEventStore } from "../src/runs/store.ts";
import { Sandbox } from "../src/sandbox.ts";

// Profile-scoped routes and the overworld (ADR-0010), through the same HTTP surface expedition.test.ts and
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
    profiles: { profileService: new ProfileService({ db }), registry, overworld: new OverworldService({ db, content, registry }) },
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
    const { profiles } = ProfileListResponse.parse((await app.inject({ method: "GET", url: "/api/profiles" })).json());
    expect(profiles.map((p) => p.id)).toEqual(expect.arrayContaining([ada, grace]));
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

  it("walks the overworld end to end through the HTTP API", SLOW, async () => {
    const ada = await createProfile("Ada-overworld");

    const realms = OverworldRealmsResponse.parse((await app.inject({ method: "GET", url: `/api/profiles/${ada}/overworld` })).json());
    expect(realms.realms.find((r) => r.id === "foundry")).toMatchObject({ available: true });

    const entered = await app.inject({
      method: "POST",
      url: `/api/profiles/${ada}/overworld/foundry/enter`,
      payload: { language: "javascript" },
    });
    expect(entered.statusCode, entered.body).toBe(200);
    const view = OverworldResponse.parse(entered.json()).overworld;
    expect(view.position).toEqual(view.entry);

    const moved = await app.inject({ method: "POST", url: `/api/profiles/${ada}/overworld/foundry/move`, payload: { x: 14, y: 4 } });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(OverworldResponse.parse(moved.json()).overworld.position).toEqual({ x: 14, y: 4 });

    const startedFight = await app.inject({
      method: "POST",
      url: `/api/profiles/${ada}/overworld/foundry/markers/foundry-loops/start`,
    });
    expect(startedFight.statusCode, startedFight.body).toBe(200);
    const { run } = RunResponse.parse(startedFight.json());

    await app.inject({
      method: "POST",
      url: `/api/profiles/${ada}/runs/${run.runId}/actions`,
      payload: { type: "cast", files: solutionFor(run.encounter?.challenge.id) },
    });

    const resolved = await app.inject({
      method: "POST",
      url: `/api/profiles/${ada}/overworld/foundry/markers/foundry-loops/resolve`,
      payload: { runId: run.runId },
    });
    expect(resolved.statusCode, resolved.body).toBe(200);
    const resolvedView = OverworldResponse.parse(resolved.json()).overworld;
    expect(resolvedView.markers.find((marker) => marker.id === "foundry-loops")?.state).toBe("cleared");
  });
});
