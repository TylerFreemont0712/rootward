import { TILE } from "@rootward/core/map";
import type { OverworldView } from "@rootward/shared";
import { describe, expect, it } from "vitest";
import { passableAt, revealedAround, tileKey } from "../src/map/overworld-fog.ts";

// A small hand-built zone, the same spirit as fog.test.ts's synthetic expedition: two interior wall pillars break
// up an otherwise open floor, matching the real Foundry zone's shape (open floor with a few obstacles) at a size
// small enough to reason about by hand.
const W = TILE.wall;
const F = TILE.floor;
const rows: string[][] = [
  [W, W, W, W, W, W, W],
  [W, F, F, F, F, F, W],
  [W, F, W, F, W, F, W],
  [W, F, F, F, F, F, W],
  [W, W, W, W, W, W, W],
];
const tiles = rows.map((row) => row.join(""));

const overworld: OverworldView = {
  realmId: "foundry",
  realmName: "The Foundry",
  language: "javascript",
  width: 7,
  height: 5,
  tiles,
  entry: { x: 1, y: 1 },
  position: { x: 1, y: 1 },
  markers: [
    { id: "m1", kind: "encounter", x: 5, y: 1, state: "open", title: "A Fight", enemyName: "Null Wraith", difficulty: 1 },
    { id: "boss", kind: "boss", x: 1, y: 3, state: "cleared", title: "The Boss", enemyName: "Kiln Warden", difficulty: 4 },
  ],
  bossMarkerId: "boss",
};

describe("tileKey", () => {
  it("is y * width + x", () => {
    expect(tileKey(overworld, { x: 3, y: 2 })).toBe(2 * overworld.width + 3);
  });
});

describe("passableAt", () => {
  it("allows floor tiles, including a marker's own tile, and blocks walls", () => {
    const passable = passableAt(overworld);
    expect(passable({ x: 1, y: 1 })).toBe(true);
    expect(passable({ x: 5, y: 1 })).toBe(true); // the encounter marker sits on plain floor
    expect(passable({ x: 0, y: 0 })).toBe(false); // border wall
    expect(passable({ x: 2, y: 2 })).toBe(false); // interior pillar
  });
});

describe("revealedAround", () => {
  it("reveals a square of the given radius around a point, clipped to the map", () => {
    const revealed = revealedAround(overworld, { x: 1, y: 1 }, 1);
    // The 3x3 block around (1,1), clipped at x=0/y=0, is exactly (0..2, 0..2).
    for (let y = 0; y <= 2; y++) {
      for (let x = 0; x <= 2; x++) expect(revealed.has(tileKey(overworld, { x, y }))).toBe(true);
    }
    expect(revealed.has(tileKey(overworld, { x: 3, y: 1 }))).toBe(false);
    expect(revealed.has(tileKey(overworld, { x: 1, y: 3 }))).toBe(false);
  });

  it("covers the whole map when the radius is large enough", () => {
    const revealed = revealedAround(overworld, { x: 3, y: 2 }, 10);
    expect(revealed.size).toBe(overworld.width * overworld.height);
  });
});
