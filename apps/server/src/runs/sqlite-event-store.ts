import type { DatabaseSync } from "node:sqlite";
import { RunEvent } from "@rootward/core";
import { z } from "zod";
import { transaction } from "../db/database.ts";
import { settle } from "../db/promise.ts";
import type { EventStore } from "./store.ts";

/** Written with every event. Bump it, and add an upcaster in `load`, when an event's stored shape changes. */
export const EVENT_PAYLOAD_VERSION = 1;

const EventRow = z.object({ seq: z.number(), version: z.number(), payload: z.string() });
const CountRow = z.object({ count: z.number() });

/** The run event log in SQLite (ADR-0006). */
export class SqliteEventStore implements EventStore {
  private readonly db: DatabaseSync;
  private readonly now: () => string;

  constructor(db: DatabaseSync, now: () => string = () => new Date().toISOString()) {
    this.db = db;
    this.now = now;
  }

  create(runId: string, events: readonly RunEvent[]): Promise<void> {
    return settle(() => {
      transaction(
        this.db,
        () => {
          const at = this.now();
          this.db.prepare("INSERT INTO runs (id, created_at, updated_at) VALUES (?, ?, ?)").run(runId, at, at);
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
        if (row.version !== EVENT_PAYLOAD_VERSION) {
          throw new Error(`run ${runId} event ${index} has payload version ${row.version}, and no upcaster exists`);
        }
        const parsed = RunEvent.safeParse(JSON.parse(row.payload));
        if (!parsed.success) {
          throw new Error(`run ${runId} event ${index} is not a valid event:\n${z.prettifyError(parsed.error)}`);
        }
        return parsed.data;
      });
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
