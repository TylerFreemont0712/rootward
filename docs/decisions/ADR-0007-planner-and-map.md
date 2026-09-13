# ADR-0007: Build dungeons as a teaching-ordered spine with safe alternatives, laid out as a walkable map

- **Status:** accepted
- **Date:** 2026-09-14
- **Related:** PROMPT.md section 10; kickoff answer 8 (more focus on maps and movement); docs/PLANNER.md;
  ideas/solutions/procedural-generation.md, ideas/solutions/adaptive-difficulty.md,
  ideas/pedagogy/curriculum-sequencing.md, ideas/pedagogy/assessment-and-difficulty.md

## Context
The planner turns the learner model and the content pool into an expedition: reviews, frontier concepts, an optional
stretch, interleaved practice, and a boss, arranged as a branching map where every path respects teaching order
(a Shrine before a new concept's first fight, no Rest first, Boss last). It must be pure and seeded (plans are saved
with runs), explainable ("why this dungeon"), and it must cope with very thin content today: one challenge, no
puzzles, no bosses, no Shrine lessons. Separately, the user asked for more focus on maps, environment, and movement.

## Options considered
For planning:
1. **Generate and score.** Produce many random candidate plans and keep the best (procedural-generation.md). Flexible,
   but ordering rules must then be checked on every path, and a good score does not guarantee validity.
2. **Construct a spine, then add safe alternatives.** Build one teaching-ordered room per floor, then add same-floor
   choices that can substitute for that floor without breaking any rule. Every path is valid by construction.
3. **A constraint solver.** Powerful and far heavier than the rules need.

For the map:
- **(a)** A node graph drawn in SVG, as in the mockup. Clear, but there is nothing to walk.
- **(b)** A tile map whose geometry affects the rules. Movement matters, but pedagogy then depends on walls.
- **(c)** A tile map laid over the plan's graph. Walking happens on the client; the server records which room was
  entered and checks it against the plan.

## Decision
Planning uses option 2 (`packages/core/src/planner/`):
- Inputs are plain snapshots (`PlanRequest`): catalog, learner snapshot with due cards and recently seen challenges,
  Oath and class realm weights, language, and balance. The planner reads no files or clocks.
- A language sees its own track plus shared nodes it has no equivalent for. A shared node's mastery is the best of
  its language nodes, and challenges count for every node that shares a concept through `transfers_to`, so a
  JavaScript player can use a Python-tagged io challenge for `concept.mappings`.
- The spine takes frontier nodes that have content (ranked by Oath, class, progress, and seeded jitter), adds a
  Shrine before a brand-new concept when a lesson exists, picks challenges fresh-first and then closest to the
  target success rate by Elo, adds a Rest for due cards plus an easier review fight, adds a Puzzle room when enough
  puzzles exist, fills remaining floors with progressively harder practice, and trims without separating a Shrine
  from its fight.
- The boss is a boss challenge the run and mastered concepts cover; otherwise the hardest unused fight stands in;
  otherwise a fight repeats. Each fallback is written into the rationale.
- Only Encounter floors branch, and only within the same concept: another fight, or one optional Elite that is
  genuinely harder. Floors connect by relative position so every room has a way in and out.

The map uses option (c) (`packages/core/src/map/`): floors descend toward Root in bands, chambers are sized by room
kind, corridors run from bottom doors along a hallway row to top doors, props never block a room's center lines, and
review rooms get Bit Rot rubble. Tiles are semantic codes so a tileset can replace glyphs later. Movement will be
client-side; the gameplay event will be "entered room X".

## Consequences
- The ordering rules hold on every path without enumerating paths; `planner-properties.test.ts` checks them over
  1,000 random catalogs and learners, and `map.test.ts` checks reachability and overlaps over 200 plans.
- Thin content yields short expeditions with explicit fallback notes instead of failures.
- Deviations from PROMPT.md section 10, to revisit as content grows: the Elite comes from the same concept rather than
  "frontier + 1"; the composite boss is a stand-in fight until multi-phase bosses exist; the streak valve and Forge
  variants are not implemented; puzzle rooms appear only once puzzle content exists.
- `ROADMAP.md` earlier said each step would be a `Move` event. Steps stay on the client instead: hundreds of step
  events per run would add nothing the rules use, and movement should feel instant.
- Generate-and-score can still be layered on later by building several spines with different seeds and scoring them.
