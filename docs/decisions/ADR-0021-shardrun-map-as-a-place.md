# ADR-0021: Shardrun's layer map as a place

- **Status:** accepted
- **Date:** 2026-09-17
- **Related:** ADR-0013 (layer maps), ADR-0019 (the battle stage, the painted arenas), ADR-0020 (the deck playstyle, which
  shares this map), `assets/README.md`

## Context

A layer's map was a node graph in the spirit of Slay the Spire: small round icons (crossed swords, a skull, a campfire,
an anvil, a chest) joined by dashed lines on a dark panel. It worked, and the player liked the idea of climbing from
room to room, but asked for "a more authentic feeling" and "a little more unique concept for the map", with "different
or better images", going "all out".

Everything a room holds was already known to the view: its kind, its foes with their sprites, and whether it is open,
current, visited, passed, or still ahead. What was missing was a sense of place.

## Options considered

1. **Better icons on the same graph.** Cheap, but still a diagram.
2. **A circuit board or a call graph**, with rooms as components or functions. On theme for a game about code, but
   abstract: nothing about it says *go there*.
3. **The layer itself, in cross-section.** Rooms are chambers carved into the layer's rock, lit from inside, with what
   waits there standing in them; tunnels join them; the guardian waits at the top in its own room; the Maintainer walks
   up from the way in with a lantern.

Option 3. It keeps the map's rules and its structure (the same nodes and edges), and turns each of them into something
seen rather than labeled.

## Decision

- **Chambers, one per layer.** Each layer has a chamber painted for it (`shardrun/map-chamber-<layer>`, 128x96, from a
  layout sketch of an arched room so all three share a shape) and a seamless rock wall behind the map
  (`shardrun/map-wall-<layer>-0`). Every room of a layer is that chamber; what differs is what stands in it.
- **What waits inside is shown, not named.** A fight or elite shows its foes' own sprites; rests, forges and treasure
  show a painted prop (`shardrun/map-prop-<kind>`). Foes in rooms that are not yet reachable are silhouettes: you see a
  shape in every room, and who it is when the room is near. Elites carry a red badge and light. A cleared room is empty.
- **The map still climbs**, from the way in at the bottom to the guardian's room at the top, as the player asked for
  when it was a chart of icons (ADR-0013). The guardian's room is the layer's `boss_backdrop` arena in an arch of rock,
  the guardian standing in it, dim until its door can be opened.
- **Tunnels** are drawn as carved paths (a dark cut with a floor), lit where the Maintainer has walked, with light
  running along the ones that can be taken now.
- **The Maintainer walks.** Their walk strip stands in the current room (or at the way in), and choosing a room first
  walks there along the tunnel's own curve, 850 ms, then enters it. The lantern they
  carry lights the rock around them; the rest is in shadow, while the rooms stay lit by their own light, so the whole
  map can still be read. Reduced motion enters at once.
- **The layer's air drifts over it**: the dust, spores, or embers its arena already has (content's `ambience`), over
  the view rather than the rock, so they stay while the map scrolls. Reduced motion hides them.
- **A room says what it is** on hover or focus: its kind, its foes, what it gives, and where it lies ("a road not
  taken"). The card goes away once the Maintainer sets off.
- The map is laid out at a fixed size and scaled to its panel, so chambers stay crisp at 1:1 on a wide screen. All art
  is optional: without it the chambers are drawn in CSS and rooms show glyphs.

## Consequences

- Entering a room takes 850 ms longer than a click did. It is the price of the walk, and reduced motion removes it.
- A new layer needs its chamber and wall (two renders) to look like itself; without them it borrows the Salvage's
  chamber and a plain background.
- The same map serves both playstyles; nothing here depends on how a run fights.
- A picture of a place is more literal than a chart, and a run *descends* ("Descend", "the way down opens"), while the
  map climbs. Drawn top-down instead (the way in at the top, the guardian at the bottom, the Maintainer facing the
  player), it would agree with those words. That was built and screenshotted during this change, then set back to
  climbing because the direction was the player's call; it is theirs to make again.
