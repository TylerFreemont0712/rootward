# Lore and narrative bible

Narrative exists to make the practice memorable and to name things consistently. It must never obscure the task.
Rule of thumb: flavor above the task statement, never inside it.

## The world
The **Machine** is a world-sized computer built by the **First Maintainers**, whose names are lost. It runs
everything: the weather is a scheduler, rivers are pipes, cities are services. Over ages, **Bit Rot** crept in:
forgotten fixes decayed, patches piled on patches, and bugs took bodily form. The **Guild of Maintainers** trains
those who descend through the layers to repair it. The deepest layer is **Root**. Nobody has reached it in living
memory. Reaching Root is not a single event; it is the moment a Maintainer can repair anything, anywhere.

The player is a new Maintainer. Their Familiar is **Lint**, a tiny daemon assigned by the Guild.

## Realms as places
- **The Foundry**: warm halls of molten glyphs where values are cast into variables. Sounds of hammering. Enemies are small and numerous.
- **Grove of Structures**: a forest where trees are literal trees, roots are linked lists, and the canopy is a heap. Paths are graphs.
- **Kernel Halls**: cold stone corridors under the Foundry; every door is a permission; torches are processes; echoes are signals.
- **The Archives**: an endless library with shelves as tables and librarians who only answer well-formed queries.
- **Spire of Applications**: a tower of workshops, each floor a layer of an application; the higher you go, the more the wind (traffic).
- **Cloud Citadel**: fortress in the sky assembled from identical bricks (containers); the drawbridge is a load balancer.
- **Shadow Bazaar**: a market at dusk where everything is a trick; merchants sell inputs you did not ask for.
- **Ruins of Legacy**: overgrown cities of old code; ghosts of previous Maintainers left comments on the walls.
- **The Observatory**: a lens on the sky where Oracles (models) speak in probabilities; the floor is a vector field.
- **Silicon Depths**: the crystalline bedrock; bits glitter; the air is cold and every step is measured in cycles.
- **The Assembly**: the great hall where all realms meet; every decision echoes; the throne of Root is beyond it.

## NPC voices
- **Lint** (Familiar/Tutor): terse, fussy, dry, secretly warm. Speaks in short sentences. Points at lines. Never insults the player; insults bugs. Catchphrases: "That line. Look again." "Empty input. Always empty input." "Retreat is not defeat. It is a checkpoint."
- **The Changelog** (Loremaster): archival, grand, past tense even for the present ("The Maintainer entered the Foundry. The Foundry took note."). Never explains code.
- **The Compiler** (Forge smith): gruff, exacting, respects tests. "Bring me the function. And its tests. No tests, no spell."
- **The Package Manager** (Quartermaster): cheerful salesman, obsessed with dependencies and versions. "Only three transitive dependencies! A bargain!"
- **The Guildmaster**: calm, sets Oaths, speaks of careers as journeys. Gives the debrief's "what next".
- **Bugs**: taunt with their own nature (Off-By-One Goblin miscounts; Null Wraith speaks in blanks; Race Condition Twins finish each other's sentences out of order).

## Naming conventions
- Enemies: `<bug or anti-pattern> <creature>`; alliteration welcome; puns must be understandable to a beginner or explained on defeat.
- Bosses: `The <Noun>` or a real term used as a proper name (The Monolith, Merge Conflict, Cache Invalidation).
- Artifacts: `<real tool or idiom> of <effect>` or a plain joke item (Rubber Duck, Coffee, Duct Tape).
- Rooms/dungeons: `<Realm adjective> <structure>`: "The Recursive Catacombs", "Halls of Permission", "The Fan-Out Gallery".
- Version titles: v1.0.0 "Initial commit", v2.0.0 "Breaking changes", v3.0.0 "Multiclass", v4.0.0 "Stable".

## Flavor banks (seed lists for the Loremaster and for deterministic fallback)
- **Room intros (Foundry)**: "Molten glyphs drip from the ceiling."; "A tally of something clicks in the dark."; "The floor is warm; something was compiled here recently."
- **Victory lines**: "All tests green. The room exhales."; "The bug dissolves into a stack trace and is gone."; "Lint says nothing, which is high praise."
- **Kernel Panic lines**: "Kernel panic - not syncing: Maintainer out of Integrity."; "Segmentation fault (core dumped). The core was you."; "Uncaught exception in run. Your progress was caught."
- **Retreat lines**: "You step back. The room waits. So does the solution."
- **Rest lines**: "You sit. Lint recites. You remember."

## Story arcs (optional, light)
- **Act 1 — The Foundry Cools**: the first realm; learn that Bit Rot spreads on the map when you neglect it.
- **Act 2 — The Gates of the Citadel**: the world opens; the Guild asks you to swear a deeper Oath.
- **Act 3 — Rootward**: the Assembly; multiclass; the final boss is the system you build yourself.

## Tone rules
- Jokes are at bugs' expense, never the player's.
- No grimdark; decay is sad but fixable. The mood is "cozy hacker".
- Keep narrative lines short; the code is the story.
