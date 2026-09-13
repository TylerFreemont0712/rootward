# Learning log

Things worth understanding in this codebase, with pointers to where they live. Add to it whenever a decision or a
language feature took more than a minute to understand.

## TypeScript and tooling

- **TypeScript without a build step.** Node 26 removes type annotations and runs `.ts` files directly, even in worker
  threads. The price: only "erasable" syntax (no `enum`, `namespace`, or constructor parameter properties) and
  explicit `.ts` extensions in relative imports. See `tsconfig.base.json` and ADR-0001.
- **Strictness flags that catch real bugs.** `noUncheckedIndexedAccess` makes `items[i]` possibly `undefined`, so
  code must handle the empty case. `exactOptionalPropertyTypes` separates "property missing" from "property set to
  undefined"; `location()` in `packages/content-tools/src/diagnostics.ts` shows the pattern it forces.
- **Type-aware linting.** `eslint.config.js` uses typescript-eslint's `strictTypeChecked`, which asks the compiler
  for types and can flag floating promises or unsafe `any` flows, not just style.
- **One test command for many packages.** `vitest.config.ts` lists workspace folders as Vitest `projects`.
- **Source-first packages.** Each `packages/*/package.json` points `exports` at `src/index.ts`, so there is no
  compiled copy to go stale.

## Validation and content

- **The schema is the file format.** `packages/content-schema/src/*.ts` exports each zod schema and a type of the
  same name (`z.infer`). Strict objects reject unknown keys, which turns typos into errors (ADR-0002).
- **Exhaustive records.** `z.record(z.enum([...]), value)` requires every key; `balance.ts` uses it so a missing
  tuning value fails at load time instead of becoming `undefined` mid-fight.
- **Errors with line numbers.** `packages/content-tools/src/yaml.ts` parses with `parseDocument` and a
  `LineCounter`, then maps each zod issue path back to a YAML node's source position.
- **Collect, don't throw.** `Diagnostics` gathers every problem so one validation run shows all of them.
- **Topological sort.** `orderPacks` in `packages/content-tools/src/loader/load-content.ts` loads packs after their
  dependencies using Kahn's algorithm; leftovers are cycles.
- **Cycle detection.** `packages/content-tools/src/validate/graph.ts` is depth-first search with a "visiting" state.
- **A tiny lexer.** `packages/runners/src/static/scan.ts` blanks comments and string contents while keeping newlines,
  so banned-token checks ignore `# no for loops here`.

## Sandboxing

- **Why player code runs in a worker thread.** A spike showed that deep recursion inside QuickJS overflowed V8's
  native stack and killed the whole Node process before QuickJS's own stack limit fired. In a worker with a larger
  stack (`resourceLimits.stackSizeMb`), QuickJS reports a clean `InternalError: stack overflow`, and a worker that
  misbehaves can be terminated without touching the server.
- **Grading outside the player's reach.** For io tests the worker compares output itself instead of running a test
  harness inside the player's VM (`packages/runners/src/wasm-js/worker.ts`), so player code cannot fake results.
- **Nonces against forged output.** `packages/runners/src/protocol/sentinel.ts`: harness lines carry a random
  per-run prefix that player code never sees.
- **"Runs in WebAssembly" does not mean "sandboxed".** A spike showed Pyodide's `os.system` running a real shell,
  because Emscripten implements it with Node's `child_process`. Always test the escape routes of a sandbox
  (`packages/runners/test/wasm-python-safety.test.ts`) instead of trusting a label.
- **Node's permission model.** `node --permission --allow-fs-read=<dir>` denies everything not allowed for the whole
  process: other files, network, child processes, workers. `sandboxFlags` in
  `packages/runners/src/wasm-python/process.ts` is the whole policy in six lines (ADR-0005).
- **A shim that answers one question.** Pyodide calls the forbidden `process.binding("constants")` while starting;
  `host.mts` replaces it with a function that returns only the file-flag constants and refuses everything else.
- **Keep the answers out of the sandbox.** The Python sandbox receives inputs but never expected outputs; the parent
  compares (`toTestResult` in `packages/runners/src/wasm-python/runner.ts`).

## Engine

- **The decider pattern.** `packages/core/src/run/decide.ts` turns a command into events (or a refusal) and
  `evolve.ts` applies events. Rules and randomness live only in `decide`; replaying events never re-runs them.
- **Events carry their results.** `CastResolved` stores the Focus left and `EnemyStruck` the Integrity left, so
  tuning `balance.yaml` later cannot change how an old run replays.
- **Counter-based randomness.** `randomFor(seed, stream, index)` in `packages/core/src/rng.ts` computes the n-th draw
  directly, so there is no generator state to save, and named streams keep subsystems from disturbing each other.
- **Refusals are values.** `Decision<T>` in `packages/core/src/result.ts` makes "no Focus left" ordinary flow and
  keeps exceptions for bugs.

## Persistence

- **Schema versions without a bookkeeping table.** SQLite keeps an integer, `PRAGMA user_version`, in the file header.
  `migrate` in `apps/server/src/db/database.ts` applies every numbered `.sql` file above it, each in a transaction.
- **Back up before you migrate.** `VACUUM INTO 'file'` writes a consistent copy even while the write-ahead log holds
  recent changes, which copying the file would miss.
- **STRICT tables.** `apps/server/src/db/migrations/0001-runs.sql` uses them so SQLite rejects wrongly typed values
  instead of storing them anyway.
- **A primary key as a concurrency guard.** `run_events` is keyed by `(run_id, seq)`: two writers appending event N to
  the same run cannot both succeed.
- **Types inferred from schemas.** `packages/core/src/run/types.ts` defines events as zod schemas and infers the
  TypeScript types from them, so data read back from the database is validated against exactly the types the code
  uses.
- **Caches rebuilt from a log.** After a restart, `RunService` replays a run's stored attempts through `applyAttempt`
  to rebuild the editor contents and test results; the in-memory copy is only a cache.

## Server and client

- **One redaction boundary.** `apps/server/src/runs/views.ts` is the only place state becomes client data. Hidden
  tests become category labels with opaque ids, and parsing the view with the strict shared schema strips anything
  unlisted. `apps/server/test/api.test.ts` proves an echo program cannot leak hidden input.
- **Validate on both sides.** `packages/shared` is used by the server to build responses and by
  `apps/client/src/api/client.ts` to check them, so contract drift fails loudly.
- **A per-key lock from promises.** `apps/server/src/runs/lock.ts` serializes actions on one run with
  `Promise.withResolvers`.
- **Asking the rules before doing work.** `RunService.act` calls `decide` with empty results first, so a Cast with no
  Focus is refused before any code runs.
- **CodeMirror inside React.** `apps/client/src/editor/CodeEditor.tsx` creates the editor once and pushes prop
  changes in as transactions; Compartments swap language and read-only mode without rebuilding.
- **Locators must be unambiguous.** Playwright's strict mode failed the first e2e run because "Tally Wisp defeated"
  appeared twice (outcome heading and combat log); `e2e/smoke.ts` now targets the heading by role.
