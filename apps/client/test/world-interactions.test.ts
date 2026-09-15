import { TILE } from "@rootward/core/map";
import type { ZoneView } from "@rootward/shared";
import { describe, expect, it } from "vitest";
import {
  approachRoute,
  labelAt,
  nearbyTarget,
  nextStep,
  passableIn,
  revealedAround,
  routeTo,
  tileKey,
  triggerAt,
  variantIndex,
  type Walker,
  walkStrip,
} from "../src/world/interactions.ts";

// A 7x5 zone small enough to reason about by hand:
//   #######
//   #..O..#   O = Orin (blocks), at (3, 1)
//   #...S.#   S = a signpost (blocks), at (4, 2)
//   #G.M..#   G = the gate portal at (1, 3); M = an open marker at (3, 3)
//   #######
// The east pocket ((4,1), (5,1), (5,2), (4,3), (5,3)) connects to the rest only through the marker's tile.
const [W, F] = [TILE.wall, TILE.floor];
const collision = [
  [W, W, W, W, W, W, W],
  [W, F, F, W, F, F, W],
  [W, F, F, F, W, F, W],
  [W, F, F, F, F, F, W],
  [W, W, W, W, W, W, W],
].map((row) => row.join(""));

const zone: ZoneView = {
  id: "test",
  name: "Test Yard",
  kind: "town",
  ambience: "none",
  arrival: "A yard.",
  width: 7,
  height: 5,
  tiles: collision.map((row) => row.replaceAll("#", ".")),
  legend: { ".": { terrain: "grass", color: "#446633", walkable: true } },
  collision,
  props: [],
  npcs: [{ id: "orin", name: "Orin", title: "Guildmaster", sprite: "guildmaster", x: 3, y: 1 }],
  features: [{ id: "sign", x: 4, y: 2, label: "Signpost" }],
  portals: [{ id: "gate", x: 1, y: 3, label: "The gate", locked: true }],
  markers: [
    { id: "goblin", kind: "encounter", x: 3, y: 3, state: "open", title: "Loops", enemyId: "goblin", enemyName: "Goblin", difficulty: 1 },
    { id: "won", kind: "encounter", x: 5, y: 1, state: "cleared", title: "Values", enemyId: "wisp", enemyName: "Wisp", difficulty: 1 },
  ],
};

describe("world interactions", () => {
  it("triggers open markers and portals, but not markers already won", () => {
    expect(triggerAt(zone, { x: 3, y: 3 })).toEqual({ kind: "marker", id: "goblin" });
    expect(triggerAt(zone, { x: 1, y: 3 })).toEqual({ kind: "portal", id: "gate" });
    expect(triggerAt(zone, { x: 5, y: 1 })).toBeUndefined();
  });

  it("uses the faced neighbor first, then any other neighbor", () => {
    expect(nearbyTarget(zone, { x: 3, y: 2 }, "right")).toMatchObject({ kind: "feature", id: "sign" });
    expect(nearbyTarget(zone, { x: 3, y: 2 }, "up")).toMatchObject({ kind: "npc", id: "orin" });
    expect(nearbyTarget(zone, { x: 3, y: 2 }, "down")).toMatchObject({ kind: "npc", id: "orin" });
    expect(nearbyTarget(zone, { x: 1, y: 1 }, "down")).toBeUndefined();
  });

  it("routes around an open marker unless the marker is where the route ends", () => {
    expect(routeTo(zone, { x: 2, y: 3 }, { x: 4, y: 3 })).toBeUndefined();
    expect(routeTo(zone, { x: 2, y: 3 }, { x: 3, y: 3 })?.at(-1)).toEqual({ x: 3, y: 3 });
  });

  it("walks up beside someone by the shortest way, never onto a trigger", () => {
    const route = approachRoute(zone, { x: 1, y: 1 }, { x: 3, y: 1 });
    expect(route?.at(-1)).toEqual({ x: 2, y: 1 });
    expect(route?.length).toBe(2);
  });

  it("follows routes, drops blocked ones, and only turns when walking into a wall", () => {
    const canStep = passableIn(zone);
    const walker: Walker = { avatar: { x: 1, y: 1 }, route: [{ x: 2, y: 1 }], facing: "down" };
    expect(nextStep(walker, undefined, canStep)).toMatchObject({ avatar: { x: 2, y: 1 }, route: [], facing: "right" });
    const blocked: Walker = { avatar: { x: 2, y: 1 }, route: [{ x: 3, y: 1 }], facing: "right" };
    expect(nextStep(blocked, undefined, canStep)).toMatchObject({ avatar: { x: 2, y: 1 }, route: [] });
    const still: Walker = { avatar: { x: 1, y: 1 }, route: [], facing: "down" };
    expect(nextStep(still, "up", canStep)).toEqual({ ...still, facing: "up" });
    expect(nextStep(still, "down", canStep)).toMatchObject({ avatar: { x: 1, y: 2 } });
    expect(nextStep(still, undefined, canStep)).toBe(still);
  });

  it("reveals a circle around the Maintainer, and nothing without a sight limit", () => {
    const revealed = revealedAround(zone, { x: 3, y: 2 }, 1);
    expect([...revealed].sort((a, b) => a - b)).toEqual(
      [
        { x: 3, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 4, y: 2 },
        { x: 3, y: 3 },
      ]
        .map((point) => tileKey(zone, point))
        .sort((a, b) => a - b),
    );
    expect(revealedAround(zone, { x: 3, y: 2 }, undefined).size).toBe(0);
  });

  it("picks tile variants that are scattered but stable", () => {
    const picks = Array.from({ length: 40 }, (_, i) => variantIndex(i, i * 3, 4));
    expect(picks.every((pick) => pick >= 0 && pick < 4)).toBe(true);
    expect(new Set(picks).size).toBeGreaterThan(1);
    expect(variantIndex(12, 7, 4)).toBe(variantIndex(12, 7, 4));
    expect(variantIndex(3, 3, 0)).toBe(0);
  });

  it("plays the right-facing walk strip mirrored when walking left", () => {
    expect(walkStrip("left")).toEqual({ direction: "right", mirrored: true });
    expect(walkStrip("up")).toEqual({ direction: "up", mirrored: false });
    expect(walkStrip("down")).toEqual({ direction: "down", mirrored: false });
  });

  it("labels people, fights, and ways out for the hover tooltip", () => {
    expect(labelAt(zone, { x: 3, y: 1 })).toBe("Orin, Guildmaster");
    expect(labelAt(zone, { x: 5, y: 1 })).toBe("Wisp: Values (won)");
    expect(labelAt(zone, { x: 1, y: 3 })).toBe("The gate (locked)");
    expect(labelAt(zone, { x: 2, y: 2 })).toBeUndefined();
  });
});
