# ADR-0019: Play a battle from its log: an effects stage, foes with presence, and battle art

- **Status:** accepted
- **Date:** 2026-09-16
- **Related:** ADR-0012 (Shardrun), ADR-0013 (the arena and the code view), ADR-0016 (overkill), ADR-0017 (UI strings),
  ADR-0008 (the client renders what the server decided), AGENT.md section 3 ("Deterministic core"), `assets/README.md`

## Context

After playing Shardrun the player asked for the fights to look and feel better:

- simple animations for casting, because "the side view of the character is a little left to be wanting";
- bigger enemies, "particularly the final boss, making it a little more of a bigger presence";
- spells that feel impactful and nuanced as attacks: "different spells, different effects, we should really go the
  whole nine yards";
- ComfyUI used as much as needed for the art;
- the character's portrait in the lower left, to show the class being played at higher fidelity.

What existed: the Maintainer was the first frame of a 32x50 walk strip scaled four times; every foe was drawn 150px
tall whatever it was, so the Root Daemon stood exactly as tall as a Tally Wisp; a bolt was a 48px icon sliding in a
straight line under a CSS animation; and the log played at a fixed pace per entry kind, with HP bars that emptied the
moment the response arrived, while the bolts that emptied them were still in the air.

The hard part of "different spells, different effects" is that spells are not authored. A spell is whatever shards the
player chained, so there is no spell to attach an animation to. What does exist, for every spell, is what its bolts did.

## Options considered

1. **Per-shard animations in content** (an `effect:` on each shard). Direct, but a spell of five shards has no single
   look, a shard's look would lie whenever a later shard changes the bolt, and every new shard would need art.
2. **Effects derived from the log, drawn with DOM elements and CSS** (the existing approach, extended). No new
   machinery, but CSS cannot do particles, trails, or a pause on impact that the next bolt waits for, and hundreds of
   animated elements per volley are slow.
3. **Effects derived from the log, drawn on a canvas with its own clock, with DOM kept for sprites and text.** More code
   in the client, no dependency, and everything on the stage can share one notion of time.
4. **A game renderer (Pixi, a WebGL scene).** Capable, but a dependency and a second rendering model for a stage that
   is a backdrop, a few sprites, and effects.

## Decision

Option 3, in these parts.

- **The log says what each bolt was.** Hit, absorb, glance and ward entries now carry the bolt's place in its volley
  (`bolt`), its aim (`target`), and, only when they differ from a plain bolt, `pierce`, `mult`, `affinity` (weak or
  resist) and `blocked` (what a shield or the Maintainer's block took). The rules never read these back. They are
  optional, so older saved logs still load, and sparse, so an ordinary volley's log stays small
  (`packages/core/src/shardrun/types.ts`, `boltShape` in `engine.ts`). A dev spawn now logs `enter` like a room does.
- **A spell looks like what its code does.** The look comes from the bolts, not from names: the element picks colors,
  art and particle kind; a bolt aimed at every foe falls as rain on all of them at once; a piercing bolt is a lance
  with a wake; one aimed at the weakest, strongest or back foe curves in as a seeker; a multiplier of 2 or more gets a
  gold halo and afterimages, and 5 or more a flare; the share of the foe's HP a hit took sizes the burst, the number,
  the shake, and the pause. So two players' spells look different because they *are* different, which is the
  lesson of the mode.
- **One timeline.** `planTimeline` (`apps/client/src/shardrun/fx/timeline.ts`) is a pure function from a log to cues
  with start times: a charge, then launches spread so any volley lasts about two seconds (several bolts per beat past
  that), impacts where flights end, a defeat just after the hit that caused it, the foes' blows, the turn banner. The
  canvas, the DOM reactions and the store's afterglow all read it.
- **The effects engine keeps the clock** (`fx/engine.ts`, drawn by `FxLayer.tsx` on a canvas under the bodies and one
  over them). Cues fire on engine time, so when a heavy hit stops the clock for a few frames (hit-stop), the next bolt
  waits too and numbers, bars and poses stay in step. Screen shake is "trauma": hits add to one value that decays, and
  the stage moves by its square. Particles snap to the art's pixel grid. A defeated foe breaks into its own pixels.
- **Numbers wait for the hit.** `fx/pending.ts` keeps what the newest log took away and has not shown yet; the stage
  and the header add it back and settle each amount as its cue plays. Losses and gains are kept apart and never go
  negative, so a replayed cue can only show the true number early, never a wrong one. A response's log plays once
  (`shownBeat` in the store), so coming back to a fight does not replay its last volley.
- **Foes have a size.** `size: small | medium | large | huge | colossal` on each foe in content, default `medium`,
  presentation only: the view reads it live from content, the rules never see it. `fx/layout.ts` places foes by it —
  bigger foes are taller and stand lower on the floor, nearer the viewer — and shares out the room left over. In a
  guardian's fight, huge and colossal foes wear a health bar across the top instead of a plate, enter as a silhouette
  rising under their name, and shed embers in the brightest color of their own sprite.
- **The Maintainer is posed and shown.** An eight-frame battle strip (idle, wind-up, cast, recover, ward, hurt, channel,
  victory) plays against the cues, and a panel in the lower left shows the class's battle portrait with Integrity,
  block and mana; the portrait lights in the spell's color while casting and flinches when hit. A hovered spell
  readies: the Maintainer winds up over a faint circle in that spell's element.
- **Art, all optional.** Made with ComfyUI through `scripts/art/generate.py`: `battle/<class>` (a pose-guided sheet,
  cut into registered frames so a lunge really moves the body), `battle/portrait-<class>` (256px), `foes/<sprite>`
  (foes at arena scale, re-processed from the very render their map sprite came from, so no design drifts), and
  `fx/*` (element bursts, rune circle, ward, slash, flare, rendered on black with brightness turned into alpha).
  Projectiles are the exception: they are drawn in code (a fire comet, a frost crystal, a crackling spark orb, a
  turning arcane star), because generated projectiles never came out as one object flying one way — frost came back
  as ice caves — and a drawn head can turn along a curved path. Without any art the stage still works: the walk
  strip, the dialogue portrait, the map sprite, and drawn shapes.
- **Comfort.** `prefers-reduced-motion` means fewer particles, no shake, no flashes and no hit-stop. Shake has its own
  option. Whole-stage flashes are limited to one in any 400ms, under the three-a-second guidance for flashing content.

## Consequences

- Casts, wards, the foes' turn and guardians now read at a glance, and the same numbers as before arrive at the moment
  they land. The engine's rules are unchanged; only its log grew.
- The timeline, the layout and the pending ledger are unit-tested. The canvas drawing is not: it was checked by driving
  a sandbox run in headless Chromium and reading screenshots, which is how it should be checked again after changes.
- The client is the biggest it has been. The effects code is self-contained under `apps/client/src/shardrun/fx/` and
  reads only cues, so it can be replaced without touching rules or views.
- Planned classes need a battle strip and a battle portrait of their own when they become playable; until then they
  fall back to their walk sprite and dialogue portrait.
- There is still no sound. The timeline is the natural place to hang it: every cue already knows what happened, how
  hard, and when.
- The battle log's English (ADR-0018's first open item) is untouched; new stage text (WEAK, nullified, the guardian
  banner) is in the client catalog in both languages.

## Amendment (2026-09-16, after the player's first look)

- **The code view moved to the middle, and was never meant to sit under the Maintainer.** The stage is a size container,
  so it is a stacking context, but the world inside it had no z-index of its own: the Maintainer (z 80) and the effects
  canvas painted over the code view (z 8). `.shr-world` now has `z-index: 0`, so everything inside the world paints
  under every overlay on the stage. The code view is centered, a little higher and larger, and sits below a guardian's
  health bar in a boss fight.
- **A cast's score outlives its code.** Every cast response is kept (`replay`), not only when its code plays. When the
  code has run (or was skipped, or the option is off), the view folds down to the spell's name and its final bolts,
  damage and block, which stay up while the hits land and fade 900ms after the last cue; a fight's finishing cast keeps
  the arena up until its score has faded. Reading a spell's code replaces the score.
- **The idle breathes.** `battle/artificer-idle` is four frames made from the idle frame by `breathe` in
  `scripts/art/generate.py`: everything above the robe's hem settles one and two pixels and rises again, feet planted,
  in the same palette, so the design cannot drift. The stage steps through it with a CSS `steps(4)` animation and a
  slow sway over the feet, and a mote of mana now and then rises off the open hand.

## Amendment (2026-09-17): arenas painted for the stage

The first arenas were painted from a prompt alone and read as flat, front-facing rooms: a staircase in the middle, props
where the fighters stand, bright detail behind every sprite, and a shape (1.75:1) the stage crops heavily. What changed:

- **A layout sketch, then the painting.** `scripts/art/layouts.py` draws each arena's composition in blurred shapes of
  value and color, and the render starts from it (img2img at denoise 0.8, `init` in the manifest): a dark ceiling for
  the code view and a guardian's health bar, a broad lit floor where the fighters stand, an open middle for bolts, a
  distant glow for depth, framed edges. A prompt cannot place things; a sketch can. The arenas are painted at the stage's
  own 2.4:1 by the illustration model (no pixel-art LoRA, which gave flat, cluttered rooms) and cut to 720x300 with 128
  colors, which keeps depth and reads as pixel art at the stage's 2x.
- **Chosen with the fighters standing in them.** Each arena was rendered as several candidates and judged on a mock
  stage with its layer's hardest foe in place: the dark Null Wraith and the fire Tally Wisp in the Salvage, the green
  Memory Leak Ooze in the Heap, the black Segfault Specter in the Kernel. The first Salvage came back violet and swallowed
  both the Maintainer and the Wraith; the first Heap was a fluorescent server room with a neon bar where the bolts fly.
  Both were rendered again (warm stone under lanterns; a muted cavern with a leak), and a candidate that is right but
  too bright or too saturated is graded in post (`brightness`, `saturation`, `contrast`) rather than rendered again.
- **Guardians fight in their own rooms.** A layer may name `boss_backdrop`: the Kiln Warden stands in front of its
  furnace, the Deadlock Golem in front of a glowing round vault door that rings it like a halo (warm, so its blue chains
  show), and the Root Daemon before an empty black-and-gold throne, as if it had just stepped down (dark, so its red
  shows).
- **The air moves.** A layer names an `ambience` (and optionally `boss_ambience`): `dust` (drifting motes, light shafts,
  crystals glinting far back), `spores` (rising spores, leaks that drip from the ceiling and splash), or `embers`
  (sparks and streaks of data rising). They are drawn by `fx/atmosphere.ts` on the canvas behind the fighters, with slow
  fog lying over the floor, and follow reduced motion.
- **Light lands on the room.** A gathering spell lights the room around the Maintainer, each hit lights the wall behind
  its foe (a flurry of small bolts flickers on it, a heavy one floods it), and a guardian's room swells with the
  guardian's own color as the dark of its entrance lifts. These are soft glows on the canvas behind the bodies
  (`light()` in `fx/engine.ts`), so they never cover a sprite or a number; they are local, not flashes, and only dim with
  reduced motion.
- **A spot for every fighter.** The rooms are dark on purpose, so each fighter stands in a faint pool of light in the
  color of the arena's air, with a fainter glow behind it; a foe's spot fades when it falls. It is what keeps a dark foe
  from becoming a hole in a dark wall.
- **Parallax.** The backdrop is its own layer inside the stage's world and takes back 60% of every shake, so it moves
  less than the fighters and reads as farther away.
- **Art stays optional.** The stage gives the guardian's room, the layer's arena, and the old Salvage backdrop as one
  list of background images, first on top, so a room missing from disk shows the next one instead of a black stage (a
  catalog entry only says the art may exist).
