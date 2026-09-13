# Persistence and event sourcing

## Storage
- SQLite via `better-sqlite3` (synchronous, fast, zero-config) with Drizzle ORM for schema and migrations. WAL mode. One file per profile under the XDG data dir (`~/.local/share/rootward/<profile>.db`); path overridable by env for tests.
- Large blobs (code submissions) deduped by sha256 in a `blobs` table.

## Event sourcing for runs
- `run_events(run_id, seq, type, payload_json, created_at)`; `seq` monotonic per run; the current `RunState` is a pure fold over events (`reduce(events, initialState)`).
- Event types (versioned): `RunStarted{plan, seed, contentVersions}`, `RoomEntered`, `Probe{files, results}`, `Cast{files, results, damage}`, `HintTaken{level}`, `AbilityUsed`, `ArtifactUsed`, `EnemyMove`, `Retreat`, `RoomCleared{bonuses, loot}`, `DamageTaken`, `RunEnded{reason}`.
- Snapshots every 50 events (`run_snapshots`) to speed resume; still verify by folding the tail.
- Benefits: resume after crash, replay for debugging, Chronicle timeline, deterministic tests (fixtures are event lists).
- Upcasting: each event has `v`; a registry of upcasters migrates old payloads on read.

## Projections
- `attempts` table is a projection of Probe/Cast events (kept as a table for fast queries and export).
- `learner_nodes`, `review_cards`, `chronicle` are updated by the post-run applier from events; a `rebuild-projections` script can recompute all of them from events (useful after changing mastery rules).

## Migrations
Drizzle migrations checked in; run at startup; back up the DB file before migrating; tests run migrations on a temp DB.

## Export/import
`pnpm db:export` writes a JSON bundle (profile, characters, events, blobs by hash); `db:import` restores. Useful for moving between machines and for bug reports.

## Privacy
AI transcripts are stored only if the setting is on; they are a separate table and excluded from export unless requested.
