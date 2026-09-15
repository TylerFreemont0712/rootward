import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner } from "@rootward/runners";
import { beforeAll, describe, expect, it } from "vitest";
import { type GameContent, loadGameContent } from "../src/content.ts";
import { MEMORY, openDatabase } from "../src/db/database.ts";
import { OverworldService } from "../src/overworld/service.ts";
import { ProfileService } from "../src/profiles/service.ts";
import { RunServiceRegistry } from "../src/runs/registry.ts";
import { Sandbox } from "../src/sandbox.ts";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const SLOW = { timeout: 60_000 };

let content: GameContent;
let sandbox: Sandbox;

beforeAll(async () => {
  content = await loadGameContent(rootDir);
  sandbox = new Sandbox(content.balance, [new WasmJsRunner()]);
});

function makeOverworld() {
  const db = openDatabase(MEMORY);
  const profiles = new ProfileService({ db });
  const registry = new RunServiceRegistry({ content, sandbox, db });
  const overworld = new OverworldService({ db, content, registry });
  return { profiles, registry, overworld };
}

describe("OverworldService", () => {
  it("reports availability from the zone catalog: foundry has a zone, most realms do not", () => {
    const { overworld } = makeOverworld();
    const realms = overworld.realms();
    expect(realms.find((r) => r.id === "foundry")).toMatchObject({ available: true });
    expect(realms.filter((r) => !r.available).length).toBeGreaterThan(0);
  });

  it("enters a zone at its entry point, with every marker open", async () => {
    const { profiles, overworld } = makeOverworld();
    const ada = await profiles.create("Ada", "artificer");
    const view = await overworld.enter(ada.id, "foundry", "javascript");
    expect(view.position).toEqual(view.entry);
    expect(view.markers.length).toBeGreaterThan(0);
    expect(view.markers.every((m) => m.state === "open")).toBe(true);
    expect(view.markers.some((m) => m.kind === "boss")).toBe(true);
  });

  it("refuses to enter a realm with no zone", async () => {
    const { profiles, overworld } = makeOverworld();
    const ada = await profiles.create("Ada", "artificer");
    await expect(overworld.enter(ada.id, "grove", "javascript")).rejects.toThrow("no overworld zone");
  });

  it("persists movement across a fresh view() call (the resume-after-restart proof)", async () => {
    const { profiles, overworld } = makeOverworld();
    const ada = await profiles.create("Ada", "artificer");
    await overworld.enter(ada.id, "foundry", "javascript");
    await overworld.move(ada.id, "foundry", 14, 4);
    const view = await overworld.view(ada.id, "foundry");
    expect(view?.position).toEqual({ x: 14, y: 4 });
  });

  it("refuses to move onto a wall", async () => {
    const { profiles, overworld } = makeOverworld();
    const ada = await profiles.create("Ada", "artificer");
    await overworld.enter(ada.id, "foundry", "javascript");
    await expect(overworld.move(ada.id, "foundry", 0, 0)).rejects.toThrow("not walkable");
  });

  it("winning a marker's fight clears it; abandoning leaves it open to retry", SLOW, async () => {
    const { profiles, registry, overworld } = makeOverworld();
    const ada = await profiles.create("Ada", "artificer");
    await overworld.enter(ada.id, "foundry", "javascript");
    const runService = registry.forProfile(ada.id);

    const lost = await overworld.startMarkerEncounter(ada.id, "foundry", "foundry-loops");
    await runService.act(lost.run.runId, { type: "abandon" });
    const afterLoss = await overworld.resolveMarkerEncounter(ada.id, "foundry", "foundry-loops", lost.run.runId);
    expect(afterLoss.markers.find((m) => m.id === "foundry-loops")?.state).toBe("open");

    const won = await overworld.startMarkerEncounter(ada.id, "foundry", "foundry-loops");
    const challengeId = won.run.encounter?.challenge.id;
    if (!challengeId) throw new Error("marker did not start a fight");
    const files = content.index.challenges.get(challengeId)?.solution.javascript;
    if (!files) throw new Error(`no javascript solution for ${challengeId}`);

    const cast = await runService.act(won.run.runId, { type: "cast", files });
    expect(cast.run.encounter?.status).toBe("won");

    const afterWin = await overworld.resolveMarkerEncounter(ada.id, "foundry", "foundry-loops", won.run.runId);
    expect(afterWin.markers.find((m) => m.id === "foundry-loops")?.state).toBe("cleared");
  });

  it("starts the boss marker's fight with the boss's own challenge", SLOW, async () => {
    const { profiles, overworld } = makeOverworld();
    const ada = await profiles.create("Ada", "artificer");
    await overworld.enter(ada.id, "foundry", "javascript");
    const started = await overworld.startMarkerEncounter(ada.id, "foundry", "foundry-kiln-warden");
    expect(started.run.encounter?.challenge.id).toBe("foundry.py.kiln-warden");
    expect(started.run.encounter?.enemy.name).toBe("Kiln Warden");
  });
});
