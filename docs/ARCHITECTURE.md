# Architecture

How Rootward is put together, as of M1 in progress (updated 2026-09-17). Decisions behind it live in
`docs/decisions/`: ADR-0001 stack, ADR-0002 content format, ADR-0003 JavaScript sandbox, ADR-0004 encounter rules,
ADR-0005 Python sandbox, ADR-0006 persistence, ADR-0007 planner and map, ADR-0008 expedition run flow, ADR-0009 learner
model, ADR-0010 characters, ADR-0011 the world as content; for Shardrun, ADR-0012 the mode, ADR-0013 layers, the code
view and modes, ADR-0014 compounding damage, ADR-0015 complexity pricing, ADR-0016 big numbers, ADR-0019 the battle
stage, ADR-0020 the deck playstyle, ADR-0021 the map as a place, ADR-0022 the damage that lands and one code view; and
ADR-0017 and ADR-0018 localization. The original build spec is `PROMPT.md`.

## The big picture

```
 browser                     local server (127.0.0.1)                          worker threads
┌──────────────┐  HTTP/JSON  ┌────────────────────────────────────────────┐   ┌───────────────────┐
│ apps/client  │ ──────────▶ │ apps/server                                │   │ QuickJS (WASM)    │
│ React +      │ ◀────────── │  routes ─▶ RunService ─▶ core.decide()     │   │ one job per worker│
│ CodeMirror   │  zod both   │     │        │   ▲          │             │   └─────────▲─────────┘
│ world canvas │  directions │     │        │   │     events + evolve()  │             │
└──────────────┘             │     │        ▼   │          ▼             │    RunJob / results
                             │     │     Sandbox ──── runners ───────────┼─────────────┘
                             │     └─▶ WorldService ─▶ core world rules  │
                             │           ContentIndex (content-tools)    │
                             │           SQLite: runs, attempts, world   │
                             └────────────────────────────────────────────┘
```

## Packages and the rules between them

| Package | Job | May depend on | Must not |
|---|---|---|---|
| `packages/content-schema` | zod schemas for every content and config file; the schema output *is* the file shape | zod | touch the filesystem |
| `packages/content-tools` | load packs with file:line diagnostics, validate (references, graphs, zone reachability), build runner jobs, `content:validate` CLI | content-schema, runners | know game rules |
| `packages/runners` | `Runner` contract, registry, limiter, io comparator, sentinel protocol, `wasm-js` runner (QuickJS in a worker thread), `wasm-python` runner (Pyodide in a permission-restricted child process), static code scanner | zod, QuickJS, Pyodide | import game code; `./static` must stay browser-safe |
| `packages/core` | pure engine: seeded RNG, run events, `decide`/`evolve` for fights and rooms, moves, rewards, planner, learner model, map layout and pathfinding (`./map` is browser-safe), world rules (conditions, quests, effects, dialogue, zone collision) | content-schema (types), zod | do I/O, read clocks, or call `Math.random` |
| `packages/shared` | HTTP contract as zod schemas | zod | import Node modules (the browser loads it) |
| `apps/server` | Fastify host: content at startup, planner catalog, run service, world service, sandbox, views | everything above | send hidden test data, the run seed, or keys to the client |
| `apps/client` | React UI: title screen and main menu, the walkable world (canvas ground, sprites, dialogue, journal), Guild Board, three-pane encounter, and Shardrun (layer map, battle stage with its effects engine, code view, workbench, deck table, Codex) | shared, runners/static, core/map | run game rules (it renders server views; walking, fog, the camera, the stage's timeline, and hiding predictions are presentation) |
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
8. `buildEncounterView` and `buildRunView` (`apps/server/src/runs/views.ts`) turn state, events, content, and
   artifacts into a `RunView`, redacting hidden tests, and parse it with the shared schema before it is sent.

## An expedition

1. `POST /api/expeditions`: `RunService.startExpedition` builds a `PlannerCatalog` from content
   (`apps/server/src/planning.ts`), calls `planDungeon`, and stores `RunStarted` with the plan (ADR-0007, ADR-0008).
2. The run view carries the laid-out map (`layoutDungeon`), a state per room, and the plan's rationale. The client
   uncovers tiles, locks doors, and moves the avatar locally (`apps/client/src/map/`).
3. Stepping through an open door posts `POST /api/runs/:runId/rooms`. `decide` checks the room against the plan's
   edges from the last cleared room and starts the fight (`RoomEntered`, `EncounterStarted`).
4. Probes and Casts work as above. When the fight ends, `RoomCleared` follows, and in the boss room `RunEnded`.
5. Back on the map, the doors below the cleared room are open.

## The world

Towns and wilds are content (ADR-0011): `zones/`, `npcs/`, `quests/`, `terrain.yaml`, and `props.yaml` in a pack. Every
route is under `/api/profiles/:profileId/world`, and `WorldService` (`apps/server/src/world/service.ts`) is the only
thing that changes world state.

1. **Arriving.** `POST .../world/start` creates the character's `world_state` row in the zone marked `start: true` (the
   Bastion), with the language their fights use.
2. **The view.** Every request reads a snapshot: the zone from content, `world_state` (zone, flags, quests),
   `zone_progress` (position and won markers per zone), and the learner model's mastery. From it the service builds a
   `WorldView`: tile rows and a legend, a collision grid in dungeon tile codes (terrain, blocking props, and people
   who are present), each marker's best-fit challenge ranked by the planner's `rankChallenges`, a "!" or "?" over
   people (`questsOffered`, `questStatus`), and the journal (`objectiveProgress`). Anything with an `if` in content is
   present, open, or unsealed only while its condition `holds`.
3. **Walking.** The client walks locally (`apps/client/src/screens/WorldScreen.tsx`) and posts `.../world/move` when
   walking stops. The server accepts the spot only if it is walkable and reachable from the last saved one.
4. **Talking.** `.../world/talk` needs the Maintainer beside the person and returns a `ConversationView` for the first
   opening whose condition holds. `.../world/choose` re-checks that the choice is offered right now, runs
   `applyEffects` (start or hand in a quest, set a flag), saves, and returns the next line. `.../world/inspect` does
   the same for signs and doors. An `open` effect tells the client to show the Guild Board, the Chronicle, or the
   Testing Grounds.
5. **Fighting.** Walking onto an open marker posts `.../world/markers/:id/start`, which starts an ordinary practice
   encounter (ADR-0010). When it ends, `.../resolve` records a win in `zone_progress`, but only for a run of one of
   that marker's own challenges. A quest counting wins becomes `ready` by itself; readiness is never stored.
6. **Travelling.** Walking onto a portal posts `.../world/travel`; a locked portal answers with its locked line.

## Modes and the main menu

Choosing a character opens the main menu (`apps/client/src/screens/MainMenu.tsx`), which has one door per mode: The
World (towns, quests, and code-graded fights, with the Guild Board inside it), Shardrun, and Shardrun (Experimental), the
same climb in the deck playstyle (ADR-0020). Only the chosen mode's
screens and bars are shown. Classes are content with a `status`: only `playable` ones can be chosen at creation
(`POST /api/profiles` checks it), and `planned` ones are shown with their subjects (ADR-0013).

## Shardrun

The roguelite mode (ADR-0012, ADR-0013). Content is `shardrun/shards/`, `shardrun/foes/`, and `shardrun/run.yaml` in a pack, and
every rule number is under `shardrun` in `config/balance.yaml`. Routes are under `/api/profiles/:profileId/shardrun`;
`ShardrunService` (`apps/server/src/shardrun/service.ts`) is the only thing that changes a run.

1. **Starting.** `POST .../shardrun/start` takes a language, a difficulty and a playstyle, refuses while another run of
   that playstyle is active (a character keeps one of each; every route takes `?playstyle=`, migration 0005), then
   saves a new snapshot from `startShardrun` in `shardrun_runs` (migration 0004). A run climbs layers; each layer's map
   is generated from the seed by `generateLayerMap` (`packages/core/src/shardrun/map.ts`), and rooms are entered only
   along its edges (`nextRooms`).
2. **A command.** `POST .../shardrun/command` reads the active snapshot, and for a cast first runs the spell (below).
   `stepShardrun` in `packages/core/src/shardrun/engine.ts` then returns the next state and a log, or a refusal, and the
   new snapshot is saved. Commands for one profile run one at a time.
3. **Running spells.** `spellsJob` (`packages/content-tools/src/shardrun.ts`) builds one program that runs every spell
   of a turn, each shard in its own namespace, and prints one result line per spell with the bolts after every shard
   (and, on an error, the shard and line). It is an ordinary io job for `Sandbox.runJob`, with the usual limits; if an
   endless loop stops the job early, the service re-runs the spells one at a time to find it. `readSpellRuns` turns
   the output into runs.
3b. **Growing a spellbook.** A run starts with the spells in `run.yaml`. A boss may grant one, a forge can bind one
   from the `spell_slots` name pool (`bindableSpell` decides what is offered), and a `spell-slot` relic binds one when
   claimed; `max_spells` caps the book. Adding a shard needs no engine change: any `draftable` shard joins the reward
   pool by rarity.
3c. **The deck playstyle** (ADR-0020). A `deck` run carries its shards as cards (`state.deck`) and blank spells. A fight
   shuffles the deck into `battle.draw` and deals `battle.hand`; `compose` moves cards between the hand and the spells
   (a multiset check keeps every card in exactly one place), a cast moves its spell's cards to `battle.discard`, and
   ending a turn discards the rest and draws again, reshuffling the discard when the pile runs out. Won cards join the
   deck, and a forge can `purge` one. The client's table is `Hand.tsx` (the hand and `useComposer`) and `DeckPanel.tsx`.
4. **Resolving.** A bolt deals `power x mult` (ADR-0014): the multiplier is the second axis a build grows on, and
   both numbers are clamped (`max_bolt_power`, `max_bolt_mult`) because a shard's output is player code. `mult`
   defaults to 1, so shards written before that ADR keep their meaning and flow it through unchanged.
   The engine prices the cast (base + shard costs + work), validates and clamps the bolts, and applies
   them: wards become block, other bolts hit their target through weaknesses, resistances, shields, and traits. Ending
   a turn lets every living foe play its next intent.
5. **The view.** A command responds as soon as the rules are applied; the next turn's spells then run in the
   background, and `GET .../shardrun/previews` waits for them. Each preview is a real run, priced and resolved on a copy
   of the state (`previewCast`), with the damage and block after every shard (`previewBolts`) for the code view. The
   difficulty decides what is sent: on Programmer, no shard summaries and no predictions. Runs are cached by exact
   input, so a cast reuses its preview's run and answers without the sandbox; its response carries a full replay.
   Relics (content) change resolution through `relicModifiers`. Encounters on the map come from the seed
   (`encounterFor`), so the map shows who waits where. A preview's `damage` is exactly what the cast will land (the
   cast applies the rules in the preview's order; ADR-0022), and it is what the code view and the spell cards
   headline; `potential`, what the volley would do to foes that cannot die, is the footnote and the run's best cast
   (ADR-0016). With predictions turned off in Options, the client strips each preview to what Programmer sends before
   rendering (`withoutPredictions`, `apps/client/src/shardrun/predictions.ts`).
6. **Seeing it all.** `GET /api/shardrun/codex` lists every shard, relic, foe, and layer with where each one is found
   (derived from the reward weights, the forge chains, and the starting loadout, so it cannot drift from the rules).
   Every view carries the rules the run plays by (`rulesView`) and what its relics changed (`modifierViews`) for the
   Stats panel, plus the run's own counters. A run marked `sandbox: true` also answers `POST .../shardrun/dev`: grant
   or remove a shard or relic, add a spell, set Integrity or mana, spawn an encounter, end a fight either way, or jump
   to a layer. That needs both `ROOTWARD_DEV=1` on the server and the run's own mark, and changes nothing else about
   how the run plays (ADR-0013).
7. **The stage.** The client plays each response's log (ADR-0019). The log already says what every bolt was — its
   place in the volley, its aim, pierce, multiplier, weakness or resistance, what a shield took — so
   `planTimeline` (`apps/client/src/shardrun/fx/timeline.ts`) can turn it into timed cues without any rule of its own.
   `FxLayer` runs `FxEngine` (`fx/engine.ts`) on two canvases, under and over the bodies, and fires each cue on the
   engine's clock, which stops for a few frames on a heavy hit; `Stage.tsx` answers the same cues with poses, hit
   flashes, rising numbers and banners. HP and Integrity wait for the hits through a small ledger (`fx/pending.ts`).
   Where everyone stands comes from `fx/layout.ts`, from each foe's `size` in content. None of this changes what the
   server decided; it only decides when the player sees it. The code view (`CodeView.tsx`) has one size and place
   whether a spell is built, cast or read: the stage's left half, because foes are laid out in its right half
   (`FOE_BAND`), so it never covers one (ADR-0022).
8. **The layer map.** `LayerMap.tsx` draws the view's nodes and edges as the layer in cross-section (ADR-0021): each
   room a chamber painted for its layer with its foes (from `encounterFor`, silhouettes until near) or a prop standing
   in it, tunnels as layered SVG strokes, the guardian's arena at the top, and the Maintainer walking a tunnel's
   curve (Web Animations keyframes sampled from the same Bézier) before `enter` is sent. Which rooms are open still
   comes only from the server.

## Language

English is the project's source language; a locale is an overlay on it, never a fork (ADR-0017). UI chrome lives in
`apps/client/src/i18n/`: `en.ts` is an `as const` object and `MessageKey = keyof typeof en`, so English defines which
keys exist and every other locale is a `Partial` of it — a stale key in `ja.ts` is a type error. `translate()` falls
back to English **per key**, which is what lets one screen be translated without the rest. Placeholders are named
(`{integrity}`) and filled by `t()`, so a translation can move a value anywhere in the sentence.

The chosen locale is a `localStorage` preference (`useLocaleStore`), applied to `<html lang>` on load as well as on
change: the Japanese font fallback (`--font-jp`, appended to both stacks because neither VT323 nor IBM Plex Mono has
kana) and the "wrap anywhere" rule for spaceless text both key off that attribute. Nothing about the locale reaches
the server or leaves the machine.

Converted so far: the title screen (which carries the picker, since it is the first screen), the main menu, and the
Shardrun Stats panel. Every other screen is still inline English, which the per-key fallback makes harmless. Where
English inflects for number, the two forms are two keys and a ternary at the call site rather than ICU plural syntax.

Content is localized by **overlay** (ADR-0018). `content/packs/<pack>/locales/<locale>/*.yaml` is a list of
`{en, to}` pairs keyed by the English text exactly as the content holds it, so a translation names no id, file or
position: content can be renamed and reordered freely, and an *edited* English string simply stops matching, falls
back, and shows up as stale in `pnpm content:locale <locale>`. An overlay can only reach the paths named in
`TRANSLATABLE_FIELDS` (`packages/content-tools/src/locale/fields.ts`), so it can never touch an id, a tag, a sprite,
a number, or the code a player runs.

The locale rides on `x-rootward-locale`, set once in the client's `request()` wrapper. One Fastify `onRequest` hook
puts it in an `AsyncLocalStorage`, and `GameContent.index` is a getter that answers with the localized index for the
request in flight — each locale's index is built once at startup. No route, service or view builder takes a locale.

Two rules keep that from leaking into the game itself. **The engine always reads English**: a shard receives
`battle.foes[].name`, and the engine writes its log into the saved run, so a localized catalog would make both the
rules and the save file depend on a preference. `ShardrunService` therefore keeps an English catalog for
`stepShardrun` and a localized one for its views, and a foe's name and flavor are read back by id at view time.
**Prose the server composes itself** — "Strike for 14", "Mana each turn" — has no English string in any file to match,
so it uses the interface's mechanism from a catalog of its own at `apps/server/src/i18n/`.

Still English: the battle log, because the engine composes it (the fix is a key and parameters on `LogEntry`, not a
translator in the core), and every client screen ADR-0017 has not reached yet.

## State: events, state, artifacts

- **Events** (`RunEvent`) are the source of truth for game state. They record facts including resulting numbers, so
  an old run replays exactly even after balance changes (ADR-0004).
- **State** (`RunState`) is always derived: `foldRun(events)`.
- **Artifacts** (`RunArtifacts`) are the non-game data around a run: last submitted files and full test output,
  including hidden tests. They never leave the server except through `views.ts`. They belong to the current fight:
  the cache key is the position of its `EncounterStarted` event, so every room starts from its own starter files.
- Both live in SQLite (`apps/server/src/db/`, ADR-0006): `run_events` holds events as zod-validated JSON, and
  `attempts` holds every accepted Probe and Cast. After a restart, state is refolded from events and artifacts are
  rebuilt by replaying attempts (`applyAttempt`), so a fight resumes with its editor contents and test results.
- **World state** is plain rows, not events (ADR-0011): `world_state` (one per character) and `zone_progress` (one per
  character per zone). Quest progress is derived from them and the learner model on every read.
- The database is `$ROOTWARD_DATA_DIR/rootward.db` (default `~/.local/share/rootward`). Migrations are numbered
  `.sql` files tracked in `PRAGMA user_version`, with a backup written before an existing database is upgraded.
- Tests use `InMemoryEventStore` / `InMemoryAttemptStore` or a temporary database; `apps/server/test/resume.test.ts`
  restarts a server on the same file.

## The learner model

The learner model is a projection of run events, rebuilt whenever it is needed (ADR-0009):

1. `evidenceFromRun` (`packages/core/src/learner/evidence.ts`) walks one run's events and emits a record whenever a
   fight ends (won, retreated, out of Focus, or a Kernel Panic) and when an expedition ends. A fight's concept tags
   come from its `EncounterStarted` event.
2. `buildLearnerModel` (`packages/core/src/learner/model.ts`) folds all evidence, oldest first, through
   `applyEvidence`: mastery levels by the evidence rules, Elo ratings, Commits, weak spots, and the semver Version.
   `creditedNodes` routes a fight played in another language to that language's node or to the shared concept.
3. `LearnerService` (`apps/server/src/learner.ts`) reads every run through `EventStore.loadAll` (events with append
   times) and serves the planner's snapshot, hint prices, `GET /api/learner` (the Chronicle), and
   `GET /api/runs/:runId/debrief` (the model before and after one run).

Mastery is never stored, so changing a rule and refolding rebuilds the whole history under the new rule.

## Content

`loadContent` reads `content/packs/*` and returns a `ContentIndex` (maps of realms, skills, oaths, classes, enemies,
items, cards, challenges, terrain, props, NPCs, quests, zones) plus diagnostics. The server refuses to start if content
has errors. `pnpm content:validate` adds reference checks, prerequisite-cycle detection, per-challenge rules, world
checks (`packages/content-tools/src/validate/world.ts`: dialogue that leads somewhere, nothing placed on a blocked
tile, every marker, portal, and person reachable from the zone's entry), and execution of every reference solution.
See `docs/CONTENT_AUTHORING.md`. Optional generated art is described in `assets/README.md` and made with
`scripts/art/generate.py`.

## Invariants and where they are enforced

| Invariant (PROMPT.md) | Enforced in | Tested in |
|---|---|---|
| Hidden tests never leave the backend | `apps/server/src/runs/views.ts` (labels, opaque ids, fixed failure phrases, visible-only console) and the strict `EncounterView` schema | `apps/server/test/api.test.ts` (an echo program cannot leak hidden input) |
| Player code runs only in a sandbox with limits | `packages/runners/src/wasm-js/` (QuickJS limits, worker per job, wall-clock kill); `packages/runners/src/wasm-python/` (Node permission model, empty environment, per-case CPU and memory limits) | `packages/runners/test/wasm-js-safety.test.ts`, `packages/runners/test/wasm-python-safety.test.ts` |
| Output cannot exhaust memory | `OutputBuffer` | `packages/runners/test/output.test.ts`, safety suite |
| At most N sandboxes at once | `ConcurrencyLimiter` via `Sandbox` | `packages/runners/test/registry-limiter.test.ts` |
| Deterministic, seeded rules | `packages/core` (`randomFor`, decider) | `packages/core/test/encounter.test.ts` |
| Rooms are entered only along the plan's edges | `packages/core/src/run/decide.ts` (`enterRoom`) | `packages/core/test/expedition.test.ts`, `apps/server/test/expedition.test.ts` |
| The run seed (which predicts enemy moves) stays on the server | `apps/server/src/runs/views.ts` | `apps/server/test/expedition.test.ts` |
| Mastery changes only through evidence | `packages/core/src/learner/model.ts` (`applyEvidence`) | `packages/core/test/learner.test.ts`, `apps/server/test/learner.test.ts` |
| Quests progress only from real facts (won fights, mastery, flags) | `packages/core/src/world/conditions.ts` (readiness derived, never stored) | `packages/core/test/world.test.ts`, `apps/server/test/world.test.ts` |
| A saved world position is walkable and reachable; nobody talks from across the map | `WorldService.move`, `requireNear` | `apps/server/test/world.test.ts` |
| A marker is cleared only by a win of its own challenge | `WorldService.resolveMarkerEncounter` | `apps/server/test/world.test.ts` |
| The reference solution satisfies its own constraints and passes its tests | `packages/content-tools/src/validate/` | `pnpm content:validate` |
| Shard code runs only in a sandbox, and an endless loop only misfires the spell | `pipelineJob` jobs through `Sandbox.runJob` | `apps/server/test/shardrun.test.ts` |
| A spell's code view shows only measured values (the start, after each shard, the result) | `playbackFrames` in `apps/client/src/shardrun/source.ts`, values from `ShardrunService.spellRunView` | `apps/client/test/shardrun-source.test.ts` |
| Programmer difficulty sends no summaries or predictions | `ShardrunService.view` and `spellRunView` | `apps/server/test/shardrun.test.ts` |
| Dev tools cannot touch an ordinary run | `ShardrunService.dev` (needs `ROOTWARD_DEV` *and* `state.sandbox`) and `stepShardrun` (refuses every `dev-*` command with `not-a-sandbox`) | `apps/server/test/shardrun.test.ts`, `packages/core/test/shardrun.test.ts` |
| Map paths never cross, and every room reaches the boss | `generateLayerMap` | `packages/core/test/shardrun.test.ts` |
| Planned classes cannot be chosen | `POST /api/profiles` in `apps/server/src/app.ts` | `apps/server/test/profile-routes.test.ts` |
| No number a shard computes is trusted as damage (bolts parsed, clamped, capped, and priced) | `normalizeBolts` and `spellCost` in `packages/core/src/shardrun/engine.ts` | `packages/core/test/shardrun.test.ts` |
| Rearranging spells never creates or destroys a shard | `stepShardrun` ("arrange") | `packages/core/test/shardrun.test.ts` |
| A shard's examples match what its code really does, in both languages | `packages/content-tools/src/validate/shardrun.ts` | `pnpm content:validate` |
| The stage never shows a number the log did not produce, and a replayed log cannot push a bar past the true value | `apps/client/src/shardrun/fx/pending.ts` (losses and gains kept apart, clamped at zero) | `apps/client/test/shardrun-stage.test.ts` |
| Every hit of a bolt aimed at all foes lands at once, and a defeat plays after the hit that caused it | `planTimeline` in `apps/client/src/shardrun/fx/timeline.ts` | `apps/client/test/shardrun-timeline.test.ts` |
| The server is not reachable from the network | `ROOTWARD_HOST` defaults to `127.0.0.1` | manual |

## Testing layers

- `pnpm test`: Vitest across every workspace package (unit tests, the sandbox safety suite, API tests via Fastify's
  `inject`). Hermetic: no network, no browser.
- `pnpm content:validate`: the content pipeline, including real execution.
- `pnpm test:e2e`: builds the client, starts the real server, and plays in headless Chromium: a new character arrives
  in the Bastion and takes a quest from Lint by keyboard, then plays a whole expedition (keyboard movement, travel to
  each open door, every fight, the boss), and finally plays a Shardrun turn (a cast run in the sandbox, the foes' turn).
  Since ADR-0013 it creates a character from the class picker, enters the World from the main menu, wins a practice
  fight instead of an expedition, and plays a Shardrun turn whose cast runs as code.
