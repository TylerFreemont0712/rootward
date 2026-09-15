import { isWalkable, type Point, tileAt } from "@rootward/core/map";
import type { OverworldView } from "@rootward/shared";

// Exploration over the overworld (ADR-0010). Unlike fog.ts's room/door reasoning for an expedition, a zone has no
// rooms or doors to be lit by: movement and reveal are the plain, radius-based rules below.

export function tileKey(view: Pick<OverworldView, "width">, point: Point): number {
  return point.y * view.width + point.x;
}

/** Where the avatar may step: walkable tiles, full stop -- there is no room/door gating in an open zone. */
export function passableAt(view: OverworldView): (point: Point) => boolean {
  return (point) => isWalkable(tileAt(view, point));
}

/** Every tile within `radius` (a square) of a point. The screen unions this with what it has already shown this
 * mount, so ground once seen stays visible while the avatar keeps walking (see OverworldScreen). */
export function revealedAround(view: Pick<OverworldView, "width" | "height">, avatar: Point, radius = 6): ReadonlySet<number> {
  const revealed = new Set<number>();
  for (let y = Math.max(0, avatar.y - radius); y <= Math.min(view.height - 1, avatar.y + radius); y++) {
    for (let x = Math.max(0, avatar.x - radius); x <= Math.min(view.width - 1, avatar.x + radius); x++) {
      revealed.add(tileKey(view, { x, y }));
    }
  }
  return revealed;
}
