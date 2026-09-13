// The walkable dungeon (kickoff answer 8, ADR-0007). Geometry is cosmetic and for navigation only: which rooms exist
// and how they connect comes from the DungeonPlan, so the rules never depend on where a wall is.

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What each tile character means. The client picks glyphs (or a tileset) per realm; logic uses these codes. */
export const TILE = {
  rock: " ",
  wall: "#",
  floor: ".",
  door: "+",
  corridor: ",",
  /** Decoration that blocks movement (an anvil in the Foundry, a tree in the Grove). */
  prop: "&",
  /** Walkable Bit Rot debris, scattered in review rooms. */
  rubble: "~",
} as const;
export type TileCode = (typeof TILE)[keyof typeof TILE];

export interface MapRoom extends Rect {
  roomId: string;
  floor: number;
  /** Where the avatar stands inside the room. */
  center: Point;
  /** The door in the top wall, reached from the floor above. */
  doorIn: Point;
  /** The door in the bottom wall toward the next floor; the boss room has none. */
  doorOut?: Point;
}

export interface DungeonMap {
  width: number;
  height: number;
  /** One string per row; every character is a TileCode. */
  tiles: string[];
  rooms: MapRoom[];
  /** The landing at the top where every expedition starts. */
  entrance: Rect & { center: Point; doorOut: Point };
  start: Point;
}
