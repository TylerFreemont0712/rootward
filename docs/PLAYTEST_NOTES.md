# Playtest notes

Friction found while playing, newest first. Each entry: date, commit, what happened, severity (blocker / annoying /
polish), and the follow-up (a ROADMAP item or the commit that fixed it).

## 2026-09-17 — the deck table after the player's first look (ADR-0020 amendment)

What the player asked for, all built: dragging cards, the code on screen while a spell is built, deck relics, holding
cards, a card-like look, and the deck beside Stats. Checked with screenshots of a drag in flight, a held card, the build
view, the Deck drawer, a second turn, and the forge, and by the smoke test (a click, a real mouse drag, a hold, a cast,
and a 6-card second hand). Found on the way:

- **The hand fell below the fold** at 1440x1000 once cards were card-sized. Annoying; a deck run's stage is shorter
  and its spells compact (prediction and buttons in one row), so stage, spells and hand fit together.
- **The dragged card did not fade in the hand** (the style targeted the button, the hand's wrapper carries the class).
  Polish; fixed.
- **The build view squeezed its bolt chips** and covered the foes' intents. Polish; the rows keep their height and the
  view sits left of center.
- **Still open, for playing it**: whether holding one card is enough (a relic makes it two), and whether the deck
  relics are priced right against the spellbook's.

## 2026-09-17 — Shardrun (Experimental), from screenshots of a deck run (ADR-0020)

Checked by driving a sandbox deck run in headless Chromium through the menu, the map and deck panel, a fight (two cards
played, a cast, a turn ended), a card reward, and a forge, and by the smoke test playing a deck turn. Not yet played by
hand, and not balanced.

- **A cast spell showed a blank spell's prediction** ("one plain bolt, 4 damage") right after its cards were spent.
  Annoying; a cast spell in a deck run now says it was cast and that its cards are in the discard pile.
- **The footer and the forge spoke spellbook** ("click a shard, then a slot"; "ready for the spare shards you are
  carrying"). Polish; both read for the deck now.
- **Two doors named Shardrun** made text lookups ambiguous in the smoke test and the screenshot script. Fixed with exact
  names; worth remembering for any test that finds a door by its text.
- **Open, for playing it**: whether 5 cards into two 3-slot spells with 4 mana is a real squeeze (in the screenshots a
  turn could cast both spells), whether unplayed cards should be kept, and whether a deck keeps up with the tower's
  foe HP.

## 2026-09-17 — the player's look at the arenas

- **The Kiln Warden and the Root Daemon faced away from the Maintainer.** Annoying; both were painted turned to the
  right. Their arena sprites are now mirrored in the art pipeline (`flip`), checked in both guardian fights.
- **The battle portrait wore two pairs of goggles** (one on the hood, one over the eyes). Polish; the player found a
  better candidate among the renders (`battle-portrait-artificer_rgb_00003_`, one pair). It is the pick now, mirrored
  to look into the stage.
- Found on the way: every art asset rendered before the pose-guidance and layout-sketch keys existed looked stale to
  the cache (175 of 181), so a plain `generate.py` would have rendered the whole manifest again. Fixed; a full
  `--reprocess` now finds every cached render.

## 2026-09-17 — the arenas, from screenshots in every room (ADR-0019 amendment)

The player asked to go "a little more all out" on the level backgrounds. Checked by rendering candidates, judging them
on a mock stage with each layer's hardest foe standing in place, then driving a dev sandbox run in headless Chromium
through a fight on each layer and each guardian's entrance (the Kiln Warden, the Deadlock Golem, the Root Daemon).
Not yet played by hand.

- **A violet room hid violet fighters.** The first Salvage render was violet-grey; the Maintainer and the Null Wraith
  melted into it. Annoying; rendered again in warm stone under lanterns, then darkened in post.
- **The first Heap was a server room**: busy cage grids behind every sprite and a neon-green bar exactly where bolts
  fly. Annoying; rendered again as a muted cavern with a thin leak along the floor.
- **A dark foe on a dark wall** (the Segfault Specter in the Kernel, the Wraith anywhere dim) read as a hole. Polish;
  every fighter now stands in a faint pool of light.
- **A fire hit on the Deadlock Golem is paler** against its bright vault door than anywhere else. Polish; the ring and
  debris still read. Watch it in play.
- **A guardian's room could be missing from disk** (the built client copies the art at build time) and the stage went
  black. Annoying; the stage now falls back to the layer's arena underneath.

## 2026-09-16 — the player's first look at the battle stage (ADR-0019 amendment)

What the player reported after playing, and what changed:

- **The code view was blocked by the character sprite.** Annoying; a stacking bug (the world's sprites out-ranked the
  overlays). The world is now one layer under every overlay, and the code view is centered, higher, and larger.
- **The damage and block of a cast vanished with its code.** Polish; the view folds down to its final bolts, damage
  and block, which stay up while the hits land and then fade.
- **A slightly different idle.** Polish; a four-frame breathing strip, a slow sway, and motes of mana off the hand.
- **Shard names on the reward cards were tiny** ("Lazy Fork", "Rewind"). Annoying; a bug, not a size choice: the rule
  for a reward section's heading (`.shr-reward-part h3`, 11px uppercase) matched every card title inside the section
  too, and won by coming later. Scoped to the section's own heading; card titles are 28px again, and card meta text and
  spell flows went up a pixel.

## 2026-09-16 — the battle stage, from screenshots mid-effect (ADR-0019)

Checked by driving a dev sandbox run in headless Chromium (a throwaway script, not the smoke test): two-foe fights and a
spawned Root Daemon, with spells built to show each flight — Kindle + Echo, Chill + Scatter, Arc + Pierce + Charge +
Resonate, and Ward — screenshotted at fixed moments during each cast and the foes' turn. Not yet played by hand.

- **Hit tints recolored the art.** A `hue-rotate` flash turned the purple Null Wraith green on every hit. Annoying;
  fixed with a flash masked by the sprite's own image, in the bolt's color.
- **A piercing bolt's wake ran through the second foe**, which read as a hit it never made. Polish; the wake now stops
  just past its target.
- **Stage flashes could strobe.** Every bolt of x5 or more flashed the whole stage, so a wide multiplied volley would
  flash many times a second. Blocker for comfort; limited to one flash in any 400ms, none with reduced motion.
- **A heavy-hit flash held the Root Daemon as a flat silhouette** for most of half a second. Polish; now a blink that
  is mostly gone in a third of its time.
- **Particles were two screen pixels** on a 1400px stage. Polish; the art-pixel grid is now half as large again (three
  pixels instead of two on a typical stage).
- **A guardian spawned before the page loads makes no entrance**, because a reload never replays the last log (on
  purpose: it would also replay the last volley). Spawned from the Dev drawer it plays: silhouette, name banner,
  embers, ring. Expected, noted so it is not mistaken for a bug.
- **The stage grows for a guardian** (58vh to 66vh), so the spells below move down when a boss fight starts. Polish;
  watch whether it bothers anyone.

## 2026-09-16 — the multiplier axis, measured rather than played (ADR-0014, 81f6bf5)

Measured with a throwaway script driving the real server and the real sandbox, not a hand-played run.

- **A compounding build cannot be paid for.** `echo x4 -> amplify-plus x2 -> charge -> resonate` ends on 16 bolts of
  14 power x 6 mult: 1344 damage, where the same eight shards under the old rules dealt 224 — through the old 640
  ceiling. But the cast costs **23 mana and a turn gives 6**, so it can never actually be cast. Blocker for the
  big-number fantasy (ordinary spells are unaffected). Follow-up: complexity-priced mana, Phase 3 in
  `POSSIBILITIES.md`, now promoted ahead of Phase 2; the cheap first step is mana relics or a work discount.
- **Overkill against the last guardian.** That cast is about eight times the Root Daemon's 170 HP on Beginner, so once
  it is affordable, foe HP is the next thing that has to grow. Not blocking today, because nothing can pay for it.
  Follow-up: geometric HP per layer and endless layers (`POSSIBILITIES.md` section 5).
- **The multiplier chip is visually unverified.** The code view shows `xN` on a bolt only when a shard moved it, and
  the smoke test only ever sees mult 1, so that branch has never been seen rendering. Polish; check it on the next
  mult build.

## 2026-09-15 — first look at the Bastion and the Foundry (screenshots, ADR-0011)

Taken with a scripted headless browser against a throwaway database, not a hand-played session.

- **Collage props.** SDXL drew several small props as sprite-sheet collages or loose fragments (flowers, crates,
  fences that looked like chairs, benches like boxes, the smithy, the furnace, the cart, the anvil). Polish; re-rendered
  with a weighted "single object" prompt and three candidates each (`scripts/art/manifest.json`).
- **Foundry floor and walls blended together.** Ash floor and rock walls were both mid-gray under the fog, so walkable
  ground was hard to read. Annoying; fixed by a `tint` post-processing option: warmer, brighter ash and darker rock.
- **Too dark in the wilds.** The fog's dimming and the light vignette stacked. Polish; both eased.
- **The fight list grows long.** "Around you" lists all eleven Foundry fights, pushing people and exits down the side
  panel. Polish; follow-up: group fights under a collapsible heading once zones get bigger.
- **Lamp posts read as thin sticks** at 2x. Polish; a wider lantern prompt next art pass.
- **The zone title replays after a page reload** (it is remembered per session only). Polish; acceptable.

## 2026-09-15 — walk cycles and Shardrun (screenshots, ADR-0012)

Played from headless-browser screenshots, not by hand: a Shardrun run from the start screen through the first fight
(two Tally Wisps), its reward, and a workbench move; and the Artificer's new walk strips at 6x.

- **The old walk had no real animation, and the sprite changed size by direction** (reported by the player). Annoying;
  fixed with pose-guided frames and one shared scale (`walk-cycle` in `scripts/art/`). Front and back steps stayed
  nearly still until the stick-figure poses were exaggerated; a faint ground shadow under one side frame needed a wider
  background tolerance.
- **The first fight felt easy** in the scripted play: two Tally Wisps fell in three turns for 1 Integrity. Unclear;
  the player's own runs will say more. Levers: foe HP and intents, `mana_per_turn`, starting spells.
- **The starting spare shard is Kindle (fire), and the first fight can be fire-resistant wisps.** Probably good (it
  teaches reading weaknesses), but watch for it feeling like a trap.
- **Shard cards wrap the function signature** under long names on three-column reward rows. Polish.
- **Both rooms on a floor can hold the same foes** (both fights on floor 2 were goblins). Polish; encounters are drawn
  per room from the seed and may repeat.

## 2026-09-16 — the player's WIP.md after testing Shardrun (ADR-0013)

What the player reported, and what changed:

- **Up and down walking cycled too slowly.** Polish; front and back strips now cycle in 0.4 s against 0.56 s for side
  walking, since a knee lift is a shorter motion than a stride.
- **Needs levels: plain words for beginners, only the function for programmers.** Blocking for the learning goal;
  Beginner and Programmer difficulties, enforced by the server.
- **No view of the spell as one function, which is the whole point.** Blocking; every spell has a Code view that
  composes it into one function, and every cast plays through that code line by line, damage and block growing as each
  shard returns (speed in Options: off, slow, normal, fast).
- **A delay between choosing a spell and it happening.** Annoying; measured at about 270 ms per command in JavaScript
  and 2.2 s in Python. The causes were a fresh sandbox per preview and a single Python spare. After the fix a cast
  answers without the sandbox, and one warm job per turn fills in the next previews.
- **The background did not fit a battle arena.** Polish; new side-view arenas, one per layer, at twice the resolution
  and color count.
- **Top-to-bottom map was confusing; bottom-to-top reads as climbing.** Annoying; Slay the Spire style generated maps
  per layer, climbing to the guardian.
- **Skeleton for levels, new spells, items.** Three layers, nine relics, boss spells, forge widening, treasure rooms.
- **All modes felt live at once; Guild Board belongs to the World; drop Descend; class placeholders.** A main menu picks
  The World or Shardrun, the Guild Board lives in the World without Descend, and six planned classes are listed with
  art.

Checked by `pnpm test:e2e` (class picker, main menu, World, practice fight, a Shardrun cast played as code) and by unit
and service tests. Not yet played by hand end to end: balance across three layers is a guess.

## Tunables to watch in the first playtests

- **Battle pacing (ADR-0019).** A cast gathers for 420ms, a volley spreads over about 1.3s (1.9s at most), and hit-stop
  pauses 40-120ms on heavy hits (220ms on a guardian's fall). Does a turn still feel quick after twenty of them? All
  in `TIMING` (`apps/client/src/shardrun/fx/timeline.ts`) and `hitStop` (`fx/engine.ts`).
- **Foe sizes.** Heights per size and how low each stands are in `fx/layout.ts`; which foe is which size is content.
  Is a colossal guardian at 80% of the stage too much once a second foe joins it?
- **Shake.** On by default, off in Options, and never with reduced motion. Too strong on a laptop screen?

- **Strike damage.** Failing tests × enemy ATK, capped at 24 per Strike (`enemy_moves.strike_damage_cap`). Casting the
  untouched starter code against the Tally Wisp costs 24 Integrity. Instructive or just punishing?
- **Starting Cycles.** 60 (`player.cycles_start`). With the mastery-0 multiplier of 0.5, that buys hint levels 1-3 on
  a brand-new concept. Enough?
- **Efficiency bonus.** Large-input runtime within 3× the reference solution on the same runner
  (`bonuses.efficiency_max_ratio_vs_reference`). Fair for reasonable non-optimal solutions?
- **Out of Focus.** An encounter ends as a forced retreat when Focus reaches 0 (ADR-0004). Does that feel right, or
  should it cost more?
- **Retreat keeps the path open.** A retreat clears its room and the expedition goes on (ADR-0008). Once rooms feed
  Commits and mastery, does that make retreating too cheap?
- **Map pace.** Click-to-travel walks one tile every 40 ms (`STEP_MS` in
  `apps/client/src/screens/ExpeditionScreen.tsx`). Too slow on a nine-floor dungeon?
- **What fog of war hides.** Room kinds are visible for the whole dungeon; titles and enemies only once a door has
  been open. Enough to make branch choices interesting, or too little?
- **World walking pace.** 140 ms per tile (`STEP_MS` in `apps/client/src/screens/WorldScreen.tsx`). Brisk enough for a
  40x30 town?
- **Foundry sight.** `sight: 7` in `zones/foundry.yaml`. Does the fog make exploring feel tense, or just slow?
- **The first quest's bar.** Three wins in the Foundry to open the kiln gate (`quests/the-foundry-cools.yaml`).
- **Shardrun pacing.** `mana_per_turn: 6` casts all three starting spells every turn. Does a turn ever involve a real
  choice, or should mana be tighter (5) so one spell waits?
- **Shardrun work cost.** Replaced in ADR-0015: a cast is one bill on a curve (`work_billing`), each step priced by
  its shard's complexity class plus its own cost. Open questions now: is `sqrt` too generous on a narrow spell (a
  three-slot starting spell costs 2 mana), and does `quadratic` bite hard enough before the Amortized Ledger?
- **Shardrun multipliers (ADR-0016).** `max_bolt_mult` went 25 -> 1000, so Resonate, Compound and the Runaway Coil
  can compound for real. Does a mult build now trivialise the Salvage, and does the Kernel still need one?
- **Does the new score read right?** The scoreboard shows what a volley was worth, with what landed as a footnote.
  Is "4 096 · 170 lands · x24 over" satisfying, or does the dealt number want to stay primary in a close fight?
- **Shardrun scaling (ADR-0015).** Mana per turn grows +3 a layer, the bolt cap +12 a layer, foe HP x1 / x2.6 / x6.8.
  All three are guesses. Does the Heap feel like a step up or a wall, and does the Kernel need the Ledger to clear?
- **Guardian difficulty.** The Kiln Warden has 95 HP, ignores bolts under 5 power, resists fire, and hits up to 12 a
  turn. Beatable with the shards a typical run finds by floor 7?
- **Shardrun length.** Three layers of 8 to 9 rows plus a boss is about 27 rooms. Too long for "short runs"? Levers: `rows`
  per layer in `shardrun/run.yaml`, or fewer layers.
- **Relic power.** Overclocked Core (all damage x1.3) and Mana Capacitor (+1 mana) are guardian relics. Do they make
  the next layer trivial?
- **Programmer difficulty.** No predictions means reading every shard. Is it satisfying, or just slower? Is keeping the
  mana cost visible the right hint?
- **Code view speed.** Normal takes about 160 ms a line plus pauses at each shard. Does watching every cast get old?
- **The multiplier ceiling.** `max_bolt_mult: 25` is a guess made to have a safety rail at all (ADR-0014). Damage is
  now `power x mult`, so the two clamps together set the ceiling at 16 x 40 x 25 = 16 000. Is that the right shape, and
  should either clamp grow per layer or per relic rather than sitting fixed?
