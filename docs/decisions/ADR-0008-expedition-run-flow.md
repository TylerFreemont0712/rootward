# ADR-0008: Play expeditions room by room along the plan, with walking and fog of war on the client

- **Status:** accepted
- **Date:** 2026-09-14
- **Related:** PROMPT.md sections 5, 7.6, and 14.3; kickoff answer 8; ADR-0004 (encounter rules), ADR-0006
  (persistence), ADR-0007 (planner and map)

## Context
The planner builds a `DungeonPlan` and `layoutDungeon` lays it out as tiles (ADR-0007), but until now a run was one
fight. M1 needs expeditions that are played room by room, resume after a restart, and feel like a place to walk
through (kickoff answer 8), without the client deciding anything the rules depend on. Only fight rooms exist today:
Shrine, Puzzle, and Rest rooms, the learner model, and the Bastion arrive later in M1.

## Options considered
How progress through the dungeon is decided:
1. **Server-authoritative movement.** Every step is an event checked against the tiles. Nothing can be faked, but a
   run would store hundreds of step events the rules never use, and every key press would wait on the server.
2. **Client-authoritative progress.** The client tracks the path and asks the server for a fight. Simple, but the
   server would take the client's word for which rooms were reachable.
3. **Rooms as the only gameplay event.** The client walks freely; entering a room is a command the rules check against
   the plan's edges from the last cleared room.

Where the map is laid out:
- **(a) On the client.** The client would need the plan and its seed, and the seed predicts enemy moves.
- **(b) On the server.** The run view carries the tiles; the client only uses core's path helpers to walk them.

## Decision
Option 3, with the map laid out on the server (b).
- `RunStarted` carries the whole plan, so a run keeps its dungeon even if content or the planner changes later.
- `EnterRoom` produces `RoomEntered` and `EncounterStarted`. It is refused unless the room is on the first floor or on
  an edge from the last cleared room, no room is in progress, the room kind is playable, and the fight setup names the
  challenge the plan chose. The server builds that setup from content.
- Any finished fight clears its room: a win, a Retreat, or running out of Focus. Retreat is a checkpoint, not a
  defeat, so the path continues. A Kernel Panic ends the run where it happened. Clearing the boss room ends the run:
  `completed` on a win, `retreated` otherwise (section 7.6: bosses can be retreated from but end the run).
- The room sets the fight's tier: an Elite or Boss room uses that tier's Strike ATK (when the template has no
  `base_atk`) and loot, whatever tier the enemy template has.
- `AbandonRun` ends a run on request.
- `views.ts` builds a `RunView`: the player summary, the laid-out map with a state per room (`cleared`, `current`,
  `open`, `ahead`, `sealed`), room details only for rooms whose door has been open, the plan's rationale, and the current
  or most recent fight. The seed never leaves the server.
- The client (`apps/client/src/map/`) decides what is uncovered (the entrance, lit rooms, corridors leading out of
  visited rooms), locks the doors of rooms out of reach, and moves the avatar (arrows, `hjkl`, WASD, click-to-travel
  with `findPath` from `@rootward/core/map`) behind a `MapRenderer` interface whose first implementation is ASCII.
- Until the learner model exists, the planner gets an empty learner snapshot. Until Shrine, Puzzle, and Rest rooms
  exist, the catalog lists no lessons or puzzles and no cards are due, so plans contain only fight rooms.
- Artifacts (editor contents, latest results) belong to the current fight: they are keyed by the position of its
  `EncounterStarted` event and rebuilt from the attempts recorded after it. Client drafts are keyed by run and room.

## Consequences
- The rules stay pure and testable without geometry (`packages/core/test/expedition.test.ts`). The API test walks
  whatever dungeon the planner builds from real content (`apps/server/test/expedition.test.ts`), resume works
  mid-expedition (`apps/server/test/resume.test.ts`), and the browser e2e plays a whole expedition.
- Fog of war and locked doors are presentation, not security. A client that ignores them still cannot enter a room off
  the path. Room details and the rationale can be read in API responses, which is fine for a single-player learning
  game whose rationale is meant to be read.
- Every run view carries the map (a long dungeon is 64 × 107 tiles, a few kilobytes). If that ever matters, the client
  can cache the map per run and the server can send it once.
- New room kinds plug in at `enterRoom` (refused with `unsupported-room` today) and at the catalog builder in
  `apps/server/src/planning.ts`.
- With one challenge in the content, every expedition has two rooms: the fight, and the same fight repeated as the
  boss, as the rationale says. More content fixes that; the code does not need to change.
