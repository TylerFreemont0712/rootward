# Playtest notes

Friction found while playing, newest first. Each entry: date, commit, what happened, severity (blocker / annoying /
polish), and the follow-up (a ROADMAP item or the commit that fixed it).

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
