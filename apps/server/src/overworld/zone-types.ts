// A hand-authored overworld zone (ADR-0010): a walkable grid with fixed encounter/boss markers, distinct from a
// DungeonPlan (no rooms, no doors, no floors). Kept as plain TS data rather than a new content-pack kind: one
// static zone for one realm does not carry the weight of a new schema, loader, and diagnostics wiring.

export interface ZoneMarker {
  id: string;
  kind: "encounter" | "boss";
  x: number;
  y: number;
  /** The skill node this marker is evidence for; used to rank `challengePool` against the player's mastery. */
  nodeId: string;
  /** Candidate challenge ids, best-first once ranked; the first one still unseen recently wins. */
  challengePool: readonly string[];
}

export interface ZoneDef {
  realmId: string;
  realmName: string;
  width: number;
  height: number;
  /** One string per row of tile codes, the `TILE` alphabet from `@rootward/core/map`. Not `readonly`: `DungeonMap`
   * (which `findPath`/`tileAt`'s `TileGrid` is drawn from) isn't either, and a zone is never mutated in place. */
  tiles: string[];
  entry: { x: number; y: number };
  markers: readonly ZoneMarker[];
  bossMarkerId: string;
}
