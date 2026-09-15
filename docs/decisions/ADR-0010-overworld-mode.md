# ADR-0010: A free-roam overworld alongside expeditions, and characters to carry it

- **Status:** accepted
- **Date:** 2026-09-15
- **Related:** ADR-0006 (persistence), ADR-0007 (planner and map), ADR-0008 (expedition run flow), ADR-0009 (learner
  model)

## Context

Descend (ADR-0008) plans one linear route per expedition and plays it room by room. The player wants an RPG feel
instead: walk a zone freely and pick fights yourself, monsters and bosses alike, rather than following a determined
path. That also surfaced a second, independent want: multiple characters, so different roles or tracks (say, an
infra-leaning run versus an interview-prep one) keep separate progress instead of sharing one Chronicle. Only the
Foundry realm has real seeded content today, so the first pass has to be a genuine vertical slice, not ten empty
zones.

Three scoping calls were made with the player before any code was written: additive (Descend stays exactly as it
is; Explore is a new second mode), Foundry-only for v1 (other realms show as locked, driven by content rather than
a hardcoded list), and a real new boss (author a genuine capstone fight rather than relabeling an existing one, the
same trick the dungeon planner already uses for display purposes).

The key fact that made this tractable: a practice fight already starts a standalone encounter
(`RunState.plan` is optional, `RunService.startEncounter()`) with no reachability gating at all. Walking onto a
monster in the overworld reuses that exact mechanism unchanged.

## Options considered

Scoping mastery/runs per character:
1. **A full multi-tenant auth layer.** Sessions, permissions, the works — over-engineered for a local, single-player
   tool with no concept of accounts today.
2. **An instance-level `profile_id`.** A nullable column on `runs`, an optional constructor parameter on the event
   store that filters `loadAll()`, one `RunService` per profile from a small registry. `LearnerService` has no state
   of its own — it only folds whatever `loadAll()` returns — so it becomes profile-scoped for free.

Zone data:
1. **A new content-pack kind.** A zod schema, loader wiring, and diagnostics for one static zone in one realm is a
   lot of ceremony for what is currently exactly one map.
2. **Hand-authored TypeScript data.** A `ZoneDef` with a tile grid and a list of markers, next to the server code
   that reads it.

Rendering:
1. **Force `TileMapRenderer` to accept a second view shape.** It is built around `ExpeditionView`'s rooms and doors;
   a zone has neither, so this means branching a component that was written to be a single sole implementation.
2. **A sibling renderer sharing real primitives.** `wallOrientation`/`isWallAt` (moved into `grid.ts`), `Span`/
   `tileSpan`, and the room-marker art (`ROOM_GLYPHS`, `assetUrl("rooms", …)`) are genuinely shared; the grid-drawing
   and cell-image functions are not forced into one shape that fits neither view cleanly.

## Decision

Option 2 in all three: profile scoping at the instance level, hand-authored zone data, and a sibling renderer.

- **Profiles.** `profiles` and `overworld_progress` tables (migration `0002`), a nullable `profile_id` on `runs`.
  Every existing unscoped route (`/api/encounters`, `/api/expeditions`, `/api/runs/:runId`, `/api/learner`) is
  untouched and still backed by the original `RunService`; a parallel, optional `AppDeps.profiles` block adds
  mirrored routes under `/api/profiles/:id/...` for both expeditions/practice and the new overworld. Runs and
  events written before this shipped, or through the legacy routes, keep `profile_id = NULL` and stay outside every
  character's view permanently — there is no reassignment tool, deliberately: this is a solo tool with no
  production users yet, and the simplicity of a separate untouched bucket outweighs building one-time migration
  tooling for data that does not exist in the wild.
- **The Foundry zone.** `apps/server/src/overworld/zones/foundry.ts` is a hand-tuned 28×20 grid with eleven markers
  (ten skill-node encounters plus the boss), each carrying a small pool of real Foundry challenge ids ranked with
  the planner's own `rankChallenges`/`familiarConcepts` against the player's live mastery — the same selection logic
  a dungeon room uses, just without a dungeon around it. `zones/index.ts` is the single place that says which realms
  are playable; a realm absent from it is what "locked/coming soon" means, with no second list to keep in sync.
- **A real boss.** `Kiln Warden` (`content/packs/core/enemies/kiln-warden.yaml`) and its challenge
  (`foundry.py.kiln-warden`, difficulty 4, combining `py.functions.define` and `py.collections.dict`) are new
  content, not a relabeled existing fight — the Foundry realm's first boss-tier enemy.
- **Movement and triggering.** The client walks the zone locally (the same keyboard/click-to-travel pattern as
  `ExpeditionScreen`, via `findPath`), persisting the resting position to the server (debounced, and flushed
  immediately before a marker fight starts so the position is never lost to an unmount racing a pending write).
  Walking onto an open marker starts its fight through `OverworldService.startMarkerEncounter`, which is `RunService.
  startEncounter` under the hood; winning marks the marker cleared via `resolveMarkerEncounter`, losing leaves it
  open to retry.

## Consequences

- Descend and Explore now both run through a per-profile `RunService`; adding a second realm's zone later is
  "author a `ZoneDef` and its content," not a rewrite of any of this.
- Every character tracks mastery independently, which is what makes "switch characters" mean something beyond a
  display name — Descend and practice fights are scoped by the same mechanism the overworld needed anyway.
- The overworld's fog is a simple radius around the avatar (`overworld-fog.ts`), unlike the room/door reasoning in
  `fog.ts` for an expedition — a zone has neither to reason about, so it did not need the same machinery.
- Building this surfaced and fixed a real, unrelated bug: since the ASCII-to-tileset migration, no rendered element
  actually carried a literal `avatar` class, so `ExpeditionScreen`'s auto-centering-on-move (`container.querySelector
  (".avatar")`) was silently a no-op. Both `TileMapRenderer` and the new `OverworldRenderer` now put that class on
  the avatar's cell.
- `assets/README.md`'s "Not wired yet" notes for `realms`/`hud` art partly resolve here: realm icons still have no
  consumer, but the room-marker art now serves two renderers instead of one.
