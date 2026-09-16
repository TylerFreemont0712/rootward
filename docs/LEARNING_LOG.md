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

## Planner and map

- **Correct by construction.** The planner builds one valid main line and only adds same-floor alternatives that
  can substitute for it (`packages/core/src/planner/branches.ts`), so every path through the map obeys the teaching
  order without checking each path.
- **Property-based tests.** `packages/core/test/planner-properties.test.ts` plans 1,000 dungeons from random catalogs
  and learners and checks rules that must always hold; a failure names the seed, so it can be replayed exactly.
- **Elo for difficulty.** `packages/core/src/planner/elo.ts`: one number for the player per concept, one per
  challenge, and the gap predicts the chance of success.
- **Language tracks.** `packages/core/src/planner/tracks.ts` shows how `transfers_to` lets progress and challenges
  cross between Python and JavaScript through shared concept nodes.
- **Fisher-Yates shuffle.** `shuffled` in `packages/core/src/rng.ts` swaps each position with a random earlier one,
  which gives every ordering the same chance.
- **Breadth-first search.** `findPath` in `packages/core/src/map/path.ts` explores tiles in order of distance, so the
  first route it finds is a shortest one.
- **Real data finds what synthetic tests miss.** Previewing dungeons from the real content for a fresh learner showed
  a dictionary challenge in a first expedition. The fix (familiar concepts in `packages/core/src/planner/select.ts`)
  then became a property in `planner-properties.test.ts`, so it holds for every random catalog too.
- **Floats are approximations.** `0.29 * 100` is `28.999999999999996` in both Python and JavaScript. The Rounding
  Error challenge (`content/packs/core/challenges/foundry/rounding-error/`) is built on that, and its test values came
  from a brute-force search rather than guesses (an earlier guess, `5.00 - 3.10`, turned out to be exact).

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

## Expeditions

- **Rules vs presentation.** Walking, fog of war, and locked doors live on the client (`apps/client/src/map/fog.ts`).
  The only gameplay event is entering a room, and `enterRoom` in `packages/core/src/run/decide.ts` checks it against
  the plan, so a client that ignores the fog still cannot take a shortcut (ADR-0008).
- **Flood fill.** `revealedTiles` spreads through corridor tiles from each exit and stops at doors: breadth-first
  search without a goal.
- **Pure state updaters.** Click-to-travel keeps the avatar and the remaining route in one state object and advances
  it with a pure function (`ExpeditionScreen.tsx`), so React's StrictMode, which may call updaters twice, cannot make
  the avatar take two steps.
- **A key as a reset button.** `ExpeditionScreen` keys the map component by the last cleared room. When it changes,
  React mounts a fresh component with fresh state instead of syncing state inside an effect.
- **Subpath exports.** `@rootward/core/map` (`packages/core/package.json` `exports`) lets the browser import the
  pathfinding without the rest of the engine.
- **Caches keyed by a log position.** A fight's artifacts are cached under `runId#<index of its EncounterStarted
  event>` (`apps/server/src/runs/service.ts`), so entering a new room can never show the previous room's editor.
- **Checking rules before expensive work, again.** `RunService.enterRoom` asks `decide` without a fight setup first;
  only a reachable fight room is worth loading a challenge and checking for a sandbox.

## Learner model

- **A projection instead of a table.** `buildLearnerModel` in `packages/core/src/learner/model.ts` folds evidence read
  from run events. No mastery is stored anywhere, so a changed rule followed by a refold rebuilds all history (ADR-0009).
- **Defaults keep old events readable.** `concepts: z.array(z.string()).default([])` on `EncounterState`
  (`packages/core/src/run/types.ts`) lets events stored before the field existed still parse. The core test
  "reads fights stored before concepts were recorded" proves it.
- **Dates without clocks.** Core never calls `Date.now()`. Timestamps arrive with the evidence (the event store's append
  time), and `learnerSnapshot` receives `now` as an argument, so tests use fixed dates.
- **Before and after from one fold.** `LearnerService.forRun` (`apps/server/src/learner.ts`) builds the model from the
  evidence before a run and again with the run's evidence added; the Debrief is the difference.

## The world (ADR-0011)

- **A recursive schema.** `WorldCondition` in `packages/content-schema/src/world.ts` contains itself (`all`, `any`,
  `not`). Its TypeScript type is written by hand and the schema uses `z.lazy`, because inference cannot follow a type
  that refers to itself.
- **`in` as a type guard.** `holds` in `packages/core/src/world/conditions.ts` tells the condition kinds apart with
  `"flag" in condition`; inside each branch TypeScript knows exactly which member of the union it has.
- **Derive, don't store.** A quest's `ready` status is recomputed from won fights, mastery, and flags every time
  (`questStatus`), so it can never disagree with the facts. Only `active` and `done` are saved (`world_state`).
- **Reusing a representation.** `zoneCollision` (`packages/core/src/world/collision.ts`) writes walkability as the
  dungeon's own tile codes, so the same `findPath` and `isWalkable` serve expeditions, zones, the server, and the client.
- **Trust, but verify.** The client walks locally, but `WorldService.move` re-checks that the new spot is reachable from
  the last saved one, and `resolveMarkerEncounter` checks the run was that marker's own challenge
  (`apps/server/src/world/service.ts`).
- **Flood fill as a content check.** `validateWorld` (`packages/content-tools/src/validate/world.ts`) floods from each
  zone's entry to prove every person, fight, and exit can be reached, with gates that open later treated as open.
- **Painter's algorithm with z-index.** `WorldRenderer.tsx` gives each sprite a z-index from the row it stands on, so
  whatever is lower on screen is drawn in front, and a tall roof overlaps the tiles behind it.
- **Canvas for many, DOM for few.** The ground (over a thousand tiles) is painted once onto a canvas at art resolution
  and scaled with `image-rendering: pixelated`; the few dozen things that animate are DOM elements. The fog canvas is
  one pixel per tile, stretched *with* smoothing, which is what gives it soft edges.
- **Hash finalizers.** `variantIndex` in `apps/client/src/world/interactions.ts` first used a plain multiply-and-XOR
  hash, whose low bits cancelled on diagonals (a unit test caught every tile picking variant 0). Two shift-and-multiply
  rounds fold the high bits into the low ones.
- **Refs for long-lived listeners.** `WorldScreen.tsx` sets up its key listeners and walking interval once per mount
  and reads the latest callbacks through refs, instead of tearing listeners down on every render.
- **A key as a reset button, again.** The dialogue box is keyed by the line it shows, so every new line starts on its
  first page with no effect that resets state.
- **Premultiplied alpha.** `resize_premultiplied` in `scripts/art/generate.py` weights color by opacity before
  averaging, so shrinking a sprite does not mix the removed white background into its edges.
- **Seamless variants.** `post_tiles` rolls one crop by half its size so its seams move to the middle, then blends every
  variant toward that rolled copy at the edges: all variants share identical borders and tile in any order.
- **Consistency from one render.** A diffusion model asked twice for "the same character" draws two slightly different
  people. `sheet_figures` in `scripts/art/generate.py` asks once for a character sheet and cuts it into figures with a
  flood fill, so the front, side, and back views share one design.
- **Pose-guided frames.** A text prompt cannot make a model move a character's legs: asked for "a walk cycle", it draws
  the same pose again. `scripts/art/poses.py` draws OpenPose stick figures (COCO keypoints, colored limbs on black)
  for a standing pose and four walk frames per direction, and an OpenPose ControlNet puts the character on each one.
  All fifteen share one render, so they share one design. Front and back strides had to be exaggerated in the poses
  before the model drew a visible step.
- **One scale for every frame.** `post_walk_cycle` fits the largest figure and scales every other figure by the same
  factor, anchoring each by the middle of its head with its feet on the bottom row. Fitting frames one by one had made
  the character a different size in every direction. The client skips the standing frame while walking with a
  `steps(4)` animation between two CSS variables (`.w-avatar-strip` in `global.css`).

## Shardrun (ADR-0012)

- **Composition as gameplay.** A spell is function composition: `reduce` over a list of functions, each taking and
  returning a list. The harness in `packages/content-tools/src/shardrun.ts` is that loop, in Python and JavaScript.
- **Namespaces per shard.** Python `exec(source, namespace)` and JavaScript `new Function(source + "return name")`
  give each shard its own scope, so two shards can define helpers with the same name.
- **A JSON string is a string literal.** `JSON.stringify(JSON.stringify(data))` is valid source in both languages, so
  embedding shard code in a generated program needs no hand-written escaping.
- **Never trust the sandbox's numbers.** Code in a sandbox is contained, but its output is still untrusted input:
  `normalizeBolts` parses with zod, rounds, clamps, and caps, and `spellCost` charges for work, which is how an
  infinite-damage loop becomes a legal but bad spell.
- **Floating point in examples.** `4 * 0.6` is `2.4000000000000004` in both languages (IEEE 754), so shard examples
  compare power with a tolerance (`validate/shardrun.ts`).
- **Snapshots versus events.** Classic runs are event-sourced; Shardrun saves a zod-validated snapshot, because its
  rules are expected to change and old events replayed under new rules would not reproduce old runs.
- **Pure functions with copies.** `stepShardrun` starts with `structuredClone`, mutates the copy, and throws it away on a
  refusal, so rules can be written imperatively and still never change their input (tested).
- **A promise chain as a lock.** `ShardrunService.serialize` queues each profile's commands on one promise, so a cast
  that awaits the sandbox cannot interleave with another command and lose an update.
- **Caching by input.** Pipeline runs are cached under the JSON of their exact input, which makes a random shard's
  preview and cast agree; failures are evicted, since a timeout may be the machine's fault.
- **Insertion-ordered maps.** A JavaScript `Map` iterates in insertion order, so deleting its first key is a
  first-in, first-out eviction (`PIPELINE_CACHE_LIMIT`).
- **Playing back a log.** The server answers with the final state and an ordered log; `usePlayback`
  (`apps/client/src/shardrun/playback.ts`) schedules one effect per entry with timeouts, and the arena draws bolts and
  numbers over numbers that already changed. The store keeps the last battle on screen (`afterglow`) while the winning
  blow plays.
- **Positions without measuring.** The arena places the Maintainer and foes at fixed percentages, so projectile
  animations interpolate between CSS variables and never read the DOM during render.

## Shardrun v2 and modes (ADR-0013)

- **Measure before optimizing.** A short script timed raw sandbox jobs and the Shardrun routes. The lag was not
  JavaScript being slow: a fresh QuickJS worker per job (about 125 ms) and a single Python spare that took about 2 s to
  replace. The fixes followed the numbers: batch, reuse cached runs, answer before previewing, and keep spares warm.
- **Warm without sharing.** A warm worker is started before its job exists and receives it with `postMessage`, so it has
  already loaded QuickJS when the job arrives (`packages/runners/src/wasm-js/runner.ts`). It still runs exactly one job.
  `worker.unref()` keeps an idle spare from holding the process open.
- **Generating maps with invariants.** `generateLayerMap` draws paths that move up one row and at most one column, and
  refuses a step that mirrors a neighbor's (which would cross). Property tests walk fifty seeds and check that no paths
  cross and every room reaches the boss.
- **Answer first, compute after.** `ShardrunService.command` responds, then starts the next previews without awaiting
  them (`warm`), reporting any failure instead of swallowing it. The previews route awaits the same in-flight promises,
  so nothing runs twice.
- **Honest animation.** The code view (`apps/client/src/shardrun/source.ts`) separates what is measured (bolts after
  each shard, from the harness trace) from what is presentation (the cursor walking lines). Values change only at
  measured frames, and a unit test checks that.
- **Composing source for display.** A spell becomes one function by printing each shard's code once, then a cast
  function with one `bolts = shard(bolts, battle)` line per slot. The same composition in two languages is plain string
  building, with no parser needed.
- **Server-side difficulty.** Hiding a prediction in the client would still send it over the wire. On Programmer the
  server leaves summaries and predictions out of the view entirely (`ShardrunService.view`).
- **Versioned snapshots.** The snapshot moved to `version: 2`. `ShardrunService.load` closes a snapshot that no longer
  parses instead of crashing every request that touches it.
- **Content status, not code flags.** Planned classes are ordinary class files with `status: planned`, so the picker,
  the API check, and future unlocking all read one field.
- **Two guards, both on the server.** The dev sandbox needs `ROOTWARD_DEV=1` on the process *and* `sandbox: true` on the
  run: `stepShardrun` refuses every `dev-*` command with `not-a-sandbox`, and `ShardrunService.dev` checks both before
  it reads the run. The client only hides buttons, so a hand-written request reaches nothing an ordinary run would not.
- **One helper, two callers.** `bindableSpell` decides which empty spell a forge could bind; `bindSpell` binds exactly
  that one, and the `spell-slot` relic calls the same pair. The panel can promise a name because the button and the
  rule read one function.
- **Examples that really run.** Every shard's worked examples execute in both Python and JavaScript during
  `pnpm content:validate`, so a shard's plain-words summary cannot drift from its code. The new shards use integer
  arithmetic throughout, which keeps the two languages agreeing exactly rather than almost.

## Compounding damage (ADR-0014)

- **A default is how a contract changes without breaking content.** Adding a second damage axis meant adding a field to
  `Bolt`, which is the file shape for 36 shards and every worked example (ADR-0002). `mult: z.number().default(1)` made
  that a non-event: old examples parse, old saved runs parse, and shards that copy bolts by spreading carry the new
  field for free. When the schema *is* the file format, a default is a migration.
- **A comparator only checks the fields it lists.** `sameBolts` in content validation compared power, element, target,
  pierce and ward one by one, so a brand-new field was invisible to it — the new shards' examples would have passed with
  a completely wrong multiplier. Executable examples are only as strong as the comparison behind them.
- **A test that cannot fail proves nothing.** The clamp test asserted damage, but damage *dealt* is capped by the foe's
  remaining HP, so a working clamp (50) and a missing one (2000) both read 20. It was rewritten to measure ward block,
  which has no such cap. Worth asking of any assertion: what value would make this fail?
- **Shared fixtures carry shared rules.** A relic added to the test catalog defaulted to common rarity, joined the pool
  the seeded elite reward draws from, and displaced the relic an unrelated test asserted by id. Fixtures that feed a
  seeded draw belong to the test that needs them, not to the shared catalog.
- **Measure the fantasy, not just the code.** Unit tests said the multiplier worked; a script through the real server
  and sandbox said a compounding build deals 1344 where the old rules gave 224 — and costs 23 mana against a turn's 6,
  so it cannot be cast at all. The rules were right and the mode was still not playable, which is not something a unit
  test was ever going to say.


## Complexity pricing and curves (ADR-0015)

- **A constraint you cannot grow is a wall, not a difficulty.** Every remaining limit in Shardrun was a literal in
  `config/balance.yaml`: 6 mana a turn, 16 bolts, 1 mana per 8 bolts of work. Turning three of them into functions of
  the layer (`mana_per_turn: { base, per_layer }`, `bolt_cap: { base, per_layer, max }`, foe HP per layer in content)
  changed the feel of the mode more than any new mechanic did. Worth asking of any tuning number: what does it do on
  turn 40? See `packages/core/src/shardrun/engine.ts` — `manaPerTurn`, `boltCap`.
- **Half a curve is no curve.** Billing the *work* sublinearly while shard costs stayed flat mana moved the
  ADR-0014 build from 23 mana to 17, of which 13 was still flat. A cost function only helps the part of the cost it is
  given; the part outside it becomes the whole constraint. `pipelineWork` now prices a shard's own cost as work
  (`cost × per_mana` units) so one curve covers the whole cast.
- **Sublinear growth flattens differences you meant to keep.** The same √ that made a wide build payable also made a
  rare cost-2 shard and a common cost-0 shard differ by about one mana on a narrow spell. Every monotone transform of a
  quantity compresses the distinctions inside it — a trade, not a free win. Recorded in ADR-0015's consequences rather
  than discovered later.
- **Where a rule lives decides what it can know.** Work used to arrive at the rules as one number (`work: number`),
  which was enough while a bolt handled cost a flat amount. Pricing by complexity needs the shard's own class, so
  `PipelineOutcome` now carries `{ shard, given }` per step and `packages/core` looks each one up. The harness still
  only *measures*; the pricing stayed in the pure layer, which is where it can be unit-tested with no sandbox.
- **Only some clamps are balance.** `bolt_cap` was a ceiling pretending to be a safety rail, and became balance.
  `max_bolt_power` and `max_bolt_mult` are genuine rails — the engine never trusts a number player code computed
  (ADR-0012) — so they stayed flat. Telling the two apart is the whole of the "what is a tunable" question.
- **A thing worth teaching should cost something.** `complexity` is a claim a shard makes about its own code, and the
  engine bills it: `constant → 1`, `linear → n`, `linearithmic → ⌈n log₂(n+1)⌉`, `quadratic → n²`. Crosslink compares
  every pair of 128 bolts and owes 16 384 units for it. Big-O stops being a fact to recite and becomes a number on the
  line that produced it, in the code view.

## Big numbers, and measuring the right thing (ADR-0016)

- **Find where a quantity is actually bounded before you design for it being unbounded.** The plan was to decide
  between capping, log-space and `BigInt` for damage. One line settles it: `damage = Math.min(damage, foe.hp)` in
  `resolveBolts` means damage can never exceed the Integrity in front of it, so the only number that can run away is
  foe HP. A whole representation question collapsed into one clamp (`foeHp`, `max_foe_hp`). Read the constraint that
  already exists before adding one.
- **A representation choice is made by the boundaries, not by the type.** `BigInt` is the obvious answer for exact big
  integers, and the wrong one here: a bolt crosses three zod/JSON boundaries (the sandbox, the saved snapshot, the
  client view) and `BigInt` survives none of them. Adopting it would have pushed an encoding onto the *player*, who
  writes the shards. When a value crosses a serialization boundary, the boundary picks the type.
- **Leave headroom for intermediates, not just for results.** 2^53 is where exactness ends, but a cast sums 96 bolts of
  `power x mult`, then applies a damage multiplier, a weakness and a scatter share. The bound has to sit far enough
  below that no intermediate product crosses it — which is why `max_foe_hp` is 1e12 and not 9e15.
- **A safety rail that is also the ceiling is not doing its job.** ADR-0015 kept `max_bolt_mult` flat because it
  guards against player code returning nonsense. True, and it was set at 25, which meant every build hit it. A rail
  should be sized from what the arithmetic can carry, not from what feels balanced; balance belongs to the numbers
  content moves.
- **Measure the thing you want to reward.** Every compounding build reported the same damage, because damage dealt is
  cut to the target's remaining health — the game was scoring the *fight*, not the volley. Scoring the volley means
  resolving a second time against foes that cannot die. Note what that pass keeps: traits, shields and resistances
  still apply, because those are real mitigation, and only "cut to what was left" goes. A metric is a definition, and
  the definition is where the design lives.
- **Adding headroom beats flattening.** The shadow battle gives every foe the same *extra* Integrity rather than the
  same total, so the foes keep their order and a bolt aimed at the weakest still picks the weakest. Perturb a value
  in a way that preserves the relations the code reads off it.

## Localization, and what a type can enforce (ADR-0017)

- **Make one locale the type, not just a convention.** `export const en = {...} as const` plus
  `type MessageKey = keyof typeof en` turns "does this key exist?" into a compile error, for free, in both directions:
  a typo in `ja.ts` fails to build, and so does asking `t()` for a key nobody wrote. This is the whole reason to
  hand-roll instead of reaching for i18next, whose `t()` is `string -> string` unless you add codegen. A derived type
  is cheaper than a validator when the source of truth is already a literal
  (`apps/client/src/i18n/en.ts`, `ja.ts`).
- **`Partial<Record<K, V>>` is the shape of "may be incomplete, may not be wrong."** It permits every subset of the
  keys and no key outside them — exactly the contract a translation wants. Reach for it whenever a thing is an
  optional overlay on a known set.
- **Fall back per key, not per locale.** `CATALOGS[locale][key] ?? en[key]` is one line, and it is the difference
  between "translating is a project" and "translating is a Tuesday". The coarse version (use `ja` if it is complete,
  else `en`) means nothing ships until everything ships.
- **Interpolate by name, never by position.** `"Integrity {integrity}/{max}"` survives a translator moving the values
  to the other end of the sentence; `%s %s` does not. Japanese word order makes this concrete rather than theoretical.
  And leave an unfilled placeholder *visible* (`{zone}`) instead of blanking it — a bug you can see beats a bug that
  renders as nothing (`fill` in `i18n/index.ts`).
- **A module-scope `const` cannot be read by code that runs above it.** Moving the locale's initial read below the
  store that uses it compiles fine and throws at import: `const` has no hoisting, only a temporal dead zone. Function
  declarations *are* hoisted, which is why `readLocale()` can live at the bottom of the file and `startingLocale`
  cannot.
- **Font stacks fall through per glyph, not per element.** Appending the system Japanese faces to a monospace stack
  does not cost the Latin look: the browser takes each character from the first font that has it, so English still
  renders in VT323 and only kana reach the fallback (`--font-jp` in `theme/tokens.css`).
- **Set `<html lang>` on load, not only on change.** Anything styled by language (CJK line breaking, font stacks,
  quotation marks) reads that attribute, so an initial value restored from storage has to reach the DOM too, or a
  reload silently loses the styling half of the locale.

## Localizing data you do not own the shape of (ADR-0018)

- **Key a translation by the source text, not by where it lives.** `shards.compound.summary` breaks when you rename
  the shard and, far worse, keeps matching when you *edit the English* — so it shows a confident translation of a
  sentence that no longer exists. Keying by the English itself makes the two failures into one harmless one: the
  entry stops matching, the string falls back, and a report names it. When a mapping can go stale, prefer a key that
  goes stale *loudly* (`packages/content-tools/src/locale/overlay.ts`).
- **An allowlist is the cheap part; knowing what to leave off it is the work.** Three fields looked translatable and
  were not: an enemy's name (the client looks its portrait up by `slugify(name)`), a spell's name (it becomes
  `cast_bolt` in the code view), and a shard's worked examples (never shown to anyone — 64 strings of waste). Before
  you let something be replaced, grep for who *derives* something from it.
- **`AsyncLocalStorage` is for values that are properties of the caller, not of the call.** A request's language is
  ambient in exactly that sense, which is why a getter on `content.index` could answer in it without a single
  signature changing. The tell for when this is the right tool, rather than a hidden global: passing it explicitly
  would mean adding the same parameter to every function on the path and using it in almost none of them.
- **Find the line where a preference could become data.** Two: the engine hands `battle.foes[].name` to player code,
  and it writes its log into the saved run. Either one would have made a save file depend on a display setting. The
  rule that falls out is worth keeping — *translate the view, never the state* — and it is why the engine keeps an
  English catalog while the views get a localized one (`apps/server/src/shardrun/service.ts`).
- **Prose assembled from a template is a different problem from prose stored in a file.** "Strike for 14" exists in
  no content file, so no content overlay can match it. Sentences the server composes need a message catalog like the
  browser's — same mechanism, different owner — which is why `makeTranslate` moved into `@rootward/shared`.
- **A `WeakMap` keyed on an object is a cache keyed on identity.** Each locale's index is built once and never
  replaced, so `WeakMap<ContentIndex, ShardrunCatalog>` is a per-locale memo that never needed a locale string, and
  releases itself if the index is ever dropped.

## Making a hit feel like a hit (ADR-0019)

- **Light adds.** Fire, lightning and magic are light, and light is additive: drawn with `globalCompositeOperation =
  "lighter"`, black adds nothing, so an effect rendered on black is already the effect. `post_glow` in
  `scripts/art/generate.py` goes one step further and turns brightness into alpha (dividing the color back out), so
  the same sprite also works with ordinary blending. Two renders came back on white anyway; the script now warns.
- **Hit-stop needs a clock you own.** A pause on a heavy hit only works if *everything* waits: the next bolt, the
  number, the HP bar. `FxEngine.clock` stands still during hit-stop and cues fire on it (`FxLayer.tsx`), so the DOM
  and the canvas cannot drift apart. `setTimeout` schedules would have kept firing through the pause.
- **Shake by trauma squared.** Hits add to one `trauma` value that decays each frame, and the stage moves by
  `trauma²` (`shakeOffset` in `fx/engine.ts`). Squaring is what makes small hits barely move the stage and big ones
  really throw it; sums of sines give motion that wanders smoothly instead of jittering like random offsets would.
- **Frame-rate independent drag.** "Keep 30% of your speed per second" is `speed *= 0.3 ** seconds` each frame, not a
  fixed factor per frame; the second slows down twice as fast at 120 fps as at 60 (`Particles.update`).
- **Don't recolor art with hue filters.** `hue-rotate` on a hit turned a purple wraith green. A flash is a colored box
  masked by the sprite's own image (`mask-image`), which lights up exactly the sprite's shape in exactly the bolt's
  color (`HeroSprite` and `FoeSprite` in `Stage.tsx`). Restarting a CSS animation on every hit takes a new animation
  *name*, hence the identical `-0`/`-1` keyframe pairs chosen by a counter's parity.
- **Make replayed effects harmless, not just rare.** The pending ledger keeps losses and gains as separate
  non-negative numbers, so settling a cue twice clamps at zero instead of showing a wrong HP (`fx/pending.ts`). The
  store's `shownBeat` stops most replays; the clamp makes the rest safe.
- **OpenPose sides are the figure's own.** A figure facing the image's right shows its *right* side to the viewer, so
  in a three-quarter view the near shoulder is `R_SHOULDER` (`battle_pose` in `scripts/art/poses.py`). Raising an arm
  past the face made the model draw a hand resting on the head and turn the figure toward the viewer; arms kept below
  the head held their pose.
- **Registered frames for moves, anchored frames for walks.** A walk cycle anchors every frame on the head so the body
  stays put while legs move. A battle pose must move the body — a lunge forward, a recoil back — so `post_pose_strip`
  crops every cell to one shared box instead, and only drops each frame to the floor.
- **Reuse a render at another size before rendering again.** A 48px map sprite was cut from a 1024px render that was
  still in the cache; cut again at 96px it is sharper than a new render would be and the same design by construction
  (`raw_from` in the manifest).

