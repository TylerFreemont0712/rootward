import { z } from "zod";

// The HTTP contract between client and server. Both sides parse with these schemas: the server before it answers
// (which also strips anything the schema does not list), the client when a response arrives. This file must stay
// browser-safe: zod only, no Node imports.

export const RUN_STATUSES = ["ok", "compile-error", "runtime-error", "timeout", "oom", "sandbox-error"] as const;
export const RunStatus = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatus>;

const MAX_FILE_BYTES = 200_000;
const MAX_FILES = 20;

/** Files the player submits: relative path -> contents. */
export const FileMap = z
  .record(z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9_\-./]+$/), z.string().max(MAX_FILE_BYTES))
  .refine((files) => Object.keys(files).length <= MAX_FILES, { error: `at most ${MAX_FILES} files` });
export type FileMap = z.infer<typeof FileMap>;

export const ChallengeSummary = z.strictObject({
  id: z.string(),
  title: z.string(),
  realm: z.string(),
  difficulty: z.number(),
  estimatedMinutes: z.number(),
  languages: z.array(z.string()),
  /** Languages that have a runner on this machine right now. */
  playableLanguages: z.array(z.string()),
  enemyName: z.string(),
});
export type ChallengeSummary = z.infer<typeof ChallengeSummary>;

export const ChallengeListResponse = z.strictObject({ challenges: z.array(ChallengeSummary) });
export type ChallengeListResponse = z.infer<typeof ChallengeListResponse>;

/** A single practice fight outside any dungeon. */
export const StartEncounterRequest = z.strictObject({
  challengeId: z.string().min(1),
  language: z.string().min(1),
  seed: z.string().min(1).max(100).optional(),
});
export type StartEncounterRequest = z.infer<typeof StartEncounterRequest>;

export const SessionLength = z.enum(["short", "standard", "long"]);
export type SessionLength = z.infer<typeof SessionLength>;

export const StartExpeditionRequest = z.strictObject({
  language: z.string().min(1),
  /** Defaults to `planner.default_session` in config/balance.yaml. */
  length: SessionLength.optional(),
  seed: z.string().min(1).max(100).optional(),
});
export type StartExpeditionRequest = z.infer<typeof StartExpeditionRequest>;

export const EnterRoomRequest = z.strictObject({ roomId: z.string().min(1).max(100) });
export type EnterRoomRequest = z.infer<typeof EnterRoomRequest>;

export const ActionRequest = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("probe"), files: FileMap }),
  z.strictObject({ type: z.literal("cast"), files: FileMap }),
  z.strictObject({ type: z.literal("hint") }),
  z.strictObject({ type: z.literal("retreat") }),
  /** Give up on the whole run. */
  z.strictObject({ type: z.literal("abandon") }),
]);
export type ActionRequest = z.infer<typeof ActionRequest>;

export const TestView = z.strictObject({
  id: z.string(),
  /** Visible tests show their name. Hidden tests only ever show a category label such as "boundary #1". */
  label: z.string(),
  visibility: z.enum(["visible", "hidden"]),
  status: z.enum(["idle", "pass", "fail"]),
  revealed: z.boolean(),
  durationMs: z.number().optional(),
  runStatus: RunStatus.optional(),
  /** Visible tests only: the input, expected and actual output, and the failure message. */
  input: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  message: z.string().optional(),
});
export type TestView = z.infer<typeof TestView>;

export const EnemyActionView = z.strictObject({
  move: z.string(),
  damage: z.number().optional(),
  category: z.string().optional(),
  fallbackFrom: z.string().optional(),
  taunt: z.string().optional(),
});
export type EnemyActionView = z.infer<typeof EnemyActionView>;

export const LogEntry = z.strictObject({
  kind: z.enum(["probe", "cast", "enemy", "hint", "retreat", "won", "exhausted", "panic", "refused"]),
  text: z.string(),
});
export type LogEntry = z.infer<typeof LogEntry>;

export const EncounterView = z.strictObject({
  runId: z.string(),
  roomId: z.string(),
  status: z.enum(["active", "won", "retreated", "exhausted", "kernel-panic"]),
  challenge: z.strictObject({
    id: z.string(),
    title: z.string(),
    realm: z.string(),
    prompt: z.string(),
    intro: z.string(),
    difficulty: z.number(),
    estimatedMinutes: z.number(),
    concepts: z.array(z.string()),
    language: z.string(),
    languages: z.array(z.string()),
    entry: z.string(),
    maxLines: z.number().optional(),
    bannedTokens: z.array(z.string()),
    targetComplexity: z.string().optional(),
  }),
  enemy: z.strictObject({
    name: z.string(),
    tier: z.union([z.number(), z.string()]),
    art: z.string().optional(),
    intro: z.string(),
    defeat: z.string(),
    hp: z.number(),
    hpMax: z.number(),
    hpDisplayed: z.number(),
    lastAction: EnemyActionView.optional(),
  }),
  player: z.strictObject({
    className: z.string(),
    integrity: z.number(),
    integrityMax: z.number(),
    focus: z.number(),
    focusMax: z.number(),
    cycles: z.number(),
  }),
  starterFiles: FileMap,
  /** The most recently submitted files, so a resumed fight restores the editor. */
  editorFiles: FileMap,
  tests: z.array(TestView),
  hints: z.strictObject({
    total: z.number(),
    taken: z.array(z.strictObject({ level: z.number(), name: z.string(), text: z.string(), cost: z.number() })),
    nextCost: z.number().optional(),
  }),
  casts: z.number(),
  retreatSuggested: z.boolean(),
  lastRun: z
    .strictObject({
      kind: z.enum(["probe", "cast"]),
      status: RunStatus,
      console: z.string(),
      wallMs: z.number(),
    })
    .optional(),
  rewards: z.strictObject({ bonuses: z.array(z.string()), commits: z.number(), cycles: z.number() }).optional(),
  /** Present after a Retreat or when Focus ran out: the reference solution and its explanation. */
  retreat: z.strictObject({ solutionFiles: FileMap, explanation: z.string().optional() }).optional(),
  /** This fight's log; every room starts a fresh one. */
  log: z.array(LogEntry),
});
export type EncounterView = z.infer<typeof EncounterView>;

// ---- The expedition map (ADR-0008) ----

export const MapPoint = z.strictObject({ x: z.int(), y: z.int() });
export type MapPoint = z.infer<typeof MapPoint>;

export const RoomKind = z.enum(["encounter", "elite", "shrine", "puzzle", "rest", "boss"]);
export type RoomKind = z.infer<typeof RoomKind>;

/**
 * A room as seen from where the player stands: `open` rooms can be entered now, `ahead` rooms lie on later floors, and
 * `sealed` rooms are branches not taken (or out of reach because the run is over).
 */
export const RoomState = z.enum(["cleared", "current", "open", "ahead", "sealed"]);
export type RoomState = z.infer<typeof RoomState>;

export const MapRoomView = z.strictObject({
  id: z.string(),
  floor: z.int(),
  kind: RoomKind,
  purpose: z.string(),
  state: RoomState,
  outcome: z.enum(["won", "retreated", "exhausted"]).optional(),
  /** What waits inside, once the room's door has been open to the player. Fog of war hides rooms further down. */
  details: z
    .strictObject({
      title: z.string(),
      enemyName: z.string(),
      difficulty: z.number(),
      concept: z.string().optional(),
    })
    .optional(),
  x: z.int(),
  y: z.int(),
  width: z.int(),
  height: z.int(),
  /** Where the avatar stands inside the room. */
  center: MapPoint,
  /** The door in the top wall; the room is entered here. */
  doorIn: MapPoint,
  /** The door toward the next floor; the boss room has none. */
  doorOut: MapPoint.optional(),
});
export type MapRoomView = z.infer<typeof MapRoomView>;

export const ExpeditionView = z.strictObject({
  length: SessionLength,
  language: z.string(),
  floorCount: z.int(),
  width: z.int(),
  height: z.int(),
  /** One string per row of tile codes: " " rock, "#" wall, "." floor, "+" door, "," corridor, "&" prop, "~" rubble. */
  tiles: z.array(z.string()),
  entrance: z.strictObject({
    x: z.int(),
    y: z.int(),
    width: z.int(),
    height: z.int(),
    center: MapPoint,
    doorOut: MapPoint,
  }),
  start: MapPoint,
  rooms: z.array(MapRoomView),
  edges: z.array(z.tuple([z.string(), z.string()])),
  currentRoomId: z.string().optional(),
  /** The last room finished; the path continues from its lower door. */
  lastClearedRoomId: z.string().optional(),
  /** Why the planner built this dungeon, in plain words. */
  rationale: z.array(z.strictObject({ kind: z.string(), text: z.string() })),
});
export type ExpeditionView = z.infer<typeof ExpeditionView>;

export const ApiError = z.strictObject({ code: z.string(), message: z.string() });
export type ApiError = z.infer<typeof ApiError>;

export const RunView = z.strictObject({
  runId: z.string(),
  status: z.enum(["active", "ended"]),
  endReason: z.enum(["kernel-panic", "completed", "retreated", "abandoned"]).optional(),
  player: z.strictObject({
    className: z.string(),
    integrity: z.number(),
    integrityMax: z.number(),
    cycles: z.number(),
  }),
  /** Present for expeditions; a practice fight has no dungeon around it. */
  expedition: ExpeditionView.optional(),
  /** The fight in progress, or the one that just ended, so its outcome can still be shown. */
  encounter: EncounterView.optional(),
});
export type RunView = z.infer<typeof RunView>;

export const RunResponse = z.strictObject({
  run: RunView,
  /** Set when the action was refused by the rules; the run view is still current. */
  refused: ApiError.optional(),
});
export type RunResponse = z.infer<typeof RunResponse>;

// ---- The learner model (ADR-0009) ----

/** 0 Unseen, 1 Seen, 2 Assisted, 3 Unaided, 4 Retained, 5 Mastered. */
export const MasteryLevel = z.int().min(0).max(5);

export const WeakSpot = z.strictObject({ category: z.string(), count: z.int() });
export type WeakSpot = z.infer<typeof WeakSpot>;

export const LearnerNodeView = z.strictObject({
  id: z.string(),
  name: z.string(),
  realm: z.string(),
  tier: z.int(),
  mastery: MasteryLevel,
  rating: z.number(),
  commits: z.number(),
  attempts: z.int(),
  wins: z.int(),
  lastSeen: z.string().optional(),
});
export type LearnerNodeView = z.infer<typeof LearnerNodeView>;

export const LearnerView = z.strictObject({
  /** The Maintainer's level as semver. */
  version: z.string(),
  fights: z.int(),
  dungeonsCleared: z.int(),
  /** Every skill node, with progress where there is any. */
  nodes: z.array(LearnerNodeView),
  weakSpots: z.array(WeakSpot),
});
export type LearnerView = z.infer<typeof LearnerView>;

export const LearnerResponse = z.strictObject({ learner: LearnerView });
export type LearnerResponse = z.infer<typeof LearnerResponse>;

export const DebriefView = z.strictObject({
  runId: z.string(),
  status: z.enum(["active", "ended"]),
  endReason: z.enum(["kernel-panic", "completed", "retreated", "abandoned"]).optional(),
  language: z.string(),
  roomsCleared: z.int(),
  floors: z.int(),
  versionBefore: z.string(),
  versionAfter: z.string(),
  /** Commits earned by the fights won in this run. */
  commits: z.number(),
  crits: z.int(),
  retreats: z.int(),
  fights: z.array(
    z.strictObject({
      roomId: z.string(),
      title: z.string(),
      outcome: z.enum(["won", "retreated", "exhausted", "kernel-panic"]),
      bonuses: z.array(z.string()),
      commits: z.number(),
    }),
  ),
  /** Each concept this run was evidence for, before and after. */
  concepts: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      commits: z.number(),
      masteryBefore: MasteryLevel,
      masteryAfter: MasteryLevel,
      ratingBefore: z.number(),
      ratingAfter: z.number(),
    }),
  ),
  weakSpots: z.array(WeakSpot),
  /** Concepts the next expedition would introduce, from a planner preview. */
  nextUp: z.array(z.strictObject({ id: z.string(), name: z.string() })),
});
export type DebriefView = z.infer<typeof DebriefView>;

export const DebriefResponse = z.strictObject({ debrief: DebriefView });
export type DebriefResponse = z.infer<typeof DebriefResponse>;

export const ErrorResponse = z.strictObject({ error: ApiError });
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const HealthResponse = z.strictObject({
  ok: z.literal(true),
  engineVersion: z.string(),
  runners: z.array(z.strictObject({ id: z.string(), languages: z.array(z.string()), available: z.boolean() })),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

// ---- Characters ("profiles"), ADR-0010 ----

export const ProfileView = z.strictObject({ id: z.string(), name: z.string(), classId: z.string(), createdAt: z.string() });
export type ProfileView = z.infer<typeof ProfileView>;

/** What a character has done so far, for the title screen. */
export const ProfileSummaryView = z.strictObject({
  className: z.string(),
  version: z.string(),
  fights: z.int(),
  /** Where the character stands in the world; absent until they arrive. */
  zoneName: z.string().optional(),
  questsActive: z.int(),
  questsDone: z.int(),
});
export type ProfileSummaryView = z.infer<typeof ProfileSummaryView>;

/** The class a new character starts as, from content. */
export const StartingClassView = z.strictObject({
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  discipline: z.string(),
});
export type StartingClassView = z.infer<typeof StartingClassView>;

/** A class in the character creation picker; planned ones are shown but cannot be chosen yet. */
export const ClassCardView = z.strictObject({
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  discipline: z.string(),
  subjects: z.array(z.string()),
  playable: z.boolean(),
});
export type ClassCardView = z.infer<typeof ClassCardView>;

export const ProfileListResponse = z.strictObject({
  profiles: z.array(ProfileView),
  /** Profile id -> summary. */
  summaries: z.record(z.string(), ProfileSummaryView),
  startingClass: StartingClassView.optional(),
  /** Every class, in picker order. */
  classes: z.array(ClassCardView),
});
export type ProfileListResponse = z.infer<typeof ProfileListResponse>;

export const ProfileResponse = z.strictObject({ profile: ProfileView });
export type ProfileResponse = z.infer<typeof ProfileResponse>;

export const CreateProfileRequest = z.strictObject({
  name: z.string().min(1).max(60),
  /** Defaults to the starting class; must be playable. */
  classId: z.string().min(1).optional(),
});
export type CreateProfileRequest = z.infer<typeof CreateProfileRequest>;

// ---- The world (ADR-0010, ADR-0011): towns and wilds walked freely, with people, quests, and fights ----

/** Screens the world can send the player to. */
export const WorldScreenId = z.enum(["guild-board", "chronicle", "practice", "shardrun"]);
export type WorldScreenId = z.infer<typeof WorldScreenId>;

export const ZonePropView = z.strictObject({
  propId: z.string(),
  name: z.string(),
  /** Top-left tile of the footprint; the art is drawn bottom-aligned on it and may rise above it. */
  x: z.int(),
  y: z.int(),
  w: z.int(),
  h: z.int(),
});
export type ZonePropView = z.infer<typeof ZonePropView>;

export const ZoneNpcView = z.strictObject({
  id: z.string(),
  name: z.string(),
  title: z.string().optional(),
  /** Art id for the map sprite. */
  sprite: z.string(),
  x: z.int(),
  y: z.int(),
  /** `offer`: talking can start a quest. `turn-in`: one of their quests is ready to hand in. */
  indicator: z.enum(["offer", "turn-in"]).optional(),
});
export type ZoneNpcView = z.infer<typeof ZoneNpcView>;

export const ZoneFeatureView = z.strictObject({ id: z.string(), x: z.int(), y: z.int(), label: z.string() });
export type ZoneFeatureView = z.infer<typeof ZoneFeatureView>;

export const ZonePortalView = z.strictObject({
  id: z.string(),
  x: z.int(),
  y: z.int(),
  label: z.string(),
  locked: z.boolean(),
});
export type ZonePortalView = z.infer<typeof ZonePortalView>;

export const ZoneMarkerView = z.strictObject({
  id: z.string(),
  kind: z.enum(["encounter", "boss"]),
  x: z.int(),
  y: z.int(),
  /** `sealed` markers cannot be fought until their condition holds (a gate that opens after a quest). */
  state: z.enum(["open", "cleared", "sealed"]),
  title: z.string(),
  enemyId: z.string(),
  enemyName: z.string(),
  difficulty: z.number(),
});
export type ZoneMarkerView = z.infer<typeof ZoneMarkerView>;

export const ZoneView = z.strictObject({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["town", "wild"]),
  realmId: z.string().optional(),
  /** Tiles lit around the Maintainer; absent means the whole zone is visible. */
  sight: z.int().optional(),
  ambience: z.string(),
  arrival: z.string(),
  width: z.int(),
  height: z.int(),
  /** One string per row of legend characters. */
  tiles: z.array(z.string()),
  legend: z.record(z.string(), z.strictObject({ terrain: z.string(), color: z.string(), walkable: z.boolean() })),
  /** Where movement is possible right now, as rows of dungeon tile codes ("." walkable, "#" blocked), so the client's
   * pathfinding is the same `findPath` an expedition uses. */
  collision: z.array(z.string()),
  props: z.array(ZonePropView),
  npcs: z.array(ZoneNpcView),
  features: z.array(ZoneFeatureView),
  portals: z.array(ZonePortalView),
  markers: z.array(ZoneMarkerView),
});
export type ZoneView = z.infer<typeof ZoneView>;

export const QuestObjectiveView = z.strictObject({
  text: z.string(),
  done: z.boolean(),
  current: z.int(),
  target: z.int(),
});
export type QuestObjectiveView = z.infer<typeof QuestObjectiveView>;

export const QuestView = z.strictObject({
  id: z.string(),
  name: z.string(),
  giverName: z.string(),
  summary: z.string(),
  status: z.enum(["active", "ready", "done"]),
  objectives: z.array(QuestObjectiveView),
  rewardText: z.string().optional(),
});
export type QuestView = z.infer<typeof QuestView>;

export const WorldView = z.strictObject({
  /** The language fights in the world are played in. */
  language: z.string(),
  zone: ZoneView,
  position: MapPoint,
  /** Started quests, unfinished first. */
  quests: z.array(QuestView),
});
export type WorldView = z.infer<typeof WorldView>;

export const ConversationView = z.strictObject({
  /** Who is being talked to and where the conversation is, so a choice can be sent back. Absent for signs. */
  npcId: z.string().optional(),
  nodeId: z.string().optional(),
  speakerName: z.string(),
  speakerTitle: z.string().optional(),
  /** Art id for the speaker's portrait. */
  portrait: z.string().optional(),
  text: z.string(),
  choices: z.array(z.strictObject({ index: z.int(), text: z.string() })),
});
export type ConversationView = z.infer<typeof ConversationView>;

export const WorldResponse = z.strictObject({ world: WorldView });
export type WorldResponse = z.infer<typeof WorldResponse>;

/** `world` is null until the character has arrived in the world. */
export const WorldStatusResponse = z.strictObject({ world: WorldView.nullable() });
export type WorldStatusResponse = z.infer<typeof WorldStatusResponse>;

/** The result of talking, choosing, inspecting, or using a portal. */
export const WorldActionResponse = z.strictObject({
  world: WorldView,
  /** The next line to show; absent when the conversation is over. */
  conversation: ConversationView.optional(),
  open: WorldScreenId.optional(),
  /** Changes worth announcing, such as "Quest started: The Foundry Cools". */
  notices: z.array(z.string()),
});
export type WorldActionResponse = z.infer<typeof WorldActionResponse>;

/** Arrive in the world, or change the language its fights are played in. */
export const StartWorldRequest = z.strictObject({ language: z.string().min(1) });
export type StartWorldRequest = z.infer<typeof StartWorldRequest>;

export const MoveWorldRequest = z.strictObject({ x: z.int(), y: z.int() });
export type MoveWorldRequest = z.infer<typeof MoveWorldRequest>;

export const MoveWorldResponse = z.strictObject({ position: MapPoint });
export type MoveWorldResponse = z.infer<typeof MoveWorldResponse>;

export const TravelRequest = z.strictObject({ portalId: z.string().min(1) });
export type TravelRequest = z.infer<typeof TravelRequest>;

export const TalkRequest = z.strictObject({ npcId: z.string().min(1) });
export type TalkRequest = z.infer<typeof TalkRequest>;

export const ChooseRequest = z.strictObject({ npcId: z.string().min(1), nodeId: z.string().min(1), choice: z.int().min(0) });
export type ChooseRequest = z.infer<typeof ChooseRequest>;

export const InspectRequest = z.strictObject({ featureId: z.string().min(1) });
export type InspectRequest = z.infer<typeof InspectRequest>;

export const ResolveMarkerRequest = z.strictObject({ runId: z.string().min(1) });
export type ResolveMarkerRequest = z.infer<typeof ResolveMarkerRequest>;

// ---- Shardrun (ADR-0012, ADR-0013): the roguelite mode, where spells are pipelines of found code ----

export const ElementView = z.enum(["none", "fire", "frost", "spark"]);
export type ElementView = z.infer<typeof ElementView>;

export const BoltView = z.strictObject({
  power: z.number(),
  element: ElementView,
  target: z.enum(["front", "back", "weakest", "strongest", "all"]),
  pierce: z.boolean(),
  ward: z.boolean(),
});
export type BoltView = z.infer<typeof BoltView>;

export const ShardView = z.strictObject({
  id: z.string(),
  name: z.string(),
  rarity: z.enum(["common", "uncommon", "rare"]),
  /** Mana added to every cast of a spell holding it. */
  cost: z.int(),
  /** Plain words for what the code does; absent on difficulties that show only the code. */
  summary: z.string().optional(),
  /** The function's name and source in the run's language. */
  function: z.string(),
  code: z.string(),
  tags: z.array(z.string()),
  /** Integrity burned by each cast. */
  curse: z.int().optional(),
  forge: z.strictObject({ into: z.string(), intoName: z.string(), verb: z.enum(["upgrade", "repair"]) }).optional(),
});
export type ShardView = z.infer<typeof ShardView>;

export const RelicView = z.strictObject({
  id: z.string(),
  name: z.string(),
  rarity: z.enum(["common", "uncommon", "rare", "boss"]),
  icon: z.string(),
  summary: z.string(),
  flavor: z.string(),
});
export type RelicView = z.infer<typeof RelicView>;

export const ShardrunMapNodeView = z.strictObject({
  id: z.string(),
  /** 0 is the bottom row; the boss is alone in the top row. */
  row: z.int(),
  col: z.int(),
  kind: z.enum(["fight", "elite", "boss", "rest", "forge", "treasure"]),
  /** `current`: the room the Maintainer is in or just left. `open`: can be entered now. `passed`: a road not taken. */
  state: z.enum(["visited", "current", "open", "passed", "ahead"]),
  foes: z.array(z.strictObject({ name: z.string(), sprite: z.string() })),
});
export type ShardrunMapNodeView = z.infer<typeof ShardrunMapNodeView>;

/** What a list of bolts would do if the spell ended with it: present only when predictions are shown (or after casting). */
export const BoltOutcomeView = z.strictObject({ bolts: z.int(), damage: z.int(), block: z.int() });
export type BoltOutcomeView = z.infer<typeof BoltOutcomeView>;

export const SpellStepView = z.strictObject({
  shard: z.string(),
  given: z.int(),
  returned: z.int(),
  /** The bolts this shard passed on (up to the trace cap). */
  bolts: z.array(BoltView),
  outcome: BoltOutcomeView.optional(),
});
export type SpellStepView = z.infer<typeof SpellStepView>;

/** A spell run against the current battle, from a real run of its shards: the cost, and step by step what it did. */
export const SpellRunView = z.strictObject({
  cost: z.int(),
  affordable: z.boolean(),
  /** The bolt every spell starts from. */
  base: z.strictObject({ bolts: z.array(BoltView), outcome: BoltOutcomeView.optional() }),
  /** One step per shard that ran; empty when predictions are hidden. */
  steps: z.array(SpellStepView),
  result: BoltOutcomeView.optional(),
  /** Why the spell would fizzle, and where, when its code fails. */
  misfire: z.strictObject({ reason: z.string(), shard: z.string().optional(), line: z.int().optional() }).optional(),
  /** Anything the shards printed. */
  console: z.string(),
});
export type SpellRunView = z.infer<typeof SpellRunView>;

export const SpellView = z.strictObject({
  id: z.string(),
  name: z.string(),
  capacity: z.int(),
  shards: z.array(z.string()),
  /** Already cast this turn. */
  spent: z.boolean(),
  /** Absent while the spell is still running in the sandbox (see `previews`). */
  preview: SpellRunView.optional(),
});
export type SpellView = z.infer<typeof SpellView>;

export const ShardrunFoeView = z.strictObject({
  uid: z.string(),
  name: z.string(),
  sprite: z.string(),
  hp: z.int(),
  max: z.int(),
  shield: z.int(),
  weak: z.array(ElementView),
  resist: z.array(ElementView),
  trait: z.strictObject({ kind: z.string(), name: z.string(), text: z.string() }).optional(),
  /** This turn's full-strength element, against a pattern ward. */
  pattern: ElementView.optional(),
  intent: z.strictObject({ kind: z.enum(["strike", "multi", "shield", "stoke", "heal"]), text: z.string() }),
  stoked: z.boolean(),
  flavor: z.string(),
});
export type ShardrunFoeView = z.infer<typeof ShardrunFoeView>;

export const ShardrunLogView = z.strictObject({
  kind: z.string(),
  text: z.string(),
  /** A foe's uid. */
  foe: z.string().optional(),
  spell: z.string().optional(),
  amount: z.int().optional(),
  element: ElementView.optional(),
});
export type ShardrunLogView = z.infer<typeof ShardrunLogView>;

export const ShardrunDifficultyView = z.strictObject({ id: z.string(), name: z.string(), summary: z.string() });
export type ShardrunDifficultyView = z.infer<typeof ShardrunDifficultyView>;

/** The numbers every run plays by, before relics change them. */
export const ShardrunRulesView = z.strictObject({
  manaPerTurn: z.int(),
  baseBoltPower: z.int(),
  spellBaseCost: z.int(),
  workPerMana: z.int(),
  maxBolts: z.int(),
  maxBoltPower: z.int(),
  maxSpells: z.int(),
  maxSpellCapacity: z.int(),
  weakMultiplier: z.number(),
  resistMultiplier: z.number(),
  scatterMultiplier: z.number(),
  patternOffMultiplier: z.number(),
  restHealFraction: z.number(),
  layerHealFraction: z.number(),
});
export type ShardrunRulesView = z.infer<typeof ShardrunRulesView>;

/** One rule, as it stands now: what it is, what it started as, and which relics moved it. */
export const ShardrunModifierView = z.strictObject({
  label: z.string(),
  base: z.string(),
  now: z.string(),
  from: z.array(z.string()),
});
export type ShardrunModifierView = z.infer<typeof ShardrunModifierView>;

export const ShardrunView = z.strictObject({
  id: z.string(),
  status: z.enum(["map", "battle", "reward", "rest", "forge", "won", "lost", "abandoned"]),
  language: z.string(),
  difficulty: z.strictObject({ id: z.string(), name: z.string(), showSummaries: z.boolean(), showPredictions: z.boolean() }),
  /** Counts accepted commands; previews fetched for an older revision are stale. */
  revision: z.int(),
  integrity: z.int(),
  integrityMax: z.int(),
  layer: z.strictObject({ index: z.int(), count: z.int(), id: z.string(), name: z.string(), flavor: z.string(), backdrop: z.string() }),
  map: z.strictObject({ nodes: z.array(ShardrunMapNodeView), edges: z.array(z.tuple([z.string(), z.string()])) }),
  spells: z.array(SpellView),
  inventory: z.array(z.string()),
  relics: z.array(z.string()),
  /** Every shard the run mentions (held, offered, or forged into), by id. */
  shards: z.record(z.string(), ShardView),
  /** Every relic the run mentions (held or offered), by id. */
  relicInfo: z.record(z.string(), RelicView),
  battle: z
    .strictObject({
      kind: z.enum(["fight", "elite", "boss"]),
      turn: z.int(),
      mana: z.int(),
      manaMax: z.int(),
      block: z.int(),
      foes: z.array(ShardrunFoeView),
    })
    .optional(),
  /** `pending` while spell previews are still running; fetch them from `.../shardrun/previews`. */
  previews: z.enum(["ready", "pending"]),
  reward: z
    .strictObject({
      shards: z.array(z.string()).optional(),
      relics: z.array(z.string()).optional(),
      spell: z.strictObject({ name: z.string(), capacity: z.int() }).optional(),
    })
    .optional(),
  /** At a forge: held shards that can be reworked, and spells that can be widened. */
  forge: z.strictObject({ shards: z.array(z.string()), spells: z.array(z.string()) }).optional(),
  /** Integrity resting would restore, while resting. */
  restHeal: z.int().optional(),
  /** In the response to a cast: that cast, step by step, with every value shown. */
  replay: z.strictObject({ spellId: z.string(), run: SpellRunView }).optional(),
  /** What the last command did, in order. */
  log: z.array(ShardrunLogView),
  stats: z.strictObject({
    fights: z.int(),
    turns: z.int(),
    casts: z.int(),
    damage: z.int(),
    shards: z.int(),
    relics: z.int(),
    layers: z.int(),
    manaSpent: z.int(),
    bolts: z.int(),
    fizzled: z.int(),
    /** Spell id -> damage dealt this run. */
    damageBySpell: z.record(z.string(), z.int()),
  }),
  /** Every rule this run plays by, before relics. */
  rules: ShardrunRulesView,
  /** What the relics held have changed, for the Stats panel. */
  modifiers: z.array(ShardrunModifierView),
});
export type ShardrunView = z.infer<typeof ShardrunView>;

/** One shard in the Codex: everything about it, plus where a run can find it. */
export const CodexShardView = z.strictObject({
  shard: ShardView,
  draftable: z.boolean(),
  /** In plain words: "fights", "elites", "guardians", "a forge". */
  found: z.array(z.string()),
});
export type CodexShardView = z.infer<typeof CodexShardView>;

export const CodexRelicView = z.strictObject({ relic: RelicView, found: z.array(z.string()) });
export type CodexRelicView = z.infer<typeof CodexRelicView>;

export const CodexFoeView = z.strictObject({
  id: z.string(),
  name: z.string(),
  sprite: z.string(),
  hp: z.int(),
  weak: z.array(ElementView),
  resist: z.array(ElementView),
  trait: z.strictObject({ kind: z.string(), name: z.string(), text: z.string() }).optional(),
  /** Its intents in order, as the arena shows them. */
  intents: z.array(z.strictObject({ kind: z.string(), text: z.string() })),
  flavor: z.string(),
  /** Where it is met. */
  layers: z.array(z.strictObject({ id: z.string(), name: z.string(), role: z.enum(["fight", "elite", "boss"]) })),
});
export type CodexFoeView = z.infer<typeof CodexFoeView>;

export const CodexLayerView = z.strictObject({
  id: z.string(),
  name: z.string(),
  flavor: z.string(),
  backdrop: z.string(),
  rows: z.int(),
  bosses: z.array(z.string()),
});
export type CodexLayerView = z.infer<typeof CodexLayerView>;


/** Everything Shardrun content holds, for the Codex screen. Not scoped to a character or a run. */
export const ShardrunCodexResponse = z.strictObject({
  language: z.string(),
  shards: z.array(CodexShardView),
  relics: z.array(CodexRelicView),
  foes: z.array(CodexFoeView),
  layers: z.array(CodexLayerView),
  rules: ShardrunRulesView,
});
export type ShardrunCodexResponse = z.infer<typeof ShardrunCodexResponse>;

export const ShardrunResponse = z.strictObject({ run: ShardrunView });
export type ShardrunResponse = z.infer<typeof ShardrunResponse>;

/** The latest run (finished ones stay until a new run starts), and what a new run can be started with. */
export const ShardrunStatusResponse = z.strictObject({
  run: ShardrunView.nullable(),
  languages: z.array(z.string()),
  difficulties: z.array(ShardrunDifficultyView),
});
export type ShardrunStatusResponse = z.infer<typeof ShardrunStatusResponse>;

/** Spell previews for the active battle at `revision`, once every spell has run. */
export const ShardrunPreviewsResponse = z.strictObject({ revision: z.int(), spells: z.record(z.string(), SpellRunView) });
export type ShardrunPreviewsResponse = z.infer<typeof ShardrunPreviewsResponse>;

export const StartShardrunRequest = z.strictObject({ language: z.string().min(1), difficulty: z.string().min(1) });
export type StartShardrunRequest = z.infer<typeof StartShardrunRequest>;

export const ShardrunCommandRequest = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("enter"), nodeId: z.string().min(1) }),
  z.strictObject({
    type: z.literal("arrange"),
    spells: z.array(z.strictObject({ id: z.string().min(1), shards: z.array(z.string()) })),
    inventory: z.array(z.string()),
  }),
  z.strictObject({ type: z.literal("cast"), spellId: z.string().min(1) }),
  z.strictObject({ type: z.literal("end-turn") }),
  z.strictObject({ type: z.literal("take"), shardId: z.string().nullable() }),
  z.strictObject({ type: z.literal("claim-relic"), relicId: z.string().min(1) }),
  z.strictObject({ type: z.literal("claim-spell") }),
  z.strictObject({ type: z.literal("leave") }),
  z.strictObject({ type: z.literal("rest") }),
  z.strictObject({ type: z.literal("forge"), shardId: z.string().nullable() }),
  z.strictObject({ type: z.literal("widen"), spellId: z.string().min(1) }),
  z.strictObject({ type: z.literal("abandon") }),
]);
export type ShardrunCommandRequest = z.infer<typeof ShardrunCommandRequest>;
