/**
 * Looks up optional AI-generated art by category + logical id (see assets/README.md at the repo root for the
 * generation pipeline). Every category has a fixed catalog of known ids; any other id returns undefined instead
 * of guessing a URL, so every call site keeps its own glyph/text fallback and the build never depends on an
 * asset existing (AGENT.md).
 */

export type AssetCategory =
  | "enemies"
  | "classes"
  | "items"
  | "oaths"
  | "realms"
  | "rooms"
  | "doors"
  | "tiles"
  | "hud"
  | "backgrounds"
  | "avatars";

/** Served from apps/client/public/generated, which is assets/generated at the repo root (see that folder's symlink). */
const BASE_URL = "/generated";

const CATALOG: Readonly<Record<AssetCategory, ReadonlySet<string>>> = {
  enemies: new Set(["null-wraith", "off-by-one-goblin", "regex-sphinx", "tally-wisp", "type-mimic"]),
  classes: new Set(["artificer"]),
  items: new Set(["rubber-duck", "stack-trace-lens"]),
  oaths: new Set([
    "oath-of-the-foundry",
    "oath-of-the-web",
    "oath-of-the-citadel",
    "oath-of-the-archives",
    "oath-of-the-interview",
    "oath-of-the-shadow",
    "oath-of-the-depths",
  ]),
  realms: new Set([
    "foundry",
    "grove",
    "kernel",
    "archives",
    "spire",
    "citadel",
    "bazaar",
    "ruins",
    "observatory",
    "depths",
    "assembly",
  ]),
  rooms: new Set(["encounter", "elite", "boss", "shrine", "puzzle", "rest"]),
  doors: new Set(["open", "closed", "locked"]),
  /** "wall-corner" is an L-shaped mask over the wall texture (transparent in the open quadrant, so the floor
   * shows through); TileMapRenderer rotates it to cover all four corner orientations from this one asset. */
  tiles: new Set(["wall", "wall-corner", "floor", "corridor", "prop", "rubble"]),
  hud: new Set(["integrity", "focus", "cycles"]),
  /** Full-bleed opaque backdrops (one per realm, eventually); id is the realm id. Only "foundry" exists so far --
   * it's the only realm any seeded content is actually set in. */
  backgrounds: new Set(["foundry"]),
  /** Top-down map tokens, distinct from the `classes` portrait; id is the class slug. */
  avatars: new Set(["artificer"]),
};

/** A display name to logical id, e.g. "Off-By-One Goblin" -> "off-by-one-goblin". */
export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** The asset's URL, or undefined when `id` isn't in the known catalog for `category`. */
export function assetUrl(category: AssetCategory, id: string): string | undefined {
  return CATALOG[category].has(id) ? `${BASE_URL}/${category}/${id}.png` : undefined;
}
