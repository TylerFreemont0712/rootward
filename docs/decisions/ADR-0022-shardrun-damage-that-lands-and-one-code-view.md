# ADR-0022: Shardrun: the damage that lands, one code view, and predictions as an option

- **Status:** accepted
- **Date:** 2026-09-17
- **Amends:** ADR-0016 §3 (which number the scoreboard shows), ADR-0019 and ADR-0020 (where the code view sits)
- **Related:** ADR-0013 (difficulties, the code view), `apps/client/src/shardrun/fx/layout.ts`

## Context

After playing both playstyles, the player reported:

- The code view came in two sizes in two places: the smaller one while a deck run's spell is built, a bigger one in the
  middle of the stage while a cast plays or a spell is read. The middle one "blocks the enemy sprites sometimes", and
  the eye has to move between two places.
- The row of bolt chips between the score and the code was cut off in the bigger view.
- "The final damage that is being done to the monsters isn't what is always displayed on the code block." On the
  lower difficulties it should be accurate to the damage that will be done, and they would like the value hidden on
  harder ones; for now, an option to hide it.

Measured before changing anything, with a scratch script against the real server and sandbox: 28 casts over eleven
foe groups (every trait, groups of up to three, pierce and scatter), with Feedback Loop, Runaway Coil, Tuning Fork,
Overclocked Core and Lens of Types held. Two causes, and nothing else:

1. **The code view's headline was not the damage.** ADR-0016 made the scoreboard show `potential`: what the volley
   would do to foes that cannot die, with the damage that lands as a footnote. In 15 of the 28 casts the two differed.
   Potential can also be *lower* than what lands: once a foe dies, the next bolts reach another foe, which may have no
   shield or be weak to them, while the potential keeps hitting the first.
2. **Feedback Loop counted the cast itself.** Its rule is "every spell you have already cast this fight"; the preview
   and the modifier line followed it, but `castSpell` counted the cast before making its bolts, so the first cast of a
   fight landed three times its own preview.

Resolution has no randomness, and a cast reuses the exact sandbox run its preview came from, so once both were fixed
the preview, the cast's replay, and the hits agreed on every cast.

## Decision

### 1. The number is what lands

The scoreboard, the note on each line of the code, and the spell card all show `damage`: what the volley removes from
the foes as they stand, after shields, traits, weaknesses and resistances, and never more than the Integrity each has
left. `potential` stays, as the footnote: "worth 4096 · ×24.1 over". So a build that outgrows its target still shows how
big it got, which was the point of ADR-0016, while the headline is always true. `stats.bestCast` still records the
potential: the run's record is about the function, not the foe.

In a group, the number is the total across the foes the bolts reach, each bolt by its own target; the stage shows each
foe's share as it lands.

### 2. A cast is counted after its bolts are made

`castSpell` counts the cast once `empower` has built its bolts, so a per-cast relic counts the spells *already* cast,
as its text and its preview say. A test pins preview and cast to the same damage on the first and second cast.

### 3. One code view, between the Maintainer and the foes

Building, casting and reading a spell all use one size and one place, below a guardian's health bar when there is one.
That place was first the left half of the stage, which no foe stands in, but it covered the Maintainer. After the
player's next look ("closer towards the middle, but essentially just not cover the sprites for either the enemies or
the main character") it is the lane between them:

- The Maintainer stands nearer the left edge (11% of the width), and foes share 60% to 96% of it.
- `codeLane` (`fx/layout.ts`) measures the open stage from the Maintainer's sprite to the nearest foe's reach. A foe
  reaches as far as its sprite or its 196-pixel plate, whichever is wider.
- The stage centres the code view in that lane, 480 to 720 pixels wide (`--code-left` and `--code-width`).
- Content spawns at most two foes, and a test checks that every such group leaves room, in both playstyles' stage
  shapes.
- Measured in the browser at 1440 and 1280 pixels wide nothing overlaps, for a pair, a pair of large elites, a huge
  and a colossal guardian, and a deck run while building and casting.

The score and the bolt chips keep their height and only the code scrolls, which is what cut the chips off before.

### 4. Hiding predictions is an option, and the harder difficulty keeps doing it

Options gains "Show what a spell will do before you cast it", on by default and remembered per browser. Off, the client
takes the spells' predicted steps and results out of the view it renders, leaving exactly what the server sends on the
Programmer difficulty (cost, whether it can be cast, misfires, printed output), so every screen behaves as it does
there. A cast still shows its numbers as its code runs.

## Consequences

- ADR-0016's build against the Root Daemon now reads "damage 170", "worth 4096 · ×24.1 over". The headline stops at a
  foe's Integrity, and the footnote carries the growth.
- The option is a choice the player makes, not a rule: the numbers still reach the browser, and it can be turned back
  on mid-fight. A difficulty remains the way to make hiding them a rule, as Programmer already does.
- The code view's place comes from the layout, so moving the Maintainer or the foes moves it with them. The plate's
  width is the one number the CSS and `PLATE_WIDTH` must agree on, and both say so.
- Foes stand a little further right and closer together. A dev-spawned group of three or four small foes can overlap
  their plates a little; content never spawns one.
