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

export const ProfileListResponse = z.strictObject({
  profiles: z.array(ProfileView),
  /** Profile id -> summary. */
  summaries: z.record(z.string(), ProfileSummaryView),
  startingClass: StartingClassView.optional(),
});
export type ProfileListResponse = z.infer<typeof ProfileListResponse>;

export const ProfileResponse = z.strictObject({ profile: ProfileView });
export type ProfileResponse = z.infer<typeof ProfileResponse>;

export const CreateProfileRequest = z.strictObject({ name: z.string().min(1).max(60) });
export type CreateProfileRequest = z.infer<typeof CreateProfileRequest>;

// ---- The world (ADR-0010, ADR-0011): towns and wilds walked freely, with people, quests, and fights ----

/** Screens the world can send the player to. */
export const WorldScreenId = z.enum(["guild-board", "chronicle", "practice"]);
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
