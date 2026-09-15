import type { Dialogue, Quest, Terrain } from "@rootward/content-schema";
import { describe, expect, it } from "vitest";
import {
  applyEffects,
  holds,
  isAdjacent,
  objectiveProgress,
  offeredChoices,
  openingNode,
  questStatus,
  questsOffered,
  TILE,
  type WorldProgress,
  zoneCollision,
} from "../src/index.ts";

const COOLS: Quest = {
  id: "foundry-cools",
  name: "The Foundry Cools",
  giver: "guildmaster",
  summary: "Clear three fights in the Foundry.",
  objectives: [{ text: "Clear three Foundry fights", cleared_in: "foundry", at_least: 3 }],
  rewards: { flags: ["kiln-gate-open"], text: "The kiln gate opens." },
};
const QUESTS = new Map([[COOLS.id, COOLS]]);

function progress(overrides: Partial<WorldProgress> = {}): WorldProgress {
  return { flags: new Set(), quests: new Map(), cleared: new Map(), mastery: () => 0, ...overrides };
}

const clearedThree = new Map([["foundry", new Set(["a", "b", "c"])]]);

describe("world conditions", () => {
  it("reads flags, markers, and mastery, and combines them with all, any, and not", () => {
    const state = progress({
      flags: new Set(["sworn-in"]),
      cleared: new Map([["foundry", new Set(["foundry-loops"])]]),
      mastery: (node) => (node === "py.control.loops" ? 2 : 0),
    });
    expect(holds({ flag: "sworn-in" }, state, QUESTS)).toBe(true);
    expect(holds({ not: { flag: "sworn-in" } }, state, QUESTS)).toBe(false);
    expect(holds({ cleared: "foundry/foundry-loops" }, state, QUESTS)).toBe(true);
    expect(holds({ cleared: "foundry/foundry-dicts" }, state, QUESTS)).toBe(false);
    expect(holds({ cleared_in: "foundry", at_least: 2 }, state, QUESTS)).toBe(false);
    expect(holds({ mastery: "py.control.loops", at_least: 2 }, state, QUESTS)).toBe(true);
    expect(holds({ all: [{ flag: "sworn-in" }, { mastery: "py.control.loops", at_least: 3 }] }, state, QUESTS)).toBe(false);
    expect(holds({ any: [{ flag: "nope" }, { cleared_in: "foundry", at_least: 1 }] }, state, QUESTS)).toBe(true);
  });

  it("derives ready from objectives, so a quest is never stored as ready", () => {
    expect(questStatus(COOLS, progress())).toBe("not-started");
    expect(questStatus(COOLS, progress({ quests: new Map([[COOLS.id, "active"]]) }))).toBe("active");
    expect(questStatus(COOLS, progress({ quests: new Map([[COOLS.id, "active"]]), cleared: clearedThree }))).toBe("ready");
    expect(questStatus(COOLS, progress({ quests: new Map([[COOLS.id, "done"]]) }))).toBe("done");
    expect(holds({ quest: COOLS.id, status: "not-started" }, progress(), QUESTS)).toBe(true);
    expect(holds({ quest: "missing", status: "not-started" }, progress(), QUESTS)).toBe(false);
  });

  it("caps objective progress at its target", () => {
    const five = new Map([["foundry", new Set(["a", "b", "c", "d", "e"])]]);
    expect(objectiveProgress({ text: "x", cleared_in: "foundry", at_least: 3 }, progress({ cleared: five }))).toEqual({
      done: true,
      current: 3,
      target: 3,
    });
  });
});

describe("world effects", () => {
  it("starts a quest, and refuses to finish it before its objectives are met", () => {
    const started = applyEffects([{ start_quest: COOLS.id }], progress(), QUESTS);
    expect(started).toMatchObject({ ok: true, outcome: { notices: ["Quest started: The Foundry Cools"] } });
    if (!started.ok) return;
    const early = applyEffects([{ complete_quest: COOLS.id }], progress({ quests: started.outcome.quests }), QUESTS);
    expect(early).toMatchObject({ ok: false, error: { code: "quest-not-ready" } });
  });

  it("applies effects in order, sets reward flags, and leaves the input untouched", () => {
    const before = progress({ cleared: clearedThree });
    const result = applyEffects(
      [{ start_quest: COOLS.id }, { complete_quest: COOLS.id }, { set_flag: "met-lint" }, { open: "guild-board" }],
      before,
      QUESTS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.quests.get(COOLS.id)).toBe("done");
    expect([...result.outcome.flags].sort()).toEqual(["kiln-gate-open", "met-lint"]);
    expect(result.outcome.open).toBe("guild-board");
    expect(before.flags.size).toBe(0);
    expect(before.quests.size).toBe(0);
  });

  it("refuses to start a quest twice", () => {
    const state = progress({ quests: new Map([[COOLS.id, "active"]]) });
    expect(applyEffects([{ start_quest: COOLS.id }], state, QUESTS)).toMatchObject({ ok: false, error: { code: "quest-already-started" } });
  });
});

describe("dialogue", () => {
  const dialogue: Dialogue = {
    start: [{ if: { flag: "sworn-in" }, goto: "welcome-back" }, { goto: "hello" }],
    nodes: {
      hello: {
        text: "Hello.",
        choices: [
          { text: "Swear in", if: { not: { flag: "sworn-in" } }, effects: [{ set_flag: "sworn-in" }] },
          { text: "Bye", effects: [] },
        ],
      },
      "welcome-back": { text: "Back again.", choices: [] },
    },
  };

  it("opens on the first start entry whose condition holds", () => {
    expect(openingNode(dialogue, () => false)).toBe("hello");
    expect(openingNode(dialogue, () => true)).toBe("welcome-back");
  });

  it("finds the quests a conversation can hand out from where it opens right now", () => {
    const giver: Dialogue = {
      start: [{ if: { flag: "busy" }, goto: "busy" }, { goto: "hello" }],
      nodes: {
        hello: { text: "Hi.", choices: [{ text: "Work?", effects: [], goto: "offer" }] },
        offer: { text: "Work.", choices: [{ text: "Yes", if: { not: { flag: "done" } }, effects: [{ start_quest: "chores" }] }] },
        busy: { text: "Busy.", choices: [] },
      },
    };
    const flags = (set: string[]) => (condition: Parameters<typeof holds>[0]) =>
      holds(condition, progress({ flags: new Set(set) }), QUESTS);
    expect([...questsOffered(giver, flags([]))]).toEqual(["chores"]);
    expect([...questsOffered(giver, flags(["busy"]))]).toEqual([]);
    expect([...questsOffered(giver, flags(["done"]))]).toEqual([]);
  });

  it("hides choices whose condition fails but keeps each choice's position in the file", () => {
    const node = dialogue.nodes.hello;
    if (!node) throw new Error("fixture");
    expect(offeredChoices(node, () => false).map((offered) => offered.index)).toEqual([1]);
    expect(offeredChoices(node, () => true).map((offered) => offered.index)).toEqual([0, 1]);
  });
});

describe("zone collision", () => {
  const terrain = new Map<string, Terrain>([
    ["grass", { id: "grass", name: "Grass", walkable: true, color: "#446633" }],
    ["water", { id: "water", name: "Water", walkable: false, color: "#224466" }],
  ]);

  it("blocks unwalkable terrain, unknown terrain, and footprints, using dungeon tile codes", () => {
    const rows = zoneCollision({ legend: { ".": "grass", "~": "water", "?": "lava" }, tiles: "....\n.~?.\n....\n" }, terrain, [
      { x: 2, y: 2, w: 2, h: 5 },
    ]);
    const [w, f] = [TILE.wall, TILE.floor];
    expect(rows).toEqual([f + f + f + f, f + w + w + f, f + f + w + w]);
  });

  it("counts the same tile and the four neighbors as adjacent, but not diagonals", () => {
    expect(isAdjacent({ x: 3, y: 3 }, { x: 3, y: 3 })).toBe(true);
    expect(isAdjacent({ x: 3, y: 3 }, { x: 3, y: 4 })).toBe(true);
    expect(isAdjacent({ x: 3, y: 3 }, { x: 4, y: 4 })).toBe(false);
  });
});
