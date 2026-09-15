import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner } from "@rootward/runners";
import { beforeAll, describe, expect, it } from "vitest";
import { type GameContent, loadGameContent } from "../src/content.ts";
import { MEMORY, openDatabase } from "../src/db/database.ts";
import { ProfileService } from "../src/profiles/service.ts";
import { RunServiceRegistry } from "../src/runs/registry.ts";
import { Sandbox } from "../src/sandbox.ts";
import { WorldService } from "../src/world/service.ts";

// The world (ADR-0011) against the real content pack: the Bastion, the Foundry, and the quests that join them.
const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const SLOW = { timeout: 60_000 };

let content: GameContent;
let sandbox: Sandbox;

beforeAll(async () => {
  content = await loadGameContent(rootDir);
  sandbox = new Sandbox(content.balance, [new WasmJsRunner()]);
});

async function arrive(name: string) {
  const db = openDatabase(MEMORY);
  const registry = new RunServiceRegistry({ content, sandbox, db });
  const world = new WorldService({ db, content, registry });
  const profile = await new ProfileService({ db }).create(name, "artificer");
  return { db, registry, world, id: profile.id };
}

/** Walk up to Guildmaster Orin and swear in, the way the Bastion expects a new Maintainer to start. */
async function swearIn(world: WorldService, id: string) {
  await world.move(id, { x: 22, y: 9 });
  const opened = await world.talk(id, "guildmaster");
  const swear = opened.conversation?.choices.find((choice) => choice.text.startsWith("I swear"));
  if (!opened.conversation?.nodeId || !swear) throw new Error("the Guildmaster did not offer the oath");
  return world.choose(id, { npcId: "guildmaster", nodeId: opened.conversation.nodeId, choice: swear.index });
}

function solutionFor(challengeId: string | undefined): Record<string, string> {
  const files = challengeId === undefined ? undefined : content.index.challenges.get(challengeId)?.solution.javascript;
  if (!files) throw new Error(`no javascript solution for ${challengeId ?? "a run without an encounter"}`);
  return files;
}

describe("WorldService", () => {
  it("has no world for a character until they arrive, then starts them at the Bastion's entry", async () => {
    const { world, id } = await arrive("Ada");
    expect(await world.world(id)).toBeUndefined();
    const view = await world.start(id, "javascript");
    expect(view.zone.id).toBe("bastion");
    expect(view.position).toEqual({ x: 19, y: 17 });
    expect(view.language).toBe("javascript");
    expect(view.quests).toEqual([]);
    // Arriving again only changes the language; the character stays where they are.
    await world.move(id, { x: 20, y: 17 });
    const again = await world.start(id, "python");
    expect(again).toMatchObject({ language: "python", position: { x: 20, y: 17 } });
  });

  it("refuses walls, unreachable tiles, and talking from across the square", async () => {
    const { world, id } = await arrive("Ada");
    await world.start(id, "javascript");
    await expect(world.move(id, { x: 0, y: 0 })).rejects.toThrow("not walkable");
    await expect(world.talk(id, "guildmaster")).rejects.toThrow("Walk up to Guildmaster Orin first");
    await expect(world.talk(id, "nobody")).rejects.toThrow("Nobody called nobody");
  });

  it("starts a quest through Lint, shows it in the journal, and puts a ! over whoever can give one", async () => {
    const { world, id } = await arrive("Ada");
    const arrived = await world.start(id, "javascript");
    expect(arrived.zone.npcs.find((npc) => npc.id === "lint")?.indicator).toBe("offer");

    await world.move(id, { x: 20, y: 17 });
    const opened = await world.talk(id, "lint");
    expect(opened.conversation).toMatchObject({ npcId: "lint", nodeId: "first-meeting", speakerName: "Lint", portrait: "lint" });
    const start = opened.conversation?.choices.find((choice) => choice.text === "Where do I start?");
    if (!start) throw new Error("Lint did not offer to start");

    const chosen = await world.choose(id, { npcId: "lint", nodeId: "first-meeting", choice: start.index });
    expect(chosen.notices).toEqual(["Quest started: Report to the Guild"]);
    expect(chosen.conversation?.nodeId).toBe("go-north");
    expect(chosen.world.quests).toMatchObject([{ id: "report-to-the-guild", status: "active", objectives: [{ done: false }] }]);
    expect(chosen.world.zone.npcs.find((npc) => npc.id === "lint")?.indicator).toBeUndefined();

    // The same choice is gone now that the quest has started.
    await expect(world.choose(id, { npcId: "lint", nodeId: "first-meeting", choice: start.index })).rejects.toThrow("not offering");
  });

  it("keeps the south gate locked until the Maintainer is sworn in, then travels to the Foundry", async () => {
    const { world, id } = await arrive("Ada");
    await world.start(id, "javascript");
    await world.move(id, { x: 19, y: 29 });
    const locked = await world.travel(id, "to-foundry");
    expect(locked.world.zone.id).toBe("bastion");
    expect(locked.conversation?.text).toContain("Sworn Maintainers only");

    const sworn = await swearIn(world, id);
    expect(sworn.conversation?.nodeId).toBe("sworn");
    expect(sworn.world.zone.portals.find((portal) => portal.id === "to-foundry")?.locked).toBe(false);

    await world.move(id, { x: 19, y: 29 });
    const travelled = await world.travel(id, "to-foundry");
    expect(travelled.world.zone.id).toBe("foundry");
    expect(travelled.world.position).toEqual({ x: 21, y: 2 });
    expect((await world.world(id))?.zone.id).toBe("foundry");
  });

  it("opens screens from doors without changing any state", async () => {
    const { world, id } = await arrive("Ada");
    await world.start(id, "javascript");
    await world.move(id, { x: 19, y: 8 });
    const door = await world.inspect(id, "guild-hall-door");
    expect(door).toMatchObject({ open: "guild-board", notices: [], conversation: { speakerName: "Guild Hall" } });
  });

  it("clears a marker only with a win of that marker's own fight, and keeps the kiln boss sealed", SLOW, async () => {
    const { world, registry, id } = await arrive("Ada");
    await world.start(id, "javascript");
    await swearIn(world, id);
    await world.move(id, { x: 19, y: 29 });
    await world.travel(id, "to-foundry");

    // Behind the closed kiln gate: sealed, and not reachable on foot either.
    await expect(world.startMarkerEncounter(id, "foundry-kiln-warden")).rejects.toThrow("sealed");
    await expect(world.move(id, { x: 22, y: 26 })).rejects.toThrow("cannot be reached");

    await world.move(id, { x: 11, y: 4 });
    const { run } = await world.startMarkerEncounter(id, "foundry-values");
    const runs = registry.forProfile(id);
    await runs.act(run.runId, { type: "cast", files: solutionFor(run.encounter?.challenge.id) });

    await expect(world.resolveMarkerEncounter(id, "foundry-loops", run.runId)).rejects.toThrow("not this marker's fight");
    const resolved = await world.resolveMarkerEncounter(id, "foundry-values", run.runId);
    expect(resolved.zone.markers.find((marker) => marker.id === "foundry-values")?.state).toBe("cleared");
    expect(resolved.zone.markers.find((marker) => marker.id === "foundry-kiln-warden")?.state).toBe("sealed");
  });

  it("hands in The Foundry Cools once three fights are cleared, which opens the kiln gate", async () => {
    const { db, world, id } = await arrive("Ada");
    await world.start(id, "javascript");
    const sworn = await swearIn(world, id);
    const work = sworn.conversation?.choices.find((choice) => choice.text === "Is there work in the Foundry?");
    if (!work) throw new Error("no work offered");
    const offer = await world.choose(id, { npcId: "guildmaster", nodeId: "sworn", choice: work.index });
    const accept = offer.conversation?.choices.find((choice) => choice.text === "I will clear three fights.");
    if (!accept) throw new Error("no quest offered");
    const accepted = await world.choose(id, { npcId: "guildmaster", nodeId: "first-task", choice: accept.index });
    expect(accepted.world.quests[0]).toMatchObject({ id: "the-foundry-cools", status: "active", objectives: [{ current: 0, target: 3 }] });

    // Three wins in the Foundry, recorded the way resolveMarkerEncounter records them.
    db.prepare(
      "INSERT INTO zone_progress (profile_id, zone_id, language, pos_x, pos_y, cleared, updated_at) VALUES (?, 'foundry', 'javascript', 21, 2, ?, 'now')",
    ).run(id, JSON.stringify(["foundry-values", "foundry-variables", "foundry-loops"]));

    const ready = await world.world(id);
    expect(ready?.quests[0]).toMatchObject({ status: "ready", objectives: [{ done: true, current: 3 }] });
    expect(ready?.zone.npcs.find((npc) => npc.id === "guildmaster")?.indicator).toBe("turn-in");

    const turnIn = await world.talk(id, "guildmaster");
    expect(turnIn.conversation?.nodeId).toBe("cools-done");
    const handIn = await world.choose(id, { npcId: "guildmaster", nodeId: "cools-done", choice: 0 });
    expect(handIn.notices).toEqual(["Quest complete: The Foundry Cools"]);
    expect(handIn.conversation?.nodeId).toBe("warden-offer");
    expect(handIn.world.quests.find((quest) => quest.id === "the-foundry-cools")).toMatchObject({ status: "done" });

    await world.move(id, { x: 19, y: 29 });
    const foundry = (await world.travel(id, "to-foundry")).world.zone;
    expect(foundry.markers.find((marker) => marker.id === "foundry-kiln-warden")?.state).toBe("open");
    expect(foundry.props.some((prop) => prop.propId === "kiln-arch")).toBe(true);
    expect(foundry.props.some((prop) => prop.propId === "kiln-gate")).toBe(false);
    expect(foundry.npcs.find((npc) => npc.id === "pell")?.indicator).toBe("offer");
  });
});
