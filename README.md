# Rootward

A programming-education roguelike: every fight is a real coding, shell, SQL, testing, or security task run in a
sandbox; classes are engineering disciplines; the skill graph is a curriculum with spaced repetition; an optional,
hot-swappable AI layer plays tutor, narrator, content forge, reviewer, and adversary. Built by one person, for one
person, to become a much better programmer.

**Status:** Milestone 0 (foundations): one playable encounter in the browser, a real JavaScript sandbox, the content
pipeline, and the event-sourced combat engine. Progress and what comes next: `docs/ROADMAP.md`.

## Run it

Requirements: Node 26 and pnpm 12 (`npm i -g pnpm@12.4.1`). No Docker, no API keys.

```sh
pnpm install
pnpm dev        # open http://127.0.0.1:5173 (the API runs on 127.0.0.1:7331)
```

On the Guild Board pick **The Tally Wisp** in **python** or **javascript**. Read the task, write code in the editor,
**Probe** (free, visible tests only) and **Cast** (1 Focus, every test, the enemy strikes back) until the wisp is
gone. Ctrl+Enter casts, Ctrl+Shift+Enter probes. Python runs in Pyodide inside a locked-down process; the first
Python run after starting the server can take a couple of seconds while it loads.

`pnpm start` builds the client and serves the whole game from one process at http://127.0.0.1:7331.

## Commands

| Command | What it does |
|---|---|
| `pnpm test` | Unit, sandbox-safety, and API tests across every package (Vitest) |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | Quality gates |
| `pnpm content:validate` | Validate content packs and run every reference solution in the sandbox |
| `pnpm test:e2e` | Build, start the server, and beat an encounter in headless Chromium |

## Where things are

| Path | Purpose |
|---|---|
| `PROMPT.md` | The full design and build spec |
| `AGENT.md` | Working agreement for AI sessions (rules, definition of done, ready-made prompts) |
| `docs/` | `ARCHITECTURE.md`, `ROADMAP.md`, `decisions/` (ADRs), `LEARNING_LOG.md`, `CONTENT_AUTHORING.md`, `RUNNERS.md`, `PLAYTEST_NOTES.md` |
| `apps/client`, `apps/server` | The React UI and the local Fastify server |
| `packages/` | `core` (pure engine), `content-schema`, `content-tools`, `runners` (sandboxes), `shared` (API contract) |
| `content/`, `config/` | Game content packs and tunables (`config/balance.yaml`) |
| `ideas/` | Reference material: theory, pedagogy, content banks, technical write-ups |
| `mockups/rootward-ui.html` | Clickable UI mock the client is based on |
| `assets/` | Optional fonts (committed) and art/audio packs (`scripts/fetch-assets.sh`); nothing requires them |

## Environment

Copy `.env.example` to `.env` if you want to override the port or, later, add AI provider keys. Nothing is required.
The server binds to 127.0.0.1 only; it runs player code and is not meant to be reachable from a network.
