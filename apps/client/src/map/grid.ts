import { TILE } from "@rootward/core/map";
import type { ExpeditionView } from "@rootward/shared";
import { tileKey } from "./fog.ts";
import { ROOM_GLYPHS } from "./rooms.ts";

/**
 * One rendered grid cell. `className` is a space-separated semantic tag ("wall", "door open", "mark cleared",
 * "avatar", ...) that TileMapRenderer keys off of to pick an image; `text` carries the legacy ASCII glyph only so
 * a room marker's kind can be recovered via ROOM_GLYPHS, since className alone doesn't carry that. `underlying`
 * is only set on the avatar cell, so the renderer can draw the right terrain image under the avatar token
 * instead of guessing.
 */
export interface Span {
  text: string;
  className: string;
  underlying?: string;
}

export const DOOR_GLYPHS: Readonly<Record<string, string>> = { "door open": "+", door: "'", "door locked": "=" };

export const TILE_STYLE: Readonly<Record<string, Span>> = {
  [TILE.wall]: { text: "#", className: "wall" },
  [TILE.floor]: { text: ".", className: "floor" },
  [TILE.corridor]: { text: "·", className: "corridor" },
  [TILE.prop]: { text: "&", className: "prop" },
  [TILE.rubble]: { text: "~", className: "rubble" },
};

export function isWallAt(tiles: readonly string[], x: number, y: number): boolean {
  return tiles[y]?.[x] === TILE.wall;
}

/**
 * Which of the two generated wall pieces a wall cell needs, from its four neighbors -- one straight run
 * (tileable as-is) and one L-shaped corner mask (see assets/README.md), each rotated to fit. "wall-corner.png"
 * in its unrotated form fills the right and bottom edges (an L opening toward the top-left), so a 90deg
 * clockwise turn of that shape covers (bottom, left), 180deg covers (left, top), 270deg covers (top, right).
 * Anything this simple scheme doesn't cover (a T-junction, a lone wall cell) falls back to the plain straight
 * texture unrotated -- there's no dead end in a generated dungeon (or overworld zone) this shape can't classify
 * from real layouts, but nothing hard-relies on that staying true. Shared by TileMapRenderer and OverworldRenderer.
 */
export function wallOrientation(tiles: readonly string[], x: number, y: number): { corner: boolean; rotate: number } {
  const n = isWallAt(tiles, x, y - 1);
  const s = isWallAt(tiles, x, y + 1);
  const e = isWallAt(tiles, x + 1, y);
  const w = isWallAt(tiles, x - 1, y);

  if (e && s && !n && !w) return { corner: true, rotate: 0 };
  if (s && w && !n && !e) return { corner: true, rotate: 90 };
  if (w && n && !s && !e) return { corner: true, rotate: 180 };
  if (n && e && !s && !w) return { corner: true, rotate: 270 };
  if (n && s && !e && !w) return { corner: false, rotate: 90 };
  return { corner: false, rotate: 0 };
}

export function tileSpan(code: string | undefined, doorClass: string | undefined): Span {
  if (code === TILE.door) {
    const className = doorClass ?? "door locked";
    return { text: DOOR_GLYPHS[className] ?? "+", className };
  }
  return (code === undefined ? undefined : TILE_STYLE[code]) ?? { text: " ", className: "" };
}

/** One Span per grid cell, one row per Y coordinate from `from` to `to`. */
export function drawLines(
  expedition: ExpeditionView,
  revealed: ReadonlySet<number>,
  avatarX: number,
  avatarY: number,
  from: number,
  to: number,
): Span[][] {
  const doors = new Map<number, string>([[tileKey(expedition, expedition.entrance.doorOut), "door"]]);
  const markers = new Map<number, Span>();
  for (const room of expedition.rooms) {
    const passable = room.state === "cleared" || room.state === "current";
    doors.set(tileKey(expedition, room.doorIn), room.state === "open" ? "door open" : passable ? "door" : "door locked");
    if (room.doorOut) doors.set(tileKey(expedition, room.doorOut), passable ? "door" : "door locked");
    markers.set(tileKey(expedition, room.center), { text: ROOM_GLYPHS[room.kind], className: `mark ${room.state}` });
  }

  const lines: Span[][] = [];
  for (let y = from; y < to; y++) {
    const row = expedition.tiles[y] ?? "";
    const spans: Span[] = [];
    for (let x = 0; x < expedition.width; x++) {
      const key = tileKey(expedition, { x, y });
      const marker = markers.get(key);
      if (x === avatarX && y === avatarY) {
        spans.push({ text: "@", className: "avatar", underlying: tileSpan(row[x], doors.get(key)).className });
      } else if (marker && (!revealed.has(key) || row[x] !== TILE.prop)) spans.push(marker);
      else if (!revealed.has(key)) spans.push({ text: " ", className: "" });
      else spans.push(tileSpan(row[x], doors.get(key)));
    }
    lines.push(spans);
  }
  return lines;
}
