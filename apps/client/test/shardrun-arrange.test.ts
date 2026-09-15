import { describe, expect, it } from "vitest";
import { type Arrangement, moveShard } from "../src/shardrun/arrange.ts";

const START: Arrangement = {
  spells: [
    { id: "bolt", capacity: 2, shards: ["amplify", "fork"] },
    { id: "ward", capacity: 2, shards: ["ward"] },
  ],
  inventory: ["kindle"],
};

const shardsOf = (arrangement: Arrangement | undefined) => ({
  spells: arrangement?.spells.map((spell) => spell.shards),
  inventory: arrangement?.inventory,
});

describe("moving shards on the workbench", () => {
  it("reorders within a spell", () => {
    expect(shardsOf(moveShard(START, { kind: "spell", spellId: "bolt", index: 0 }, { kind: "spell", spellId: "bolt", index: 1 }))).toEqual({
      spells: [["fork", "amplify"], ["ward"]],
      inventory: ["kindle"],
    });
  });

  it("moves into a spell with room, and back out to the inventory", () => {
    const moved = moveShard(START, { kind: "inventory", index: 0 }, { kind: "spell", spellId: "ward", index: 0 });
    expect(shardsOf(moved)).toEqual({ spells: [["amplify", "fork"], ["kindle", "ward"]], inventory: [] });
    if (!moved) throw new Error("move refused");
    expect(shardsOf(moveShard(moved, { kind: "spell", spellId: "bolt", index: 1 }, { kind: "inventory", index: 0 }))).toEqual({
      spells: [["amplify"], ["kindle", "ward"]],
      inventory: ["fork"],
    });
  });

  it("swaps with the shard it lands on when the spell is full", () => {
    expect(shardsOf(moveShard(START, { kind: "inventory", index: 0 }, { kind: "spell", spellId: "bolt", index: 1 }))).toEqual({
      spells: [["amplify", "kindle"], ["ward"]],
      inventory: ["fork"],
    });
  });

  it("refuses moves that change nothing or have nowhere to go, and never touches the original", () => {
    const before = structuredClone(START);
    expect(moveShard(START, { kind: "spell", spellId: "bolt", index: 0 }, { kind: "spell", spellId: "bolt", index: 0 })).toBeUndefined();
    expect(moveShard(START, { kind: "inventory", index: 0 }, { kind: "spell", spellId: "bolt", index: 5 })).toBeUndefined();
    expect(moveShard(START, { kind: "inventory", index: 3 }, { kind: "spell", spellId: "ward", index: 0 })).toBeUndefined();
    expect(START).toEqual(before);
  });
});
