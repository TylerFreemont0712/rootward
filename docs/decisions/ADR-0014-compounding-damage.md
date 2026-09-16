# ADR-0014 — Compounding damage: a multiplier on every bolt

Status: accepted (2026-09-16)
Supersedes nothing. Amends the damage rules of ADR-0012 and ADR-0013.

## Context

The player's ask, in their words: the joy of a Balatro-like is the absurd final number, and in a programming game the
functions themselves should be what compound. Shardrun cannot do that today, and the reason is arithmetic rather than
tuning (`POSSIBILITIES.md` has the long form):

- A cast is capped at `max_bolts` × `max_bolt_power` = 16 × 40 = **640 damage**, whatever the build.
- Nearly every bonus is **additive**: `amplify` is +3 power, `arc` +1, Debugger Duck +1 per bolt. The one
  multiplicative source (`damage-multiplier`) multiplies a number that is already clamped.

Additive bonuses on a capped quantity converge: a great build and an average one land in the same place. That is the
opposite of the intended feeling, and no amount of balancing fixes it.

## Options considered

1. **Raise the caps.** Rejected: a larger flat ceiling is still a ceiling, and builds still converge on it. It buys
   one session of feeling better and changes nothing structurally.
2. **A cast-level multiplier**, exactly as Balatro scores a hand (`chips × mult`). This is the closest analogue, but a
   shard's contract is `(bolts, battle) -> bolts` — a pure list transformation. A cast-level mult means a shard must
   return a second value, which changes the sandbox protocol, the harness trace format, and the shape of every shard
   ever written. Deferred, not dismissed: if per-bolt multipliers prove confusing in play, this is the fallback, and
   it is a better fit for retriggers (`twice`, `compose`) when those arrive.
3. **A multiplier on each bolt** (chosen). A bolt gains `mult`, defaulting to 1, and a bolt's damage becomes
   `power × mult` before the existing element, trait, and relic multipliers apply.

## Decision

Bolts carry `mult` alongside `power`. Damage per bolt is `power × mult`, then resolved exactly as now.

This was chosen because it buys the compounding axis at the smallest possible cost to everything already built:

- **The shard signature does not change.** A mult shard is still `(bolts, battle) -> bolts`.
- **Every existing shard keeps working, untouched.** Shards copy bolts with `{**bolt, ...}` / `{ ...bolt }`, so `mult`
  flows through them for free.
- **Every existing example still passes.** `mult` is `z.number().default(1)`, so the 36 shards' worked examples — which
  list bolts field by field and are executed for real during validation — parse and compare unchanged.
- **Old snapshots still load.** The same default covers runs saved before this ADR.
- It also teaches something true: shards that transform the list and shards that raise the multiplier are visibly two
  different kinds of function, which is the distinction the later higher-order work is built on.

`mult` is clamped by a new `max_bolt_mult` balance number, for the same reason `power` is clamped: a shard is player
code, and the engine must never trust a number it computed. The clamp is a safety rail, not the ceiling — the ceiling
is now the product of two axes, and later phases raise it per layer and per relic.

## Consequences

- The damage ceiling becomes `max_bolts × max_bolt_power × max_bolt_mult`, and builds now differ by orders of
  magnitude rather than by a factor of three.
- Two new kinds of content become expressible with no further engine work: `+mult` shards (common) and `×mult` shards
  (rare), plus relics that raise mult.
- Previews and casts must agree, since a preview's run is cached and reused as the cast (ADR-0013). `mult` flows
  through `previewBolts` by the same path as `power`, so the code view keeps showing measured values only.
- Numbers stay far below the 2^53 precision limit while mult is clamped. The exponent tier and endless layers
  (`POSSIBILITIES.md`, phases 3–4) still require the big-number decision — cap, log-space, or `BigInt` — and that is
  deliberately **not** settled here.
- The existing `damage-multiplier` relic now multiplies a much larger number. Balance across the three layers will
  need a pass, and foe HP is still roughly linear, so the geometric-HP and endless work is what makes the new ceiling
  matter.
