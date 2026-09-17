# POSSIBILITIES.md — making the numbers get out of hand

Ideas, written 2026-09-16 from the player's note: *the fun of a Balatro-like is the insane final number, and in a
programming game the functions themselves should be what compound.*

**Where it stands (2026-09-17).**
- **Shipped:** the second axis (`mult`, ADR-0014), complexity pricing (ADR-0015), and the settled big-number question
  (ADR-0016). The multiplicative tier exists as shards (Charge, Cascade, Resonate, Compound, Attune, Tithe,
  Crosslink) and relics (Tuning Fork, Runaway Coil, Feedback Loop). Section 4 marks what else exists.
- **Changed since:** the scoreboard shows the damage that lands again, with the volley's potential as its footnote
  ("worth 4096 · ×24.1 over"). The player wanted the number on the code block to be what the foes actually take
  (ADR-0022). The run's best cast still records the potential.
- **Built from a different line of thought:** Shardrun (Experimental), a deckbuilder turn over the same tower
  (ADR-0020). It answers "every turn is the same turn" (`WIP.md`), not the size of the numbers, but it changes what a
  build is.
- **Everything else here is still a proposal**, and each piece needs an ADR first, because most of it changes the
  Shardrun damage contract (ADR-0012, ADR-0013).

## 1. Why Shardrun could not explode (before ADR-0014 and ADR-0015)

The ceiling is hard, and it is arithmetic, not balance:

| Rule | Value | Where |
|---|---|---|
| Bolts that land per cast | 16 (`max_bolts`) | `config/balance.yaml` |
| Power per bolt | 40 (`max_bolt_power`) | same |
| **Therefore max damage per cast** | **640** | `normalizeBolts` clamps both |
| Foe HP | 20–30, × layer, × difficulty | `shardrun/foes/`, `run.yaml` |

So the best build in the game and a mediocre one differ by maybe 3×, and both bounce off the same wall. Worse, almost
every bonus is **additive**: `amplify` is +3 power, `arc` is +1, Debugger Duck is +1 power per bolt. There is exactly
one multiplicative source in the whole mode (the `damage-multiplier` relic), and it multiplies a number that is already
clamped. Additive bonuses on a capped quantity converge — every build ends up in the same place, which is the opposite
of the feeling we want.

**The fix is not "raise the cap."** It is to add axes that multiply each other, and to price them so that reaching a
big number is a thing you *engineered*.

## 2. What Balatro actually does, named precisely

Worth stating exactly, so we copy the mechanism and not the vibe:

1. **Two axes that multiply.** Score = `chips × mult`. Neither alone is the score.
2. **Three tiers of growth.** `+chips` (additive), `+mult` (additive, but on the multiplier), and `×mult` (rare,
   multiplicative on the multiplier). Explosions live almost entirely in that third tier.
3. **Retriggers.** Applying an effect N times turns addition into multiplication. Cheap to state, enormous in play.
4. **Permanent scaling.** Some jokers grow every round, so the build compounds across the run, not just the hand.
5. **The requirement grows too.** Antes scale superlinearly, so standing still is losing. This is what *forces* the
   build to compound, and it is the part most easily forgotten.
6. **The payoff is watched.** The counter ticks. You see it happen.

Point 6 is the one Rootward is already best placed for: the line-by-line code view built this session is a
better version of Balatro's score counter, because the thing ticking up is *the player's own function*.

## 3. The core proposal: a second axis, spelled `mult`

Give a cast two numbers instead of one:

```
damage = (Σ bolt power) × mult
```

Bolts keep `power` and stay clamped (that clamp is a safety rail against a shard returning `1e308`, and it should
stay). `mult` starts at 1 and is raised by shards and relics — it is the axis the build grows on.

> **What shipped differs from this sketch on two points (ADR-0014).** The multiplier lives on *each bolt* rather than
> on the cast, which means the `(bolts, battle) -> bolts` shard signature survives untouched and all 36 existing shards
> carry it for free. And it *is* clamped, by `max_bolt_mult`, for exactly the reason power is: a shard's output is
> player code, and the engine trusts none of it. A cast-level multiplier, as sketched here, remains the fallback if
> per-bolt multipliers turn out to read confusingly in play — and it is the better fit for retriggers in Phase 2.

Why this fits a programming game: the volley is *data*, and the mult is *the accumulator you fold into*. Shards that
work on the list and shards that work on the accumulator are visibly different kinds of function, which is itself
worth teaching.

### An illustrative cast (numbers invented, not balanced)

| Step | Shard | Bolts | Σ power | mult | Damage |
|---|---|---|---|---|---|
| start | — | 1 | 4 | 1 | 4 |
| 1 | `fork` (×2 bolts) | 2 | 8 | 1 | 8 |
| 2 | `prism` (×3, 40% each) | 6 | 9.6 | 1 | 9.6 |
| 3 | `amplify` (+3 each) | 6 | 27.6 | 1 | 27.6 |
| 4 | `charge` (+4 mult) | 6 | 27.6 | 5 | 138 |
| 5 | `twice(charge)` (retrigger) | 6 | 27.6 | 9 | 248 |
| 6 | `resonate` (×2 mult) | 6 | 27.6 | 18 | 497 |
| 7 | `recurse(depth 3)` | 6 | 27.6 | 18³ = 5 832 | **160 963** |

Same shards, one extra tier each time. That is the shape we want: step 3 is +23, step 7 is ×324.

## 4. Ten mechanics, each one a real programming idea

Ordered roughly by how much they multiply, and each is a thing worth learning.

| # | Mechanic | How it compounds | What it teaches |
|---|---|---|---|
| 1 | **Higher-order shards** — `twice(f)`, `compose(f, g)`, `repeat(n, f)` take *another shard* as an argument. *Open; needs a sandbox spike.* | Retriggers: turns any additive shard multiplicative | Functions as values, the single best concept fit |
| 2 | **Recursion with a depth budget** — `recurse` re-runs the pipeline on its own output, depth is a resource relics raise. *Open.* | Exponential in depth | Recursion, base cases, why depth matters |
| 3 | **Complexity-priced mana** — a shard costs by the work it does: O(1), O(n), O(n²); a rare relic bills you at O(log n). *Shipped (ADR-0015; the Amortized Ledger bills the logarithm).* | Makes wide builds *payable*, which is itself the unlock | Big-O, felt rather than recited |
| 4 | **Scaling shards** — "gains +1 power every time it is cast this run". *Within a fight only so far: Patience (+3 power a turn) and the Feedback Loop relic (+2 mult per spell already cast). Across a run: open.* | Compounds across the whole run | Mutable state, accumulators, persistence |
| 5 | **`mult` shards** — `+mult` (common) and `×mult` (rare). *Shipped: Charge, Cascade, Crosslink add; Resonate, Tithe, Compound, Attune multiply or spread; Runaway Coil doubles after the last shard (ADR-0014, ADR-0016).* | The third tier, where explosions live | Fold/reduce with different operators |
| 6 | **Memoize** — casting the same spell twice in a turn is cheaper the second time. *Open (Cache Hit only discounts a turn's first spell).* | Enables repeat-spam builds | Caching, purity, why a cache needs a key |
| 7 | **Parallel lanes** — split the volley into k lanes, run them independently, merge. *Open.* | Multiplicative width | map / reduce, independence |
| 8 | **Tag synergies** — relics pay per shard *kind* in a spell ("+2 mult per list shard"). *Open.* | Rewards coherent builds | Classification, composition over chance |
| 9 | ~~**Exponent tier**~~ — **do not build (ADR-0016)**: an exponent on a player-controlled base is uncontrollable (`e = 3` on a base of 10 000 is 1e12 in one step). A third *multiplicative* tier is bounded by the slot budget and just as exciting; the Runaway Coil relic is its first piece | | |
| 10 | **Endless layers** — after the Kernel, foe HP grows geometrically per layer. *Open, and no longer blocked on anything.* | Forces the build to compound | — (this is the ante, and it is what makes the rest matter) |

### The two that matter most

If only two are ever built, build **#1 (higher-order shards)** and **#3 (complexity pricing)**.

`twice(amplify)` is the retrigger, the multiplicative tier, *and* a genuine lesson in functions-as-values, in one
mechanic. And complexity pricing is what keeps the whole thing honest: it replaces the arbitrary `max_bolts` wall with
a cost curve, so a thousand-bolt build is not forbidden, it is simply expensive — until you find the relic that bills
you logarithmically, and then it is a build.

## 5. Making the numbers *necessary* (the first bullet shipped in ADR-0015)

Big numbers are only fun against big requirements. Today foe HP is roughly linear, so a 10× build just wins faster.

- ~~Foe HP per layer as `base × r^layer` (r ≈ 2.5–4)~~ — shipped as content in ADR-0015: ×1, ×2.6, ×6.8 across the
  three layers. Whether that is the right growth is a playtest question, and it is an edit to `run.yaml`.
- **Endless mode** past the Kernel: layers keep coming, HP keeps compounding, and the run ends when you finally
  cannot keep up. "How deep did your function go" is the score, and it is a far better long-term hook than "you won."
- ~~A per-run **best cast** record in the Stats panel~~ — shipped in ADR-0016 as `stats.bestCast`, and it needed a
  new measurement to be worth anything: damage *dealt* is cut to a foe's remaining Integrity, so every build past the
  first lethal one read the same. A cast is now also scored against foes that cannot die (`potential`), and that is
  the record. (What the code view *headlines* went back to the damage dealt in ADR-0022, with the potential beside it.)
  A personal all-time best across runs is still open, and wants the profile store rather than the run snapshot.

## 6. Engineering notes (the unglamorous, load-bearing part)

- ~~**JavaScript runs out of integers at 2^53.**~~ **Settled in ADR-0016: float64 forever, bounded by one number.**
  Damage is `Math.min(damage, foe.hp)` per hit, so the only quantity that can escape is *foe HP* — clamping it with
  `max_foe_hp` (1e12) bounds everything downstream, and the rails are now sized from that budget rather than from
  taste (`max_bolt_mult` 25 → 1000). `BigInt` is ruled out for this codebase specifically: it survives none of the
  three zod/JSON boundaries a bolt crosses (sandbox, snapshot, view), so it would mean an encoding the *player* has to
  learn to write a shard. Log-space is the named successor if one is ever needed. And the exponent tier, which is what
  would force it, should be replaced by a third multiplicative tier — see the note in §4 #9.
- **The clamps become balance, not constants.** `max_bolts` / `max_bolt_power` should scale per layer and per relic
  rather than being fixed. They stay as safety rails against a shard returning nonsense; they stop being the ceiling.
- **Determinism must hold.** Previews are cached and reused as the cast (ADR-0013), so a shard that used randomness
  would make the preview a lie. Any "gamble" shard needs a seed supplied by the engine, never `Math.random`. The same
  goes for rules: a preview must apply them in the cast's order. Feedback Loop once counted the cast itself, and its
  first cast of a fight landed three times what it promised (ADR-0022).
- **Higher-order shards change the sandbox contract.** A shard receiving another shard means the generated program
  must pass functions between namespaces. Worth a spike before committing.
- **Display.** Built: the code view runs the spell line by line, with the bolts, damage and block after every shard,
  and each bolt's multiplier on its chip; the score pops as it changes. Still open: e-notation past 1e5 and a
  digit-roll on the damage number. Sound landed in ADR-0023, where a hit sounds heavier the harder it lands, but
  nothing yet rises with the multiplier. The escalation should be *audible and visible* — that is the payoff.

## 7. Suggested order

1. **Phase 1 — two axes. ✅ Done 2026-09-16, ADR-0014.** `mult` landed on the bolt rather than the cast (the shard
   signature survives that way), clamped by a new `max_bolt_mult`. Charge, Cascade and Resonate move it, the Tuning
   Fork relic adds to it, and the code view shows it on each bolt chip.

   **Measured through the real server and the real sandbox the day it landed.** The build
   `echo ×4 → amplify-plus ×2 → charge → resonate` ends on 16 bolts of 14 power × 6 mult: **1 344 damage, where the
   same eight shards under the old rules gave 224** — through the old 640 ceiling, and enough to kill the Root Daemon
   (170 HP on Beginner) roughly eight times over. The new arithmetic ceiling is 16 × 40 × 25 = 16 000.

   **But that cast costs 23 mana and a turn gives 6, so it cannot actually be cast.** This is the honest limit of
   Phase 1: it proves the axis compounds, and it moves **Phase 3 (complexity pricing) ahead of Phase 2 in priority**,
   because paying for a wide build is now the binding constraint rather than computing one. A first cheap step would
   be relics and shards that give mana or discount work, so a big build is reachable before the deep mechanics land.
2. **Phase 3 — complexity pricing. ✅ Done 2026-09-16, ADR-0015.** A cast is now one bill on a curve: each step pays
   its shard's complexity class applied to the bolts it was handed (`constant` / `linear` / `linearithmic` /
   `quadratic`), *plus that shard's own cost priced as work* — the flat half of the old bill was the actual wall — and
   the total is billed as its square root, or its logarithm with the Amortized Ledger relic. Mana per turn, the bolt
   cap and foe HP stopped being constants at the same time.

   **Measured through the real server and the real sandbox.** The build Phase 1 could not cast —
   `echo ×4 → amplify-plus ×2 → charge → resonate` at 23 mana against an income of 6 — now costs **5 mana** and is
   castable on the first turn of the first layer. An eight-slot `echo ×7 → crosslink` hands 128 bolts to a shard that
   compares every pair: 16 639 work units, **46 mana amortized and 12 with the Ledger**, and it kills the Root Daemon
   in one cast. Both are assertions in `apps/server/test/shardrun.test.ts`.

   **What this leaves as the binding constraint: slots and the clamps.** `max_bolt_power` (40) and `max_bolt_mult`
   (25) are the ceiling again, exactly as ADR-0014 predicted, and they are deliberately *not* balance — they are the
   rule that the engine never trusts player code's arithmetic. Past them, the next real growth has to come from the
   exponent tier or from a damage representation that is not a clamped `number`, which is Phase 4's decision.

   **Since then (ADR-0016):** the big-number representation is decided (float64, bounded by `max_foe_hp`), and
   `max_bolt_mult` went from 25 to 1000, so the clamps are rails again rather than the ceiling.
3. **Phase 2 — higher-order shards: next.** `twice`, `compose`, `repeat`. Needs a sandbox spike first, because a shard
   would receive another shard. With the bill on a curve a retrigger is affordable, and `twice(crosslink)` is a
   sentence a player would want to write.
4. **Phase 4 — recursion, endless layers, scaling shards** (the exponent tier is replaced by a third multiplicative
   tier, §4 #9). Endless layers are cheap now that foe HP compounds and the caps scale — the layer index already
   drives both.
