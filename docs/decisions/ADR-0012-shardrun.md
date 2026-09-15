# ADR-0012: Shardrun, a roguelite mode where spells are pipelines of found code

- **Status:** accepted
- **Date:** 2026-09-15
- **Related:** ADR-0003 (sandboxes), ADR-0006 (persistence), ADR-0011 (the world as content),
  `docs/proposals/scripted-combat.md`, AGENT.md section 3 ("Real execution or nothing", "Data-driven")

## Context

The classic mode plays like a run of programming problems: every fight is a task graded by tests. The player asked for
a second, separate mode that feels like a roguelite: you find pieces of code, plug them together into powerful attacks
and spells, and fight turn by turn, using the same art and fidelity as the rest of the game. They were explicit about
the risk: if players can script attacks, an infinite loop that deals infinite damage breaks the game.

The scripted-combat proposal explored letting the player write attack code outright. That is the most expressive
option and the hardest to balance, and it overlaps with the classic mode, where the player already writes code from
scratch. The roguelite fantasy is different: the joy is in finding a piece, reading it, and seeing what it does next to
the pieces you already have.

## Options considered

1. **Free-form attack scripts.** The player writes `attack(battle)` and the engine applies what it returns. Maximum
   expression, but every balance rule becomes a limit on arbitrary code, and a run turns into writing the same optimal
   script every time.
2. **Visual blocks with no real code.** Safe and easy to balance, but it breaks "real execution or nothing": the
   "code" would be a picture of code.
3. **Shards: real functions, found and composed.** Every shard is a small function in Python and JavaScript with the
   signature `(bolts, battle) -> bolts`. A spell is an ordered list of shards; casting runs the list in a sandbox and
   the engine resolves the bolts that come out.

## Decision

Option 3, built as follows.

- **Content.** Shards (`shardrun/shards/<id>.yaml`), foes (`shardrun/foes/<id>.yaml`), and the run
  (`shardrun/run.yaml`: starting spells, floors, encounters, reward odds) are new pack content with zod schemas.
  Every tunable rule number is in `config/balance.yaml` under `shardrun`. Each shard carries worked examples that
  `pnpm content:validate` runs in both languages, so a shard's code and its description cannot drift apart.
- **The pipeline harness** (`packages/content-tools/src/shardrun.ts`) builds one program per spell. Each shard is loaded
  in its own namespace, the bolts pass through the shards in slot order, a shard's output is cut to
  `max_pipeline_bolts` before the next one sees it, and the result is printed after a marker line. It runs as an
  ordinary io job, so the same sandboxes, time limits, and memory limits that contain challenge solutions contain
  shards. An infinite loop is a timeout, and the spell misfires.
- **No number from a shard is trusted.** The engine (`packages/core/src/shardrun/engine.ts`) parses every bolt with
  zod, drops malformed ones, rounds and clamps power to `max_bolt_power`, and lets bolts past `max_bolts` fizzle. A
  cast costs the base cost, plus every shard's cost, plus one mana per `work_per_mana` bolts handed to shards across the
  pipeline. Making a thousand bolts is legal code and a bad spell.
- **The engine is pure and seeded.** `stepShardrun(state, command, catalog)` returns a new state and a log of what
  happened, or a refusal. Encounters and rewards come from the run's seed. The sandbox run happens on the server before
  the rules see it; the rules only receive its outcome.
- **A run is a state snapshot, not an event log.** Classic runs are event-sourced (ADR-0006) because their history is
  the learner's evidence. Shardrun is young and its rules will change often; replaying old events under new rules would
  break saved runs, while a validated snapshot (`shardrun_runs.state`, migration 0004) keeps them loading. One active
  run per character.
- **Previews are real runs.** The view runs every spell against the current battle and shows cost, bolt count, and
  predicted damage and block. Runs are cached by their exact input, so the cast after a preview uses the same result,
  even for a shard that uses randomness. A profile's commands are serialized, so a cast that waits on the sandbox cannot
  race another command.
- **Foes bend one rule each** (nullify the first bolt, a thick hide that ignores weak bolts, a weakness that shifts, a
  pattern ward), chosen so that the shards that beat them teach a habit: send a cheap bolt first, merge small bolts,
  read the battle state, match a pattern.
- **Client.** A separate store and screen (`apps/client/src/state/shardrun.ts`, `screens/ShardrunScreen.tsx`). The
  arena replays each command's log as bolts, damage numbers, and hits over the server's numbers. The workbench moves
  shards by click or drag and sends the proposed arrangement; the server checks that no shard was created or lost. The
  mode is reached from the top bar and from Nym, the Package Manager, in the Bastion.

## Consequences

- Balance has clear levers, all in YAML: shard costs, the work rate, bolt caps, foe HP, traits and intents, floor
  layout, and reward odds.
- Shardrun records no mastery evidence yet. The learner model reads classic runs only; deciding what a Shardrun win
  proves (reading code? composing functions?) is future work.
- Shards are read-only in this first version. Letting the player edit a shard's code, and paying for it, is the natural
  next step, and the harness already runs arbitrary shard source.
- A snapshot means no replays or event-level debugging of a Shardrun run. If the mode settles, event-sourcing it like
  classic runs is possible, with a migration.
- Each battle view costs one sandbox run per spell. Warm runners and the input cache keep this to a few milliseconds per
  spell in JavaScript; Python is slower but still interactive.
