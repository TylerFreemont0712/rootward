**What it required.** One pass over the items that carries the current run and the best run so far, with ties going
to the earlier run.

**The pattern to remember.** Loops often need state that survives from one step to the next [py.control.loops]: here,
the previous item and the length of the current run. Update that state in the same order every time: extend or
restart the run, remember the item, then compare with the best.

**Where it usually goes wrong.**
- Counting every item instead of restarting the run when the item changes.
- Using `>=` for the best run, which reports the last of two equal runs instead of the first.
- Forgetting a line with no items, which has no item to print.

**Try later.** Report the longest run of increasing numbers instead of equal items.
