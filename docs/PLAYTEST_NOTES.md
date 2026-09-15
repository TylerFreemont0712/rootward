# Playtest notes

Friction found while playing, newest first. Each entry: date, commit, what happened, severity (blocker / annoying /
polish), and the follow-up (a ROADMAP item or the commit that fixed it).

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
- **Shardrun work cost.** One extra mana per 8 bolts handed to shards (`work_per_mana`). Fork chains stay cheap until
  about three forks deep. Too generous?
- **Guardian difficulty.** The Kiln Warden has 95 HP, ignores bolts under 5 power, resists fire, and hits up to 12 a
  turn. Beatable with the shards a typical run finds by floor 7?
- **Shardrun length.** Three layers of 8 to 9 rows plus a boss is about 27 rooms. Too long for "short runs"? Levers: `rows`
  per layer in `shardrun/run.yaml`, or fewer layers.
- **Relic power.** Overclocked Core (all damage x1.3) and Mana Capacitor (+1 mana) are guardian relics. Do they make
  the next layer trivial?
- **Programmer difficulty.** No predictions means reading every shard. Is it satisfying, or just slower? Is keeping the
  mana cost visible the right hint?
- **Code view speed.** Normal takes about 160 ms a line plus pauses at each shard. Does watching every cast get old?
