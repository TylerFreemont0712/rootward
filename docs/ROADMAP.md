# Rootward — Roadmap

Living plan. Milestone goals and definitions of done come from `PROMPT.md` section 15; this file tracks the concrete
task list, what is done, what is next, and decisions made in conversation. Update it at the end of every session
(`AGENT.md` section 7).

- **Current milestone:** M1 — Vertical slice (in progress). M0 is done.
- **Last updated:** 2026-09-14

## Kickoff decisions (2026-09-13)

| # | Question | Answer | Consequence |
|---|---|---|---|
| 1 | Stack | TypeScript monorepo (PROMPT.md section 14) | ADR-0001 |
| 2 | In-game languages | Python and JavaScript first; **also think about C++** | C++ is planned alongside the Docker runner in M3 (see "M3 additions") |
| 3 | Docker | "Use your best judgement" | Docker 29 (usable without sudo) is the container engine from M3; gVisor (`runsc`) is auto-detected and used if installed, never required |
| 4 | Local models | llama.cpp `llama-server` on port 8080 is the local setup; not Ollama | Default local provider is `openai-compatible` at `http://localhost:8080/v1`; the `ollama` provider kind stays selectable in Settings but is not configured by default |
| 5 | API keys | Undecided; an OpenAI key is likely later | No hosted fallbacks configured by default; OpenAI model ids are discovered from the API, never hardcoded |
| 6 | Session preferences | Long runs | Default run length is **long (9 rooms)**; vim keymap off by default with a toggle; ASCII/Unicode glyphs first |
| 7 | Name | Rename the repo to **Rootward** | Package scope `@rootward/*`, docs say Rootward; the folder rename `ProgramMe` -> `Rootward` happens at the end of the session (moving the working directory under a live session breaks it) |
| 8 | Look | Keep the amber CRT look; **more focus on the maps and the environment for movement** | The M1 expedition map becomes a walkable, turn-based ASCII dungeon layered over the planner's branching graph (see M1) |

Environment at kickoff: Node 26.0.0 (runs `.ts` files natively, including worker threads), pnpm 12.4.1, Docker
29.8.0, Python 3.14, git 2.43. TypeScript is pinned to 6.0.3 because typescript-eslint 8.70 does not support TS 7
yet (ADR-0001).

## M0 — Foundations (done 2026-09-13)

**DoD met and verified:** `pnpm install && pnpm dev` serves the game at http://127.0.0.1:5173 with the API proxied;
The Tally Wisp is beaten in JavaScript through the browser (`pnpm test:e2e`, headless Chromium, with a first-Cast
crit); `pnpm test`, `pnpm lint`, and `pnpm typecheck` pass; `pnpm content:validate` passes with one expected warning
(Python has no runner until M1).

- [x] Repo: `git init`, renamed to Rootward in docs and package scope, optional vendor assets ignored, fonts committed
- [x] Monorepo scaffold: pnpm 12 workspace on Node 26 (TypeScript runs without a build step), strict TypeScript 6,
      type-aware ESLint 10, Prettier, Vitest projects, root scripts, `CLAUDE.md` (ADR-0001)
- [x] `packages/content-schema`: strict zod schemas for pack, realm, skill node, challenge, io tests, hint ladder,
      enemy, item, class, abilities, oath, review card, and balance; seed files aligned (ADR-0002)
- [x] `packages/content-tools`: loader with file:line diagnostics, pack dependency order, references, prerequisite
      cycles, challenge rules, reference-solution execution, `pnpm content:validate`
- [x] `packages/runners`: contract, registry, concurrency limiter, output cap, sentinel protocol with nonce, io
      comparator, comment-aware code scanner, `wasm-js` runner (QuickJS in a worker per job), malicious-code suite
      (ADR-0003)
- [x] `packages/core`: seeded RNG, run events and fold, decider for Probe/Cast/Hint/Retreat with regression heal,
      Strike, Edge Case, rewards, Kernel Panic, and out-of-Focus; fixed-seed tests on the real balance (ADR-0004)
- [x] `packages/shared`: browser-safe API contract validated by both client and server
- [x] `apps/server`: Fastify on 127.0.0.1, content at startup, in-memory event store behind an interface, per-run
      lock, reference timing for efficiency, hidden-test redaction with an API test that tries to leak it, serves the
      built client for `pnpm start`
- [x] `apps/client`: Vite + React + Zustand, amber CRT tokens, challenge select, three-pane encounter with CodeMirror
      6, HUD, enemy card with ASCII art, tests, console, combat log, deterministic Lint lines, hint ladder, Retreat
      panel with explanation, win and Kernel Panic states, Ctrl+Enter / Ctrl+Shift+Enter
- [x] `pnpm test:e2e`: builds, starts the real server, and beats The Tally Wisp in headless Chromium
- [x] Docs: `ARCHITECTURE.md`, ADR-0001 to ADR-0004, `RUNNERS.md`, `CONTENT_AUTHORING.md`, `LEARNING_LOG.md`,
      `PLAYTEST_NOTES.md`, README

Deviations from the M0 plan, recorded so nothing is silent:
- The JavaScript **unit-form** test harness (sentinel protocol inside QuickJS) moved to M1. M0 challenges use io
  tests, graded outside the player's VM (ADR-0003); the sentinel parser itself is implemented and tested.
- Runs are kept in memory, so a server restart forgets them (SQLite arrives in M1). Unsent editor drafts survive a
  page reload through browser storage.
- Artificer abilities are data only (`implemented: false`). The editor offers a free "Reset to starter" meanwhile.
- The client bundle is about 1 MB (mostly CodeMirror and the markdown renderer); code-splitting can come with M1's
  extra screens.

## M1 — Vertical slice: one complete run (in progress)

M1 turns one encounter into a whole expedition. The server gains SQLite persistence for profiles, characters, run
events, and attempts, so a run resumes after a restart; Python arrives through a `wasm-python` (Pyodide) runner. The
pure planner v1 in `packages/core` builds a seeded `DungeonPlan` from the learner model (due reviews, frontier nodes,
Elo-targeted challenge choice, optional stretch, puzzle interleave, boss) with a rationale the player can read, and
property tests over many seeds. Per the kickoff answer on maps, a deterministic **layout** step turns that plan into a
walkable ASCII dungeon: chambers for rooms, corridors and doors for the branch choices, floors that descend toward
Root, realm-themed props, fog of war, and Bit Rot tiles on rotting concepts. The Maintainer moves with arrows,
`hjkl`, or WASD (or click-to-travel); steps stay on the client and entering a room is the event the server records
(ADR-0007). Geometry is cosmetic and navigational only; the pedagogy lives in the plan, so planner tests never depend
on tiles. Shrine, Puzzle, Rest (FSRS cards via
ts-fsrs), and Boss rooms join Encounter. Mastery rules, Elo updates, Commits, and semver Version progression move the
learner model only through evidence, and the Bastion, Debrief, and Chronicle screens close the loop. The default run
length is long (9 rooms). Seed content grows toward PROMPT.md section 13.4. **DoD:** PROMPT.md section 15 (three full
runs on different seeds, learner model changes verified by tests and the Chronicle, resume after restart, no AI).

Task breakdown:
- [x] `wasm-python` runner: Pyodide in a permission-restricted child process (ADR-0005; a spike showed Pyodide in
      Node is not a sandbox by itself), outputs compared outside the sandbox, warm spare process, safety suite; the
      Tally Wisp Python variant is validated by `content:validate` and playable end to end
- [x] Persistence: ADR-0006 (`node:sqlite`, plain SQL, numbered migrations with backups), SQLite event store with
      zod-validated events, attempts table that rebuilds editor contents and test results, resume after a server
      restart (`apps/server/test/resume.test.ts`)
- [ ] `db:export` / `db:import` JSON backups of the database
- [ ] JavaScript unit-form harness (sentinel protocol inside QuickJS), moved from M0
- [ ] Concepts per language: decide how a JavaScript play of a multi-language challenge credits `js.*` nodes (ADR)
- [ ] Artificer Inspect and Refactor abilities (effect primitives `revealHiddenTest`, `resetStarter`)
- [ ] Learner model: mastery 0-5 evidence rules, Elo update, error tags, FSRS glue, Commits, Version
- [x] Planner v1 in `packages/core` (ADR-0007, `docs/PLANNER.md`): language tracks, Elo selection, spine with safe
      branches, rationale, unit tests and a 1,000-seed property test
- [x] Map layout and pathfinding in `packages/core`, property-tested for reachability and overlaps
- [x] Run flow over a plan (ADR-0008): plan saved in `RunStarted`, `EnterRoom` checked against the plan's edges, any
      fight outcome clears the room, Elite and Boss tiers come from the room, the boss room ends the run, `AbandonRun`;
      the server builds the planner catalog from content (the learner snapshot stays empty until the learner model
      lands); artifacts and drafts per room; resume mid-expedition
- [x] Map screen: ASCII renderer behind a `MapRenderer` interface, client-side movement (arrows, hjkl, WASD,
      click-to-travel, and a door list), fog of war, locked doors, route, legend, and "why this dungeon" panels, minimap
      in the encounter screen; `pnpm test:e2e` plays a whole expedition
- [ ] Learner simulation script (planner converges to target success on synthetic learners)
- [ ] Rooms: Shrine, Puzzle (predict-output, spot-the-bug, Parsons), Rest, and multi-phase Boss (boss rooms already play
      as a boss-tier fight); enable lessons, puzzles, and due cards in `apps/server/src/planning.ts` as each lands
- [ ] Screens: Bastion (character creation, Artificer, Oath of the Foundry), Debrief, Chronicle (the Guild Board stands
      in for the Bastion; the Expedition map is done)
- [ ] Content: `content:new`, `content:stats`, seed content per section 13.4 (Foundry Python + JS, Grove, puzzles,
      cards, 15 enemies, 12 items, Warden class data)

## Later milestones (summaries; full text in PROMPT.md section 15)

- **M2 — AI layer.** Provider registry, role router with fallbacks and live switching, Tutor/Loremaster/Reviewer,
  Settings UI. Defaults follow kickoff answers 4 and 5 (llama.cpp first, nothing hosted until a key exists).
- **M3 — Containers and the Warden.** Docker runner and images, `process` fallback behind a flag, terminal over
  WebSocket, Warden class, Kernel Halls terminal content, Trap rooms.
  - **M3 additions (kickoff answer 2):** a `rootward/cpp` image (g++/clang++, `-std=c++20`, ASan/UBSan) with io-form
    support first and a small `rw_test.hpp` unit harness that prints sentinel lines; `@codemirror/lang-cpp` in the
    editor; a `cpp.*` skill track stub with `transfers_to` links into the shared concept nodes; a handful of C++
    Foundry challenges. There is no zero-setup WASM path for C++ (in-process clang toolchains are very large), so
    C++ requires Docker or the opt-in `process` runner; revisit if that changes.
- **M4 — Forge and Adversary.** **M5 — More classes.** **M6 — Progression depth and polish** (candidate: make the
  Bastion walkable with the M1 map engine). **M7 — Packaging.**

## Your Turn (optional tasks for the user; nothing is blocked on these)

- **Your Turn (easy):** Write four review cards for `py.control.loops` in `content/packs/core/cards/` (copy the
  shape of `py-collections-dict.yaml`), then run `pnpm content:validate`.
- **Your Turn (medium):** Implement the `drain` enemy move (costs the player 1 Focus) in the core move registry, with
  a fixed-seed unit test. The registry and the `strike` move are the worked examples.
- **Your Turn (hard):** Add an `order_insensitive` comparison mode for io test cases (schema flag, comparator,
  unit tests, and one content case that uses it).

## Next session: start here

State (2026-09-14): M0 is done. M1 has the Python runner, SQLite persistence with resume, planner v1, and expeditions
playable end to end: Guild Board, walkable ASCII map with fog of war, fights room by room, and a boss that ends the run
(ADR-0008). Content is now the bottleneck: with one challenge, every expedition is two rooms (the fight, then the same
fight as the boss). Suggested order for the rest of M1:
1. Content: more Foundry challenges in Python and JavaScript so expeditions get real floors and branches, the
   JavaScript track nodes, and the concepts-per-language ADR.
2. Learner model (mastery rules, Elo, FSRS via ts-fsrs, Commits, Version) feeding the planner's learner snapshot, then
   the Bastion and Debrief screens.
3. Shrine, Puzzle, and Rest rooms.
4. `db:export` / `db:import`.

Housekeeping: the folder is still named `ProgramMe`. Rename it to `Rootward` between sessions, not during one (moving
the working directory breaks a running session).

## Blockers and open questions

- None blocking.
