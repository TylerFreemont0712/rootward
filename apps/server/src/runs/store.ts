import type { RunEvent } from "@rootward/core";

/**
 * Where run events live. M0 keeps them in memory; M1 adds a SQLite implementation behind this same interface so the
 * run service does not change.
 */
export interface EventStore {
  create(runId: string, events: readonly RunEvent[]): Promise<void>;
  /** Append events, failing if another writer appended since the caller loaded `expectedLength` events. */
  append(runId: string, expectedLength: number, events: readonly RunEvent[]): Promise<void>;
  load(runId: string): Promise<RunEvent[] | undefined>;
}

export class InMemoryEventStore implements EventStore {
  private readonly runs = new Map<string, RunEvent[]>();

  create(runId: string, events: readonly RunEvent[]): Promise<void> {
    if (this.runs.has(runId)) return Promise.reject(new Error(`run ${runId} already exists`));
    this.runs.set(runId, [...events]);
    return Promise.resolve();
  }

  append(runId: string, expectedLength: number, events: readonly RunEvent[]): Promise<void> {
    const existing = this.runs.get(runId);
    if (!existing) return Promise.reject(new Error(`run ${runId} does not exist`));
    if (existing.length !== expectedLength) {
      return Promise.reject(new Error(`run ${runId} changed concurrently (${existing.length} != ${expectedLength})`));
    }
    existing.push(...events);
    return Promise.resolve();
  }

  load(runId: string): Promise<RunEvent[] | undefined> {
    const events = this.runs.get(runId);
    return Promise.resolve(events ? [...events] : undefined);
  }
}
