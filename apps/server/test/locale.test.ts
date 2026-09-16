import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner } from "@rootward/runners";
import { LOCALE_HEADER } from "@rootward/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { type GameContent, loadGameContent, withLocale } from "../src/content.ts";
import { MEMORY, openDatabase } from "../src/db/database.ts";
import { ProfileService } from "../src/profiles/service.ts";
import { RunServiceRegistry } from "../src/runs/registry.ts";
import { RunService } from "../src/runs/service.ts";
import { InMemoryEventStore } from "../src/runs/store.ts";
import { Sandbox } from "../src/sandbox.ts";
import { ShardrunService } from "../src/shardrun/service.ts";
import { WorldService } from "../src/world/service.ts";

// Content localization end to end (ADR-0018): the header a client sends decides the language of what the server
// builds, without any route or service taking a locale argument.
const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");

let content: GameContent;
let sandbox: Sandbox;

beforeAll(async () => {
  content = await loadGameContent(rootDir);
  sandbox = new Sandbox(content.balance, [new WasmJsRunner({ warm: true })]);
});
afterAll(async () => {
  await sandbox.dispose();
});

async function server() {
  const db = openDatabase(MEMORY);
  const registry = new RunServiceRegistry({ content, sandbox, db });
  const shardrun = new ShardrunService({ db, content, sandbox });
  const app = await buildApp({
    service: new RunService({ content, sandbox, store: new InMemoryEventStore() }),
    sandbox,
    profiles: {
      profileService: new ProfileService({ db }),
      registry,
      world: new WorldService({ db, content, registry }),
      content,
      shardrun,
    },
  });
  return { app, db };
}

describe("the locale of a request", () => {
  it("is English when nothing asks for anything else", () => {
    expect(content.index.shards.get("compound")?.value.name).toBe("Compound");
    expect(content.locales).toContain("ja");
  });

  it("changes what content.index answers, and only inside the request", () => {
    withLocale("ja", () => {
      expect(content.index.shards.get("compound")?.value.name).toBe("複利");
    });
    expect(content.index.shards.get("compound")?.value.name).toBe("Compound");
  });

  it("falls back to English for a locale nothing has translated", () => {
    withLocale("de", () => {
      expect(content.index.shards.get("compound")?.value.name).toBe("Compound");
    });
  });

  it("reaches the Codex through the header, prose and all", async () => {
    const { app, db } = await server();
    const codex = async (locale?: string) => {
      const response = await app.inject({
        method: "GET",
        url: "/api/shardrun/codex?language=javascript",
        headers: locale === undefined ? {} : { [LOCALE_HEADER]: locale },
      });
      expect(response.statusCode).toBe(200);
      return response.json<{
        shards: { shard: { id: string; name: string; summary?: string }; found: string[] }[];
        foes: { id: string; name: string; trait?: { name: string } }[];
      }>();
    };

    const english = await codex();
    const japanese = await codex("ja");
    const pick = (body: Awaited<ReturnType<typeof codex>>, id: string) =>
      body.shards.find((entry) => entry.shard.id === id)?.shard;
    expect(pick(english, "compound")?.name).toBe("Compound");
    expect(pick(japanese, "compound")?.name).toBe("複利");
    // Content prose and the sentences the server composes itself both follow the header.
    const wraith = (body: Awaited<ReturnType<typeof codex>>) => body.foes.find((foe) => foe.id === "null-wraith");
    expect(wraith(english)?.name).toBe("Null Wraith");
    expect(wraith(japanese)?.name).toBe("ヌルの亡霊");
    expect(wraith(english)?.trait?.name).toBe("Nullify");
    expect(wraith(japanese)?.trait?.name).toBe("無効化");
    // The Codex's own "where you find it" labels are the server's prose, and follow too.
    const found = (body: Awaited<ReturnType<typeof codex>>, id: string) =>
      body.shards.find((entry) => entry.shard.id === id)?.found ?? [];
    expect(found(english, "compound")).toContain("elites");
    expect(found(japanese, "compound")).toContain("精鋭");
    // An unknown language is English, not an error and not a blank screen.
    expect(pick(await codex("kl"), "compound")?.name).toBe("Compound");
    await app.close();
    db.close();
  });

  it("keeps the rules and the saved run English, whatever language they are read in", async () => {
    const db = openDatabase(MEMORY);
    const service = new ShardrunService({ db, content, sandbox });
    const profile = await new ProfileService({ db }).create("Ada", "artificer");

    // Start and play the run entirely in Japanese.
    const view = await withLocale("ja", async () => {
      const started = await service.start(profile.id, "javascript", "beginner");
      const node = started.map.nodes.find((candidate) => candidate.state === "open");
      if (!node) throw new Error("no open room");
      return service.command(profile.id, { type: "enter", nodeId: node.id });
    });
    // What the reader sees is Japanese...
    expect(view.layer.name).toBe("遺構");
    expect(view.shards.ward?.name).toBe("防護");

    // ...but the engine's own log, which is saved with the run, is not: a save file must not depend on a preference.
    const log = view.log.map((entry) => entry.text).join(" ");
    expect(log).not.toMatch(/[ぁ-んァ-ン一-龯]/u);

    // And the same run read back in English reads English, because only the view was ever translated.
    const inEnglish = await service.latest(profile.id);
    expect(inEnglish?.layer.name).toBe("The Salvage");
    db.close();
  });
});
