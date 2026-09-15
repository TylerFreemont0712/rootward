import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { settle } from "../db/promise.ts";

/** A character: its own name and class, with its own independently tracked mastery and runs (ADR-0010). */
export interface Profile {
  id: string;
  name: string;
  classId: string;
  createdAt: string;
}

const ProfileRow = z.object({ id: z.string(), name: z.string(), class_id: z.string(), created_at: z.string() });

function fromRow(row: z.infer<typeof ProfileRow>): Profile {
  return { id: row.id, name: row.name, classId: row.class_id, createdAt: row.created_at };
}

export interface ProfileServiceDeps {
  db: DatabaseSync;
  newId?: () => string;
  now?: () => string;
}

/** Plain CRUD over the `profiles` table (ADR-0010); no learner/run logic lives here. */
export class ProfileService {
  private readonly db: DatabaseSync;
  private readonly newId: () => string;
  private readonly now: () => string;

  constructor(deps: ProfileServiceDeps) {
    this.db = deps.db;
    this.newId = deps.newId ?? randomUUID;
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  list(): Promise<Profile[]> {
    return settle(() =>
      this.db
        .prepare("SELECT id, name, class_id, created_at FROM profiles ORDER BY created_at, id")
        .all()
        .map((row) => fromRow(ProfileRow.parse(row))),
    );
  }

  create(name: string, classId: string): Promise<Profile> {
    return settle(() => {
      const profile: Profile = { id: this.newId(), name: name.trim(), classId, createdAt: this.now() };
      this.db
        .prepare("INSERT INTO profiles (id, name, class_id, created_at) VALUES (?, ?, ?, ?)")
        .run(profile.id, profile.name, profile.classId, profile.createdAt);
      return profile;
    });
  }

  get(id: string): Promise<Profile | undefined> {
    return settle(() => {
      const row = this.db.prepare("SELECT id, name, class_id, created_at FROM profiles WHERE id = ?").get(id);
      return row === undefined ? undefined : fromRow(ProfileRow.parse(row));
    });
  }
}
