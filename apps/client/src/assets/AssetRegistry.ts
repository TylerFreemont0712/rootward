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
  | "brand"
  | "shardrun";

/** Served from apps/client/public/generated, which is assets/generated at the repo root (see that folder's symlink). */
const BASE_URL = "/generated";

const NPCS = ["guildmaster", "lint", "archivist", "compiler", "quartermaster", "sergeant", "pip", "guard", "innkeeper", "pell"];
const ENEMIES = ["null-wraith", "off-by-one-goblin", "regex-sphinx", "tally-wisp", "type-mimic", "kiln-warden"];
/** Shardrun's deeper layers (ADR-0013); their sprites share the `creatures` folder. */
const SHARDRUN_FOES = [
  "memory-leak-ooze",
  "race-condition-imp",
  "dangling-pointer",
  "garbage-collector",
  "deadlock-golem",
  "stack-overflow-serpent",
  "segfault-specter",
  "fork-bomb",
  "root-daemon",
];
/** Every class, playable or planned (PROMPT.md section 6). */
const CLASSES = ["artificer", "warden", "shade", "oracle", "keeper", "necromancer", "summoner"];
const RELICS = [
  "debugger-duck",
  "firewall",
  "patch-kit",
  "cache-hit",
  "lens-of-types",
  "ecc-memory",
  "grimoire-page",
  "mana-capacitor",
  "overclocked-core",
  "second-grimoire",
  "tuning-fork",
];
const SHARD_ICONS = [
  "fork",
  "lazy-fork",
  "amplify",
  "kindle",
  "chill",
  "arc",
  "ward",
  "seeker",
  "scatter",
  "pierce",
  "sieve",
  "focus",
  "ramp",
  "headcount",
  "adapt",
  "exploit",
  "echo",
  "overclock",
  "prism",
  "double-tap",
  "bulwark",
  "priority-queue",
  "apex",
  "tally",
  "rewind",
  "temper",
  "triage",
  "vengeance",
  "patience",
  "overflow",
  "siphon",
  "charge",
  "cascade",
  "resonate",
];

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
  backgrounds: new Set(["foundry", "title", "salvage", "arena-salvage", "arena-heap", "arena-kernel"]),
  /** Map sprites for the player, keyed by class slug; distinct from the `classes` portrait. */
  avatars: new Set(CLASSES),
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
  portraits: new Set([...NPCS, ...CLASSES]),
  /** Enemy map sprites standing on world markers; id is the enemy template id. */
  creatures: new Set([...ENEMIES, ...SHARDRUN_FOES]),
  /** The title screen: the Guild emblem and a Maintainer seen from behind. */
  brand: new Set(["emblem", "wanderer", "shardrun"]),
  /** Shardrun (ADR-0012): `bolt-<element|ward>` projectiles and `shard-<id>` icons (an upgrade shares its base's icon). */
  shardrun: new Set([
    ...["none", "fire", "frost", "spark", "ward"].map((kind) => `bolt-${kind}`),
    ...SHARD_ICONS.map((id) => `shard-${id}`),
    ...["fight", "elite", "boss", "rest", "forge", "treasure"].map((kind) => `map-${kind}`),
    ...RELICS.map((id) => `relic-${id}`),
  ]),
};

/** A shard's icon, or undefined when it has none. `fork-plus` uses `fork`'s icon. */
export function shardIconUrl(shardId: string): string | undefined {
  return assetUrl("shardrun", `shard-${shardId.replace(/-plus$/, "")}`);
}

/** Ground tile art: each terrain has this many interchangeable variants (`terrain/<id>-<n>.png`) that tile seamlessly. */
const TERRAIN = new Set(["grass", "dirt", "cobble", "flagstone", "planks", "water", "stone-wall", "ash", "basalt", "lava", "rock"]);
const TERRAIN_VARIANTS = 4;

/** Classes whose map sprite also has walk strips: `avatars/<id>-walk-<down|up|right>.png`, frames side by side. */
const WALK_STRIPS = new Set(["artificer"]);
/** Frames in a strip: the standing pose first, then the walk cycle (contact, passing, other contact, other passing). */
export const WALK_STRIP_FRAMES = 5;
export const WALK_CYCLE_FRAMES = 4;
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
