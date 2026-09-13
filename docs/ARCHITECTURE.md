# Architecture

How Rootward is put together as of M0. Decisions behind it live in `docs/decisions/` (ADR-0001 stack, ADR-0002
content format, ADR-0003 JavaScript sandbox, ADR-0004 encounter rules). The build spec is `PROMPT.md`.

## The big picture

```
 browser                     local server (127.0.0.1)                          worker threads
┌──────────────┐  HTTP/JSON  ┌────────────────────────────────────────────┐   ┌───────────────────┐
│ apps/client  │ ──────────▶ │ apps/server                                │   │ QuickJS (WASM)    │
│ React +      │ ◀────────── │  routes ─▶ RunService ─▶ core.decide()     │   │ one job per worker│
│ CodeMirror   │  zod both   │              │   ▲          │             │   └─────────▲─────────┘
└──────────────┘  directions │              │   │     events + evolve()  │             │
                             │              ▼   │          ▼             │    RunJob / results
                             │           Sandbox ──── runners ───────────┼─────────────┘
                             │           ContentIndex (content-tools)    │
                             │           EventStore + attempts (SQLite)  │
                             └────────────────────────────────────────────┘
```

## Packages and the rules between them

| Package | Job | May depend on | Must not |
|---|---|---|---|
| `packages/content-schema` | zod schemas for every content and config file; the schema output *is* the file shape | zod | touch the filesystem |
| `packages/content-tools` | load packs with file:line diagnostics, validate, build runner jobs, `content:validate` CLI | content-schema, runners | know game rules |
| `packages/runners` | `Runner` contract, registry, limiter, io comparator, sentinel protocol, `wasm-js` runner (QuickJS in a worker thread), `wasm-python` runner (Pyodide in a permission-restricted child process), static code scanner | zod, QuickJS, Pyodide | import game code; `./static` must stay browser-safe |
| `packages/core` | pure engine: seeded RNG, run events, `decide`/`evolve`, moves, rewards | content-schema (types), zod | do I/O, read clocks, or call `Math.random` |
| `packages/shared` | HTTP contract as zod schemas | zod | import Node modules (the browser loads it) |
| `apps/server` | Fastify host: content at startup, run service, sandbox, views | everything above | send hidden test data or keys to the client |
| `apps/client` | React UI: challenge select, three-pane encounter | shared, runners/static | run game rules (it renders server views) |
| `e2e` | browser smoke test | playwright-core | run in `pnpm test` |

There is no build step for packages or the server: Node 26 runs the TypeScript sources directly (ADR-0001). Vite
builds the client; Vitest compiles tests.

## What happens on a Cast

1. The client posts `{ type: "cast", files }` to `POST /api/runs/:runId/actions`. The body is parsed with
   `ActionRequest` from `@rootward/shared`.
2. `RunService.act` (`apps/server/src/runs/service.ts`) takes a per-run lock, loads the run's events, and folds them
   into `RunState` with `foldRun`.
3. A precheck asks `decide` whether a Cast is even possible (run still active, Focus left) before any code runs.
4. The `Sandbox` builds an io `RunJob` for every active test (visible, hidden, and any revealed by Edge Case) and the
   `wasm-js` runner executes it in a fresh worker thread (`packages/runners/src/wasm-js/`).
5. Per-test pass/fail and durations become a `Cast` command; if all large-input tests passed, the reference
   solution's time on the same runner is attached for the efficiency bonus.
6. `decide` (`packages/core/src/run/decide.ts`) applies the combat rules and returns events: `CastResolved`, then
   `EncounterWon`, or an enemy move (`EnemyStruck` / `EdgeCaseRevealed`) and possibly `Exhausted` or `RunEnded`.
7. Events are appended to `run_events` and the Cast itself (files and full runner output) to `attempts`, both in
   SQLite; an in-memory `RunArtifacts` cache is updated from the same attempt.
8. `buildEncounterView` (`apps/server/src/runs/views.ts`) turns state, events, content, and artifacts into an
   `EncounterView`, redacting hidden tests, and parses it with the shared schema before it is sent.

## State: events, state, artifacts

- **Events** (`RunEvent`) are the source of truth for game state. They record facts including resulting numbers, so
  an old run replays exactly even after balance changes (ADR-0004).
- **State** (`RunState`) is always derived: `foldRun(events)`.
- **Artifacts** (`RunArtifacts`) are the non-game data around a run: last submitted files and full test output,
  including hidden tests. They never leave the server except through `views.ts`.
- Both live in SQLite (`apps/server/src/db/`, ADR-0006): `run_events` holds events as zod-validated JSON, and
  `attempts` holds every accepted Probe and Cast. After a restart, state is refolded from events and artifacts are
  rebuilt by replaying attempts (`applyAttempt`), so a fight resumes with its editor contents and test results.
- The database is `$ROOTWARD_DATA_DIR/rootward.db` (default `~/.local/share/rootward`). Migrations are numbered
  `.sql` files tracked in `PRAGMA user_version`, with a backup written before an existing database is upgraded.
- Tests use `InMemoryEventStore` / `InMemoryAttemptStore` or a temporary database; `apps/server/test/resume.test.ts`
  restarts a server on the same file.

## Content

`loadContent` reads `content/packs/*` and returns a `ContentIndex` (maps of realms, skills, oaths, classes, enemies,
items, cards, challenges) plus diagnostics. The server refuses to start if content has errors. `pnpm
content:validate` adds reference checks, prerequisite-cycle detection, per-challenge rules, and execution of every
reference solution. See `docs/CONTENT_AUTHORING.md`.

## Invariants and where they are enforced

| Invariant (PROMPT.md) | Enforced in | Tested in |
|---|---|---|
| Hidden tests never leave the backend | `apps/server/src/runs/views.ts` (labels, opaque ids, fixed failure phrases, visible-only console) and the strict `EncounterView` schema | `apps/server/test/api.test.ts` (an echo program cannot leak hidden input) |
| Player code runs only in a sandbox with limits | `packages/runners/src/wasm-js/` (QuickJS limits, worker per job, wall-clock kill); `packages/runners/src/wasm-python/` (Node permission model, empty environment, per-case CPU and memory limits) | `packages/runners/test/wasm-js-safety.test.ts`, `packages/runners/test/wasm-python-safety.test.ts` |
| Output cannot exhaust memory | `OutputBuffer` | `packages/runners/test/output.test.ts`, safety suite |
| At most N sandboxes at once | `ConcurrencyLimiter` via `Sandbox` | `packages/runners/test/registry-limiter.test.ts` |
| Deterministic, seeded rules | `packages/core` (`randomFor`, decider) | `packages/core/test/encounter.test.ts` |
| The reference solution satisfies its own constraints and passes its tests | `packages/content-tools/src/validate/` | `pnpm content:validate` |
| The server is not reachable from the network | `ROOTWARD_HOST` defaults to `127.0.0.1` | manual |

## Testing layers

- `pnpm test`: Vitest across every workspace package (unit tests, the sandbox safety suite, API tests via Fastify's
  `inject`). Hermetic: no network, no browser.
- `pnpm content:validate`: the content pipeline, including real execution.
- `pnpm test:e2e`: builds the client, starts the real server, and beats one encounter in headless Chromium.
