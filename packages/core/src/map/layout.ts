import type { DungeonPlan, PlanRoom, RoomKind } from "../planner/types.ts";
import { createRng } from "../rng.ts";
import { type DungeonMap, type MapRoom, type Point, type Rect, TILE } from "./types.ts";

// Lays a DungeonPlan out as a tile map that descends toward Root: an entrance landing at the top, one horizontal band
// per floor, a chamber per room, and corridors that run down from each room's bottom door along a hallway row to the
// top doors of the rooms it connects to. All variation (jitter, props, rubble) comes from the plan's seed.

const COLUMN_WIDTH = 20;
const COLUMNS = 3;
const MARGIN = 2;
const BAND_HEIGHT = 7;
const GAP = 4;
const ENTRANCE = { width: 11, height: 5 };

/** Chamber size including walls. Widths are odd so a door can sit exactly in the middle. */
const ROOM_SIZE: Readonly<Record<RoomKind, { width: number; height: number }>> = {
  encounter: { width: 9, height: 5 },
  elite: { width: 11, height: 5 },
  shrine: { width: 9, height: 5 },
  puzzle: { width: 9, height: 5 },
  rest: { width: 9, height: 5 },
  boss: { width: 15, height: 7 },
};

const bandTop = (floor: number) => 1 + ENTRANCE.height + GAP + floor * (BAND_HEIGHT + GAP);

export function layoutDungeon(plan: DungeonPlan): DungeonMap {
  const next = createRng(plan.seed, "map");
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const width = MARGIN * 2 + COLUMNS * COLUMN_WIDTH;
  const height = bandTop(plan.floors.length - 1) + BAND_HEIGHT + 2;
  const grid: string[][] = Array.from({ length: height }, () => Array<string>(width).fill(TILE.rock));
  const byId = new Map(plan.rooms.map((room) => [room.id, room]));

  const entranceRect: Rect = { x: Math.floor((width - ENTRANCE.width) / 2), y: 1, ...ENTRANCE };
  carveChamber(grid, entranceRect);
  const entranceCenter = { x: entranceRect.x + Math.floor(ENTRANCE.width / 2), y: entranceRect.y + Math.floor(ENTRANCE.height / 2) };
  const entranceDoor = { x: entranceCenter.x, y: entranceRect.y + ENTRANCE.height - 1 };
  set(grid, entranceDoor, TILE.door);

  const mapRooms: MapRoom[] = [];
  plan.floors.forEach((ids, floor) => {
    const offset = ((COLUMNS - ids.length) / 2) * COLUMN_WIDTH;
    ids.forEach((id, index) => {
      const room = byId.get(id);
      if (!room) throw new Error(`plan floor ${floor} lists unknown room ${id}`);
      const size = ROOM_SIZE[room.kind];
      const centerX = Math.round(MARGIN + offset + (index + 0.5) * COLUMN_WIDTH) + int(-2, 2);
      const rect: Rect = {
        x: centerX - Math.floor(size.width / 2),
        y: bandTop(floor) + int(0, BAND_HEIGHT - size.height),
        ...size,
      };
      carveChamber(grid, rect);
      const center = { x: centerX, y: rect.y + Math.floor(size.height / 2) };
      const doorIn = { x: centerX, y: rect.y };
      set(grid, doorIn, TILE.door);
      const mapRoom: MapRoom = { roomId: id, floor, ...rect, center, doorIn };
      if (floor < plan.floors.length - 1) {
        mapRoom.doorOut = { x: centerX, y: rect.y + size.height - 1 };
        set(grid, mapRoom.doorOut, TILE.door);
      }
      decorate(grid, rect, center, room, int);
      mapRooms.push(mapRoom);
    });
  });

  const rooms = new Map(mapRooms.map((room) => [room.roomId, room]));
  for (const id of plan.floors[0] ?? []) {
    const target = rooms.get(id);
    if (target) corridor(grid, entranceDoor, target.doorIn, hallway(-1));
  }
  for (const [from, to] of plan.edges) {
    const a = rooms.get(from);
    const b = rooms.get(to);
    if (!a?.doorOut || !b) throw new Error(`plan edge ${from}->${to} does not match its rooms`);
    corridor(grid, a.doorOut, b.doorIn, hallway(a.floor));
  }

  return {
    width,
    height,
    tiles: grid.map((row) => row.join("")),
    rooms: mapRooms,
    entrance: { ...entranceRect, center: entranceCenter, doorOut: entranceDoor },
    start: entranceCenter,
  };
}

/** The hallway row in the gap below a floor (floor -1 is the entrance landing). */
function hallway(floor: number): number {
  const top = floor < 0 ? 1 + ENTRANCE.height : bandTop(floor) + BAND_HEIGHT;
  return top + Math.floor(GAP / 2);
}

function set(grid: string[][], point: Point, code: string): void {
  const row = grid[point.y];
  if (row && point.x >= 0 && point.x < row.length) row[point.x] = code;
}

function carveChamber(grid: string[][], rect: Rect): void {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const edge = y === rect.y || y === rect.y + rect.height - 1 || x === rect.x || x === rect.x + rect.width - 1;
      set(grid, { x, y }, edge ? TILE.wall : TILE.floor);
    }
  }
}

/** Dig corridor through rock only: down from one door to the hallway, across, and down to the next door. */
function corridor(grid: string[][], fromDoor: Point, toDoor: Point, hallwayY: number): void {
  const dig = (x: number, y: number) => {
    if (grid[y]?.[x] === TILE.rock) set(grid, { x, y }, TILE.corridor);
  };
  for (let y = fromDoor.y + 1; y <= hallwayY; y++) dig(fromDoor.x, y);
  for (let x = Math.min(fromDoor.x, toDoor.x); x <= Math.max(fromDoor.x, toDoor.x); x++) dig(x, hallwayY);
  for (let y = hallwayY; y < toDoor.y; y++) dig(toDoor.x, y);
}

/**
 * Props that block movement, kept off the center column and center row so the way from door to door always stays
 * open, and walkable Bit Rot rubble in review rooms.
 */
function decorate(grid: string[][], rect: Rect, center: Point, room: PlanRoom, int: (min: number, max: number) => number): void {
  const inside = (x: number, y: number) => x > rect.x && x < rect.x + rect.width - 1 && y > rect.y && y < rect.y + rect.height - 1;
  const spots: Point[] = [];
  for (let y = rect.y + 1; y < rect.y + rect.height - 1; y++) {
    for (let x = rect.x + 1; x < rect.x + rect.width - 1; x++) {
      if (x !== center.x && y !== center.y && inside(x, y)) spots.push({ x, y });
    }
  }
  const take = (count: number, code: string) => {
    for (let i = 0; i < count && spots.length > 0; i++) {
      const [spot] = spots.splice(int(0, spots.length - 1), 1);
      if (spot) set(grid, spot, code);
    }
  };
  take(room.kind === "boss" ? int(2, 4) : int(0, 2), TILE.prop);
  if (room.purpose === "review") take(int(2, 4), TILE.rubble);
}
