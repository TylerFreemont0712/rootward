import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner } from "@rootward/runners";
import type { ShardrunView } from "@rootward/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type GameContent, loadGameContent } from "../src/content.ts";
import { MEMORY, openDatabase } from "../src/db/database.ts";
import { ProfileService } from "../src/profiles/service.ts";
import { Sandbox } from "../src/sandbox.ts";
import { ShardrunService } from "../src/shardrun/service.ts";

// Shardrun (ADR-0012, ADR-0013) against the real content pack, with spells run in the real JavaScript sandbox.
const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const SLOW = { timeout: 60_000 };

let content: GameContent;
let sandbox: Sandbox;

beforeAll(async () => {
  content = await loadGameContent(rootDir);
  sandbox = new Sandbox(content.balance, [new WasmJsRunner({ warm: true })]);
});
afterAll(async () => {
  await sandbox.dispose();
});

async function character(using: GameContent = content) {
  const db = openDatabase(MEMORY);
  const service = new ShardrunService({
    db,
    content: using,
    sandbox,
    onBackgroundError: (error) => {
      throw error;
    },
  });
  const profile = await new ProfileService({ db }).create("Ada", "artificer");
  return { db, service, id: profile.id };
}

/** The real content with one shard's JavaScript replaced. */
function withJavascript(shardId: string, source: string): GameContent {
  const shard = content.index.shards.get(shardId);
  if (!shard) throw new Error(`no shard ${shardId}`);
  const shards = new Map(content.index.shards);
  shards.set(shardId, { ...shard, value: { ...shard.value, code: { ...shard.value.code, javascript: source } } });
  return { ...content, index: { ...content.index, shards } };
}

function openRoom(run: ShardrunView) {
  const node = run.map.nodes.find((candidate) => candidate.state === "open");
  if (!node) throw new Error("no open room on the map");
  return node;
}

async function firstFight(service: ShardrunService, id: string, difficulty = "beginner"): Promise<ShardrunView> {
  const run = await service.start(id, "javascript", difficulty);
  return service.command(id, { type: "enter", nodeId: openRoom(run).id });
}

const totalHp = (view: ShardrunView) => (view.battle?.foes ?? []).reduce((sum, foe) => sum + foe.hp, 0);

describe("ShardrunService", () => {
  it("offers the languages and difficulties it can run, and has no run until one starts", async () => {
    const { service, id } = await character();
    expect(await service.languages()).toEqual(["javascript"]);
    expect(service.difficulties().map((difficulty) => difficulty.id)).toEqual(["beginner", "programmer"]);
    expect(await service.latest(id)).toBeNull();
    await expect(service.start(id, "python", "beginner")).rejects.toThrow("cannot be played in python");
    await expect(service.start(id, "javascript", "nightmare")).rejects.toThrow("no nightmare difficulty");
  });

  it("starts on a layer map whose bottom row is open, with its foes shown in advance", async () => {
    const { service, id } = await character();
    const run = await service.start(id, "javascript", "beginner");
    expect(run.layer).toMatchObject({ index: 0, count: 3, name: "The Salvage" });
    const open = run.map.nodes.filter((node) => node.state === "open");
    expect(open.length).toBeGreaterThan(1);
    expect(open.every((node) => node.row === 0 && node.kind === "fight" && node.foes.length > 0)).toBe(true);
    expect(run.map.nodes.filter((node) => node.kind === "boss")).toHaveLength(1);
  });

  it("answers a command at once and serves previews, step by step, when they are ready", SLOW, async () => {
    const { service, id } = await character();
    const fight = await firstFight(service, id);
    expect(fight.status).toBe("battle");
    const previews = await service.previews(id);
    expect(previews.revision).toBe(fight.revision);
    expect(previews.spells["spell-1"]).toMatchObject({
      cost: 2,
      base: { bolts: [{ power: 4 }] },
      steps: [{ shard: "amplify", given: 1, returned: 1, bolts: [{ power: 7 }] }],
      result: { bolts: 1 },
    });
    expect(previews.spells["spell-2"]?.result).toMatchObject({ bolts: 1, block: 6, damage: 0 });
    expect(previews.spells["spell-3"]?.steps[0]).toMatchObject({ shard: "fork", returned: 2 });
    // Once the previews exist, the view carries them too.
    const again = await service.latest(id);
    expect(again?.previews).toBe("ready");
    expect(again?.shards.amplify?.summary).toBe("Adds 3 power to every bolt.");
  });

  it("casts exactly what the preview promised, and replays the cast step by step", SLOW, async () => {
    const { service, id } = await character();
    await firstFight(service, id);
    const { spells } = await service.previews(id);
    const before = await service.latest(id);
    const cast = await service.command(id, { type: "cast", spellId: "spell-1" });
    expect(cast.replay).toMatchObject({ spellId: "spell-1", run: { steps: [{ shard: "amplify" }] } });
    expect(cast.battle?.mana).toBe((before?.battle?.mana ?? 0) - (spells["spell-1"]?.cost ?? 0));
    expect(before && totalHp(before) - totalHp(cast)).toBe(spells["spell-1"]?.result?.damage);
    await expect(service.command(id, { type: "cast", spellId: "spell-1" })).rejects.toThrow("spent until your next turn");
    await expect(service.start(id, "javascript", "beginner")).rejects.toThrow("already underway");
    expect((await service.command(id, { type: "abandon" })).status).toBe("abandoned");
  });

  it("on Programmer, shows only code: no summaries and no predictions until a cast", SLOW, async () => {
    const { service, id } = await character();
    const fight = await firstFight(service, id, "programmer");
    expect(fight.difficulty).toMatchObject({ id: "programmer", showSummaries: false, showPredictions: false });
    expect(fight.shards.amplify?.summary).toBeUndefined();
    expect(fight.shards.amplify?.code).toContain("function amplify");
    const { spells } = await service.previews(id);
    expect(spells["spell-1"]).toMatchObject({ cost: 2, steps: [] });
    expect(spells["spell-1"]?.result).toBeUndefined();
    const cast = await service.command(id, { type: "cast", spellId: "spell-1" });
    expect(cast.replay?.run.result?.bolts).toBe(1);
  });

  it("names the shard and line of a spell whose code throws, and fizzles it for the base cost", SLOW, async () => {
    const source = "function amplify(bolts, battle) {\n  const extra = 3;\n  throw new Error(\"boom\");\n}";
    const { service, id } = await character(withJavascript("amplify", source));
    const fight = await firstFight(service, id);
    const { spells } = await service.previews(id);
    expect(spells["spell-1"]?.misfire).toMatchObject({ shard: "amplify" });
    expect(spells["spell-1"]?.misfire?.reason).toContain("boom");
    const cast = await service.command(id, { type: "cast", spellId: "spell-1" });
    expect(cast.log[0]?.kind).toBe("fizzle");
    expect(cast.battle?.mana).toBe((fight.battle?.manaMax ?? 0) - content.balance.shardrun.spell_base_cost);
  });

  it("contains a shard that never returns without losing the other spells' previews", SLOW, async () => {
    const { service, id } = await character(withJavascript("fork", "function fork(bolts, battle) { while (true) {} }"));
    await firstFight(service, id);
    const { spells } = await service.previews(id);
    expect(spells["spell-3"]?.misfire?.reason).toContain("ran out of time");
    expect(spells["spell-1"]?.misfire).toBeUndefined();
    expect(spells["spell-1"]?.result?.bolts).toBe(1);
  });

  it("carries the rules a run plays by, and what its relics changed", SLOW, async () => {
    const { service, id } = await character();
    const fight = await firstFight(service, id);
    expect(fight.rules).toMatchObject({ manaPerTurn: 6, baseBoltPower: 4, maxBolts: 16, weakMultiplier: 1.5 });
    const mana = fight.modifiers.find((modifier) => modifier.label === "Mana each turn");
    expect(mana).toEqual({ label: "Mana each turn", base: "6", now: "6", from: [] });
    const cast = await service.command(id, { type: "cast", spellId: "spell-1" });
    expect(cast.stats.casts).toBe(1);
    expect(cast.stats.manaSpent).toBeGreaterThan(0);
    expect(cast.stats.damageBySpell["spell-1"]).toBe(cast.stats.damage);
  });

  it("lists all content in the Codex, with where each thing is found", async () => {
    const { service } = await character();
    const codex = service.codex("javascript");
    expect(codex.shards.length).toBe(content.index.shards.size);
    expect(codex.relics.length).toBe(content.index.shardrunRelics.size);
    expect(codex.foes.length).toBe(content.index.shardrunFoes.size);
    expect(codex.layers.map((layer) => layer.id)).toEqual(["salvage", "heap", "kernel"]);

    const amplify = codex.shards.find((entry) => entry.shard.id === "amplify");
    expect(amplify?.shard.summary).toBe("Adds 3 power to every bolt.");
    expect(amplify?.shard.code).toContain("function amplify");
    expect(amplify?.found).toContain("fights");
    expect(amplify?.found).toContain("the Bolt spell you start with");
    // Upgrades are never offered as rewards; the forge is the only way to them.
    const plus = codex.shards.find((entry) => entry.shard.id === "amplify-plus");
    expect(plus?.draftable).toBe(false);
    expect(plus?.found).toEqual(["upgrading Amplify at a forge"]);

    const duck = codex.relics.find((entry) => entry.relic.id === "debugger-duck");
    expect(duck?.found).toEqual(["elites", "treasure rooms"]);
    const capacitor = codex.relics.find((entry) => entry.relic.id === "mana-capacitor");
    expect(capacitor?.found).toEqual(["guardians"]);

    const warden = codex.foes.find((entry) => entry.id === "kiln-warden");
    expect(warden?.layers).toEqual([{ id: "salvage", name: "The Salvage", role: "boss" }]);
    expect(warden?.trait?.name).toBe("Thick hide");
    expect(warden?.intents[0]?.text).toBe("Strike for 8");
    expect(codex.rules).toMatchObject({ manaPerTurn: 6, baseBoltPower: 4, weakMultiplier: 1.5 });
  });

  it("closes a run saved under older rules instead of failing on it", async () => {
    const { db, service, id } = await character();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO shardrun_runs (id, profile_id, status, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      "old-run",
      id,
      "map",
      JSON.stringify({ version: 1, status: "map" }),
      now,
      now,
    );
    expect(await service.latest(id)).toBeNull();
    expect((await service.start(id, "javascript", "beginner")).status).toBe("map");
  });
});
