# ADR-0016 — Big numbers: float64 forever, and scoring the volley instead of the fight

Status: accepted (2026-09-16). §3's display amended by ADR-0022: the scoreboard shows the damage that lands, with the
potential as its footnote; the potential is still computed, and is still the run's best cast.
Amends the damage rules of ADR-0012, ADR-0014 and ADR-0015. Settles the question ADR-0014 and `POSSIBILITIES.md` §6
deliberately left open.

## Context

`POSSIBILITIES.md` §6 said the representation of damage had to be decided *before* the exponent tier, because past
2^53 a JavaScript `number` silently loses precision — and an engine that lies about its own arithmetic breaks the
project's first rule. It listed three options: cap the fantasy below 1e15, score in log-space, or move damage to
`BigInt`.

**Looking at the code, the question is smaller than it was framed, and it is in a different place.** In
`resolveBolts`, every hit does `damage = Math.min(damage, foe.hp)` before `dealt += damage`. So:

- damage per cast is bounded by the Integrity standing in front of it;
- `stats.damage` is bounded by all the Integrity a run ever spawned;
- the only quantity that can actually run away is **foe HP**, and only once endless layers exist.

The big-number decision is a foe-HP decision.

That same line has a second consequence, and it is the more urgent one. It means **the number the player watches is
clamped to the foe's health**. ADR-0015's own test showed it: a volley of sixteen bolts worth 4 096 reported
`170 damage`, because 170 was all the Root Daemon had. Every build past the first lethal one reads identically. That
is the exact inverse of the thing this whole line of work is for (`POSSIBILITIES.md` §2, point 6: *the payoff is
watched*), and no amount of compounding fixes it, because the compounding is what is being hidden.

## Options considered

1. **`BigInt` in the engine, shards keep returning ordinary numbers.** Rejected, and specifically rejected *for this
   codebase* rather than on taste. A shard returns bolts through `json.dumps` / `JSON.stringify`; a run persists as a
   JSON snapshot validated by zod; a view crosses `packages/shared`, validated by zod again. `BigInt` survives none of
   those three boundaries, so adopting it means inventing an encoding **the player has to learn in order to write a
   shard**. It would trade the thing that makes the mode work for exactness in digits nobody can see.
2. **Log-space** (`store log10(damage)`, render `1.8e47`). Not rejected — deferred, and named as the successor if one
   is ever needed. It stays a `number`, so JSON, zod and the sandbox contract are untouched; its precision degrades as
   *relative* error, which is what a player perceives; and multiplication becomes addition, which is what a
   compounding build is already doing. It costs one conversion at the display edge instead of a rewrite at three
   boundaries.
3. **Stay on float64 and bound the one quantity that can escape** (chosen).

## Decision

### 1. One number bounds the mode: `max_foe_hp`

`foeHp()` clamps a foe's Integrity to `max_foe_hp` (1e12) however a layer and a difficulty multiply it. Because damage
is bounded by HP per hit, bounding HP bounds every number the engine carries.

1e12 rather than something nearer 2^53 because the *intermediates* need room: a cast sums up to `bolt_cap.max` bolts
of `power × mult`, then applies `damageMultiplier`, a weakness and a scatter share. Leaving several orders of
magnitude of headroom means no intermediate product can cross the exact-integer boundary, and that is assertable
(`Number.isSafeInteger`) rather than hoped for.

### 2. The rails are sized from that budget, not from taste

ADR-0015 kept `max_bolt_power` and `max_bolt_mult` flat, on the grounds that they are rails against player code rather
than balance. That argument was right and the *numbers* were wrong: at ×25, the mult rail was the ceiling on every
build, which is exactly the role a rail must not have. A rail's job is to keep the arithmetic exact and bounded, not
to be small.

`max_bolt_mult` goes 25 → **1000**. A whole cast is then at most `96 × 40 × 1000 = 3 840 000` — six orders of
magnitude under `max_foe_hp`, and still nowhere near 2^53. `max_bolt_power` stays at 40 on purpose: power is the
additive axis and multiplication is meant to be the interesting one.

### 3. Score the volley, not the fight

A cast now reports two numbers. `damage` is the Integrity it removed. `potential` is what the same volley does against
a copy of the battle whose foes cannot die — the same rules, with traits, shields, resistances and targeting all still
applying (a volley fired into a resistance genuinely *is* worth less), and only the two effects that hide a build's
size removed: damage cut to what a foe had left, and bolts with nothing left to hit.

It is computed by resolving a second time against a cloned battle whose foes are given headroom equal to the largest
volley the rules permit. Adding headroom rather than flattening HP keeps the foes in the same order, so a bolt aimed at
the weakest or strongest still picks the one it would have picked.

`potential` is what the scoreboard shows, with `damage` demoted to a footnote ("170 lands · ×24 over"), and
`stats.bestCast` keeps the run's biggest one. That is the number worth beating.

### 4. Recorded, not built: prefer a third multiplicative tier to an exponent tier

The exponent tier (`damage = (Σ power × mult)^e`) is what would have forced option 2, and it should not be built.
An exponent on a player-controlled base is uncontrollable — `e = 3` on a base of 10 000 reaches 1e12 in one step, and
balance becomes a step function in `e`. A third *multiplicative* tier grows just as excitingly and is bounded by the
slot budget, which spell capacity already limits. This ADR ships the relic-level version of that tier
(`bolt-mult-factor`) instead.

## Consequences

- **Measured through the real service and sandbox** (`apps/server/test/shardrun.test.ts`): the `echo ×7 → crosslink`
  build that read `170 damage` under ADR-0015 now records a best cast of **4 096** — sixteen bolts of 4 power at ×128,
  halved by the Root Daemon's resistance to plain bolts, and twenty-four times what the guardian could absorb.
- **Two resolves per preview instead of one.** The code view previews after every shard, so a six-slot spell across
  five spells is a few dozen extra resolutions of at most 96 bolts on a cloned battle. Cheap, and worth naming.
- **`max_bolt_mult` at 1000 is a balance change, not just a rail change.** Resonate, Compound and the Runaway Coil can
  now compound past ×25, which is the intent, and the three layers need a playtest pass.
- **`BattleState` gained `casts`**, a per-fight counter, so a relic can grow within a fight. It defaults to 0, so runs
  saved before this ADR still load.
- **Endless layers are no longer blocked on this decision.** At geometric HP growth of ×3 a layer from a 30 HP base,
  1e12 is about 25 layers. The cap limits notation, not play.
- New content: `compound` (squares the multiplier), `attune` (spreads the volley's best multiplier), `tithe` (trades
  clamped power for unclamped multiplier), and the Runaway Coil (`bolt-mult-factor`, the multiplicative tier) and
  Feedback Loop (`mult-per-cast`, growth within a fight) relics.
