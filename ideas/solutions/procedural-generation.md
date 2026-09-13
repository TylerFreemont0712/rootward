# Procedural generation for dungeons

## RNG
- Seeded, splittable: `mulberry32`/`xorshift128+` (tiny, fast) or `seedrandom`. Derive sub-seeds per subsystem (`hash(seed, "layout")`, `hash(seed, "loot")`) so adding a random call in one place does not change others.
- Save the seed with the run; "daily seed" = hash of the date; replays are deterministic given content versions.

## Dungeon as a graph (Slay the Spire style)
- Floors = N (5-9). Each floor has 2-4 nodes; edges connect adjacent floors; generate 3-4 paths from start to boss, merge overlapping nodes, ensure every node is on some path.
- Assign room types by a **grammar with constraints** rather than pure weights:
  - Start floor: Shrine or Encounter(easy) or Puzzle.
  - Shrine must precede the first Encounter of a mastery-0 node on every path that reaches it (enforce by placing the Shrine on floor k and the Encounter on k+1 with an edge, and pruning paths that skip it).
  - Rest not on floor 1; at least one Rest on every path if the run has due reviews.
  - Elite at most once per path; optional; better loot.
  - Merchant/Event mid-run; Boss last.
- Difficulty ramp: challenge difficulty targets rise by ~0.5 per floor; Elite +2.
- Anti-repetition: exclude challenges seen in the last 14 days; prefer least-recently-seen; never the same enemy template twice in a run.

## Selection by constraint satisfaction
Simple approach: generate candidate plans (say 50), score each (pedagogical constraints satisfied, review coverage, oath weight, variety), pick the best. Cheap, testable, explainable (store the score breakdown as the plan rationale).

## Testing generators
Property tests over 1000 seeds: every path valid per grammar; boss reachable; no dangling nodes; Shrine-before-Encounter invariant; distribution sanity (Elite frequency near target).

## Cosmetic map generation (optional)
If the tile renderer is used, generate room shapes with BSP or cellular automata for looks only; gameplay never depends on tile geometry.

## Variants of challenges (content-level generation)
- Parameterized templates: placeholders (`{{n}}`, `{{name}}`, domain words) with constraints; render both prompt and tests; validate by executing the reference.
- Narrative reskins: same tests, different story (cheap variety from the Loremaster with deterministic fallback banks).
- Structural variants via Forge (AI) validated by execution (see `content-pipeline.md`).
