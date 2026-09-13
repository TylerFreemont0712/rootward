**What it required.** Floored division and the remainder that goes with it, for every combination of signs, plus a
guard for division by zero.

**The pattern to remember.** "Integer division" is not one operation [py.basics.values]. Python's `//` and `%` round
toward negative infinity, so `divmod(a, b)` always satisfies `a == q * b + r` with `r` taking the sign of `b`.
JavaScript's `%` is a remainder with the sign of `a`, so compute `q = Math.floor(a / b)` and `r = a - q * b` yourself.

**Where it usually goes wrong.**
- `int(a / b)` or `Math.trunc(a / b)` rounds toward zero: `-7 / 2` becomes `-3` instead of `-4`.
- Dividing before checking for zero: Python raises `ZeroDivisionError`, and JavaScript quietly prints `Infinity NaN`.
- Forgetting that `b` can be negative, which makes the remainder zero or negative.

**Try later.** Use the same rule to wrap a position around a circular list, stepping backwards as well as forwards.
