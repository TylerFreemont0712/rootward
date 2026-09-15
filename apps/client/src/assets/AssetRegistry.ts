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
  | "avatars"
  | "props"
  | "npcs"
  | "portraits"
  | "creatures"
  | "brand";

/** Served from apps/client/public/generated, which is assets/generated at the repo root (see that folder's symlink). */
const BASE_URL = "/generated";

const NPCS = ["guildmaster", "lint", "archivist", "compiler", "quartermaster", "sergeant", "pip", "guard", "innkeeper", "pell"];
const ENEMIES = ["null-wraith", "off-by-one-goblin", "regex-sphinx", "tally-wisp", "type-mimic", "kiln-warden"];

const CATALOG: Readonly<Record<AssetCategory, ReadonlySet<string>>> = {
  enemies: new Set(ENEMIES),
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
  backgrounds: new Set(["foundry", "title"]),
  /** Map sprites for the player, keyed by class slug; distinct from the `classes` portrait. */
  avatars: new Set(["artificer"]),
  /** World props (content/packs/<pack>/props.yaml), drawn bottom-aligned on their footprint. */
  props: new Set([
    "guild-hall",
    "library",
    "smithy",
    "inn",
    "house-red",
    "house-blue",
    "market-stall",
    "town-gate",
    "fountain",
    "well",
    "oak",
    "pine",
    "bush",
    "lamp",
    "barrel",
    "crates",
    "fence",
    "bench",
    "signpost",
    "notice-board",
    "dummy",
    "cart",
    "flowers",
    "anvil",
    "furnace",
    "crucible",
    "gears",
    "glyph-pillar",
    "ore-rocks",
    "boulder",
    "kiln-gate",
    "kiln-arch",
    "tent",
    "campfire",
    "portal",
  ]),
  /** NPC map sprites; id is the NPC's `sprite` (its id unless the content says otherwise). */
  npcs: new Set(NPCS),
  /** Dialogue portraits: every NPC, plus the player's class. */
  portraits: new Set([...NPCS, "artificer"]),
  /** Enemy map sprites standing on world markers; id is the enemy template id. */
  creatures: new Set(ENEMIES),
  /** The title screen: the Guild emblem and a Maintainer seen from behind. */
  brand: new Set(["emblem", "wanderer"]),
};

/** Ground tile art: each terrain has this many interchangeable variants (`terrain/<id>-<n>.png`) that tile seamlessly. */
const TERRAIN = new Set(["grass", "dirt", "cobble", "flagstone", "planks", "water", "stone-wall", "ash", "basalt", "lava", "rock"]);
const TERRAIN_VARIANTS = 4;

/** Classes whose map sprite also has walk strips: `avatars/<id>-walk-<down|up|right>.png`, four frames side by side. */
const WALK_STRIPS = new Set(["artificer"]);
export const WALK_FRAMES = 4;
export type WalkDirection = "down" | "up" | "right";

/** A class's walk strip for one direction, or undefined when it has none (the static avatar is used instead). */
export function walkStripUrl(classSlug: string, direction: WalkDirection): string | undefined {
  return WALK_STRIPS.has(classSlug) ? `${BASE_URL}/avatars/${classSlug}-walk-${direction}.png` : undefined;
}

/** A display name to logical id, e.g. "Off-By-One Goblin" -> "off-by-one-goblin". */
export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** The asset's URL, or undefined when `id` isn't in the known catalog for `category`. */
export function assetUrl(category: AssetCategory, id: string): string | undefined {
  return CATALOG[category].has(id) ? `${BASE_URL}/${category}/${id}.png` : undefined;
}

/** Every variant URL for a terrain, or none when it has no art (the renderer then fills tiles with its color). */
export function terrainVariantUrls(terrainId: string): string[] {
  if (!TERRAIN.has(terrainId)) return [];
  return Array.from({ length: TERRAIN_VARIANTS }, (_, index) => `${BASE_URL}/terrain/${terrainId}-${index}.png`);
}
