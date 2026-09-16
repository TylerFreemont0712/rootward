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

async function character(using: GameContent = content, dev = false) {
  const db = openDatabase(MEMORY);
  const service = new ShardrunService({
    db,
    content: using,
    sandbox,
    dev,
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
  shards.set(shardId, {
    ...shard,
    value: { ...shard.value, code: { ...shard.value.code, javascript: source } },
  });
  return { ...content, index: { ...content.index, shards } };
}

function openRoom(run: ShardrunView) {
  const node = run.map.nodes.find((candidate) => candidate.state === "open");
  if (!node) throw new Error("no open room on the map");
  return node;
}

async function firstFight(
  service: ShardrunService,
  id: string,
  difficulty = "beginner",
): Promise<ShardrunView> {
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
    await expect(service.command(id, { type: "cast", spellId: "spell-1" })).rejects.toThrow(
      "spent until your next turn",
    );
    await expect(service.start(id, "javascript", "beginner")).rejects.toThrow("already underway");
    expect((await service.command(id, { type: "abandon" })).status).toBe("abandoned");
  });

  it("on Programmer, shows only code: no summaries and no predictions until a cast", SLOW, async () => {
    const { service, id } = await character();
    const fight = await firstFight(service, id, "programmer");
    expect(fight.difficulty).toMatchObject({
      id: "programmer",
      showSummaries: false,
      showPredictions: false,
    });
    expect(fight.shards.amplify?.summary).toBeUndefined();
    expect(fight.shards.amplify?.code).toContain("function amplify");
    const { spells } = await service.previews(id);
    expect(spells["spell-1"]).toMatchObject({ cost: 2, steps: [] });
    expect(spells["spell-1"]?.result).toBeUndefined();
    const cast = await service.command(id, { type: "cast", spellId: "spell-1" });
    expect(cast.replay?.run.result?.bolts).toBe(1);
  });

  it(
    "names the shard and line of a spell whose code throws, and fizzles it for the base cost",
    SLOW,
    async () => {
      const source = 'function amplify(bolts, battle) {\n  const extra = 3;\n  throw new Error("boom");\n}';
      const { service, id } = await character(withJavascript("amplify", source));
      const fight = await firstFight(service, id);
      const { spells } = await service.previews(id);
      expect(spells["spell-1"]?.misfire).toMatchObject({ shard: "amplify" });
      expect(spells["spell-1"]?.misfire?.reason).toContain("boom");
      const cast = await service.command(id, { type: "cast", spellId: "spell-1" });
      expect(cast.log[0]?.kind).toBe("fizzle");
      expect(cast.battle?.mana).toBe((fight.battle?.manaMax ?? 0) - content.balance.shardrun.spell_base_cost);
    },
  );

  it("contains a shard that never returns without losing the other spells' previews", SLOW, async () => {
    const { service, id } = await character(
      withJavascript("fork", "function fork(bolts, battle) { while (true) {} }"),
    );
    await firstFight(service, id);
    const { spells } = await service.previews(id);
    expect(spells["spell-3"]?.misfire?.reason).toContain("ran out of time");
    expect(spells["spell-1"]?.misfire).toBeUndefined();
    expect(spells["spell-1"]?.result?.bolts).toBe(1);
  });

  it("carries the rules a run plays by, and what its relics changed", SLOW, async () => {
    const { service, id } = await character();
    const fight = await firstFight(service, id);
    expect(fight.rules).toMatchObject({
      manaPerTurn: 6,
      baseBoltPower: 4,
      maxBolts: 16,
      weakMultiplier: 1.5,
    });
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

  it("keeps the dev sandbox behind both the server flag and the run's own mark", SLOW, async () => {
    const plain = await character();
    expect(plain.service.devEnabled()).toBe(false);
    // Without ROOTWARD_DEV there is no way in at all: not a sandbox run, and not a single dev command.
    await expect(plain.service.start(plain.id, "javascript", "beginner", true)).rejects.toThrow(
      "ROOTWARD_DEV=1",
    );
    expect((await plain.service.start(plain.id, "javascript", "beginner")).sandbox).toBe(false);
    await expect(
      plain.service.dev(plain.id, { type: "grant-relic", relicId: "debugger-duck" }),
    ).rejects.toThrow("ROOTWARD_DEV=1");

    // With the flag, an ordinary run is still an ordinary run.
    const devd = await character(content, true);
    expect(devd.service.devEnabled()).toBe(true);
    expect((await devd.service.start(devd.id, "javascript", "beginner")).sandbox).toBe(false);
    await expect(
      devd.service.dev(devd.id, { type: "grant-relic", relicId: "debugger-duck" }),
    ).rejects.toThrow("sandbox run");
    await devd.service.command(devd.id, { type: "abandon" });

    const box = await devd.service.start(devd.id, "javascript", "beginner", true);
    expect(box.sandbox).toBe(true);
    const granted = await devd.service.dev(devd.id, { type: "grant-relic", relicId: "debugger-duck" });
    expect(granted.relics).toContain("debugger-duck");
    const spawned = await devd.service.dev(devd.id, { type: "spawn", kind: "elite", foes: ["kiln-warden"] });
    expect(spawned.status).toBe("battle");
    expect(spawned.battle?.foes[0]?.name).toBe("Kiln Warden");
    // A spawned fight is a real fight: its spells are previewed in the sandbox like any other.
    expect((await devd.service.previews(devd.id)).spells["spell-1"]?.cost).toBeGreaterThan(0);
  });

  it(
    "bills a wide quadratic build on a curve, and a ledger relic makes it payable (ADR-0015)",
    SLOW,
    async () => {
      // The whole point of ADR-0015, measured through the real service and the real sandbox: eight slots of found code
      // that hands 128 bolts to a shard comparing every pair, priced first amortized and then logarithmically.
      const devd = await character(content, true);
      await devd.service.start(devd.id, "javascript", "beginner", true);
      const granted = await devd.service.dev(devd.id, { type: "grant-spell", name: "Cascade", capacity: 8 });
      const spellId = granted.spells.at(-1)?.id ?? "";
      const build = ["echo", "echo", "echo", "echo", "echo", "echo", "echo", "crosslink"];
      let held = granted;
      for (const shardId of build) {
        held = await devd.service.dev(devd.id, { type: "grant-shard", shardId });
      }
      // Arranging is all-or-nothing and conserves shards: every spell is listed, and the rest stay in the inventory.
      const spare = [...held.inventory];
      for (const shardId of build) spare.splice(spare.indexOf(shardId), 1);
      await devd.service.command(devd.id, {
        type: "arrange",
        spells: held.spells.map((spell) => ({
          id: spell.id,
          shards: spell.id === spellId ? build : spell.shards,
        })),
        inventory: spare,
      });
      const spawned = await devd.service.dev(devd.id, { type: "spawn", kind: "boss", foes: ["root-daemon"] });
      const bossHp = totalHp(spawned);

      const { spells } = await devd.service.previews(devd.id);
      const wide = spells[spellId];
      // Seven doublings hand 1 + 2 + ... + 64 bolts to Echo, and 128 to Crosslink, which pays the square of them.
      const work = (wide?.steps ?? []).reduce((sum, step) => sum + step.work, 0);
      expect(work).toBe(127 + 128 * 128);
      // The bill is that work plus the 16 mana of shard cost priced as work (8 units each), amortized: √(16 639/8) = 45.
      expect(wide?.cost).toBe(1 + 45);

      await devd.service.dev(devd.id, { type: "grant-relic", relicId: "amortized-ledger" });
      const billed = (await devd.service.previews(devd.id)).spells[spellId];
      // The same measured pipeline, now billed log2(16 639/8 + 1) = 11. Nothing about the bolts changed.
      expect(billed?.cost).toBe(1 + 11);
      expect(billed?.result?.bolts).toBe(wide?.result?.bolts);

      // And it can actually be cast, which is what all of this was for.
      const funded = await devd.service.dev(devd.id, { type: "set", mana: 30 });
      expect(funded.battle?.mana).toBe(30);
      const cast = await devd.service.command(devd.id, { type: "cast", spellId });
      expect(cast.stats.damage).toBe(billed?.result?.damage);
      // Only the first 16 bolts land on the opening layer; the other 112 fizzle.
      expect(cast.stats.bolts).toBe(16);
      expect(cast.stats.fizzled).toBe(112);
      // One cast of found code kills the last layer's guardian outright: damage *dealt* is capped by its HP.
      expect(cast.stats.damage).toBe(bossHp);
      expect(cast.battle).toBeUndefined();
      // And the run records what the volley was actually worth, which is the whole point of ADR-0016: sixteen bolts
      // of 4 power at x128, halved because the Root Daemon resists plain bolts - a resistance is real mitigation and
      // potential keeps it. It is still twenty-four times what the guardian could absorb, and without this number
      // every build past the first lethal one reads as exactly 170.
      expect(cast.stats.bestCast).toBe(16 * 4 * 128 * 0.5);
      expect(cast.stats.bestCast).toBeGreaterThan(bossHp * 20);
      expect(billed?.result?.potential).toBe(cast.stats.bestCast);
    },
  );

  it("makes the build ADR-0014 could not afford castable on the first layer", SLOW, async () => {
    // ADR-0014 measured `echo x4 -> amplify-plus x2 -> charge -> resonate` at 23 mana against an income of 6: it
    // compounded and could not be cast. The same eight shards, under one bill on a curve, are the check on ADR-0015.
    const devd = await character(content, true);
    await devd.service.start(devd.id, "javascript", "beginner", true);
    const granted = await devd.service.dev(devd.id, { type: "grant-spell", name: "Cascade", capacity: 8 });
    const spellId = granted.spells.at(-1)?.id ?? "";
    const build = ["echo", "echo", "echo", "echo", "amplify-plus", "amplify-plus", "charge", "resonate"];
    let held = granted;
    for (const shardId of build) {
      held = await devd.service.dev(devd.id, { type: "grant-shard", shardId });
    }
    const spare = [...held.inventory];
    for (const shardId of build) spare.splice(spare.indexOf(shardId), 1);
    await devd.service.command(devd.id, {
      type: "arrange",
      spells: held.spells.map((spell) => ({
        id: spell.id,
        shards: spell.id === spellId ? build : spell.shards,
      })),
      inventory: spare,
    });
    const fight = await devd.service.dev(devd.id, { type: "spawn", kind: "fight", foes: ["tally-wisp"] });

    const wide = (await devd.service.previews(devd.id)).spells[spellId];
    // 79 units of complexity plus 13 mana of shard cost at 8 units each: 183, amortized to 4, plus the base.
    expect((wide?.steps ?? []).reduce((sum, step) => sum + step.work, 0)).toBe(79);
    expect(wide?.cost).toBe(5);
    expect(wide?.cost).toBeLessThanOrEqual(fight.battle?.mana ?? 0);
    expect(wide?.affordable).toBe(true);
  });

  it("closes a run saved under older rules instead of failing on it", async () => {
    const { db, service, id } = await character();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO shardrun_runs (id, profile_id, status, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("old-run", id, "map", JSON.stringify({ version: 1, status: "map" }), now, now);
    expect(await service.latest(id)).toBeNull();
    expect((await service.start(id, "javascript", "beginner")).status).toBe("map");
  });
});
