-- Runs, their event logs, and their attempts (ADR-0006).
-- LEARN: STRICT tables make SQLite enforce column types instead of silently storing, say, text in an INTEGER column.

-- One row per run. Game state is not stored here: it is rebuilt by folding run_events.
CREATE TABLE runs (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- The event log. (run_id, seq) is the primary key, so two writers can never both append position N.
CREATE TABLE run_events (
  run_id     TEXT    NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  type       TEXT    NOT NULL, -- copied from the payload for debugging and queries
  version    INTEGER NOT NULL, -- payload format version, so old events can be upcast later
  payload    TEXT    NOT NULL, -- the event as JSON, validated with zod when read
  created_at TEXT    NOT NULL,
  PRIMARY KEY (run_id, seq)
) STRICT;

-- Every accepted Probe and Cast: the submitted files and the full runner result, hidden tests included.
-- Server-side only; views.ts decides what a player may see. seq is the position of the attempt's first event.
CREATE TABLE attempts (
  run_id     TEXT    NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('probe', 'cast')),
  language   TEXT    NOT NULL,
  files      TEXT    NOT NULL, -- JSON object: relative path -> contents
  result     TEXT    NOT NULL, -- JSON RunResult
  created_at TEXT    NOT NULL,
  PRIMARY KEY (run_id, seq)
) STRICT;
