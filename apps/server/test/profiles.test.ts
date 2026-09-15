import { decide, evolve, type RunCommand, type RunEvent, type RunState } from "@rootward/core";
import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type GameContent, loadGameContent } from "../src/content.ts";
import { MEMORY, openDatabase } from "../src/db/database.ts";
import { ProfileService } from "../src/profiles/service.ts";
import { InMemoryEventStore } from "../src/runs/store.ts";
import { SqliteEventStore } from "../src/runs/sqlite-event-store.ts";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const NOW = () => "2026-09-15T00:00:00.000Z";

let content: GameContent;

/** One tiny real run: enough events to prove a store filters by profile, not to play a full fight. */
function startRun(): RunEvent[] {
  const classDef = content.index.classes.get("artificer")?.def;
  if (!classDef) throw new Error("seed content is missing");
  const commands: RunCommand[] = [{ type: "StartRun", runId: "run-1", seed: "profile-test", classDef }];
  let state: RunState | undefined;
  const produced: RunEvent[] = [];
  for (const command of commands) {
    const decision = decide(state, command, { balance: content.balance });
    if (!decision.ok) throw new Error(decision.error.message);
    for (const event of decision.events) {
      state = evolve(state, event);
      produced.push(event);
    }
  }
  return produced;
}

beforeAll(async () => {
  content = await loadGameContent(rootDir);
});

describe("ProfileService", () => {
  it("creates and lists characters, oldest first", async () => {
    let tick = 0;
    const service = new ProfileService({ db: openDatabase(MEMORY), newId: () => `p${++tick}`, now: () => `t${tick}` });
    const first = await service.create("Ada", "artificer");
    const second = await service.create("Grace", "artificer");
    expect(first).toEqual({ id: "p1", name: "Ada", classId: "artificer", createdAt: "t1" });
    expect(await service.list()).toEqual([first, second]);
  });

  it("trims a character's name", async () => {
    const service = new ProfileService({ db: openDatabase(MEMORY) });
    const profile = await service.create("  Ada  ", "artificer");
    expect(profile.name).toBe("Ada");
  });

  it("gets a character by id, or undefined if it does not exist", async () => {
    const service = new ProfileService({ db: openDatabase(MEMORY) });
    const created = await service.create("Ada", "artificer");
    expect(await service.get(created.id)).toEqual(created);
    expect(await service.get("no-such-id")).toBeUndefined();
  });
});

describe("profile-scoped event stores", () => {
  it("SqliteEventStore: loadAll only sees the bound profile's runs; load(runId) is unaffected", async () => {
    const db = openDatabase(MEMORY);
    const profiles = new ProfileService({ db, now: NOW });
    const alice = await profiles.create("Alice", "artificer");
    const bob = await profiles.create("Bob", "artificer");

    const aliceStore = new SqliteEventStore(db, NOW, alice.id);
    const bobStore = new SqliteEventStore(db, NOW, bob.id);
    const legacyStore = new SqliteEventStore(db, NOW); // no profileId: today's unscoped behavior

    const events = startRun();
    await aliceStore.create("alice-run", events);
    await bobStore.create("bob-run", events);

    expect((await aliceStore.loadAll()).map((r) => r.runId)).toEqual(["alice-run"]);
    expect((await bobStore.loadAll()).map((r) => r.runId)).toEqual(["bob-run"]);
    expect((await legacyStore.loadAll()).map((r) => r.runId).sort()).toEqual(["alice-run", "bob-run"]);

    // load(runId) is not scoped: holding the id is enough, exactly like before profiles existed.
    expect(await bobStore.load("alice-run")).toEqual(events);
  });

  it("InMemoryEventStore mirrors the same scoping, for test parity with SqliteEventStore", async () => {
    const aliceStore = new InMemoryEventStore(NOW, "alice");
    const bobStore = new InMemoryEventStore(NOW, "bob");
    const events = startRun();
    await aliceStore.create("alice-run", events);

    expect((await aliceStore.loadAll()).map((r) => r.runId)).toEqual(["alice-run"]);
    expect(await bobStore.loadAll()).toEqual([]);

    const unscoped = new InMemoryEventStore(NOW);
    await unscoped.create("run-x", events);
    expect((await unscoped.loadAll()).map((r) => r.runId)).toEqual(["run-x"]);
  });
});
