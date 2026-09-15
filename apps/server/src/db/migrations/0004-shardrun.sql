-- Shardrun, the roguelite mode (ADR-0012). A run is one JSON snapshot of its state, rewritten after every command;
-- `status` is copied out of it so the active run can be found without parsing every row.
CREATE TABLE shardrun_runs (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  state      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX shardrun_runs_by_profile ON shardrun_runs (profile_id, created_at);
