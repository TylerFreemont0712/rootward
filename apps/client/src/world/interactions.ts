import { findPath, isWalkable, type Point, tileAt } from "@rootward/core/map";
import type { ZoneView } from "@rootward/shared";
import type { WalkDirection } from "../assets/AssetRegistry.ts";

// Walking and using things in a zone (ADR-0011), as plain functions over a ZoneView so they can be tested without a
// browser. The server re-checks everything that matters (where the Maintainer stopped, who is close enough to talk
// to); these only decide what the screen does next.

export type Facing = "up" | "down" | "left" | "right";

export const STEP: Readonly<Record<Facing, Point>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Something used from beside it with E or a click. */
export interface Target {
  kind: "npc" | "feature";
  id: string;
  label: string;
  x: number;
  y: number;
}

/** Something that happens by stepping onto its tile. */
export interface Trigger {
  kind: "marker" | "portal";
  id: string;
}

export interface Walker {
  avatar: Point;
  /** Tiles still to walk, nearest first. */
  route: Point[];
  facing: Facing;
  /** What to use once the route ends beside it. */
  then?: Target | undefined;
}

export function tileKey(zone: Pick<ZoneView, "width">, point: Point): number {
  return point.y * zone.width + point.x;
}

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export function isNear(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
}

export function passableIn(zone: ZoneView): (point: Point) => boolean {
  const grid = { width: zone.width, height: zone.height, tiles: zone.collision };
  return (point) => isWalkable(tileAt(grid, point));
}

/** An open marker starts its fight and a portal leads on; won and sealed markers are just ground. */
export function triggerAt(zone: ZoneView, point: Point): Trigger | undefined {
  const marker = zone.markers.find((candidate) => candidate.state === "open" && same(candidate, point));
  if (marker) return { kind: "marker", id: marker.id };
  const portal = zone.portals.find((candidate) => same(candidate, point));
  return portal ? { kind: "portal", id: portal.id } : undefined;
}

export function targetAt(zone: ZoneView, point: Point): Target | undefined {
  const npc = zone.npcs.find((candidate) => same(candidate, point));
  if (npc) return { kind: "npc", id: npc.id, label: npc.name, x: npc.x, y: npc.y };
  const feature = zone.features.find((candidate) => same(candidate, point));
  return feature ? { kind: "feature", id: feature.id, label: feature.label, x: feature.x, y: feature.y } : undefined;
}

/** What E would use: the tile being faced first, then the tile underfoot, then any other neighbor. */
export function nearbyTarget(zone: ZoneView, avatar: Point, facing: Facing): Target | undefined {
  const order = [STEP[facing], { x: 0, y: 0 }, ...Object.values(STEP).filter((step) => step !== STEP[facing])];
  for (const step of order) {
    const target = targetAt(zone, { x: avatar.x + step.x, y: avatar.y + step.y });
    if (target) return target;
  }
  return undefined;
}

export function facingToward(from: Point, to: Point): Facing | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return undefined;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/**
 * A route (starting at `from`) that walks around open markers and portals, so clicking somewhere past a monster does
 * not start its fight on the way. The destination itself may be one: clicking a monster means fighting it.
 */
export function routeTo(zone: ZoneView, from: Point, to: Point): Point[] | undefined {
  const canStep = passableIn(zone);
  const grid = { width: zone.width, height: zone.height, tiles: zone.collision };
  return findPath(grid, from, to, (point) => canStep(point) && (same(point, to) || triggerAt(zone, point) === undefined));
}

/** The shortest route to a tile from which `target` can be used: beside it, or on it when it can be stood on. */
export function approachRoute(zone: ZoneView, from: Point, target: Point): Point[] | undefined {
  const canStep = passableIn(zone);
  let best: Point[] | undefined;
  for (const step of [{ x: 0, y: 0 }, ...Object.values(STEP)]) {
    const spot = { x: target.x + step.x, y: target.y + step.y };
    if (!canStep(spot) || triggerAt(zone, spot)) continue;
    const route = routeTo(zone, from, spot);
    if (route && (!best || route.length < best.length)) best = route;
  }
  return best;
}

/**
 * One tick of walking: follow the route if there is one, otherwise take a step in the held direction. Walking into
 * something solid only turns to face it, and a route that has become blocked is dropped.
 */
export function nextStep(walker: Walker, held: Facing | undefined, canStep: (point: Point) => boolean): Walker {
  const [next, ...rest] = walker.route;
  if (next) {
    if (!canStep(next)) return { ...walker, route: [], then: undefined };
    return { ...walker, avatar: next, route: rest, facing: facingToward(walker.avatar, next) ?? walker.facing };
  }
  if (!held) return walker;
  const target = { x: walker.avatar.x + STEP[held].x, y: walker.avatar.y + STEP[held].y };
  if (canStep(target)) return { avatar: target, route: [], facing: held };
  return walker.facing === held ? walker : { ...walker, facing: held };
}

/** Walk strips exist for down, up, and right; walking left plays the right-facing strip mirrored. */
export function walkStrip(facing: Facing): { direction: WalkDirection; mirrored: boolean } {
  return facing === "left" ? { direction: "right", mirrored: true } : { direction: facing, mirrored: false };
}

/** Tiles within `radius` (a circle) of the Maintainer; nothing when the zone has no sight limit. */
export function revealedAround(zone: Pick<ZoneView, "width" | "height">, avatar: Point, radius: number | undefined): Set<number> {
  const revealed = new Set<number>();
  if (radius === undefined) return revealed;
  for (let y = Math.max(0, avatar.y - radius); y <= Math.min(zone.height - 1, avatar.y + radius); y++) {
    for (let x = Math.max(0, avatar.x - radius); x <= Math.min(zone.width - 1, avatar.x + radius); x++) {
      if ((x - avatar.x) ** 2 + (y - avatar.y) ** 2 <= radius * radius) revealed.add(tileKey(zone, { x, y }));
    }
  }
  return revealed;
}

/**
 * Which tile-art variant a cell uses: scattered, but always the same for the same cell.
 * LEARN: multiplying coordinates by large odd constants and XOR-ing them is a classic spatial hash, but its low bits are
 * weak (on the diagonal x = 3y they cancel out completely), and `% count` only looks at low bits. The two
 * shift-and-multiply rounds after it (a hash "finalizer") fold the high bits down into the low ones. `Math.imul` keeps
 * every multiplication in 32-bit integers, and `>>> 0` reads the result as unsigned so `%` never goes negative.
 */
export function variantIndex(x: number, y: number, count: number): number {
  if (count <= 0) return 0;
  let hash = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) % count;
}

/** A short label for whatever stands at a tile, for the hover tooltip. */
export function labelAt(zone: ZoneView, point: Point): string | undefined {
  const npc = zone.npcs.find((candidate) => same(candidate, point));
  if (npc) return npc.title ? `${npc.name}, ${npc.title}` : npc.name;
  const marker = zone.markers.find((candidate) => same(candidate, point));
  if (marker) {
    const state = marker.state === "cleared" ? " (won)" : marker.state === "sealed" ? " (sealed)" : "";
    return `${marker.enemyName}: ${marker.title}${state}`;
  }
  const portal = zone.portals.find((candidate) => same(candidate, point));
  if (portal) return portal.locked ? `${portal.label} (locked)` : portal.label;
  return zone.features.find((candidate) => same(candidate, point))?.label;
}
