import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner } from "@rootward/runners";
import type { ShardrunView } from "@rootward/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type GameContent, loadGameContent } from "../src/content.ts";
import { MEMORY, openDatabase } from "../src/db/database.ts";
import { ProfileService } from "../src/profiles/service.ts";
import { Sandbox } from "../src/sandbox.ts";
import { ShardrunService } from "../src/shardrun/service.ts";

// Shardrun (ADR-0012) against the real content pack, with spells run in the real JavaScript sandbox.
const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const SLOW = { timeout: 60_000 };

let content: GameContent;
let sandbox: Sandbox;

beforeAll(async () => {
  content = await loadGameContent(rootDir);
  sandbox = new Sandbox(content.balance, [new WasmJsRunner()]);
});

async function character(using: GameContent = content) {
  const db = openDatabase(MEMORY);
  const service = new ShardrunService({ db, content: using, sandbox });
  const profile = await new ProfileService({ db }).create("Ada", "artificer");
  return { service, id: profile.id };
}

/** The real content with one shard's JavaScript replaced. */
function withJavascript(shardId: string, source: string): GameContent {
  const shard = content.index.shards.get(shardId);
  if (!shard) throw new Error(`no shard ${shardId}`);
  const shards = new Map(content.index.shards);
  shards.set(shardId, { ...shard, value: { ...shard.value, code: { ...shard.value.code, javascript: source } } });
  return { ...content, index: { ...content.index, shards } };
}

async function firstFight(service: ShardrunService, id: string): Promise<ShardrunView> {
  const run = await service.start(id, "javascript");
  const node = run.floors[0]?.[0];
  if (!node) throw new Error("the first floor has no room");
  return service.command(id, { type: "enter", nodeId: node.id });
}

const totalHp = (view: ShardrunView) => (view.battle?.foes ?? []).reduce((sum, foe) => sum + foe.hp, 0);

describe("ShardrunService", () => {
  it("offers the languages this machine can run, and has no run until one starts", async () => {
    const { service, id } = await character();
    expect(await service.languages()).toEqual(["javascript"]);
    expect(await service.latest(id)).toBeNull();
    await expect(service.start(id, "python")).rejects.toThrow("cannot be played in python");
  });

  it("previews every spell from a real run of its shards", SLOW, async () => {
    const { service, id } = await character();
    const run = await service.start(id, "javascript");
    expect(run.status).toBe("map");
    expect(run.floors[0]?.[0]).toMatchObject({ state: "open" });
    expect(run.floors[0]?.[0]?.foes.length).toBeGreaterThan(0);

    const fight = await service.command(id, { type: "enter", nodeId: run.floors[0]?.[0]?.id ?? "" });
    expect(fight.status).toBe("battle");
    const [bolt, ward, fork] = fight.spells;
    expect(bolt?.preview).toMatchObject({ cost: 2, bolts: 1, trace: [{ shard: "amplify", given: 1, returned: 1 }] });
    expect(ward?.preview).toMatchObject({ bolts: 1, block: 6, damage: 0 });
    expect(fork?.preview).toMatchObject({ bolts: 2 });
    expect(fight.shards.amplify).toMatchObject({ function: "amplify", forge: { into: "amplify-plus" } });
  });

  it("casts exactly what the preview promised, once per turn, with one run at a time", SLOW, async () => {
    const { service, id } = await character();
    const fight = await firstFight(service, id);
    const preview = fight.spells[1]?.preview;
    if (!preview) throw new Error("no preview for Ward");
    const cast = await service.command(id, { type: "cast", spellId: "spell-2" });
    expect(cast.battle).toMatchObject({ mana: (fight.battle?.manaMax ?? 0) - preview.cost, block: preview.block });
    expect(cast.log[0]).toMatchObject({ kind: "cast", amount: preview.cost });
    await expect(service.command(id, { type: "cast", spellId: "spell-2" })).rejects.toThrow("spent until your next turn");
    await expect(service.start(id, "javascript")).rejects.toThrow("already underway");

    const struck = fight.spells[0]?.preview;
    const hit = await service.command(id, { type: "cast", spellId: "spell-1" });
    expect(totalHp(cast) - totalHp(hit)).toBe(struck?.damage);

    const abandoned = await service.command(id, { type: "abandon" });
    expect(abandoned.status).toBe("abandoned");
    expect((await service.start(id, "javascript")).status).toBe("map");
  });

  it("fizzles a spell whose code throws, charging only the base cost", SLOW, async () => {
    const { service, id } = await character(withJavascript("amplify", 'function amplify(bolts, battle) { throw new Error("boom"); }'));
    const fight = await firstFight(service, id);
    expect(fight.spells[0]?.preview?.misfire).toContain("boom");
    const cast = await service.command(id, { type: "cast", spellId: "spell-1" });
    expect(cast.log[0]?.kind).toBe("fizzle");
    expect(cast.battle?.mana).toBe((fight.battle?.manaMax ?? 0) - content.balance.shardrun.spell_base_cost);
  });

  it("contains a shard that never returns: the spell times out and the run carries on", SLOW, async () => {
    const { service, id } = await character(withJavascript("fork", "function fork(bolts, battle) { while (true) {} }"));
    const fight = await firstFight(service, id);
    expect(fight.spells[2]?.preview?.misfire).toContain("ran out of time");
    expect(fight.spells[0]?.preview?.misfire).toBeUndefined();
  });
});
