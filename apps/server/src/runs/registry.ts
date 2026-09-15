import type { DatabaseSync } from "node:sqlite";
import type { GameContent } from "../content.ts";
import type { Sandbox } from "../sandbox.ts";
import { SqliteAttemptStore } from "./attempts.ts";
import { RunService } from "./service.ts";
import { SqliteEventStore } from "./sqlite-event-store.ts";

export interface RunServiceRegistryDeps {
  content: GameContent;
  sandbox: Sandbox;
  db: DatabaseSync;
  now?: () => string;
}

/**
 * One RunService per profile (ADR-0010), each backed by a store scoped to that profile's own runs, so its
 * `learner` field (which only ever folds `store.loadAll()`) is automatically scoped too, for free. Built lazily and
 * cached: a RunService is cheap to construct here, since it only wraps a profile-bound store over the one shared
 * database.
 */
export class RunServiceRegistry {
  private readonly deps: RunServiceRegistryDeps;
  private readonly cache = new Map<string, RunService>();

  constructor(deps: RunServiceRegistryDeps) {
    this.deps = deps;
  }

  forProfile(profileId: string): RunService {
    const cached = this.cache.get(profileId);
    if (cached) return cached;
    const { content, sandbox, db, now } = this.deps;
    const service = new RunService({
      content,
      sandbox,
      store: new SqliteEventStore(db, now, profileId),
      attempts: new SqliteAttemptStore(db, now),
      ...(now !== undefined ? { now } : {}),
    });
    this.cache.set(profileId, service);
    return service;
  }
}
