# POSSIBILITIES.md — making the numbers get out of hand

Ideas, not decisions. Nothing here is built. Anything adopted needs an ADR first, because most of it changes the
Shardrun damage contract (ADR-0012, ADR-0013). Written 2026-09-16 from the player's note: *the fun of a Balatro-like
is the insane final number, and in a programming game the functions themselves should be what compound.*

## 1. Why Shardrun cannot explode today

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
stay). `mult` starts at 1, is raised by shards and relics, and is **not** clamped the same way — it is the axis the
build grows on. In the shard contract this is a small change: a shard may return a volley, and optionally a mult
contribution.

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
| 1 | **Higher-order shards** — `twice(f)`, `compose(f, g)`, `repeat(n, f)` take *another shard* as an argument | Retriggers: turns any additive shard multiplicative | Functions as values, the single best concept fit |
| 2 | **Recursion with a depth budget** — `recurse` re-runs the pipeline on its own output, depth is a resource relics raise | Exponential in depth | Recursion, base cases, why depth matters |
| 3 | **Complexity-priced mana** — a shard costs by the work it does: O(1), O(n), O(n²); a rare relic bills you at O(log n) | Makes wide builds *payable*, which is itself the unlock | Big-O, felt rather than recited |
| 4 | **Scaling shards** — "gains +1 power every time it is cast this run" | Compounds across the whole run | Mutable state, accumulators, persistence |
| 5 | **`mult` shards** — `+mult` (common) and `×mult` (rare) | The third tier, where explosions live | Fold/reduce with different operators |
| 6 | **Memoize** — casting the same spell twice in a turn is cheaper the second time | Enables repeat-spam builds | Caching, purity, why a cache needs a key |
| 7 | **Parallel lanes** — split the volley into k lanes, run them independently, merge | Multiplicative width | map / reduce, independence |
| 8 | **Tag synergies** — relics pay per shard *kind* in a spell ("+2 mult per list shard") | Rewards coherent builds | Classification, composition over chance |
| 9 | **Exponent tier** — rare relics add to an exponent: `damage = (Σ power × mult) ^ e` | Tetration-ish top end | Exponentiation, growth rates |
| 10 | **Endless layers** — after the Kernel, foe HP grows geometrically per layer | Forces the build to compound | — (this is the ante, and it is what makes the rest matter) |

### The two that matter most

If only two are ever built, build **#1 (higher-order shards)** and **#3 (complexity pricing)**.

`twice(amplify)` is the retrigger, the multiplicative tier, *and* a genuine lesson in functions-as-values, in one
mechanic. And complexity pricing is what keeps the whole thing honest: it replaces the arbitrary `max_bolts` wall with
a cost curve, so a thousand-bolt build is not forbidden, it is simply expensive — until you find the relic that bills
you logarithmically, and then it is a build.

## 5. Making the numbers *necessary*

Big numbers are only fun against big requirements. Today foe HP is roughly linear, so a 10× build just wins faster.

- Foe HP per layer as `base × r^layer` (r ≈ 2.5–4), so layer 6 genuinely needs six figures.
- **Endless mode** past the Kernel: layers keep coming, HP keeps compounding, and the run ends when you finally
  cannot keep up. "How deep did your function go" is the score, and it is a far better long-term hook than "you won."
- A per-run **best cast** record in the Stats panel, and a personal all-time best. Balatro's real loop is beating your
  own number.

## 6. Engineering notes (the unglamorous, load-bearing part)

- **JavaScript runs out of integers at 2^53.** Past ~9e15, `number` silently loses precision — which would make the
  engine lie, and that is not acceptable under the "real execution" rule. Options: cap the fantasy below 1e15; or
  score in log-space internally and render e-notation; or move damage to `BigInt` in the engine while shards keep
  returning ordinary numbers. Decide *before* building the exponent tier, not after.
- **The clamps become balance, not constants.** `max_bolts` / `max_bolt_power` should scale per layer and per relic
  rather than being fixed. They stay as safety rails against a shard returning nonsense; they stop being the ceiling.
- **Determinism must hold.** Previews are cached and reused as the cast (ADR-0013), so a shard that used randomness
  would make the preview a lie. Any "gamble" shard needs a seed supplied by the engine, never `Math.random`.
- **Higher-order shards change the sandbox contract.** A shard receiving another shard means the generated program
  must pass functions between namespaces. Worth a spike before committing.
- **Display.** e-notation past 1e5, digit-roll animation on the damage number, and the code view showing a running
  `Σ power × mult` readout per line. The escalation should be *audible and visible* — that is the payoff.

## 7. Suggested order

1. **Phase 1 — two axes.** Add `mult` to the cast, make the clamps balance-driven, add three `+mult` shards and one
   `×mult` relic, show `Σ power × mult` in the code view. Small, and it immediately changes how builds feel.
2. **Phase 2 — higher-order shards.** `twice`, `compose`, `repeat`. Needs the sandbox spike first.
3. **Phase 3 — complexity pricing.** Replace flat shard costs with a cost function of work, plus a log-billing relic.
4. **Phase 4 — recursion, exponent tier, endless layers, scaling shards.** The deep end, once the arithmetic is
   settled and the big-number representation is decided.

Phase 1 alone is probably one session's work and would answer the question "does this actually feel better?" before
anything expensive is built.
