import type { DatabaseSync } from "node:sqlite";
import {
  type ChallengeQuery,
  familiarConcepts,
  isWalkable,
  type LearnerSnapshot,
  type PlannerCatalog,
  rankChallenges,
  tileAt,
  type TrackView,
  viewForLanguage,
} from "@rootward/core";
import type { OverworldMarkerView, OverworldRealmSummary, OverworldView, RunResponse } from "@rootward/shared";
import { z } from "zod";
import type { GameContent } from "../content.ts";
import { settle } from "../db/promise.ts";
import { ServiceError } from "../errors.ts";
import { buildPlannerCatalog } from "../planning.ts";
import type { RunServiceRegistry } from "../runs/registry.ts";
import type { ZoneDef, ZoneMarker } from "./zone-types.ts";
import { ZONES } from "./zones/index.ts";

const ProgressRow = z.object({ pos_x: z.number(), pos_y: z.number(), cleared: z.string(), language: z.string() });

export interface OverworldServiceDeps {
  db: DatabaseSync;
  content: GameContent;
  registry: RunServiceRegistry;
  now?: () => string;
}

/**
 * A free-roam zone alongside the planner-driven expedition (ADR-0010). Position and cleared markers live in
 * `overworld_progress`, one row per (profile, realm); the fight behind a marker is an ordinary run, started through
 * the same `RunService.startEncounter()` a practice fight uses, via this profile's `RunServiceRegistry` entry.
 */
export class OverworldService {
  private readonly db: DatabaseSync;
  private readonly content: GameContent;
  private readonly registry: RunServiceRegistry;
  private readonly now: () => string;
  private readonly catalog: PlannerCatalog;

  constructor(deps: OverworldServiceDeps) {
    this.db = deps.db;
    this.content = deps.content;
    this.registry = deps.registry;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.catalog = buildPlannerCatalog(deps.content.index);
  }

  /** Every realm from content, `available` when it has a zone (ADR-0010) -- this is the only place that fact lives. */
  realms(): OverworldRealmSummary[] {
    return [...this.content.index.realms.values()]
      .map(({ value }) => ({ id: value.id, name: value.name, available: Object.hasOwn(ZONES, value.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Start (or resume) this profile's overworld progress in a realm, at the zone's entry point if new. */
  async enter(profileId: string, realmId: string, language: string): Promise<OverworldView> {
    const zone = this.zoneFor(realmId);
    await settle(() => {
      const existing = this.db
        .prepare("SELECT 1 FROM overworld_progress WHERE profile_id = ? AND realm_id = ?")
        .get(profileId, realmId);
      if (existing === undefined) {
        this.db
          .prepare(
            "INSERT INTO overworld_progress (profile_id, realm_id, language, pos_x, pos_y, cleared, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run(profileId, realmId, language, zone.entry.x, zone.entry.y, "[]", this.now());
      }
    });
    return this.requireView(profileId, realmId);
  }

  /** The current view, or undefined when this profile has never entered this realm. */
  async view(profileId: string, realmId: string): Promise<OverworldView | undefined> {
    const zone = this.zoneFor(realmId);
    const row = await settle(() =>
      this.db
        .prepare("SELECT pos_x, pos_y, cleared, language FROM overworld_progress WHERE profile_id = ? AND realm_id = ?")
        .get(profileId, realmId),
    );
    if (row === undefined) return undefined;
    const parsed = ProgressRow.parse(row);
    const cleared = new Set(z.array(z.string()).parse(JSON.parse(parsed.cleared)));
    const { view, learner } = await this.trackView(profileId, parsed.language);
    return {
      realmId: zone.realmId,
      realmName: zone.realmName,
      language: parsed.language,
      width: zone.width,
      height: zone.height,
      tiles: [...zone.tiles],
      entry: zone.entry,
      position: { x: parsed.pos_x, y: parsed.pos_y },
      markers: zone.markers.map((marker) => this.markerView(view, learner, parsed.language, marker, cleared)),
      bossMarkerId: zone.bossMarkerId,
    };
  }

  /** Move within a zone; the server re-checks walkability rather than trusting the client's own pathfinding. */
  async move(profileId: string, realmId: string, x: number, y: number): Promise<void> {
    const zone = this.zoneFor(realmId);
    if (!isWalkable(tileAt(zone, { x, y }))) {
      throw new ServiceError(400, "not-walkable", `(${x}, ${y}) is not walkable in ${zone.realmName}.`);
    }
    return settle(() => {
      const result = this.db
        .prepare("UPDATE overworld_progress SET pos_x = ?, pos_y = ?, updated_at = ? WHERE profile_id = ? AND realm_id = ?")
        .run(x, y, this.now(), profileId, realmId);
      if (result.changes === 0) throw new ServiceError(404, "overworld-not-entered", `Enter ${realmId} before moving in it.`);
    });
  }

  /** Walk into a marker: pick its best-fit challenge for this player and start it exactly like a practice fight. */
  async startMarkerEncounter(profileId: string, realmId: string, markerId: string): Promise<RunResponse> {
    const zone = this.zoneFor(realmId);
    const marker = this.markerFor(zone, markerId);
    const language = await this.languageOf(profileId, realmId);
    const { view, learner } = await this.trackView(profileId, language);
    const challengeId = this.pickChallengeId(view, learner, language, marker);
    return this.registry.forProfile(profileId).startEncounter({ challengeId, language });
  }

  /** After a marker's fight ends: mark it cleared on a win, leave it open to retry otherwise. Either way, the run
   * itself is left as-is -- resolving is bookkeeping on the zone, not on the run. A marker's fight is started like a
   * practice fight (no plan), which never ends the run itself on a win (`closeRoom` in decide.ts only does that
   * inside an expedition) -- the win shows up as `encounter.status === "won"`, not `run.status === "ended"`. */
  async resolveMarkerEncounter(profileId: string, realmId: string, markerId: string, runId: string): Promise<OverworldView> {
    const zone = this.zoneFor(realmId);
    this.markerFor(zone, markerId);
    const { run } = await this.registry.forProfile(profileId).getRun(runId);
    if (run.encounter?.status === "won") {
      await settle(() => {
        const row = this.db
          .prepare("SELECT cleared FROM overworld_progress WHERE profile_id = ? AND realm_id = ?")
          .get(profileId, realmId);
        const cleared = new Set(
          row === undefined ? [] : z.array(z.string()).parse(JSON.parse(z.object({ cleared: z.string() }).parse(row).cleared)),
        );
        cleared.add(markerId);
        this.db
          .prepare("UPDATE overworld_progress SET cleared = ?, updated_at = ? WHERE profile_id = ? AND realm_id = ?")
          .run(JSON.stringify([...cleared]), this.now(), profileId, realmId);
      });
    }
    return this.requireView(profileId, realmId);
  }

  private async requireView(profileId: string, realmId: string): Promise<OverworldView> {
    const view = await this.view(profileId, realmId);
    if (!view) throw new ServiceError(404, "overworld-not-entered", `Enter ${realmId} before viewing it.`);
    return view;
  }

  private async languageOf(profileId: string, realmId: string): Promise<string> {
    const row = await settle(() =>
      this.db.prepare("SELECT language FROM overworld_progress WHERE profile_id = ? AND realm_id = ?").get(profileId, realmId),
    );
    if (row === undefined) throw new ServiceError(404, "overworld-not-entered", `Enter ${realmId} before starting a fight in it.`);
    return z.object({ language: z.string() }).parse(row).language;
  }

  private async trackView(profileId: string, language: string): Promise<{ view: TrackView; learner: LearnerSnapshot }> {
    const learner = await this.registry.forProfile(profileId).learner.snapshot();
    return { view: viewForLanguage(this.catalog, learner, language, this.content.balance.rating.initial_player), learner };
  }

  /** The best-fit challenge for a marker: ranked like any other fight, restricted to the marker's own pool so a
   * two-candidate marker still varies with recency and mastery instead of always playing the same challenge. */
  private pickChallengeId(view: TrackView, learner: LearnerSnapshot, language: string, marker: ZoneMarker): string {
    const target =
      marker.kind === "boss" ? this.content.balance.planner.target_success.elite : this.content.balance.planner.target_success.frontier;
    const query: ChallengeQuery = {
      nodeId: marker.nodeId,
      kind: marker.kind,
      target,
      exclude: new Set(),
      familiar: familiarConcepts(view, [marker.nodeId]),
    };
    const ranked = rankChallenges(
      { seed: "overworld", length: "short", language, catalog: this.catalog, learner, oathRealms: {}, classAffinity: {}, balance: this.content.balance },
      view,
      query,
    ).filter((pick) => marker.challengePool.includes(pick.challenge.id));
    return ranked[0]?.challenge.id ?? marker.challengePool[0] ?? marker.id;
  }

  private markerView(
    view: TrackView,
    learner: LearnerSnapshot,
    language: string,
    marker: ZoneMarker,
    cleared: ReadonlySet<string>,
  ): OverworldMarkerView {
    const challengeId = this.pickChallengeId(view, learner, language, marker);
    const manifest = this.content.index.challenges.get(challengeId)?.manifest;
    const enemy = manifest ? this.content.index.enemies.get(manifest.enemy.template)?.value : undefined;
    return {
      id: marker.id,
      kind: marker.kind,
      x: marker.x,
      y: marker.y,
      state: cleared.has(marker.id) ? "cleared" : "open",
      title: manifest?.title ?? marker.id,
      enemyName: enemy?.name ?? "Unknown",
      difficulty: manifest?.difficulty ?? 0,
    };
  }

  private zoneFor(realmId: string): ZoneDef {
    const zone = ZONES[realmId];
    if (!zone) throw new ServiceError(404, "realm-not-available", `${realmId} has no overworld zone yet.`);
    return zone;
  }

  private markerFor(zone: ZoneDef, markerId: string): ZoneMarker {
    const marker = zone.markers.find((candidate) => candidate.id === markerId);
    if (!marker) throw new ServiceError(404, "marker-not-found", `No marker ${markerId} in ${zone.realmId}.`);
    return marker;
  }
}
