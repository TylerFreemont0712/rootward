-- The world (ADR-0011). Zones are content now, and a realm can have more than one (a town and its wilds), so progress
-- is kept per zone rather than per realm. Rows written under ADR-0010 keep working: the Foundry's zone id is the realm
-- id it used before, "foundry", and its marker ids did not change.
ALTER TABLE overworld_progress RENAME TO zone_progress;
ALTER TABLE zone_progress RENAME COLUMN realm_id TO zone_id;

-- One row per character that has arrived in the world: where they are, the language they fight in, and what their
-- quests and choices have changed. Everything else a zone shows is derived from content, zone_progress, and runs.
CREATE TABLE world_state (
  profile_id TEXT PRIMARY KEY REFERENCES profiles (id) ON DELETE CASCADE,
  zone_id    TEXT NOT NULL,
  language   TEXT NOT NULL,
  flags      TEXT NOT NULL, -- JSON array of flag ids
  quests     TEXT NOT NULL, -- JSON object: quest id -> "active" | "done"
  updated_at TEXT NOT NULL
) STRICT;
