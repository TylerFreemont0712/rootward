# The planner (v1)

How Rootward decides what goes into an expedition. Code: `packages/core/src/planner/`. Decision record: ADR-0007.
Tunables: `planner`, `rating`, and `mastery` in `config/balance.yaml`.

## In one paragraph

The planner is a pure function, `planDungeon(request)`. It looks at which concepts you are ready for, which you are
forgetting, and what content exists, then builds a main line of rooms in teaching order (the spine) and adds branch
choices that cannot break that order. The same request and seed always produce the same dungeon, and every choice is
written down in a rationale the game can show under "why this dungeon".

## Inputs (`PlanRequest`)

| Input | Meaning |
|---|---|
| `catalog` | Skill nodes, challenges (encounter or boss), puzzles, and which nodes have Shrine lessons |
| `learner` | Mastery, rating, and rotting flag per node; review cards due now; challenges seen recently |
| `language` | The language this run is played in |
| `oathRealms`, `classAffinity` | Realm weights from the Oath and the class |
| `length` | `short`, `standard`, or `long`: the number of floors (`planner.session_rooms`) |
| `seed` | All randomness (tie-breaks, branch order, the stretch roll) derives from it |

## Steps

1. **Language view** (`tracks.ts`). Keep the language's own track (`py.*` for Python) and shared nodes (`concept.*`,
   `ds.*`, ...) that the track has no node for. A shared node's mastery is the best mastery among the language nodes
   that transfer to it. A challenge counts for a node if it is tagged with that node, its shared concept, or another
   language's node for that concept. Two nodes of one track that share a concept (`py.strings.basics` and
   `py.strings.split`) are different lessons and never stand in for each other.
2. **Frontier** (`select.ts`). Nodes below mastery 3 whose prerequisites are all at mastery 3 or more, ranked by Oath
   weight, class affinity, progress, and a tiny seeded jitter. Only nodes with at least one playable challenge are
   used; if none have content, any node with content is used instead and the rationale says so. At most
   `frontier_nodes_per_run.max` nodes. **A thin frontier grows** (`growFrontier` in `spine.ts`): while the run has
   fewer than `frontier_nodes_per_run.min` concepts, or fewer distinct fights than floors, it adds a concept that
   builds directly on one already in the run (every other prerequisite at mastery 3), lowest tier first. That concept
   is introduced after its prerequisites, and only if they made it into the dungeon. A brand-new player, whose whole
   frontier is one root concept, gets that concept and the ones that come right after it.
3. **Blocks.** For each frontier node: a Shrine if the node is brand new and has a lesson, then an Encounter. The
   challenge is the unseen one whose expected success (Elo, `elo.ts`) is closest to `target_success.frontier`. Every
   other concept a challenge uses must be familiar: mastery 1 or more, or introduced earlier in this dungeon. A first
   fight on strings never quietly needs dictionaries too.
4. **Reviews.** Up to five due cards become a Rest room; the most urgent concept (rotting first, then due) gets an
   easier Encounter aimed at `target_success.review`.
5. **Interleaving.** If at least three puzzles touch concepts at mastery 2-4 or this run's concepts, one Puzzle room.
6. **Order.** First block, puzzle, second block, reviews, remaining blocks. Remaining floors fill with practice fights
   for the run's concepts at progressively harder targets. Extra rooms are trimmed from the end without leaving a
   Shrine behind. A Rest never opens the dungeon.
7. **Boss** (`spine.ts`). A boss challenge whose concepts are covered by this run plus mastered nodes; otherwise the
   hardest unused fight stands in; otherwise a fight repeats.
8. **Branches** (`branches.ts`). Encounter floors may gain another fight for the same concept and, once per run
   (`stretch_probability`), an optional Elite that is actually harder. Other floors keep one room. Floors connect by
   relative position.

## Guarantees (tested on every one of 1,000 random catalogs)

- The boss is alone on the last floor, and there are never more floors than the session length.
- Every floor has one to three rooms; every room can be reached and leads onward.
- A Shrine's floor has no alternatives, so it cannot be skipped, and its concept is never fought before it.
- A concept is never introduced before a prerequisite that the same dungeon introduces.
- A fight never leans on a concept the player has not met: each concept of its challenge is the room's own concept,
  one at mastery 1 or more, or one the dungeon introduced by that floor.
- No Rest on the first floor. Challenges exist, support the language, and never repeat unless the rationale says content
  was too thin. At most one Elite, always beside a normal fight for the same concept.

## The map

`layoutDungeon(plan)` (`packages/core/src/map/`) lays a plan out as ASCII tiles: an entrance landing, one band per
floor descending toward Root, chambers sized by room kind, corridors from bottom doors to top doors along a hallway
row, blocking props kept off each room's center lines, and Bit Rot rubble in review rooms. Geometry never affects the
rules. `findPath` (breadth-first search) finds walking routes.

## From plan to play (ADR-0008)

- The server builds the catalog from the content packs (`apps/server/src/planning.ts`): every skill node, and every
  io-tested code challenge that is not deprecated. A challenge guarded by a boss-tier enemy is a boss candidate.
- Until the learner model lands, the learner snapshot is empty: every node is unseen and nothing is due. Until Shrine,
  Puzzle, and Rest rooms are playable, the catalog lists no lessons or puzzles, so plans contain only fight rooms.
- The plan is saved in the run's `RunStarted` event. The player may enter any first-floor room, then only rooms on an
  edge from the room they cleared last. The boss room ends the run.
- The run view sends the laid-out map with a state per room; the client handles walking, fog of war, and locked doors.

## Tuning and changing it

- Success targets, session lengths, recency, and stretch probability live in `config/balance.yaml`.
- Rating math (`challenge_rating_base`, `challenge_rating_per_difficulty`, `k_by_tier`) lives under `rating`.
- To replace the algorithm, keep the `planDungeon(request): PlanResult` signature and the guarantees above; the
  property test is the contract.

## Not yet

Elites from "frontier + 1" concepts, true multi-phase bosses, the streak valve (softening after two failures), Forge
variants when the pool runs dry, a learner simulation script, and real learner snapshots (the server passes an empty
one until the learner model exists).
