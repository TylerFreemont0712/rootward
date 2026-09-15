# ADR-0011: The world as content: zones, people, dialogue, and quests

- **Status:** accepted
- **Date:** 2026-09-15
- **Related:** ADR-0010 (overworld and characters; its zone-as-TypeScript and `/overworld` routes are superseded here),
  ADR-0002 (content format), ADR-0006 (persistence), PROMPT.md section 4 ("Hub: The Bastion"), AGENT.md section 3
  ("Data-driven"), `ideas/game-content/lore-and-narrative.md`

## Context

After ADR-0010 the player could walk one Foundry zone, but it read as a bare rectangle of repeated tiles with markers
on it, and the art (SDXL renders shrunk with a nearest-neighbor resize) came out soft. The player asked for the feel
of an actual RPG: towns, characters with portraits, a world that reacts, with fights still being real code.

ADR-0010 kept its single zone as hand-written TypeScript precisely because one static map did not justify a content
kind. A town, a second zone, ten people with branching conversations, and quests change that arithmetic, and AGENT.md
is explicit that adding content must never require engine changes. PROMPT.md section 4 already describes the town (the
Bastion, the Guild Hall, the Library, the Compiler, the Package Manager, the Testing Grounds) as screens; walking
between them is the M6 candidate "make the Bastion walkable", pulled forward at the player's request.

Two constraints shaped everything else. Real execution or nothing: a quest may only ask for facts the game really has
(won fights, mastery evidence, flags other quests set), and no building may pretend to offer a mechanic that does not
exist. And the client renders server views: conditions, quest progress, and choices must be decided on the server.

## Options considered

Where the world is defined:
1. **Keep zones in TypeScript and add people there too.** No new schema, but every line of dialogue becomes an engine
   change, which is exactly what AGENT.md rules out.
2. **New content kinds in packs** (`terrain.yaml`, `props.yaml`, `zones/`, `npcs/`, `quests/`), zod-validated like
   every other kind, with world checks in content-tools.
3. **Tiled (`.tmx`) maps.** A real map editor, but a new format and parser, and markers, portals, people, and
   conditions would still be custom properties that need their own validation. Worth revisiting if maps outgrow
   hand-edited YAML.

Where the rules run:
1. **The client evaluates conditions** and shows dialogue from content it downloads. Duplicated logic, and the client
   would decide whether a quest is finished.
2. **Pure rules in `@rootward/core/world`** (`holds`, `questStatus`, `objectiveProgress`, `applyEffects`,
   `offeredChoices`, `questsOffered`, `zoneCollision`), applied and saved by a server `WorldService`, with the client
   rendering a `ConversationView` it cannot change. The same split as `decide`/`evolve` for runs.

How progress is stored:
1. **Event-sourced world events**, like runs. Uniform, but heavy for a handful of flags, and nothing needs the history.
2. **A `world_state` row per character** (zone, language, flags, and each quest as `active` or `done`) plus
   `zone_progress` (position and won markers per zone). `ready` is never stored: it is derived from the objectives
   every time, so a quest can never disagree with the facts it is about.

How the world is drawn:
1. **Keep the per-cell DOM grid** of `TileMapRenderer`. Simple, but flat, and sprites cannot rise above their tile.
2. **Canvas ground plus DOM sprites** sorted by the row they stand on, under a camera that follows the Maintainer.
3. **A game engine** (PixiJS, Phaser). More power than a 44x30 zone needs, a large dependency, and a second rendering
   model next to the expedition map.

How art is made:
1. **The saved ComfyUI graph** from the first art pass. Manual, and its nearest-neighbor downscale is what made
   sprites look muddy.
2. **A script and a manifest** (`scripts/art/`): ComfyUI renders, cached, then post-processing that ComfyUI has no
   stock nodes for (area downscale, a small palette, hard alpha, fragment removal, an outline, seamless ground
   variants).

## Decision

Option 2 in every group. In detail:

- **Content.** Terrain kinds (walkability and a fallback color), props (footprint, blocking), zones (a tile block with a
  legend, an entry, props, people, features, portals, and markers), NPCs (a dialogue graph: openings tried in order,
  nodes with choices), and quests (a giver, objectives, reward flags). Conditions are a small closed set: quest status,
  flag, a won marker, a count of won markers in a zone, mastery on a node, and `all`/`any`/`not`. Effects are start a
  quest, hand one in, set a flag, and open a screen (the Guild Board, the Chronicle, the Testing Grounds). Anything
  with an `if` (props, people, features, portals, markers) is present, open, or unsealed only while it holds, which is
  how the kiln gate opens and Pell walks home.
- **Validation.** `validateWorld` checks every reference, that exactly one zone is the start, that dialogue always goes
  somewhere, that nothing stands on a blocked tile, and (flood fill from the entry with conditional blockers removed)
  that every marker, portal, arrival point, person, and feature can be walked to. It warns about flags nobody sets and
  quests nobody starts.
- **Server.** `WorldService` replaces `OverworldService`. It re-checks what the client claims: a saved position must be
  walkable and reachable from the last one (no stepping through a sealed gate), talking and reading need adjacency,
  a choice must be offered right now, and resolving a marker needs a run of that marker's own challenge. Migration
  0003 renames `overworld_progress` to `zone_progress` (the Foundry zone keeps the id `foundry` and every marker id, so
  ADR-0010 progress carries over) and adds `world_state`. Routes live under `/api/profiles/:id/world`; the
  `/overworld` routes are gone, since the client was their only consumer.
- **Client.** A character lands in the world; a new one first picks the language their fights use. The Guild Board is
  reached through the Guild Hall door, Orin, or the top bar. `WorldScreen` walks on the client (held keys at a fixed
  pace, click-to-travel that routes around monsters, walk-up-and-talk) and saves where walking stopped. The dialogue
  box types lines out page by page, with portraits and keyboard choices; a journal, a surroundings list (every person,
  fight, and exit as a button), toasts, zone title cards, ambient particles, and soft fog in the wilds complete it.
- **No shop yet.** The Package Manager stands in the market and says, in character, that his stall opens once Cycles
  travel home from an expedition. Cycles are per run today; a persistent economy needs its own ADR before any
  building sells anything.

## Consequences

- A new zone, person, or quest is YAML plus `pnpm content:validate`; nothing in the engine changes. Art is the one
  manual step: new art ids must be added to `apps/client/src/assets/AssetRegistry.ts`, and until they are (or until
  the art exists) sprites fall back to glyphs and terrain to flat colors.
- Marker ids are now part of saved progress. Renaming one in content silently forgets every character's win there;
  the Foundry zone's header comment says so.
- Other realms are no longer a list of locked buttons; they appear in the Bastion as signposts on roads that are not
  cleared yet. Adding the Grove means authoring its zone and a portal, not changing a realm list.
- `TileMapRenderer` still draws expeditions; the two renderers now differ in technique. If expeditions should get the
  same depth, porting them onto the canvas-and-sprites approach is the natural next step.
- Worth revisiting: Tiled import when maps grow, NPCs that wander on a schedule, an economy ADR for shops and crafting
  (the Compiler's Spells), and whether `world_state` should become events once something needs world history.
- LEARN pointers: the recursive zod schema (`packages/content-schema/src/world.ts`), `in` type guards over condition
  unions (`packages/core/src/world/conditions.ts`), seamless tile variants and premultiplied-alpha resizing
  (`scripts/art/generate.py`), the spatial hash for tile variants (`apps/client/src/world/interactions.ts`), and
  depth-sorted sprites (`apps/client/src/world/WorldRenderer.tsx`).
