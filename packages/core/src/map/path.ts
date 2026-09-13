import { type DungeonMap, type Point, TILE } from "./types.ts";

const WALKABLE = new Set<string>([TILE.floor, TILE.door, TILE.corridor, TILE.rubble]);

/** The part of a map that movement needs; the client's expedition view has the same shape. */
export type TileGrid = Pick<DungeonMap, "width" | "height" | "tiles">;

export function isWalkable(code: string | undefined): boolean {
  return code !== undefined && WALKABLE.has(code);
}

export function tileAt(map: TileGrid, point: Point): string | undefined {
  return map.tiles[point.y]?.[point.x];
}

/**
 * The shortest path between two tiles moving up, down, left, or right, or undefined when there is none. Used for
 * click-to-travel and to prove in tests that every room is reachable.
 * LEARN: breadth-first search visits tiles in order of distance from the start, so the first time it reaches the goal
 * it has found a shortest path; `previous` remembers how each tile was reached so the path can be walked back.
 */
export function findPath(
  map: TileGrid,
  from: Point,
  to: Point,
  passable: (point: Point, code: string | undefined) => boolean = (_, code) => isWalkable(code),
): Point[] | undefined {
  const key = (p: Point) => p.y * map.width + p.x;
  const previous = new Map<number, Point | null>([[key(from), null]]);
  const queue: Point[] = [from];
  // Iterating an array with for...of also visits items pushed during the loop, which is exactly a queue.
  for (const current of queue) {
    if (current.x === to.x && current.y === to.y) {
      const path: Point[] = [];
      for (let step: Point | null | undefined = current; step; step = previous.get(key(step))) path.push(step);
      return path.reverse();
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (next.x < 0 || next.y < 0 || next.x >= map.width || next.y >= map.height) continue;
      if (previous.has(key(next)) || !passable(next, tileAt(map, next))) continue;
      previous.set(key(next), current);
      queue.push(next);
    }
  }
  return undefined;
}
