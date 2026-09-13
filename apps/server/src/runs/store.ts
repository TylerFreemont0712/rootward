import type { RunEvent, TimedEvent } from "@rootward/core";

/** One run's full log, with the time each event was appended. */
export interface StoredRun {
  runId: string;
  events: TimedEvent[];
}

/**
 * Where run events live: in memory for tests, SQLite in the app (ADR-0006). The run service only sees this interface.
 */
export interface EventStore {
  create(runId: string, events: readonly RunEvent[]): Promise<void>;
  /** Append events, failing if another writer appended since the caller loaded `expectedLength` events. */
  append(runId: string, expectedLength: number, events: readonly RunEvent[]): Promise<void>;
  load(runId: string): Promise<RunEvent[] | undefined>;
  /** Every run with append times, oldest run first: what the learner model is built from (ADR-0009). */
  loadAll(): Promise<StoredRun[]>;
}

export class InMemoryEventStore implements EventStore {
  private readonly runs = new Map<string, TimedEvent[]>();
  private readonly now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  create(runId: string, events: readonly RunEvent[]): Promise<void> {
    if (this.runs.has(runId)) return Promise.reject(new Error(`run ${runId} already exists`));
    const at = this.now();
    this.runs.set(
      runId,
      events.map((event) => ({ event, at })),
    );
    return Promise.resolve();
  }

  append(runId: string, expectedLength: number, events: readonly RunEvent[]): Promise<void> {
    const existing = this.runs.get(runId);
    if (!existing) return Promise.reject(new Error(`run ${runId} does not exist`));
    if (existing.length !== expectedLength) {
      return Promise.reject(new Error(`run ${runId} changed concurrently (${existing.length} != ${expectedLength})`));
    }
    const at = this.now();
    existing.push(...events.map((event) => ({ event, at })));
    return Promise.resolve();
  }

  load(runId: string): Promise<RunEvent[] | undefined> {
    const events = this.runs.get(runId);
    return Promise.resolve(events?.map((timed) => timed.event));
  }

  loadAll(): Promise<StoredRun[]> {
    // A Map iterates in insertion order, which is creation order here.
    return Promise.resolve([...this.runs].map(([runId, events]) => ({ runId, events: [...events] })));
  }
}
