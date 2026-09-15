import type { DatabaseSync } from "node:sqlite";
import { RunEvent, type TimedEvent } from "@rootward/core";
import { z } from "zod";
import { transaction } from "../db/database.ts";
import { settle } from "../db/promise.ts";
import type { EventStore, StoredRun } from "./store.ts";

/** Written with every event. Bump it, and add an upcaster in `parseEvent`, when an event's stored shape changes. */
export const EVENT_PAYLOAD_VERSION = 1;

const EventRow = z.object({ seq: z.number(), version: z.number(), payload: z.string() });
const TimedEventRow = EventRow.extend({ runId: z.string(), at: z.string() });
const CountRow = z.object({ count: z.number() });

/** The run event log in SQLite (ADR-0006). */
export class SqliteEventStore implements EventStore {
  private readonly db: DatabaseSync;
  private readonly now: () => string;
  /** When set, every run this instance creates carries this profile, and loadAll() only sees that profile's runs
   * (ADR-0010). Left null, behavior is identical to before profiles existed. */
  private readonly profileId: string | null;

  constructor(db: DatabaseSync, now: () => string = () => new Date().toISOString(), profileId: string | null = null) {
    this.db = db;
    this.now = now;
    this.profileId = profileId;
  }

  create(runId: string, events: readonly RunEvent[]): Promise<void> {
    return settle(() => {
      transaction(
        this.db,
        () => {
          const at = this.now();
          this.db
            .prepare("INSERT INTO runs (id, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?)")
            .run(runId, this.profileId, at, at);
          this.insert(runId, 0, events, at);
        },
        `creating run ${runId}`,
      );
    });
  }

  append(runId: string, expectedLength: number, events: readonly RunEvent[]): Promise<void> {
    return settle(() => {
      transaction(
        this.db,
        () => {
          const { count } = CountRow.parse(
            this.db.prepare("SELECT COUNT(*) AS count FROM run_events WHERE run_id = ?").get(runId),
          );
          if (count !== expectedLength) {
            throw new Error(`run ${runId} changed concurrently (it has ${count} events, expected ${expectedLength})`);
          }
          const at = this.now();
          this.insert(runId, expectedLength, events, at);
          this.db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(at, runId);
        },
        `appending to run ${runId}`,
      );
    });
  }

  load(runId: string): Promise<RunEvent[] | undefined> {
    return settle(() => {
      if (this.db.prepare("SELECT 1 FROM runs WHERE id = ?").get(runId) === undefined) return undefined;
      const rows = this.db.prepare("SELECT seq, version, payload FROM run_events WHERE run_id = ? ORDER BY seq").all(runId);
      return rows.map((raw, index) => {
        const row = EventRow.parse(raw);
        if (row.seq !== index) throw new Error(`run ${runId} is missing event ${index}`);
        return parseEvent(runId, row);
      });
    });
  }

  loadAll(): Promise<StoredRun[]> {
    return settle(() => {
      const rows =
        this.profileId === null
          ? this.db
              .prepare(
                `SELECT e.run_id AS runId, e.seq, e.version, e.payload, e.created_at AS at
                   FROM run_events e JOIN runs r ON r.id = e.run_id
                  ORDER BY r.created_at, e.run_id, e.seq`,
              )
              .all()
          : this.db
              .prepare(
                `SELECT e.run_id AS runId, e.seq, e.version, e.payload, e.created_at AS at
                   FROM run_events e JOIN runs r ON r.id = e.run_id
                  WHERE r.profile_id = ?
                  ORDER BY r.created_at, e.run_id, e.seq`,
              )
              .all(this.profileId);
      const runs = new Map<string, TimedEvent[]>();
      for (const raw of rows) {
        const row = TimedEventRow.parse(raw);
        const events = runs.get(row.runId) ?? [];
        if (row.seq !== events.length) throw new Error(`run ${row.runId} is missing event ${events.length}`);
        events.push({ event: parseEvent(row.runId, row), at: row.at });
        runs.set(row.runId, events);
      }
      return [...runs].map(([runId, events]) => ({ runId, events }));
    });
  }

  private insert(runId: string, firstSeq: number, events: readonly RunEvent[], at: string): void {
    const statement = this.db.prepare(
      "INSERT INTO run_events (run_id, seq, type, version, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    events.forEach((event, offset) => {
      statement.run(runId, firstSeq + offset, event.type, EVENT_PAYLOAD_VERSION, JSON.stringify(event), at);
    });
  }
}

/** Validate one stored event. Old payload versions would be upcast here. */
function parseEvent(runId: string, row: z.infer<typeof EventRow>): RunEvent {
  if (row.version !== EVENT_PAYLOAD_VERSION) {
    throw new Error(`run ${runId} event ${row.seq} has payload version ${row.version}, and no upcaster exists`);
  }
  const parsed = RunEvent.safeParse(JSON.parse(row.payload));
  if (!parsed.success) {
    throw new Error(`run ${runId} event ${row.seq} is not a valid event:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
