import type { OverworldView } from "@rootward/shared";
import { type Span, tileSpan } from "./grid.ts";
import { tileKey } from "./overworld-fog.ts";
import { ROOM_GLYPHS } from "./rooms.ts";

/** One Span per grid cell for an overworld zone, matching grid.ts's drawLines shape for an ExpeditionView but with
 * markers instead of rooms/doors: a zone has neither. */
export function drawOverworldLines(
  view: OverworldView,
  revealed: ReadonlySet<number>,
  avatarX: number,
  avatarY: number,
  from: number,
  to: number,
): Span[][] {
  const markers = new Map<number, Span>();
  for (const marker of view.markers) {
    markers.set(tileKey(view, marker), {
      text: ROOM_GLYPHS[marker.kind === "boss" ? "boss" : "encounter"],
      className: `mark ${marker.state}`,
    });
  }

  const lines: Span[][] = [];
  for (let y = from; y < to; y++) {
    const row = view.tiles[y] ?? "";
    const spans: Span[] = [];
    for (let x = 0; x < view.width; x++) {
      const key = tileKey(view, { x, y });
      if (x === avatarX && y === avatarY) {
        spans.push({ text: "@", className: "avatar", underlying: tileSpan(row[x], undefined).className });
        continue;
      }
      if (!revealed.has(key)) {
        spans.push({ text: " ", className: "" });
        continue;
      }
      spans.push(markers.get(key) ?? tileSpan(row[x], undefined));
    }
    lines.push(spans);
  }
  return lines;
}
