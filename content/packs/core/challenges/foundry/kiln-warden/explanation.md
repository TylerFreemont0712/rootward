**What it required.** A function that accumulates a running total per key instead of overwriting it, and returns the
whole structure instead of printing it.

**The pattern to remember.** `scores.get(metal, 0) + delta` reads the running total (or 0 for a metal seen for the
first time) before adding to it [py.collections.dict]. A function that ends by printing instead of returning gives
its caller `None` (Python) or `undefined` (JavaScript) instead of the value it built, the same trap as any other
function [py.functions.define].

**Where it usually goes wrong.**
- `scores[metal] = delta` overwrites the previous total instead of adding to it.
- Printing inside `tally` instead of returning, so `main`'s loop over the result fails instead of running.
- Iterating in sorted order instead of insertion order, which changes which metal each printed line names.

**Try later.** Have the Warden reject a batch outright once its score drops below a threshold, instead of only
tallying it.
