# ADR-0013: Shardrun v2: layer maps, relics, difficulties, spells as code, faster sandboxes, and a main menu

- **Status:** accepted
- **Date:** 2026-09-16
- **Related:** ADR-0012 (Shardrun), ADR-0005 (the Python sandbox), ADR-0010 (characters), ADR-0011 (the world),
  PROMPT.md section 6 (classes), `WIP.md` (the player's notes this answers)

## Context

After playing the first Shardrun, the player wrote down what to change (`WIP.md`):

- Beginner and harder "levels": plain-words descriptions on one, only the function on the other.
- The whole spell should be visible as one function. That is the point of the mode. Better still, casting should run
  through that code line by line and grow the damage as it goes (like Balatro scoring a hand), at a speed set in
  options.
- A noticeable delay between clicking a spell and anything happening.
- A battle backdrop that fits an arena, at higher fidelity.
- A Slay the Spire style map, climbing bottom to top rather than reading top to bottom.
- A skeleton for more: layers, new spells, and items such as global multipliers.
- Outside Shardrun: a main menu to pick a character and a mode, so modes are not all live at once. The Guild Board
  should belong to the World, and Descend (planned expeditions) should go, since Shardrun replaces it. Placeholders
  for other classes (other subjects, languages, an AI class, an infrastructure class).

## Decisions

### Where the lag came from, and the fix

Measured before changing anything (`scratchpad/latency.ts` during the session):

- The JavaScript sandbox started a new worker and loaded QuickJS for every job, about 125 ms each.
- The Python runner kept one warm process. A job used it up, and the replacement took about 2 s to load Pyodide.
- Every Shardrun command re-ran all three spells' previews as separate jobs. A cast took about 270 ms in JavaScript and
  about 2.2 s in Python.

Fixes, none of which weaken isolation (every job still gets a fresh worker or process, terminated afterwards):

1. **One job per turn.** The harness runs any number of spells in one program and prints one result line per spell.
   If an endless loop stops the job early, the spells are re-run one at a time to pin the timeout on the right spell.
2. **Answer first, preview after.** A command applies the rules and responds at once. The next previews start in the
   background, and the client fetches them from `GET .../shardrun/previews`. A cast reuses the run its preview already
   made (results are cached by exact input), so casting never waits on the sandbox.
3. **Warm spares.** `WasmJsRunner({ warm: true })` starts the next job's worker ahead of time, and it receives its job as
   its first message. `WasmPythonRunner({ spares: 2 })` keeps two loaded processes, so jobs in quick succession do not
   queue behind a 2 s load.

### Difficulties

`run.yaml` declares difficulties. Each one says whether shard summaries are shown, whether damage and block are
predicted, and how much foe HP scales. The server enforces them: on Programmer, summaries and predictions are left out
of the view entirely, not hidden by the client. A spell's code and its mana cost are always shown, and so is the full
replay after a cast.

### The whole spell as code

The client composes a spell into one program: each shard's function once, then a cast function that calls them in slot
order (`apps/client/src/shardrun/source.ts`). The code view walks that program line by line. The damage, block, and bolt
counters change only at points the server measured:

- the starting bolt,
- the bolts after each shard returned (the harness now records them per step),
- the final result.

Each measured point's damage and block come from the engine's own resolution against the current battle
(`previewBolts`). A misfire stops on the shard and line that raised, when the language reports one. Speed (off, slow,
normal, fast) is a per-browser option. Between measured points the cursor only shows execution order, and no number
changes without a measurement behind it.

### Layers and maps

A run is a list of layers: the Salvage, the Heap, and the Kernel. Each has its own foes, boss, and arena backdrop. A
layer's map is generated from the run seed in the Slay the Spire manner (`packages/core/src/shardrun/map.ts`):

- several paths climb from the bottom row, one row at a time, at most one column sideways, never crossing;
- the rooms they touch are the map, with the boss alone above the top row;
- rows can be pinned to a kind (fights at the bottom, a treasure mid-way, a rest under the boss);
- other rooms are weighted, with elites kept above a given row and special rooms never repeating along a path.

Entering a room must follow an edge. Property tests check reachability, the no-crossing rule, and determinism over
many seeds.

### Relics, new spells, treasure

Relics are content (`shardrun/relics/`), made from a small set of effect primitives:

- bolt power, damage multiplier, weakness bonus, mana per turn, first-cast discount, block per turn, healing after fights;
- one-time: extra spell slots and maximum Integrity.

Elites and treasure rooms offer relics. A boss offers a choice of guardian relics, plus a new empty spell when its layer
defines one. Forges can widen a spell as an alternative to reworking a shard. Rewards are claimed part by part, and
leaving forfeits the rest.

### Saved runs

The state snapshot moved to version 2. A version-1 run cannot continue under the new rules, so the service closes it as
abandoned when it is next read, instead of failing on it forever.

### Main menu and classes

Choosing a character opens a main menu with one door per mode: The World (classic) and Shardrun. The top bar offers the
Main menu plus, inside the World, the World and its Guild Board. The Guild Board drops Descend. The expedition code and
its routes stay (tested, and resumable for saved runs), but nothing in the UI starts a new expedition.

Classes gain `status` (playable or planned), `subjects`, and `order`. The six other classes from PROMPT.md section 6
exist as planned content with portraits and sprites: Warden (infrastructure and Linux), Shade (security), Oracle
(testing), Keeper (data), Necromancer (legacy code), and Summoner (AI). Creating a character with a planned class is
refused.

### The Codex, the Stats panel, and the dev sandbox

Three ways to see the mode, all reading the same server numbers rather than recomputing anything in the client:

- **The Codex** (`GET /api/shardrun/codex`) lists every shard, relic, foe, and layer in the content, with where each
  one is found (derived from the reward weights, the forge chains, and the starting loadout, so it cannot drift from
  the rules). It is readable outside a run, in either language.
- **The Stats panel** shows the rules a run plays by as base/now/from rows — every relic that changed a number says so
  — plus the run's totals and its damage by spell. The run snapshot gained the counters behind it (mana spent, bolts
  fired, bolts fizzled, damage by spell), each with a zod default so older snapshots still load.
- **The dev sandbox** is an ordinary run marked `sandbox: true`, plus commands that grant and set things: grant or
  remove a shard or relic, add a spell, set Integrity or mana, spawn any encounter, end a fight either way, and jump to
  a layer. Nothing else changes: costs, the cap, the sandbox, and every rule stay exactly as they are, so what is
  learned in a sandbox is true of a real run.

The sandbox is guarded twice, and both guards are on the server. The process must run with `ROOTWARD_DEV=1` (a run
started without it cannot be a sandbox), and the run itself must carry the mark (the engine refuses every dev command
with `not-a-sandbox` otherwise). The client only ever hides buttons; it decides nothing. `POST
/api/profiles/:id/shardrun/dev` is the one route, and the launcher sets `ROOTWARD_DEV=1` for local play.

## Consequences

- A turn costs one sandbox job, started after the response is sent. Python stays interactive as long as two spares
  keep up. A third quick job in a row still pays the load time.
- Warm spares cost memory at idle: one extra QuickJS worker, and two Pyodide processes instead of one.
- Old Shardrun runs are closed on upgrade. Only in-development test runs existed.
- How planned classes will play Shardrun (shards in bash or SQL?) is still open. They are placeholders by design.
- Shardrun still records no mastery evidence (see ADR-0012).
- Dev tooling exists in the shipped build rather than behind a compile flag. Both guards are server-side and tested, so
  a client cannot reach it; the cost is that the checks must stay in place as the commands grow.
- A sandbox run is saved like any other run, so a character can only be in one sandbox or one real run at a time.
