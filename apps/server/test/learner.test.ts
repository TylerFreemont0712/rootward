import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner } from "@rootward/runners";
import { DebriefResponse, LearnerResponse, RunResponse, type RunView } from "@rootward/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { type GameContent, loadGameContent } from "../src/content.ts";
import { RunService } from "../src/runs/service.ts";
import { InMemoryEventStore } from "../src/runs/store.ts";
import { Sandbox } from "../src/sandbox.ts";

// The learner model through the API (ADR-0009): evidence from finished fights, hint prices, the debrief, and plans
// that build on what the player has shown.
const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const SLOW = { timeout: 120_000 };

let content: GameContent;
let sandbox: Sandbox;
const apps: FastifyInstance[] = [];

beforeAll(async () => {
  content = await loadGameContent(rootDir);
  sandbox = new Sandbox(content.balance, [new WasmJsRunner()]);
});

afterAll(async () => {
  for (const app of apps) await app.close();
  await sandbox.dispose();
});

/** A server with its own empty history. */
async function freshApp(): Promise<FastifyInstance> {
  const app = await buildApp({ service: new RunService({ content, sandbox, store: new InMemoryEventStore() }), sandbox });
  apps.push(app);
  return app;
}

async function send(app: FastifyInstance, method: "GET" | "POST", url: string, payload?: object): Promise<unknown> {
  const response = await app.inject(payload === undefined ? { method, url } : { method, url, payload });
  expect(response.statusCode, response.body).toBe(200);
  return response.json();
}

function solutionFor(run: RunView): Record<string, string> {
  const id = run.encounter?.challenge.id;
  const files = id === undefined ? undefined : content.index.challenges.get(id)?.solution.javascript;
  if (!files) throw new Error(`no JavaScript solution for ${id ?? "a run without an encounter"}`);
  return files;
}

async function learner(app: FastifyInstance) {
  return LearnerResponse.parse(await send(app, "GET", "/api/learner")).learner;
}

describe("the learner model through the API", () => {
  it("starts every Maintainer at 1.0.0 with nothing learned", async () => {
    const app = await freshApp();
    const view = await learner(app);
    expect(view).toMatchObject({ version: "1.0.0", fights: 0, dungeonsCleared: 0, weakSpots: [] });
    expect(view.nodes.find((node) => node.id === "py.basics.values")).toMatchObject({ mastery: 0, attempts: 0 });
  });

  it("records a won fight, and prices the next hint on that concept for someone who knows it", SLOW, async () => {
    const app = await freshApp();
    const practice = async () =>
      RunResponse.parse(
        await send(app, "POST", "/api/encounters", { challengeId: "foundry.py.dict-word-count", language: "javascript" }),
      ).run;
    const first = await practice();
    // Hint 1 costs 20 Cycles, halved for a concept at mastery 0 (balance.yaml).
    expect(first.encounter?.hints.nextCost).toBe(10);
    await send(app, "POST", `/api/runs/${first.runId}/actions`, { type: "cast", files: solutionFor(first) });

    const view = await learner(app);
    expect(view).toMatchObject({ version: "1.0.1", fights: 1 });
    // Played in JavaScript, the Python-tagged fight counts for the shared concepts.
    expect(view.nodes.find((node) => node.id === "concept.mappings")).toMatchObject({ mastery: 3, wins: 1 });
    expect(view.nodes.find((node) => node.id === "py.collections.dict")).toMatchObject({ mastery: 0 });

    const second = await practice();
    expect(second.encounter?.hints.nextCost).toBe(25);
  });

  it("debriefs a completed expedition and plans the next one from what was learned", SLOW, async () => {
    const app = await freshApp();
    const start = async (seed: string) =>
      RunResponse.parse(await send(app, "POST", "/api/expeditions", { language: "javascript", length: "short", seed })).run;
    const firstFloor = (run: RunView) =>
      run.expedition?.rooms.filter((room) => room.floor === 0).map((room) => room.details?.concept);

    let run = await start("learning-1");
    expect(firstFloor(run)).toEqual(["concept.values"]);
    while (run.status === "active") {
      const room = run.expedition?.rooms.find((candidate) => candidate.state === "open");
      if (!room) throw new Error("the expedition has no open room");
      run = RunResponse.parse(await send(app, "POST", `/api/runs/${run.runId}/rooms`, { roomId: room.id })).run;
      run = RunResponse.parse(await send(app, "POST", `/api/runs/${run.runId}/actions`, { type: "cast", files: solutionFor(run) })).run;
    }
    expect(run.endReason).toBe("completed");

    const { debrief } = DebriefResponse.parse(await send(app, "GET", `/api/runs/${run.runId}/debrief`));
    expect(debrief).toMatchObject({ endReason: "completed", roomsCleared: debrief.floors, versionBefore: "1.0.0", versionAfter: "1.1.0" });
    expect(debrief.fights.every((fight) => fight.outcome === "won")).toBe(true);
    expect(debrief.concepts.find((concept) => concept.id === "concept.values")).toMatchObject({ masteryBefore: 0, masteryAfter: 3 });

    const next = await start("learning-2");
    const nextConcept = firstFloor(next)?.[0];
    expect(nextConcept).toBeDefined();
    expect(nextConcept).not.toBe("concept.values");
    expect(debrief.nextUp.map((node) => node.id)).toContain(nextConcept);
  });
});
