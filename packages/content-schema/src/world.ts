import { z } from "zod";
import { ID_PATTERN, Id, NonEmptyString } from "./primitives.ts";

// The walkable world (ADR-0011): terrain and props to build zones from, the people in them, and the quests they give.
// Everything a zone lets the Maintainer do is backed by real state -- fights cleared, mastery from the learner model,
// and flags that finished quests set -- so no line of dialogue stands in for a mechanic that does not exist.

const ID_BODY = ID_PATTERN.source.slice(1, -1);

export const GridPoint = z.strictObject({ x: z.int().min(0), y: z.int().min(0) });
export type GridPoint = z.infer<typeof GridPoint>;

export const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i, { error: "colors are #rrggbb" });

/** `<zone id>/<marker id>`: one fight marker anywhere in the world. */
export const MarkerRef = z.string().regex(new RegExp(`^${ID_BODY}/${ID_BODY}$`), {
  error: "marker references are <zone id>/<marker id>",
});

export const QUEST_STATUSES = ["not-started", "active", "ready", "done"] as const;
/** `ready` means active with every objective met, waiting to be handed in. */
export const QuestStatus = z.enum(QUEST_STATUSES);
export type QuestStatus = z.infer<typeof QuestStatus>;

// LEARN: a recursive schema needs its TypeScript type written out by hand, because inference cannot follow a type that
// refers to itself. `z.lazy` defers reading `WorldCondition` until parse time, after the constant exists.
export type WorldCondition =
  | { quest: string; status: QuestStatus }
  | { flag: string }
  | { cleared: string }
  | { cleared_in: string; at_least: number }
  | { mastery: string; at_least: number }
  | { all: WorldCondition[] }
  | { any: WorldCondition[] }
  | { not: WorldCondition };

/** A fact about the Maintainer's progress that dialogue, props, portals, and markers can depend on. */
export const WorldCondition: z.ZodType<WorldCondition> = z.lazy(() =>
  z.union([
    z.strictObject({ quest: Id, status: QuestStatus }),
    z.strictObject({ flag: Id }),
    z.strictObject({ cleared: MarkerRef }),
    /** At least this many markers cleared in one zone. */
    z.strictObject({ cleared_in: Id, at_least: z.int().min(1) }),
    /** Mastery level (0-5) on a skill node, from the learner model. */
    z.strictObject({ mastery: Id, at_least: z.int().min(0).max(5) }),
    z.strictObject({ all: z.array(WorldCondition).min(1) }),
    z.strictObject({ any: z.array(WorldCondition).min(1) }),
    z.strictObject({ not: WorldCondition }),
  ]),
);

/** Screens the client opens from the world. The server never acts on these; it passes them back to the client. */
export const WORLD_SCREENS = ["guild-board", "chronicle", "practice", "shardrun"] as const;
export const WorldScreen = z.enum(WORLD_SCREENS);
export type WorldScreen = z.infer<typeof WorldScreen>;

/** What choosing a line of dialogue or using a feature does. */
export const WorldEffect = z.union([
  z.strictObject({ start_quest: Id }),
  /** Only works when the quest is `ready`; sets the quest's reward flags. */
  z.strictObject({ complete_quest: Id }),
  z.strictObject({ set_flag: Id }),
  z.strictObject({ open: WorldScreen }),
]);
export type WorldEffect = z.infer<typeof WorldEffect>;

// --- Building blocks ------------------------------------------------------------------------------------------------

/** One kind of ground. Tile art is optional: without it the client fills the tile with `color`. */
export const Terrain = z.strictObject({
  id: Id,
  name: NonEmptyString,
  walkable: z.boolean(),
  color: HexColor,
});
export type Terrain = z.infer<typeof Terrain>;

/** `terrain.yaml` */
export const TerrainFile = z.strictObject({ terrain: z.array(Terrain).min(1) });
export type TerrainFile = z.infer<typeof TerrainFile>;

/** Something placed on the ground: a building, a tree, a barrel. Its art is drawn bottom-aligned on its footprint and
 * may be taller than the footprint, so a house's roof rises over the tiles behind it. */
export const Prop = z.strictObject({
  id: Id,
  name: NonEmptyString,
  footprint: z.strictObject({ w: z.int().min(1).max(12), h: z.int().min(1).max(12) }).default({ w: 1, h: 1 }),
  /** Whether the footprint stops movement; flowers and rune circles do not. */
  blocking: z.boolean().default(true),
});
export type Prop = z.infer<typeof Prop>;

/** `props.yaml` */
export const PropsFile = z.strictObject({ props: z.array(Prop).min(1) });
export type PropsFile = z.infer<typeof PropsFile>;

// --- People and conversations ---------------------------------------------------------------------------------------

export const DialogueChoice = z.strictObject({
  text: NonEmptyString,
  /** Hidden unless this holds. */
  if: WorldCondition.optional(),
  effects: z.array(WorldEffect).default([]),
  /** The node shown next; without one, choosing this ends the conversation. */
  goto: Id.optional(),
});
export type DialogueChoice = z.infer<typeof DialogueChoice>;

export const DialogueNode = z.strictObject({
  /** Another NPC who speaks this line (Lint chiming in); defaults to whoever is being talked to. */
  speaker: Id.optional(),
  text: NonEmptyString,
  /** No choices means the line ends the conversation. */
  choices: z.array(DialogueChoice).default([]),
});
export type DialogueNode = z.infer<typeof DialogueNode>;

export const DialogueOpening = z.strictObject({ if: WorldCondition.optional(), goto: Id });
export type DialogueOpening = z.infer<typeof DialogueOpening>;

export const Dialogue = z.strictObject({
  /** Tried in order; the first whose `if` holds opens the conversation. The last one should have no `if`. */
  start: z.array(DialogueOpening).min(1),
  nodes: z.record(Id, DialogueNode),
});
export type Dialogue = z.infer<typeof Dialogue>;

/** `npcs/<id>.yaml` */
export const Npc = z.strictObject({
  id: Id,
  name: NonEmptyString,
  title: NonEmptyString.optional(),
  /** Art ids for the map sprite and the dialogue portrait; both default to the NPC's id. */
  sprite: Id.optional(),
  portrait: Id.optional(),
  dialogue: Dialogue,
});
export type Npc = z.infer<typeof Npc>;

// --- Quests ---------------------------------------------------------------------------------------------------------

export const QuestObjective = z.union([
  z.strictObject({ text: NonEmptyString, cleared: MarkerRef }),
  z.strictObject({ text: NonEmptyString, cleared_in: Id, at_least: z.int().min(1) }),
  z.strictObject({ text: NonEmptyString, mastery: Id, at_least: z.int().min(1).max(5) }),
  z.strictObject({ text: NonEmptyString, flag: Id }),
]);
export type QuestObjective = z.infer<typeof QuestObjective>;

/** `quests/<id>.yaml` */
export const Quest = z.strictObject({
  id: Id,
  name: NonEmptyString,
  /** The NPC who hands it out and takes it back. */
  giver: Id,
  summary: NonEmptyString,
  objectives: z.array(QuestObjective).min(1),
  rewards: z.strictObject({
    flags: z.array(Id).default([]),
    /** Shown in the journal once the quest is done. */
    text: NonEmptyString,
  }),
});
export type Quest = z.infer<typeof Quest>;

// --- Zones ----------------------------------------------------------------------------------------------------------

export const ZonePropPlacement = z.strictObject({
  prop: Id,
  /** Top-left tile of the footprint. */
  x: z.int().min(0),
  y: z.int().min(0),
  /** Present only while this holds (a sealed gate that disappears once opened). */
  if: WorldCondition.optional(),
});
export type ZonePropPlacement = z.infer<typeof ZonePropPlacement>;

export const ZoneNpcPlacement = z.strictObject({
  npc: Id,
  x: z.int().min(0),
  y: z.int().min(0),
  if: WorldCondition.optional(),
});
export type ZoneNpcPlacement = z.infer<typeof ZoneNpcPlacement>;

/** Something to inspect: a sign, a door, a notice board. Used from an adjacent tile. */
export const ZoneFeature = z.strictObject({
  id: Id,
  x: z.int().min(0),
  y: z.int().min(0),
  label: NonEmptyString,
  text: NonEmptyString,
  if: WorldCondition.optional(),
  effects: z.array(WorldEffect).default([]),
});
export type ZoneFeature = z.infer<typeof ZoneFeature>;

/** A way to another zone, used by walking onto it. */
export const ZonePortal = z.strictObject({
  id: Id,
  x: z.int().min(0),
  y: z.int().min(0),
  label: NonEmptyString,
  to: z.strictObject({ zone: Id, portal: Id }),
  /** Where someone arriving through this portal stands: next to it, so arriving does not travel straight back. */
  arrive: GridPoint,
  /** Locked unless this holds. */
  if: WorldCondition.optional(),
  locked_text: NonEmptyString.optional(),
});
export type ZonePortal = z.infer<typeof ZonePortal>;

/** A fight, started by walking onto it. */
export const ZoneMarker = z.strictObject({
  id: Id,
  kind: z.enum(["encounter", "boss"]),
  x: z.int().min(0),
  y: z.int().min(0),
  /** The skill node the fight is evidence for; ranks `challenges` against the player's mastery. */
  node: Id,
  challenges: z.array(Id).min(1),
  /** Sealed unless this holds. */
  if: WorldCondition.optional(),
});
export type ZoneMarker = z.infer<typeof ZoneMarker>;

export const AMBIENCES = ["none", "embers", "leaves"] as const;

/** `zones/<id>.yaml` */
export const Zone = z
  .strictObject({
    id: Id,
    name: NonEmptyString,
    kind: z.enum(["town", "wild"]),
    /** Exactly one zone in all content is where new characters arrive. */
    start: z.boolean().default(false),
    realm: Id.optional(),
    /** How many tiles around the Maintainer are lit; omitted means the whole zone is visible (towns). */
    sight: z.int().min(2).optional(),
    ambience: z.enum(AMBIENCES).default("none"),
    /** Music id (`audio/<id>`) played while walking the zone; presentation only, silent without the file (ADR-0023). */
    music: Id.optional(),
    /** One line shown under the zone's name on arrival. */
    arrival: NonEmptyString,
    /** Tile character -> terrain id. */
    legend: z.record(z.string().length(1), Id),
    /** One line per row of tile characters, all the same width. */
    tiles: NonEmptyString,
    entry: GridPoint,
    props: z.array(ZonePropPlacement).default([]),
    npcs: z.array(ZoneNpcPlacement).default([]),
    features: z.array(ZoneFeature).default([]),
    portals: z.array(ZonePortal).default([]),
    markers: z.array(ZoneMarker).default([]),
  })
  .superRefine((zone, ctx) => {
    const rows = zoneRows(zone);
    const width = rows[0]?.length ?? 0;
    const unknown = new Set<string>();
    rows.forEach((row, y) => {
      if (row.length !== width) {
        ctx.addIssue({ code: "custom", path: ["tiles"], message: `row ${y} is ${row.length} tiles wide; row 0 is ${width}` });
      }
      for (const char of row) if (!Object.hasOwn(zone.legend, char)) unknown.add(char);
    });
    for (const char of unknown) {
      ctx.addIssue({ code: "custom", path: ["legend"], message: `tile character "${char}" is not in the legend` });
    }
    const inBounds = (point: GridPoint, path: (string | number)[]) => {
      if (point.x >= width || point.y >= rows.length) {
        ctx.addIssue({ code: "custom", path, message: `(${point.x}, ${point.y}) is outside the ${width}x${rows.length} zone` });
      }
    };
    inBounds(zone.entry, ["entry"]);
    const placed = { props: zone.props, npcs: zone.npcs, features: zone.features, portals: zone.portals, markers: zone.markers };
    for (const [field, items] of Object.entries(placed)) {
      items.forEach((item, i) => {
        inBounds(item, [field, i]);
      });
    }
    zone.portals.forEach((portal, i) => {
      inBounds(portal.arrive, ["portals", i, "arrive"]);
    });
  });
export type Zone = z.infer<typeof Zone>;

/** A zone's tile rows. YAML block scalars end with a newline, which is not a row. */
export function zoneRows(zone: Pick<Zone, "tiles">): string[] {
  return zone.tiles.replace(/\n+$/, "").split("\n");
}
