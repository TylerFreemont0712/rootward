import { describe, expect, it } from "vitest";
import { type DungeonMap, type DungeonPlan, findPath, layoutDungeon, planDungeon, type Rect, TILE } from "../src/index.ts";
import { planRequest, syntheticCatalog, syntheticLearner } from "./planner-fixtures.ts";

function planFor(seed: string): DungeonPlan {
  const catalog = syntheticCatalog(seed, 16);
  const result = planDungeon(planRequest({ seed, catalog, learner: syntheticLearner(seed, catalog) }));
  if (!result.ok) throw new Error(result.error.message);
  return result.plan;
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width + 1 && b.x < a.x + a.width + 1 && a.y < b.y + b.height + 1 && b.y < a.y + a.height + 1;

function mapProblems(plan: DungeonPlan, map: DungeonMap): string[] {
  const problems: string[] = [];
  if (map.tiles.length !== map.height) problems.push("row count differs from height");
  if (map.tiles.some((row) => row.length !== map.width)) problems.push("a row has the wrong width");
  // Every tile code is plain ASCII: rock, wall, floor, door, corridor, prop, rubble.
  if (Object.values(TILE).join("") !== " #.+,&~") problems.push("the tile legend changed; update this test");
  if (map.tiles.some((row) => !/^[ #.+,&~]*$/.test(row))) problems.push("unknown tile code");
  if (map.rooms.length !== plan.rooms.length) problems.push("room count differs from the plan");

  map.rooms.forEach((room, i) => {
    if (map.tiles[room.doorIn.y]?.[room.doorIn.x] !== TILE.door) problems.push(`${room.roomId} has no top door`);
    if (!findPath(map, map.start, room.center)) problems.push(`${room.roomId} is unreachable from the entrance`);
    for (const other of map.rooms.slice(i + 1)) {
      if (overlaps(room, other)) problems.push(`${room.roomId} overlaps ${other.roomId}`);
    }
  });
  for (const [from, to] of plan.edges) {
    const a = map.rooms.find((room) => room.roomId === from);
    const b = map.rooms.find((room) => room.roomId === to);
    const corridorOnly = (_: unknown, code: string | undefined) => code === TILE.corridor || code === TILE.door;
    if (!a?.doorOut || !b || !findPath(map, a.doorOut, b.doorIn, corridorOnly)) problems.push(`no corridor for ${from}->${to}`);
  }
  return problems;
}

describe("layoutDungeon", () => {
  it("builds a walkable map where every room is reachable and nothing overlaps", () => {
    const plan = planFor("map-basic");
    const map = layoutDungeon(plan);
    expect(mapProblems(plan, map)).toEqual([]);
    const boss = map.rooms.find((room) => room.floor === plan.floors.length - 1);
    const other = map.rooms.find((room) => room.floor === 0);
    expect(boss && other && boss.width > other.width).toBe(true);
    expect(boss?.doorOut).toBeUndefined();
  });

  it("is deterministic for a plan and varies between seeds", () => {
    const plan = planFor("map-determinism");
    expect(layoutDungeon(plan)).toEqual(layoutDungeon(plan));
    const shapes = new Set(Array.from({ length: 8 }, (_, i) => layoutDungeon({ ...plan, seed: `other-${i}` }).tiles.join("\n")));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it("holds its guarantees across 200 random plans", { timeout: 60_000 }, () => {
    const failures: string[] = [];
    for (let i = 0; i < 200; i++) {
      const plan = planFor(`map-property-${i}`);
      for (const problem of mapProblems(plan, layoutDungeon(plan))) failures.push(`seed ${i}: ${problem}`);
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });
});

describe("findPath", () => {
  const map: DungeonMap = {
    width: 5,
    height: 3,
    tiles: ["..#..", ".###.", "....."],
    rooms: [],
    entrance: { x: 0, y: 0, width: 1, height: 1, center: { x: 0, y: 0 }, doorOut: { x: 0, y: 0 } },
    start: { x: 0, y: 0 },
  };

  it("finds the shortest way around walls", () => {
    const path = findPath(map, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(path).toHaveLength(9);
    expect(path?.[0]).toEqual({ x: 0, y: 0 });
    expect(path?.at(-1)).toEqual({ x: 4, y: 0 });
  });

  it("returns undefined when the goal is walled off", () => {
    const sealed: DungeonMap = { ...map, tiles: ["..#..", "..###", "..#.."] };
    expect(findPath(sealed, { x: 0, y: 0 }, { x: 4, y: 2 })).toBeUndefined();
  });
});
