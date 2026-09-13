import { isWalkable, type Point, TILE, tileAt } from "@rootward/core/map";
import type { ExpeditionView, MapRoomView } from "@rootward/shared";

// Exploration over the server's map (ADR-0008). Nothing here is a rule: the server checks every room entry against the
// plan. This only decides what the player sees and where the avatar may walk.

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function tileKey(map: Pick<ExpeditionView, "width">, point: Point): number {
  return point.y * map.width + point.x;
}

export function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}

export function roomAt(expedition: ExpeditionView, point: Point): MapRoomView | undefined {
  return expedition.rooms.find((room) => contains(room, point));
}

/** Rooms the player can see into: visited rooms and rooms whose door is open now. */
export function isLit(room: MapRoomView): boolean {
  return room.state === "cleared" || room.state === "current" || room.state === "open";
}

/**
 * Tiles the player has uncovered: the entrance, lit rooms, and the corridors leading out of the entrance and out of
 * visited rooms. Rooms further down stay dark; the renderer shows only a marker for their kind.
 */
export function revealedTiles(expedition: ExpeditionView): ReadonlySet<number> {
  const revealed = new Set<number>();
  const reveal = (rect: Rect) => {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) revealed.add(tileKey(expedition, { x, y }));
    }
  };
  reveal(expedition.entrance);
  const exits: Point[] = [expedition.entrance.doorOut];
  for (const room of expedition.rooms) {
    if (!isLit(room)) continue;
    reveal(room);
    if (room.state !== "open" && room.doorOut) exits.push(room.doorOut);
  }

  // LEARN: a flood fill is a breadth-first search without a goal. It spreads through corridor tiles from every exit
  // and stops at doors, which it uncovers but does not pass through.
  const queue = [...exits];
  for (const current of queue) {
    for (const [dx, dy] of STEPS) {
      const next = { x: current.x + dx, y: current.y + dy };
      const code = tileAt(expedition, next);
      if (code !== TILE.corridor && code !== TILE.door) continue;
      const key = tileKey(expedition, next);
      if (revealed.has(key)) continue;
      revealed.add(key);
      if (code === TILE.corridor) queue.push(next);
    }
  }
  return revealed;
}

/**
 * Where the avatar may step: walkable, uncovered tiles, except that the doors of rooms out of reach stay locked and an
 * open room can only be approached as far as its door (going further is entering, which the server decides).
 */
export function passability(expedition: ExpeditionView, revealed: ReadonlySet<number>): (point: Point) => boolean {
  const blocked = new Set<number>();
  for (const room of expedition.rooms) {
    if (room.state === "ahead" || room.state === "sealed") {
      blocked.add(tileKey(expedition, room.doorIn));
      if (room.doorOut) blocked.add(tileKey(expedition, room.doorOut));
    } else if (room.state === "open") {
      for (let y = room.y; y < room.y + room.height; y++) {
        for (let x = room.x; x < room.x + room.width; x++) {
          if (x !== room.doorIn.x || y !== room.doorIn.y) blocked.add(tileKey(expedition, { x, y }));
        }
      }
    }
  }
  return (point) => {
    const key = tileKey(expedition, point);
    return revealed.has(key) && !blocked.has(key) && isWalkable(tileAt(expedition, point));
  };
}

/** The open room whose doorway the avatar stands in, if any. */
export function doorwayAt(expedition: ExpeditionView, point: Point): MapRoomView | undefined {
  return expedition.rooms.find((room) => room.state === "open" && room.doorIn.x === point.x && room.doorIn.y === point.y);
}

/** Where the avatar stands when the map opens: in the current room, else the room cleared last, else the entrance. */
export function restingPoint(expedition: ExpeditionView): Point {
  const room =
    expedition.rooms.find((candidate) => candidate.id === expedition.currentRoomId) ??
    expedition.rooms.find((candidate) => candidate.id === expedition.lastClearedRoomId);
  return room?.center ?? expedition.start;
}

/** Where click-to-travel heads for a clicked tile: the doorway of an open room, otherwise the tile itself. */
export function travelTarget(expedition: ExpeditionView, point: Point): Point {
  const room = roomAt(expedition, point);
  return room?.state === "open" ? room.doorIn : point;
}
