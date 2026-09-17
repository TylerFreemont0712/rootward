# Rootward

A programming-education RPG and roguelite where every fight is real code. Challenges run in a sandbox and are graded
by tests, and roguelite spells are chains of real functions. Classes are engineering disciplines, and a learner model
turns wins into mastery. An optional, hot-swappable AI layer (tutor, narrator, content forge, reviewer, adversary) is
designed but not built yet. Built by one person, for one person, to become a much better programmer, and playable in
English or Japanese.

**Status (2026-09-18):** Milestone 1 in progress (`docs/ROADMAP.md`). Three modes are playable from the main menu:

- **The World**: walk the Bastion and the Foundry, talk to ten people, follow seven quests, and win fights that are
  real Python or JavaScript problems (17 challenges). Wins become mastery in your Chronicle.
- **Shardrun**: a roguelite climb through three layers of the Machine (the Salvage, the Heap, the Kernel). You find
  shards (45 real functions, each in both languages) and chain them into spells whose code runs in the sandbox, line
  by line, with damage that compounds. Along the way are 23 relics, 15 foes including three guardians, and Beginner
  and Programmer difficulties.
- **Shardrun (Experimental)**: the same climb played with a deck. Shards are cards, dealt into a hand each turn and
  played into blank spells.

Every mode has music and game sounds, generated or recorded locally, with a Sound menu on every screen. The Artificer
is the playable class; six more are planned. The AI layer (M2) is not built, and nothing needs it.

## Run it

Requirements: Node 26 and pnpm 12 (`npm i -g pnpm@12.4.1`). No Docker, no API keys.

```sh
pnpm install
pnpm dev        # open http://127.0.0.1:5173 (the API runs on 127.0.0.1:7331)
```

`pnpm start` builds the client and serves the whole game from one process at http://127.0.0.1:7331.

## Playing

The title screen picks the language and a character (or makes one). The main menu then opens a mode, and the
**Codex**, which lists every shard, relic, foe, and layer and where each is found. The 🔊 **Sound** button (on the
title screen, the main menu, and every screen's top bar) sets the volume of the music and of the game sounds
separately, or mutes either; sound starts after your first click or key press.

- **The World.** Walk with the arrow keys, WASD, or `hjkl` (or click). Talk and use doors with E, Enter, or Space.
  The Guild Board is behind the Guild Hall's door. Stepping onto a fight marker starts an encounter: read the task,
  write code, **Probe** (Ctrl+Shift+Enter, visible tests only, free) and **Cast** (Ctrl+Enter, every test, and the
  enemy strikes back) until the enemy is gone. Retreating shows the reference solution. Python runs in Pyodide inside
  a locked-down process, so the first Python run after starting the server can take a couple of seconds.
- **Shardrun.** Choose a difficulty and a language, then pick rooms on the layer map: fights, elites, rests, forges,
  treasure, and the guardian at the top. In a fight, each spell is a pipeline of shards. **Code** shows it as one
  function, and **Cast** (or its number key) runs it and plays the code before the hits. E ends the turn. Wins give
  shards; elites, treasure and guardians give relics; forges rework shards and widen or bind spells. **Options**
  sets how casts play, whether spells predict their damage, and screen shake. **Stats** shows the rules the run plays
  by. A character keeps one run in progress per Shardrun card.
- **Shardrun (Experimental).** Each turn deals a hand of cards. Click or drag cards into a spell in the order they
  should run, hold one for next turn, and cast. The spell's code grows on screen as it is built. **Deck** shows the
  whole deck and the piles.

Runs marked *sandbox* (the start screen's *Sandbox in …* buttons, on a server started with `ROOTWARD_DEV=1`) add a
**Dev** drawer that can grant any shard or relic, spawn any fight, or jump between layers.

### Desktop launcher (Linux)

`scripts/rootward-launch.sh --install` writes `Rootward.desktop` in the repository root, using this checkout's absolute
paths, and puts a copy on your Desktop. Double-clicking it installs packages if the lockfile changed, builds the client,
starts the server in the background, and opens the game. If Rootward is already running, the click updates and restarts
it: the update is built while the old server keeps running, and only a successful build replaces it, so a failed update
leaves the working game up (progress is saved on every move, so a restart loses nothing). Clicks made while an update is
already under way are ignored. Right-click the icon for **Open** (just the browser, no update), **Stop**, and **Update
and restart**. The launcher's log is `~/.local/state/rootward/launcher.log`. After moving the repository folder, run the
install command again.

## Commands

| Command | What it does |
|---|---|
| `pnpm test` | Unit, sandbox-safety, and API tests across every package (Vitest) |
| `pnpm lint` · `pnpm typecheck` | Quality gates |
| `pnpm format:check` | Prettier check. The tree has never been formatted as a whole, so do not run `pnpm format` on it |
| `pnpm content:validate` | Validate content packs and run every reference solution and shard example in the sandbox |
| `pnpm content:locale ja` | How much of the content a locale translates, what is missing, and what has gone stale |
| `pnpm test:e2e` | Build, start a server, and in headless Chromium create a character, take a quest, win a practice fight, and play a Shardrun turn in each playstyle |
| `python scripts/art/generate.py` | The art pipeline: prompts in `scripts/art/manifest.json`, rendered by a local ComfyUI, post-processed into pixel art (usage at the top of the script) |
| `python scripts/audio/generate.py` | The audio pipeline: music prompts in `scripts/audio/manifest.json` rendered by ACE-Step 1.5 in a local ComfyUI, and CC0 recordings for game sounds, trimmed, looped, leveled, and encoded (usage at the top of the script) |

## Where things are

| Path | Purpose |
|---|---|
| `PROMPT.md` | The original design and build spec (the ADRs record where the build has moved on) |
| `AGENT.md`, `CLAUDE.md` | Working agreement and commands for AI sessions |
| `POSSIBILITIES.md` | Design notes on compounding damage and big numbers in Shardrun |
| `docs/` | `ARCHITECTURE.md`, `ROADMAP.md`, `decisions/` (ADR-0001 to ADR-0023), `LEARNING_LOG.md`, `PLAYTEST_NOTES.md`, `CONTENT_AUTHORING.md`, `RUNNERS.md`, `PLANNER.md` |
| `apps/client`, `apps/server` | The React UI and the local Fastify server |
| `packages/` | `core` (pure, seeded rules for fights, the world, and Shardrun), `content-schema`, `content-tools`, `runners` (sandboxes), `shared` (API contract) |
| `content/packs/core/` | Challenges, classes, the world (zones, NPCs, quests), Shardrun (shards, relics, foes, `run.yaml`), and `locales/ja` |
| `config/` | Tunables (`balance.yaml`) and AI prompts for later |
| `scripts/` | The launcher, the art pipeline (`scripts/art/`), and the audio pipeline (`scripts/audio/`) |
| `assets/` | Fonts, vendor packs, and generated art, music, and sounds (`assets/README.md`); the game runs without any of it |
| `e2e/` | The browser smoke test |
| `ideas/`, `mockups/` | Reference material and the clickable UI mock the client started from |

## Environment

Copy `.env.example` to `.env` to override anything; nothing is required. `ROOTWARD_PORT` moves the server (default
7331), `ROOTWARD_DATA_DIR` moves the database, and `ROOTWARD_DEV=1` allows sandbox runs' dev tools. The AI provider
keys are for M2 and unused today. The server binds to 127.0.0.1 only; it runs player code and is not meant to be
reachable from a network.

Characters, world progress, fights, and Shardrun runs are saved in `~/.local/share/rootward/rootward.db`, so everything
survives a restart. The file is created on first start, and schema upgrades back it up first.
