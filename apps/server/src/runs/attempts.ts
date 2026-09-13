import type { DatabaseSync } from "node:sqlite";
import type { FileMap } from "@rootward/content-tools";
import { RunResult } from "@rootward/runners";
import { z } from "zod";
import { settle } from "../db/promise.ts";
import type { RunArtifacts } from "./artifacts.ts";

/** One accepted Probe or Cast: what was submitted and everything the runner reported, hidden tests included. */
export interface Attempt {
  /** Position of the attempt's first event in the run's event log. */
  seq: number;
  kind: "probe" | "cast";
  language: string;
  files: FileMap;
  result: RunResult;
}

export interface AttemptStore {
  record(runId: string, attempt: Attempt): Promise<void>;
  /** A run's attempts in the order they happened. */
  list(runId: string): Promise<Attempt[]>;
}

export class InMemoryAttemptStore implements AttemptStore {
  private readonly attempts = new Map<string, Attempt[]>();

  record(runId: string, attempt: Attempt): Promise<void> {
    const list = this.attempts.get(runId) ?? [];
    list.push(attempt);
    this.attempts.set(runId, list);
    return Promise.resolve();
  }

  list(runId: string): Promise<Attempt[]> {
    return Promise.resolve([...(this.attempts.get(runId) ?? [])]);
  }
}

const AttemptRow = z.object({
  seq: z.number(),
  kind: z.enum(["probe", "cast"]),
  language: z.string(),
  files: z.string(),
  result: z.string(),
});
const StoredFiles = z.record(z.string(), z.string());

/** Attempts in SQLite (ADR-0006). Rows are validated with zod when read back. */
export class SqliteAttemptStore implements AttemptStore {
  private readonly db: DatabaseSync;
  private readonly now: () => string;

  constructor(db: DatabaseSync, now: () => string = () => new Date().toISOString()) {
    this.db = db;
    this.now = now;
  }

  record(runId: string, attempt: Attempt): Promise<void> {
    return settle(() => {
      this.db
        .prepare(
          "INSERT INTO attempts (run_id, seq, kind, language, files, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          runId,
          attempt.seq,
          attempt.kind,
          attempt.language,
          JSON.stringify(attempt.files),
          JSON.stringify(attempt.result),
          this.now(),
        );
    });
  }

  list(runId: string): Promise<Attempt[]> {
    return settle(() =>
      this.db
        .prepare("SELECT seq, kind, language, files, result FROM attempts WHERE run_id = ? ORDER BY seq")
        .all(runId)
        .map((raw) => {
          const row = AttemptRow.parse(raw);
          return {
            seq: row.seq,
            kind: row.kind,
            language: row.language,
            files: StoredFiles.parse(JSON.parse(row.files)),
            result: RunResult.parse(JSON.parse(row.result)),
          };
        }),
    );
  }
}

/**
 * Fold one attempt into a run's artifacts: its files become the editor contents, its test results replace older ones,
 * and it becomes the last run shown in the console. Replaying every attempt rebuilds artifacts after a restart.
 */
export function applyAttempt(artifacts: RunArtifacts, attempt: Attempt, visibleIds: ReadonlySet<string>): void {
  artifacts.files = { ...attempt.files };
  for (const test of attempt.result.tests ?? []) artifacts.latest.set(test.id, test);
  artifacts.lastRun = { kind: attempt.kind, result: attempt.result, visibleIds };
}
