-- Characters ("profiles") and their overworld progress (ADR-0010). A character is a separate, independently
-- tracked mastery model: LearnerService rebuilds mastery by folding every event a profile-scoped store returns, so
-- scoping runs by profile_id is enough to give each character its own progress, with no change to that folding.

CREATE TABLE profiles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  class_id   TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

-- Nullable: runs written before this migration, or through the legacy unscoped routes, keep profile_id = NULL and
-- stay permanently outside every profile-scoped view (ADR-0010) rather than being guessed into one.
ALTER TABLE runs ADD COLUMN profile_id TEXT REFERENCES profiles (id) ON DELETE CASCADE;
CREATE INDEX runs_profile_id_idx ON runs (profile_id);

-- One row per character per realm they've entered the overworld for. Game state is not stored here beyond position
-- and cleared markers: the fight itself is an ordinary run, found via run_events like any other.
CREATE TABLE overworld_progress (
  profile_id TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  realm_id   TEXT    NOT NULL,
  language   TEXT    NOT NULL,
  pos_x      INTEGER NOT NULL,
  pos_y      INTEGER NOT NULL,
  cleared    TEXT    NOT NULL, -- JSON array of marker ids
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (profile_id, realm_id)
) STRICT;
