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
