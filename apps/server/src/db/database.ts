import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// SQLite access for the server (ADR-0006): open the database, apply migrations, run transactions. Queries live next
// to the code that needs them, written as plain SQL.

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));
const MIGRATION_FILE = /^(\d{4})-([a-z0-9-]+)\.sql$/;
export const MEMORY = ":memory:";

/** Every `NNNN-name.sql` file in migrations/, in version order. Versions must be 1, 2, 3, ... with no gaps. */
export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const migrations = readdirSync(dir)
    .flatMap((file) => {
      const match = MIGRATION_FILE.exec(file);
      return match?.[1] === undefined || match[2] === undefined
        ? []
        : [{ version: Number(match[1]), name: match[2], sql: readFileSync(path.join(dir, file), "utf8") }];
    })
    .sort((a, b) => a.version - b.version);
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`migration versions must be contiguous from 1; found ${migration.version} at position ${index + 1}`);
    }
  });
  return migrations;
}

/** Open (creating if needed) a database file, configure it, and bring its schema up to date. */
export function openDatabase(file: string, migrations: Migration[] = loadMigrations()): DatabaseSync {
  if (file !== MEMORY) mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true, timeout: 5000 });
  if (file !== MEMORY) {
    // LEARN: write-ahead logging lets readers keep reading while a write is in progress and survives crashes well.
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
  }
  migrate(db, file, migrations);
  return db;
}

export interface MigrationReport {
  from: number;
  to: number;
  backup?: string;
}

/**
 * Apply every migration newer than the database's `user_version`, each in its own transaction.
 * LEARN: `PRAGMA user_version` is an integer SQLite stores in the file header for applications to use. Keeping the
 * schema version there means no bookkeeping table is needed.
 */
export function migrate(db: DatabaseSync, file: string, migrations: Migration[]): MigrationReport {
  const from = userVersion(db);
  const latest = migrations.at(-1)?.version ?? 0;
  if (from > latest) {
    throw new Error(`the database is at schema version ${from}, newer than this build supports (${latest})`);
  }
  const pending = migrations.filter((migration) => migration.version > from);
  if (pending.length === 0) return { from, to: from };

  const report: MigrationReport = { from, to: latest };
  if (file !== MEMORY && from > 0) {
    const backup = `${file}.backup-v${from}`;
    if (!existsSync(backup)) {
      // VACUUM INTO writes a consistent copy even while WAL holds recent changes; copying the file might not.
      db.prepare("VACUUM INTO ?").run(backup);
    }
    report.backup = backup;
  }
  for (const migration of pending) {
    transaction(db, () => {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
    }, `migration ${migration.version} (${migration.name})`);
  }
  return report;
}

export function userVersion(db: DatabaseSync): number {
  return z.object({ user_version: z.number() }).parse(db.prepare("PRAGMA user_version").get()).user_version;
}

/** Run `work` inside BEGIN IMMEDIATE ... COMMIT, rolling back if it throws. */
export function transaction<T>(db: DatabaseSync, work: () => T, label = "transaction"): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed and was rolled back: ${message}`, { cause: error });
  }
}
