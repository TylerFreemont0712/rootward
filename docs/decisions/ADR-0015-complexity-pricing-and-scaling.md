# ADR-0015 — Complexity pricing, and rules that scale instead of stopping

Status: accepted (2026-09-16)
Supersedes nothing. Amends the cost and cap rules of ADR-0012 and the damage rules of ADR-0014.

## Context

ADR-0014 gave a cast a second axis and the damage did start to compound — and then ran straight into the next wall,
which the ADR recorded honestly: the build it measured (`echo ×4 → amplify-plus ×2 → charge → resonate`) dealt
**1 344 damage for 23 mana, against an income of 6**. It could be engineered and it could not be cast.

Looking at why, every remaining constraint in the mode was a **constant**:

| Constraint | Was | Shape |
|---|---|---|
| Mana a turn gives | 6 | flat for the whole run |
| Bolts that land | 16 (`max_bolts`) | flat for the whole run |
| A shard's cost | 0–9 mana, flat | added outside any curve |
| Work | 1 mana per 8 bolts handed to shards | linear in the work, forever |
| Foe HP per layer | ×1 | flat across the three layers |

Two of those are fatal on their own. **Linear work billing** means a pipeline that doubles its volley pays double for
every doubling, so width is priced exactly as fast as it pays — there is no engineering to be done. And **flat shard
costs** meant that even with the work billed on a curve, a six-slot spell of ordinary shards owed six mana before it
handled a single bolt: billing half a cast on a curve and half flat leaves the flat half as the wall.

The player's ask was for "a more logarithmic or scaling system instead of one where it's too constrained". That is the
right diagnosis: the problem is not the size of the numbers, it is that they are constants.

## Options considered

1. **Raise the constants** (more mana, a higher `max_bolts`). Rejected for the same reason ADR-0014 rejected raising
   the damage caps: a bigger constant is still a constant, and every build converges on it one session later.
2. **Keep flat shard costs, curve only the work.** Measured and rejected: the ADR-0014 build falls from 23 mana to 17,
   of which 13 is flat shard cost. The curve cannot amortize a bill it is not given.
3. **Complexity-priced work on a sublinear curve, with the shard costs inside the same bill** (chosen), plus the
   remaining constants turned into functions of the layer and of relics.

## Decision

### One bill, on a curve

A cast costs `spell_base_cost + bill(work)`, and nothing else. `work` is in **units**, gathered per pipeline step:

```
units(step) = complexity(shard, bolts handed in) + shard.cost × per_mana
complexity: constant → 1 · linear → n · linearithmic → ⌈n log₂(n+1)⌉ · quadratic → n²
bill(units) = ⌊f(units / per_mana)⌋      f = identity (linear) | √ (sqrt) | log_b (log)
```

Three things follow from that shape, and each was the point:

- **Big-O is charged rather than recited.** A shard declares its complexity class in content (`complexity:`, default
  `linear`, which is what all but one of the shards written before this ADR do — Priority Queue sorts, and is now
  priced for it). What it pays is the class applied to the bolts it was actually
  handed, so a quadratic shard on a wide volley is ruinous and the same shard on four bolts is nothing. That is the
  lesson, and it arrives as a mana bill.
- **A shard's own cost is priced as work** (`cost` mana buys `per_mana` units) rather than added outside the curve, so
  the curve amortizes the whole cast. `cost` keeps its unit — it is still "this shard is worth 2 mana" — it just goes
  through the same function everything else does.
- **The curve is the build.** `sqrt` is the default; the *Amortized Ledger* relic buys `log`. Two relics that bill on a
  curve do not stack: the cheapest one wins, since `WORK_CURVES` is ordered cheapest first.

### Constants that become functions

- `mana_per_turn: { base: 6, per_layer: 3 }` — income grows as the spells widen.
- `bolt_cap: { base: 16, per_layer: 12, max: 96 }`, plus a `bolt-cap` relic effect. `max_bolts` is gone;
  `normalizeBolts` is handed the cap rather than reading one, so the number of bolts that land is a run's property.
- `max_pipeline_bolts` rises 64 → 128. It is a safety rail on what a shard may hand the next shard, not a ceiling.
- Foe HP per layer is content, and now compounds: ×1, ×2.6, ×6.8. A 10× build has to be a 10× build.

`max_bolt_power` and `max_bolt_mult` are deliberately **left** as flat clamps. They are not balance; they are the rule
that the engine never trusts a number player code computed (ADR-0012), and a rail has no business scaling.

## Measured, through the real service and the real JavaScript sandbox

Both numbers below are assertions in `apps/server/test/shardrun.test.ts`, run against the real content pack.

- **The build ADR-0014 could not afford.** `echo ×4 → amplify-plus ×2 → charge → resonate`: 79 units of complexity
  plus 13 mana of shard cost at 8 units each is 183, amortized to 4, plus the base. **5 mana, where it was 23** — and
  castable on the first turn of the first layer, which is what the whole change was for.
- **A wide quadratic build, and what the curve is worth.** Eight slots of `echo ×7 → crosslink`, which hands 128 bolts
  to a shard that compares every pair: 16 511 units of complexity, 16 639 with the shard costs. Amortized that is
  **46 mana**; with the Amortized Ledger it is **12**. Nothing about the bolts changes — the same measured pipeline,
  the same 16 that land and 112 that fizzle — and it kills the Root Daemon, the last layer's guardian, in one cast on
  the opening layer.

## Consequences

- **Mana stops being the early constraint and becomes the wide-build constraint.** A starting spell costs what it did
  before (the arithmetic was kept so on purpose: one linear shard handed one bolt is 9 units, which is 1 mana). A
  six-slot compounding spell is now affordable, and a *quadratic* six-slot spell is not, until a relic changes the
  curve. That is the tension moving from "can I cast anything" to "what can I afford to compute".
- **`cost` is no longer flat mana, and the client no longer pretends it is.** The Workbench showed "from N mana" by
  adding up a spell's shard costs; a cast's price cannot be added up any more, so it shows the measured preview cost
  instead, and a shard's cost chip says "N mana of work, before the cast's curve".
- **The rarity signal in `cost` is weaker at small scale**, because √ flattens it: three cost-2 shards and three
  cost-0 shards differ by about one mana on a narrow spell. Accepted — rarity still gates *availability*, and the
  alternative was keeping the wall.
- **`PipelineOutcome` carries the steps, not a total.** Only the rules know a shard's complexity class, so the server
  hands them `{ shard, given }` per step and core prices it. The harness still measures `given`; nothing about what is
  trusted changed.
- **Numbers stay far below 2^53.** The worst case a pipeline can reach is a few slots of 128² units, and damage is still
  bounded by `bolt_cap.max × max_bolt_power × max_bolt_mult` = 96 × 40 × 25 = 96 000. The big-number decision
  (cap, log-space, or `BigInt`) is still open and still belongs to the exponent tier and endless layers.
- **Three layers of balance need a pass with a player at the controls.** Foe HP now compounds and the bolt cap grows;
  whether ×2.6 and ×6.8 are the right growth is a playtest question, and they are content, so answering it is an edit.
- New content this ADR makes expressible with no further engine work: shards of any complexity class, relics that move
  the curve or the cap. Shipped with it: `crosslink` (quadratic, and the first shard whose payoff is worth its class),
  `census` (linearithmic), `singularity` (constant), and the Amortized Ledger, Wider Aperture and Thread Pool relics.
