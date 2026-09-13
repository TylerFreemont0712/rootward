import type { DungeonPlan } from "@rootward/core";
import { findPath, layoutDungeon, type Point } from "@rootward/core/map";
import type { ExpeditionView, MapRoomView, RoomState } from "@rootward/shared";
import { describe, expect, it } from "vitest";
import { doorwayAt, passability, restingPoint, revealedTiles, tileKey, travelTarget } from "../src/map/fog.ts";

// Two choices on floor 0, one room on floor 1, the boss on floor 2: the same shape as core's expedition tests.
const plan: DungeonPlan = {
  seed: "fog",
  length: "short",
  language: "javascript",
  floors: [["f0-r0", "f0-r1"], ["f1-r0"], ["f2-r0"]],
  rooms: [
    { id: "f0-r0", floor: 0, kind: "encounter", purpose: "frontier", challengeId: "c1" },
    { id: "f0-r1", floor: 0, kind: "elite", purpose: "stretch", challengeId: "c2" },
    { id: "f1-r0", floor: 1, kind: "encounter", purpose: "practice", challengeId: "c3" },
    { id: "f2-r0", floor: 2, kind: "boss", purpose: "boss", challengeId: "c4" },
  ],
  edges: [
    ["f0-r0", "f1-r0"],
    ["f0-r1", "f1-r0"],
    ["f1-r0", "f2-r0"],
  ],
  rationale: [],
};

/** An expedition view like the server's, with room states chosen by the test. */
function expedition(states: Readonly<Record<string, RoomState>>, lastClearedRoomId?: string): ExpeditionView {
  const map = layoutDungeon(plan);
  return {
    length: plan.length,
    language: plan.language,
    floorCount: plan.floors.length,
    width: map.width,
    height: map.height,
    tiles: map.tiles,
    entrance: map.entrance,
    start: map.start,
    rooms: map.rooms.map((geometry): MapRoomView => {
      const room = plan.rooms.find((candidate) => candidate.id === geometry.roomId);
      if (!room) throw new Error(`unknown room ${geometry.roomId}`);
      return {
        id: room.id,
        floor: room.floor,
        kind: room.kind,
        purpose: room.purpose,
        state: states[room.id] ?? "ahead",
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        center: geometry.center,
        doorIn: geometry.doorIn,
        ...(geometry.doorOut ? { doorOut: geometry.doorOut } : {}),
      };
    }),
    edges: plan.edges,
    rationale: [],
    ...(lastClearedRoomId === undefined ? {} : { lastClearedRoomId }),
  };
}

function room(view: ExpeditionView, id: string): MapRoomView {
  const found = view.rooms.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no room ${id}`);
  return found;
}

function walk(view: ExpeditionView, from: Point, to: Point): Point[] | undefined {
  const canStep = passability(view, revealedTiles(view));
  return findPath(view, from, to, (point) => canStep(point));
}

describe("exploring the expedition map", () => {
  it("starts with the entrance and the open first floor uncovered, and deeper rooms dark", () => {
    const view = expedition({ "f0-r0": "open", "f0-r1": "open" });
    const revealed = revealedTiles(view);
    expect(revealed.has(tileKey(view, view.start))).toBe(true);
    expect(revealed.has(tileKey(view, room(view, "f0-r1").center))).toBe(true);
    expect(revealed.has(tileKey(view, room(view, "f1-r0").doorIn))).toBe(false);
    expect(revealed.has(tileKey(view, room(view, "f1-r0").center))).toBe(false);
  });

  it("walks to an open doorway but not into the room or past it", () => {
    const view = expedition({ "f0-r0": "open", "f0-r1": "open" });
    const first = room(view, "f0-r0");
    expect(walk(view, view.start, first.doorIn)?.at(-1)).toEqual(first.doorIn);
    expect(doorwayAt(view, first.doorIn)?.id).toBe("f0-r0");
    expect(walk(view, view.start, first.center)).toBeUndefined();
    expect(walk(view, view.start, room(view, "f1-r0").doorIn)).toBeUndefined();
    expect(travelTarget(view, first.center)).toEqual(first.doorIn);
  });

  it("opens the way down from a cleared room and keeps the branch not taken sealed", () => {
    const view = expedition({ "f0-r0": "cleared", "f0-r1": "sealed", "f1-r0": "open" }, "f0-r0");
    const start = restingPoint(view);
    const sealed = room(view, "f0-r1");
    expect(start).toEqual(room(view, "f0-r0").center);
    expect(walk(view, start, room(view, "f1-r0").doorIn)?.at(-1)).toEqual(room(view, "f1-r0").doorIn);
    expect(walk(view, start, sealed.doorIn)).toBeUndefined();
    expect(sealed.doorOut && walk(view, start, sealed.doorOut)).toBeUndefined();
    expect(revealedTiles(view).has(tileKey(view, room(view, "f2-r0").center))).toBe(false);
  });
});
