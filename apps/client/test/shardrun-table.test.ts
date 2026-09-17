import { describe, expect, it } from "vitest";
import { moveCard, parseSpot, type Spot, spotKey, type Table } from "../src/shardrun/table.ts";

// The deck playstyle's table (ADR-0020): what dropping a card somewhere proposes to the server.

const TABLE: Table = {
  spells: [
    { id: "spell-1", capacity: 2, shards: ["amplify"], spent: false },
    { id: "spell-2", capacity: 2, shards: ["fork", "ward"], spent: false },
    { id: "spell-3", capacity: 3, shards: [], spent: true },
  ],
  hand: ["kindle", "chill", "ward"],
  held: [],
  holdLimit: 1,
};

const shape = (table: Table | undefined) =>
  table && { spells: table.spells.map((spell) => spell.shards), hand: table.hand, held: table.held };

describe("moving cards on the table", () => {
  it("plays a card from the hand into a spell with room, at the slot it was dropped on", () => {
    expect(shape(moveCard(TABLE, { zone: "hand", index: 1 }, { zone: "spell", spellId: "spell-1", index: 0 }))).toEqual({
      spells: [["chill", "amplify"], ["fork", "ward"], []],
      hand: ["kindle", "ward"],
      held: [],
    });
    // Past the end means last.
    expect(shape(moveCard(TABLE, { zone: "hand", index: 0 }, { zone: "spell", spellId: "spell-1", index: 9 }))?.spells[0]).toEqual([
      "amplify",
      "kindle",
    ]);
  });

  it("swaps with the card it lands on in a full spell, and refuses to overfill one", () => {
    expect(shape(moveCard(TABLE, { zone: "hand", index: 0 }, { zone: "spell", spellId: "spell-2", index: 1 }))).toEqual({
      spells: [["amplify"], ["fork", "kindle"], []],
      hand: ["ward", "chill", "ward"],
      held: [],
    });
    expect(moveCard(TABLE, { zone: "hand", index: 0 }, { zone: "spell", spellId: "spell-2", index: 2 })).toBeUndefined();
  });

  it("reorders within a spell or the hand, and does nothing for a drop on the same place", () => {
    expect(shape(moveCard(TABLE, { zone: "spell", spellId: "spell-2", index: 0 }, { zone: "spell", spellId: "spell-2", index: 1 }))?.spells[1]).toEqual([
      "ward",
      "fork",
    ]);
    expect(shape(moveCard(TABLE, { zone: "hand", index: 2 }, { zone: "hand", index: 0 }))?.hand).toEqual(["ward", "kindle", "chill"]);
    expect(moveCard(TABLE, { zone: "hand", index: 1 }, { zone: "hand", index: 1 })).toBeUndefined();
  });

  it("holds up to the limit, and gives a card back to the hand", () => {
    const held = moveCard(TABLE, { zone: "hand", index: 0 }, { zone: "hold", index: 0 });
    expect(shape(held)).toEqual({ spells: [["amplify"], ["fork", "ward"], []], hand: ["chill", "ward"], held: ["kindle"] });
    if (!held) throw new Error("the hold refused a card");
    expect(moveCard(held, { zone: "hand", index: 0 }, { zone: "hold", index: 1 })).toBeUndefined();
    expect(shape(moveCard(held, { zone: "hold", index: 0 }, { zone: "hand", index: 2 }))?.hand).toEqual(["chill", "ward", "kindle"]);
  });

  it("never touches a spell already cast this turn", () => {
    expect(moveCard(TABLE, { zone: "hand", index: 0 }, { zone: "spell", spellId: "spell-3", index: 0 })).toBeUndefined();
  });

  it("names every spot in a data attribute, and reads it back", () => {
    const spots: Spot[] = [
      { zone: "spell", spellId: "spell-2", index: 1 },
      { zone: "hand", index: 4 },
      { zone: "hold", index: 0 },
    ];
    for (const spot of spots) expect(parseSpot(spotKey(spot))).toEqual(spot);
    expect(parseSpot("spell::1")).toBeUndefined();
    expect(parseSpot("deck:1")).toBeUndefined();
    expect(parseSpot(null)).toBeUndefined();
  });
});
