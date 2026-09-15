import type { DatabaseSync } from "node:sqlite";
import {
  type Npc,
  type Quest,
  type Terrain,
  type WorldCondition,
  type WorldEffect,
  type Zone,
  type ZoneMarker,
  zoneRows,
} from "@rootward/content-schema";
import {
  applyEffects,
  type ChallengeQuery,
  type EffectOutcome,
  familiarConcepts,
  findPath,
  type Footprint,
  holds,
  isAdjacent,
  isWalkable,
  type LearnerSnapshot,
  objectiveProgress,
  offeredChoices,
  openingNode,
  type PlannerCatalog,
  type Point,
  questStatus,
  questsOffered,
  rankChallenges,
  tileAt,
  type TrackView,
  viewForLanguage,
  type WorldProgress,
  zoneCollision,
} from "@rootward/core";
import type {
  ChooseRequest,
  ConversationView,
  QuestView,
  RunResponse,
  WorldActionResponse,
  WorldView,
  ZoneMarkerView,
  ZoneNpcView,
  ZoneView,
} from "@rootward/shared";
import { z } from "zod";
import type { GameContent } from "../content.ts";
import { transaction } from "../db/database.ts";
import { settle } from "../db/promise.ts";
import { ServiceError } from "../errors.ts";
import { buildPlannerCatalog } from "../planning.ts";
import type { RunServiceRegistry } from "../runs/registry.ts";

const StateRow = z.object({ zone_id: z.string(), language: z.string(), flags: z.string(), quests: z.string() });
const ProgressRow = z.object({ zone_id: z.string(), pos_x: z.number(), pos_y: z.number(), cleared: z.string() });
const IdList = z.array(z.string());
const QuestStates = z.record(z.string(), z.enum(["active", "done"]));

export interface WorldServiceDeps {
  db: DatabaseSync;
  content: GameContent;
  registry: RunServiceRegistry;
  now?: () => string;
}

/** One character's world, read once per request: everything the rules and the views need. */
interface Snapshot {
  zone: Zone;
  language: string;
  position: Point;
  progress: WorldProgress;
  learner: LearnerSnapshot;
  track: TrackView;
  /** Where movement is possible right now, as dungeon tile codes. */
  collision: string[];
}

/**
 * The walkable world (ADR-0011): zones, people, and quests from content, with each character's place in it kept in
 * `world_state` and `zone_progress`. The rules themselves are pure functions in `@rootward/core`; this class reads the
 * state they need, checks what the client asks for (adjacency, reachability, conditions), and saves what changed. A
 * fight behind a marker is an ordinary run, started exactly like a practice fight (ADR-0010).
 */
export class WorldService {
  private readonly db: DatabaseSync;
  private readonly content: GameContent;
  private readonly registry: RunServiceRegistry;
  private readonly now: () => string;
  private readonly catalog: PlannerCatalog;
  private readonly zones: ReadonlyMap<string, Zone>;
  private readonly npcs: ReadonlyMap<string, Npc>;
  private readonly quests: ReadonlyMap<string, Quest>;
  private readonly terrain: ReadonlyMap<string, Terrain>;

  constructor(deps: WorldServiceDeps) {
    this.db = deps.db;
    this.content = deps.content;
    this.registry = deps.registry;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.catalog = buildPlannerCatalog(deps.content.index);
    const { index } = deps.content;
    const values = <T>(map: ReadonlyMap<string, { value: T }>) => new Map([...map].map(([id, sourced]) => [id, sourced.value]));
    this.zones = values(index.zones);
    this.npcs = values(index.npcs);
    this.quests = values(index.quests);
    this.terrain = values(index.terrain);
  }

  /** The character's world, or undefined before they have arrived in it. */
  async world(profileId: string): Promise<WorldView | undefined> {
    const snapshot = await this.snapshot(profileId);
    return snapshot && this.worldView(snapshot);
  }

  /** Arrive in the start zone; for a character already in the world, this only changes the language they fight in. */
  async start(profileId: string, language: string): Promise<WorldView> {
    const zone = this.startZone();
    await settle(() => {
      if (this.db.prepare("SELECT 1 FROM profiles WHERE id = ?").get(profileId) === undefined) {
        throw new ServiceError(404, "profile-not-found", "There is no such character.");
      }
      this.db
        .prepare(
          `INSERT INTO world_state (profile_id, zone_id, language, flags, quests, updated_at) VALUES (?, ?, ?, '[]', '{}', ?)
           ON CONFLICT (profile_id) DO UPDATE SET language = excluded.language, updated_at = excluded.updated_at`,
        )
        .run(profileId, zone.id, language, this.now());
    });
    return this.requireWorld(profileId);
  }

  /** Save where the Maintainer stopped walking. The client walks locally; the server checks the spot is walkable and
   * reachable from the last saved one, so a saved position can never be on the far side of a sealed gate. */
  async move(profileId: string, to: Point): Promise<Point> {
    const s = await this.requireSnapshot(profileId);
    const grid = gridOf(s.collision);
    if (!isWalkable(tileAt(grid, to))) {
      throw new ServiceError(400, "not-walkable", `(${to.x}, ${to.y}) is not walkable in ${s.zone.name}.`);
    }
    if (!findPath(grid, s.position, to)) {
      throw new ServiceError(400, "unreachable", `(${to.x}, ${to.y}) cannot be reached from where you stand.`);
    }
    await settle(() => {
      this.savePosition(profileId, s.zone.id, s.language, to);
    });
    return to;
  }

  /** Step through a portal. A locked one answers with its locked line instead of an error: that is ordinary play. */
  async travel(profileId: string, portalId: string): Promise<WorldActionResponse> {
    const s = await this.requireSnapshot(profileId);
    const portal = s.zone.portals.find((candidate) => candidate.id === portalId);
    if (!portal) throw new ServiceError(404, "portal-not-found", `There is no way called ${portalId} here.`);
    this.requireNear(s, portal, portal.label);
    if (!this.present(portal, s.progress)) {
      const text = portal.locked_text ?? `${portal.label} is shut.`;
      return { world: this.worldView(s), conversation: { speakerName: portal.label, text, choices: [] }, notices: [] };
    }
    const destination = this.zones.get(portal.to.zone);
    const arrival = destination?.portals.find((candidate) => candidate.id === portal.to.portal);
    // Content validation guarantees both exist, so a missing one is a bug rather than something the player did.
    if (!destination || !arrival) throw new Error(`portal ${s.zone.id}/${portal.id} leads nowhere (${portal.to.zone}/${portal.to.portal})`);
    await settle(() => {
      transaction(this.db, () => {
        this.db.prepare("UPDATE world_state SET zone_id = ?, updated_at = ? WHERE profile_id = ?").run(destination.id, this.now(), profileId);
        this.savePosition(profileId, destination.id, s.language, arrival.arrive);
      });
    });
    return { world: await this.requireWorld(profileId), notices: [] };
  }

  /** Start a conversation with someone standing next to the Maintainer. */
  async talk(profileId: string, npcId: string): Promise<WorldActionResponse> {
    const s = await this.requireSnapshot(profileId);
    const npc = this.npcNear(s, npcId);
    const conversation = this.conversation(npc, openingNode(npc.dialogue, this.check(s.progress)), s.progress);
    return { world: this.worldView(s), notices: [], ...(conversation ? { conversation } : {}) };
  }

  /** Pick a line of dialogue: it must be on offer right now, its effects are applied and saved, and the conversation
   * moves on to where the choice leads. */
  async choose(profileId: string, request: ChooseRequest): Promise<WorldActionResponse> {
    const s = await this.requireSnapshot(profileId);
    const npc = this.npcNear(s, request.npcId);
    const node = npc.dialogue.nodes[request.nodeId];
    const offered = node && offeredChoices(node, this.check(s.progress)).find((candidate) => candidate.index === request.choice);
    if (!offered) throw new ServiceError(409, "choice-unavailable", `${npc.name} is not offering that choice right now.`);
    const outcome = await this.apply(profileId, offered.choice.effects, s.progress);
    const after = await this.requireSnapshot(profileId);
    return this.actionResponse(after, outcome, this.conversation(npc, offered.choice.goto, after.progress));
  }

  /** Read a sign, knock on a door, or use anything else a zone marks as a feature. */
  async inspect(profileId: string, featureId: string): Promise<WorldActionResponse> {
    const s = await this.requireSnapshot(profileId);
    const feature = s.zone.features.find((candidate) => candidate.id === featureId && this.present(candidate, s.progress));
    if (!feature) throw new ServiceError(404, "feature-not-found", `There is nothing called ${featureId} here.`);
    this.requireNear(s, feature, feature.label);
    const outcome = await this.apply(profileId, feature.effects, s.progress);
    const after = await this.requireSnapshot(profileId);
    return this.actionResponse(after, outcome, { speakerName: feature.label, text: feature.text, choices: [] });
  }

  /** Walk into a marker: pick its best-fit challenge for this player and start it exactly like a practice fight. */
  async startMarkerEncounter(profileId: string, markerId: string): Promise<RunResponse> {
    const s = await this.requireSnapshot(profileId);
    const marker = this.markerHere(s, markerId);
    if (!this.present(marker, s.progress)) throw new ServiceError(409, "marker-sealed", "That fight is sealed for now.");
    this.requireNear(s, marker, "that fight");
    return this.registry.forProfile(profileId).startEncounter({ challengeId: this.pickChallengeId(s, marker), language: s.language });
  }

  /** After a marker's fight ends: a win clears the marker, anything else leaves it open to try again. The run must be
   * one of this marker's own challenges, so an unrelated practice win cannot clear it. */
  async resolveMarkerEncounter(profileId: string, markerId: string, runId: string): Promise<WorldView> {
    const s = await this.requireSnapshot(profileId);
    const marker = this.markerHere(s, markerId);
    const { run } = await this.registry.forProfile(profileId).getRun(runId);
    const challengeId = run.encounter?.challenge.id;
    if (challengeId === undefined || !marker.challenges.includes(challengeId)) {
      throw new ServiceError(409, "wrong-run", "That run is not this marker's fight.");
    }
    if (run.encounter?.status === "won") {
      const cleared = new Set(s.progress.cleared.get(s.zone.id));
      cleared.add(marker.id);
      await settle(() => {
        this.db
          .prepare(
            `INSERT INTO zone_progress (profile_id, zone_id, language, pos_x, pos_y, cleared, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (profile_id, zone_id) DO UPDATE SET cleared = excluded.cleared, updated_at = excluded.updated_at`,
          )
          .run(profileId, s.zone.id, s.language, s.position.x, s.position.y, JSON.stringify([...cleared].sort()), this.now());
      });
    }
    return this.requireWorld(profileId);
  }

  // --- Reading state ------------------------------------------------------------------------------------------------

  private async snapshot(profileId: string): Promise<Snapshot | undefined> {
    const stored = await settle(() => {
      const state = this.db.prepare("SELECT zone_id, language, flags, quests FROM world_state WHERE profile_id = ?").get(profileId);
      if (state === undefined) return undefined;
      const rows = this.db.prepare("SELECT zone_id, pos_x, pos_y, cleared FROM zone_progress WHERE profile_id = ?").all(profileId);
      return { state: StateRow.parse(state), rows: rows.map((row) => ProgressRow.parse(row)) };
    });
    if (!stored) return undefined;

    const learner = await this.registry.forProfile(profileId).learner.snapshot();
    const progress: WorldProgress = {
      flags: new Set(IdList.parse(JSON.parse(stored.state.flags))),
      quests: new Map(Object.entries(QuestStates.parse(JSON.parse(stored.state.quests)))),
      cleared: new Map(stored.rows.map((row) => [row.zone_id, new Set(IdList.parse(JSON.parse(row.cleared)))])),
      mastery: (nodeId) => learner.nodes.get(nodeId)?.mastery ?? 0,
    };
    // A zone removed from content since the character was last in it sends them back to the start.
    const zone = this.zones.get(stored.state.zone_id) ?? this.startZone();
    const collision = this.collision(zone, progress);
    const row = stored.rows.find((candidate) => candidate.zone_id === zone.id);
    const saved = row ? { x: row.pos_x, y: row.pos_y } : zone.entry;
    // A saved spot that is no longer walkable (the layout changed, or someone stands there now) falls back to the entry.
    const position = isWalkable(tileAt(gridOf(collision), saved)) ? saved : zone.entry;
    const language = stored.state.language;
    const track = viewForLanguage(this.catalog, learner, language, this.content.balance.rating.initial_player);
    return { zone, language, position, progress, learner, track, collision };
  }

  private async requireSnapshot(profileId: string): Promise<Snapshot> {
    const snapshot = await this.snapshot(profileId);
    if (!snapshot) throw new ServiceError(404, "world-not-started", "Arrive in the world first.");
    return snapshot;
  }

  private async requireWorld(profileId: string): Promise<WorldView> {
    return this.worldView(await this.requireSnapshot(profileId));
  }

  private startZone(): Zone {
    const zone = [...this.zones.values()].find((candidate) => candidate.start);
    if (!zone) throw new ServiceError(404, "no-world", "The loaded content has no world to walk.");
    return zone;
  }

  private check(progress: WorldProgress): (condition: WorldCondition) => boolean {
    return (condition) => holds(condition, progress, this.quests);
  }

  /** Whether something with an optional `if` is there (props, people, features) or open (portals, markers). */
  private present(item: { if?: WorldCondition | undefined }, progress: WorldProgress): boolean {
    return item.if === undefined || holds(item.if, progress, this.quests);
  }

  private collision(zone: Zone, progress: WorldProgress): string[] {
    const blockers: Footprint[] = [];
    for (const placement of zone.props) {
      const prop = this.content.index.props.get(placement.prop)?.value;
      if (prop?.blocking && this.present(placement, progress)) {
        blockers.push({ x: placement.x, y: placement.y, w: prop.footprint.w, h: prop.footprint.h });
      }
    }
    for (const placement of zone.npcs) {
      if (this.present(placement, progress)) blockers.push({ x: placement.x, y: placement.y, w: 1, h: 1 });
    }
    return zoneCollision(zone, this.terrain, blockers);
  }

  private requireNear(s: Snapshot, target: Point, what: string): void {
    if (!isAdjacent(s.position, target)) throw new ServiceError(409, "too-far", `Walk up to ${what} first.`);
  }

  private npcNear(s: Snapshot, npcId: string): Npc {
    const placement = s.zone.npcs.find((candidate) => candidate.npc === npcId && this.present(candidate, s.progress));
    const npc = this.npcs.get(npcId);
    if (!placement || !npc) throw new ServiceError(404, "npc-not-found", `Nobody called ${npcId} is here.`);
    this.requireNear(s, placement, npc.name);
    return npc;
  }

  private markerHere(s: Snapshot, markerId: string): ZoneMarker {
    const marker = s.zone.markers.find((candidate) => candidate.id === markerId);
    if (!marker) throw new ServiceError(404, "marker-not-found", `No marker ${markerId} in ${s.zone.name}.`);
    return marker;
  }

  // --- Changing state -----------------------------------------------------------------------------------------------

  /** Apply effects and save what they changed; a refusal becomes a 409 whose message the player reads. */
  private async apply(profileId: string, effects: readonly WorldEffect[], progress: WorldProgress): Promise<EffectOutcome> {
    const result = applyEffects(effects, progress, this.quests);
    if (!result.ok) throw new ServiceError(409, result.error.code, result.error.message);
    if (effects.some((effect) => !("open" in effect))) {
      const { flags, quests } = result.outcome;
      await settle(() => {
        this.db
          .prepare("UPDATE world_state SET flags = ?, quests = ?, updated_at = ? WHERE profile_id = ?")
          .run(JSON.stringify([...flags].sort()), JSON.stringify(Object.fromEntries(quests)), this.now(), profileId);
      });
    }
    return result.outcome;
  }

  private savePosition(profileId: string, zoneId: string, language: string, at: Point): void {
    this.db
      .prepare(
        `INSERT INTO zone_progress (profile_id, zone_id, language, pos_x, pos_y, cleared, updated_at) VALUES (?, ?, ?, ?, ?, '[]', ?)
         ON CONFLICT (profile_id, zone_id) DO UPDATE SET
           pos_x = excluded.pos_x, pos_y = excluded.pos_y, language = excluded.language, updated_at = excluded.updated_at`,
      )
      .run(profileId, zoneId, language, at.x, at.y, this.now());
  }

  // --- Views --------------------------------------------------------------------------------------------------------

  private worldView(s: Snapshot): WorldView {
    return { language: s.language, zone: this.zoneView(s), position: s.position, quests: this.questViews(s.progress) };
  }

  private actionResponse(s: Snapshot, outcome: EffectOutcome, conversation: ConversationView | undefined): WorldActionResponse {
    return {
      world: this.worldView(s),
      notices: outcome.notices,
      ...(conversation ? { conversation } : {}),
      ...(outcome.open !== undefined ? { open: outcome.open } : {}),
    };
  }

  private zoneView(s: Snapshot): ZoneView {
    const { zone, progress } = s;
    const rows = zoneRows(zone);
    const legend = Object.fromEntries(
      Object.entries(zone.legend).map(([char, terrainId]) => [
        char,
        { terrain: terrainId, color: this.terrain.get(terrainId)?.color ?? "#000000", walkable: this.terrain.get(terrainId)?.walkable ?? false },
      ]),
    );
    return {
      id: zone.id,
      name: zone.name,
      kind: zone.kind,
      ...(zone.realm !== undefined ? { realmId: zone.realm } : {}),
      ...(zone.sight !== undefined ? { sight: zone.sight } : {}),
      ambience: zone.ambience,
      arrival: zone.arrival,
      width: rows[0]?.length ?? 0,
      height: rows.length,
      tiles: rows,
      legend,
      collision: s.collision,
      props: zone.props.flatMap((placement) => {
        const prop = this.content.index.props.get(placement.prop)?.value;
        if (!prop || !this.present(placement, progress)) return [];
        return [{ propId: prop.id, name: prop.name, x: placement.x, y: placement.y, w: prop.footprint.w, h: prop.footprint.h }];
      }),
      npcs: zone.npcs.flatMap((placement): ZoneNpcView[] => {
        const npc = this.npcs.get(placement.npc);
        if (!npc || !this.present(placement, progress)) return [];
        const indicator = this.indicator(npc, progress);
        return [
          {
            id: npc.id,
            name: npc.name,
            ...(npc.title !== undefined ? { title: npc.title } : {}),
            sprite: npc.sprite ?? npc.id,
            x: placement.x,
            y: placement.y,
            ...(indicator ? { indicator } : {}),
          },
        ];
      }),
      features: zone.features
        .filter((feature) => this.present(feature, progress))
        .map((feature) => ({ id: feature.id, x: feature.x, y: feature.y, label: feature.label })),
      portals: zone.portals.map((portal) => ({
        id: portal.id,
        x: portal.x,
        y: portal.y,
        label: portal.label,
        locked: !this.present(portal, progress),
      })),
      markers: zone.markers.map((marker) => this.markerView(s, marker)),
    };
  }

  /** "?" when one of their quests is ready to hand in, "!" when talking to them can start one. */
  private indicator(npc: Npc, progress: WorldProgress): ZoneNpcView["indicator"] {
    for (const quest of this.quests.values()) {
      if (quest.giver === npc.id && questStatus(quest, progress) === "ready") return "turn-in";
    }
    for (const questId of questsOffered(npc.dialogue, this.check(progress))) {
      const quest = this.quests.get(questId);
      if (quest && questStatus(quest, progress) === "not-started") return "offer";
    }
    return undefined;
  }

  private questViews(progress: WorldProgress): QuestView[] {
    const order = { ready: 0, active: 1, done: 2 } as const;
    return [...this.quests.values()]
      .flatMap((quest): QuestView[] => {
        const status = questStatus(quest, progress);
        if (status === "not-started") return [];
        return [
          {
            id: quest.id,
            name: quest.name,
            giverName: this.npcs.get(quest.giver)?.name ?? quest.giver,
            summary: quest.summary,
            status,
            objectives: quest.objectives.map((objective) => ({ text: objective.text, ...objectiveProgress(objective, progress) })),
            ...(status === "done" ? { rewardText: quest.rewards.text } : {}),
          },
        ];
      })
      .sort((a, b) => order[a.status] - order[b.status]);
  }

  private conversation(npc: Npc, nodeId: string | undefined, progress: WorldProgress): ConversationView | undefined {
    const node = nodeId === undefined ? undefined : npc.dialogue.nodes[nodeId];
    if (nodeId === undefined || !node) return undefined;
    const speaker = (node.speaker !== undefined ? this.npcs.get(node.speaker) : undefined) ?? npc;
    return {
      npcId: npc.id,
      nodeId,
      speakerName: speaker.name,
      ...(speaker.title !== undefined ? { speakerTitle: speaker.title } : {}),
      portrait: speaker.portrait ?? speaker.id,
      text: node.text,
      choices: offeredChoices(node, this.check(progress)).map(({ index, choice }) => ({ index, text: choice.text })),
    };
  }

  private markerView(s: Snapshot, marker: ZoneMarker): ZoneMarkerView {
    const manifest = this.content.index.challenges.get(this.pickChallengeId(s, marker))?.manifest;
    const enemy = manifest ? this.content.index.enemies.get(manifest.enemy.template)?.value : undefined;
    const cleared = s.progress.cleared.get(s.zone.id)?.has(marker.id) ?? false;
    return {
      id: marker.id,
      kind: marker.kind,
      x: marker.x,
      y: marker.y,
      state: cleared ? "cleared" : this.present(marker, s.progress) ? "open" : "sealed",
      title: manifest?.title ?? marker.id,
      enemyId: enemy?.id ?? "unknown",
      enemyName: enemy?.name ?? "Unknown",
      difficulty: manifest?.difficulty ?? 0,
    };
  }

  /** The best-fit challenge for a marker: ranked like any other fight, restricted to the marker's own pool so a
   * two-challenge marker still varies with recency and mastery instead of always playing the same one. */
  private pickChallengeId(s: Snapshot, marker: ZoneMarker): string {
    const { balance } = this.content;
    const query: ChallengeQuery = {
      nodeId: marker.node,
      kind: marker.kind,
      target: marker.kind === "boss" ? balance.planner.target_success.elite : balance.planner.target_success.frontier,
      exclude: new Set(),
      familiar: familiarConcepts(s.track, [marker.node]),
    };
    const ranked = rankChallenges(
      { seed: "world", length: "short", language: s.language, catalog: this.catalog, learner: s.learner, oathRealms: {}, classAffinity: {}, balance },
      s.track,
      query,
    ).filter((pick) => marker.challenges.includes(pick.challenge.id));
    return ranked[0]?.challenge.id ?? marker.challenges[0] ?? marker.id;
  }
}

function gridOf(collision: string[]): { width: number; height: number; tiles: string[] } {
  return { width: collision[0]?.length ?? 0, height: collision.length, tiles: collision };
}
