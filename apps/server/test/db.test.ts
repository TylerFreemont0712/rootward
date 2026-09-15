import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { loadMigrations, MEMORY, migrate, openDatabase, transaction, userVersion } from "../src/db/database.ts";

const tempDirs: string[] = [];

function tempDatabaseFile(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "rootward-db-"));
  tempDirs.push(dir);
  return path.join(dir, "rootward.db");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tableNames(db: DatabaseSync): unknown[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
}

describe("openDatabase and migrate", () => {
  it("creates the file, applies every migration, and does nothing when reopened", () => {
    const file = tempDatabaseFile();
    const latest = loadMigrations().length;
    const db = openDatabase(file);
    expect(userVersion(db)).toBe(latest);
    expect(tableNames(db)).toEqual(expect.arrayContaining(["attempts", "run_events", "runs"]));
    db.close();

    const reopened = new DatabaseSync(file);
    expect(migrate(reopened, file, loadMigrations())).toEqual({ from: latest, to: latest });
    reopened.close();
  });

  it("backs up an existing database before upgrading it", () => {
    const file = tempDatabaseFile();
    const base = loadMigrations();
    openDatabase(file, base).close();

    const next = [...base, { version: base.length + 1, name: "extra", sql: "CREATE TABLE extra (x INTEGER) STRICT;" }];
    const db = new DatabaseSync(file);
    const backup = `${file}.backup-v${base.length}`;
    expect(migrate(db, file, next)).toEqual({ from: base.length, to: base.length + 1, backup });
    expect(existsSync(backup)).toBe(true);
    expect(tableNames(db)).toContain("extra");
    db.close();
  });

  it("rolls back a failing migration and keeps the old version", () => {
    const base = loadMigrations();
    const db = openDatabase(MEMORY, base);
    const broken = [
      ...base,
      { version: base.length + 1, name: "broken", sql: "CREATE TABLE half (x INTEGER) STRICT; THIS IS NOT SQL;" },
    ];
    expect(() => migrate(db, MEMORY, broken)).toThrow("rolled back");
    expect(userVersion(db)).toBe(base.length);
    expect(tableNames(db)).not.toContain("half");
  });

  it("refuses a database created by a newer build", () => {
    const db = openDatabase(MEMORY);
    db.exec("PRAGMA user_version = 99");
    expect(() => migrate(db, MEMORY, loadMigrations())).toThrow("newer than this build");
  });
});

describe("transaction", () => {
  it("commits on success and rolls back when the work throws", () => {
    const db = new DatabaseSync(MEMORY);
    db.exec("CREATE TABLE t (x INTEGER) STRICT");
    transaction(db, () => db.prepare("INSERT INTO t VALUES (1)").run());
    expect(() =>
      transaction(db, () => {
        db.prepare("INSERT INTO t VALUES (2)").run();
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(db.prepare("SELECT COUNT(*) AS n FROM t").get()).toEqual({ n: 1 });
  });
});

describe("migration 0003 (the world, ADR-0011)", () => {
  it("keeps overworld progress written under ADR-0010 as zone progress", () => {
    const db = new DatabaseSync(MEMORY);
    const migrations = loadMigrations();
    migrate(db, MEMORY, migrations.slice(0, 2));
    db.prepare("INSERT INTO profiles (id, name, class_id, created_at) VALUES ('p1', 'Ada', 'artificer', 'then')").run();
    db.prepare(
      `INSERT INTO overworld_progress (profile_id, realm_id, language, pos_x, pos_y, cleared, updated_at)
       VALUES ('p1', 'foundry', 'python', 14, 4, '["foundry-loops"]', 'then')`,
    ).run();

    migrate(db, MEMORY, migrations);
    expect(db.prepare("SELECT profile_id, zone_id, pos_x, pos_y, cleared FROM zone_progress").all()).toEqual([
      { profile_id: "p1", zone_id: "foundry", pos_x: 14, pos_y: 4, cleared: '["foundry-loops"]' },
    ]);
    expect(tableNames(db)).toEqual(expect.arrayContaining(["world_state", "zone_progress"]));
    expect(tableNames(db)).not.toContain("overworld_progress");
    db.close();
  });
});
