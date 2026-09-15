import { type Terrain, type Zone, zoneRows } from "@rootward/content-schema";
import { type Point, TILE } from "../map/types.ts";

/** A rectangle of tiles that stops movement: a building's footprint, or a person (1x1). */
export interface Footprint {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a zone can be walked, as rows of `TILE.floor` and `TILE.wall`. Using the dungeon's own tile codes means
 * `findPath` and `isWalkable` work on a zone unchanged, on the server and in the client alike.
 */
export function zoneCollision(
  zone: Pick<Zone, "legend" | "tiles">,
  terrain: ReadonlyMap<string, Terrain>,
  blockers: readonly Footprint[],
): string[] {
  const grid = zoneRows(zone).map((row) =>
    Array.from(row, (char) => {
      const terrainId = zone.legend[char];
      return terrainId !== undefined && terrain.get(terrainId)?.walkable === true ? TILE.floor : TILE.wall;
    }),
  );
  for (const blocker of blockers) {
    for (let y = blocker.y; y < blocker.y + blocker.h; y++) {
      const row = grid[y];
      for (let x = blocker.x; row && x < Math.min(blocker.x + blocker.w, row.length); x++) row[x] = TILE.wall;
    }
  }
  return grid.map((row) => row.join(""));
}

/** On the same tile or one step away (no diagonals): close enough to talk, read a sign, or step through a portal. */
export function isAdjacent(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
}
