# ADR-0006: Persist runs with Node's built-in SQLite, plain SQL, and numbered migrations

- **Status:** accepted
- **Date:** 2026-09-14
- **Related:** PROMPT.md sections 5 (resumable runs), 14.3, 14.4; ideas/solutions/persistence-and-event-sourcing.md;
  ADR-0004 (event-sourced rules)

## Context
M1's definition of done requires runs to resume after the app restarts, and the learner model, Chronicle, and
Bastion that follow need durable storage too. Runs are already event-sourced (ADR-0004): state is a fold over events.
PROMPT.md suggested `better-sqlite3` with Drizzle ORM. At build time: Drizzle ORM 0.45 has no driver for Node's
built-in `node:sqlite`; `better-sqlite3` is a native addon, which pnpm 12 does not build without explicit approval and
which needs a prebuilt binary for each Node version; Node 26 ships `node:sqlite` (`DatabaseSync`) without an
experimental warning.

## Options considered
1. **`better-sqlite3` + Drizzle ORM.** Typed queries and generated migrations. A native build step, two
   dependencies plus drizzle-kit, and a query layer between the reader and the SQL.
2. **`node:sqlite` + Drizzle's `sqlite-proxy` driver.** No native build, typed queries, but an asynchronous proxy
   wrapped around a synchronous API: more moving parts than the queries justify.
3. **`node:sqlite` + hand-written SQL.** No dependencies. The SQL is visible, rows are validated with zod, and
   migrations are numbered `.sql` files tracked with `PRAGMA user_version`.
4. **JSON files per run.** Simplest of all, but no transactions and no queries for the Chronicle later.

## Decision
Option 3, in `apps/server/src/db/`:
- `openDatabase` enables foreign keys, a busy timeout, and WAL, then applies pending migrations in order, each in a
  transaction that also sets `user_version`. Before upgrading an existing database it writes a consistent copy with
  `VACUUM INTO` (`rootward.db.backup-v<old version>`).
- Tables are `STRICT`. `run_events` has the primary key `(run_id, seq)`, so two writers can never both append the same
  position; appends also check the expected length inside the transaction.
- Event payloads are JSON with a `version` column for future upcasting, and are parsed with the zod `RunEvent`
  schema on the way back (`packages/core/src/run/types.ts` now defines events and state as zod schemas).
- `attempts` stores every accepted Probe and Cast (submitted files and the full runner result). The editor contents,
  the latest test results, and the console are rebuilt from it after a restart.
- The database lives at `$ROOTWARD_DATA_DIR/rootward.db`, defaulting to `$XDG_DATA_HOME/rootward` or
  `~/.local/share/rootward`.

## Consequences
- No new dependencies and no native builds. Row mapping is written by hand; if queries grow (Chronicle analytics), a
  small query builder can come later without changing the schema.
- No state snapshots yet: runs are tens of events, so folding is instant. Add snapshots when a run reaches hundreds.
- Attempts are recorded right after their events. If that write fails, the fight state survives but that attempt's
  editor contents and output are lost; acceptable for a local single-player game.
- Hidden test output is stored in the local database, which never leaves the machine except through a user's export.
- `node:sqlite` is newer than `better-sqlite3`; watch Node release notes for changes.
