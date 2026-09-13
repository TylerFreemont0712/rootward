# Rootward — Roadmap

Living plan. Milestone goals and definitions of done come from `PROMPT.md` section 15; this file tracks the concrete
task list, what is done, what is next, and decisions made in conversation. Update it at the end of every session
(`AGENT.md` section 7).

- **Current milestone:** M0 — Foundations
- **Last updated:** 2026-09-13

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

## M0 — Foundations (in progress)

Goal and DoD: PROMPT.md section 15. **DoD:** a new user can clone, run `pnpm install && pnpm dev`, and beat one
encounter in the browser; `pnpm test` is green; `pnpm lint` is clean; `pnpm content:validate` passes.

- [ ] Repo: `git init`, rename to Rootward, `.gitignore` (optional vendor assets ignored, fonts kept)
- [ ] Monorepo scaffold: pnpm workspace, strict `tsconfig.base.json`, ESLint flat config (typescript-eslint,
      type-aware), Prettier, vitest projects, root scripts (`dev`, `test`, `lint`, `typecheck`, `format`,
      `content:validate`), `CLAUDE.md`
- [ ] `packages/content-schema`: zod schemas for pack, realm, skill node, challenge (+ io test files, hint ladder),
      enemy, item, class + abilities, oath, review card, balance config; seed files brought in line with the schemas
- [ ] `packages/content-tools`: pack loader and content index; `content:validate` (schema, references, graph
      acyclicity, test-count drift, hint ladder, static constraints, reference solutions executed on `wasm-js`;
      languages without a runner are skipped with a visible warning)
- [ ] `packages/runners`: `Runner` contract, registry, concurrency limit, output truncation, sentinel protocol with
      per-run nonce, io comparator, `wasm-js` runner (QuickJS in a worker thread: memory limit, interrupt deadline,
      hard wall-clock kill, `fs`/stdin shim), JS unit-test harness, malicious-code test suite
- [ ] `packages/core`: seeded RNG, run event log and fold, `Encounter` controller (Probe, Cast, Hint, Retreat,
      damage and regression heal, enemy moves `strike` and `edge-case`, bonuses, Kernel Panic), fairness-invariant
      tests with fixed seeds
- [ ] `packages/shared`: API DTOs as zod schemas (client and server both validate)
- [ ] `apps/server`: Fastify host, content loaded at startup, in-memory run store behind an interface, routes to start
      an encounter and act in it, hidden-test redaction (tested), serves the built client for `pnpm start`
- [ ] `apps/client`: Vite + React + Zustand, amber CRT tokens from the mockup, three-pane shell, CodeMirror 6 editor,
      Task panel, HUD and enemy card, test results and console, hint ladder, Retreat panel, win/lose states, keyboard
      shortcuts (Ctrl+Enter Cast, Ctrl+Shift+Enter Probe)
- [ ] End-to-end smoke check (`pnpm test:e2e`, Playwright with the locally cached Chromium): beat The Tally Wisp in
      JavaScript through the real browser UI
- [ ] Docs: `ARCHITECTURE.md`, `ADR-0001-stack.md`, `ADR-0002-content-format.md`, sandbox/runner ADR, encounter
      rules ADR, `RUNNERS.md`, `CONTENT_AUTHORING.md` (first cut), `LEARNING_LOG.md`, `PLAYTEST_NOTES.md`, README

## M1 — Vertical slice: one complete run (next)

M1 turns one encounter into a whole expedition. The server gains SQLite persistence for profiles, characters, run
events, and attempts, so a run resumes after a restart; Python arrives through a `wasm-python` (Pyodide) runner. The
pure planner v1 in `packages/core` builds a seeded `DungeonPlan` from the learner model (due reviews, frontier nodes,
Elo-targeted challenge choice, optional stretch, puzzle interleave, boss) with a rationale the player can read, and
property tests over many seeds. Per the kickoff answer on maps, a deterministic **layout** step turns that plan into a
walkable ASCII dungeon: chambers for rooms, corridors and doors for the branch choices, floors that descend toward
Root, realm-themed props, fog of war, and Bit Rot tiles on rotting concepts. The Maintainer moves turn by turn with
arrows, `hjkl`, or WASD (or click-to-travel), and each step is a `Move` event. Geometry is cosmetic and navigational
only; the pedagogy lives in the plan, so planner tests never depend on tiles. Shrine, Puzzle, Rest (FSRS cards via
ts-fsrs), and Boss rooms join Encounter. Mastery rules, Elo updates, Commits, and semver Version progression move the
learner model only through evidence, and the Bastion, Debrief, and Chronicle screens close the loop. The default run
length is long (9 rooms). Seed content grows toward PROMPT.md section 13.4. **DoD:** PROMPT.md section 15 (three full
runs on different seeds, learner model changes verified by tests and the Chronicle, resume after restart, no AI).

Task breakdown (refine when M0 closes):
- [ ] Persistence ADR (`node:sqlite` built-in vs `better-sqlite3` + Drizzle; Drizzle 0.45 has no `node:sqlite`
      driver), event store, snapshots, migrations, `db:export`/`db:import`
- [ ] `wasm-python` runner (Pyodide in a worker thread) + Python harness; Tally Wisp Python variant validated
- [ ] Learner model: mastery 0-5 evidence rules, Elo update, error tags, FSRS glue, Commits, Version
- [ ] Planner v1 + `docs/PLANNER.md` + property tests + learner simulation script
- [ ] Map: layout generator, movement controller (`Move` events), `MapRenderer` interface with an ASCII
      implementation, minimap in the encounter screen
- [ ] Rooms: Shrine, Puzzle (predict-output, spot-the-bug, Parsons), Rest, Boss
- [ ] Screens: Bastion (character creation, Artificer, Oath of the Foundry), Expedition map, Debrief, Chronicle
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

## Blockers and open questions

- None blocking. Open: persistence library choice (decide at the start of M1, ADR).
