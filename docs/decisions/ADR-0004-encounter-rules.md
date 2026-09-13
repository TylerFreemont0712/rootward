# ADR-0004: Encounter rules as an event-sourced decider, with clarified rules and tunables

- **Status:** accepted
- **Date:** 2026-09-13
- **Related:** PROMPT.md sections 7, 14.3; ideas/solutions/persistence-and-event-sourcing.md;
  ideas/solutions/procedural-generation.md; mockups/rootward-ui.html

## Context
Section 7 describes combat, and section 14.3 asks for event-sourced, deterministic run state. Several details are
unspecified or ambiguous (what happens at 0 Focus, where Edge Case tests come from, how efficiency is measured on a
slow WASM runner), the starting Cycles made hints unaffordable in the first fight, and the mockup's fake evaluator
behaves differently from the spec in places.

## Options considered
1. **Reducer over commands** (`state + command -> state`). Simple, but randomness and rules end up re-run on replay,
   so a rules change silently rewrites old runs.
2. **Decider:** `decide(state, command) -> events | refusal` holds all rules and randomness; `evolve(state, event)`
   only applies facts, and events carry their resulting numbers. Replays reproduce history exactly.
3. **Mutable engine objects.** Familiar, but hard to test, replay, or resume.

## Decision
Option 2 (`packages/core/src/run/decide.ts`, `evolve.ts`). Randomness is counter-based: the enemy's move after cast
*n* is `randomFor(seed, "enemy-move:<room>", n)`. The clarified rules:

1. Enemy HP is the total weight of active tests not passing. A Cast deals the weight of newly passing tests and, when
   `regression_heals_enemy`, heals the weight of tests that stopped passing. Results must name exactly the active
   tests (Probe: exactly the visible ones), which guards against server bugs.
2. **Strike** deals failing-test count × ATK, capped at the new `enemy_moves.strike_damage_cap` (24). ATK is the
   enemy's `base_atk`, or `strike_atk_by_tier` (now with `elite` and `special` keys).
3. **Edge Case** reveals a `reserve: true` hidden case of its `category` with weight `edge_case_hp_added`. With no
   matching reserve case it falls back to Strike. Moves the engine does not implement yet also fall back to Strike,
   and content validation warns about them.
4. **Out of Focus:** if a Cast leaves the enemy alive with 0 Focus, the encounter ends as `exhausted`, a forced
   retreat (reference solution shown, no loot). Kernel Panic happens only at 0 Integrity, as section 7.5 says; the
   mockup's "Kernel Panic on 0 Focus" is not used.
5. **Hints** are strictly sequential. Cost = ladder cost × mastery multiplier, rounded; the player needs the Cycles.
   `player.cycles_start` rises from 0 to 60 so the first fight of a run can use hints on a new concept.
6. **Rewards:** crit = won on the first Cast; true sight = hidden tests present and Inspect unused; unaided = no hints;
   efficiency = the player's large-input time is at most `bonuses.efficiency_max_ratio_vs_reference` (3) × the
   reference solution's time on the same runner, measured by the server; elegance is not awarded until the Reviewer
   (M2) or a deterministic linter exists. Commits = difficulty base × product of earned multipliers. Cycles = tier
   Cycles × the class's `lootMultiplierOnCrit` passive effect when the win was a crit.
7. `hp_display_offset` is display-only and adds to the shown HP while the enemy lives (the Goblin shows "14/13").
8. Lint suggests Retreat once an encounter has `suggest_retreat_after_failed_casts` Casts without a win.

Balance file changes: `crit_requires_first_cast` removed (it had only one meaningful value); the duplicate
top-level `version` section renamed `character_version`; `planner.default_session: long` added (kickoff answer 6).

## Consequences
- Tests drive the rules from command lists with fixed seeds and read the real `config/balance.yaml`
  (`packages/core/test/encounter.test.ts`).
- Old runs replay exactly even after tuning, because events store damage, Focus, Integrity, and Cycles as they were.
- The tunables most likely to need adjusting are listed in `docs/PLAYTEST_NOTES.md`.
- `drain` is left as a well-scoped Your Turn task next to the Edge Case example in `moves.ts`.
