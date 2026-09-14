**What it required.** A rotation that works for any `k` (positive, negative, zero, or larger than the list) and for a
line with no items at all.

**The pattern to remember.** Normalize the step with modulo, then cut and rejoin with slices [py.collections.list].
Python's `%` already returns a value from `0` to `n - 1` for a positive `n`; JavaScript's `%` keeps the sign of the left
operand, so `((k % n) + n) % n` is the form that works in both.

**Where it usually goes wrong.**
- Slicing with `k` directly, which quietly stops rotating once `k` is larger than the list.
- Taking `% 0` on a line with no items: Python raises `ZeroDivisionError`, and JavaScript produces `NaN`.
- In JavaScript, a negative remainder that turns a left rotation into no rotation at all.

**Try later.** Rotate the list in place, using only a constant amount of extra memory.
