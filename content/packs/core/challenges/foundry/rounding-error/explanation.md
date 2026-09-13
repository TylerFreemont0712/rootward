**What it required.** Count money in whole cents: convert each amount with rounding, subtract integers, and report a
negative result as a short payment.

**The pattern to remember.** Money is counted, not measured. Floats (`float` in Python, `number` in JavaScript) hold
the nearest binary fraction to a decimal, so `0.29 * 100` is `28.999999999999996` [py.basics.values]. Convert to an
integer number of cents as early as possible, rounding rather than truncating, and do the arithmetic on integers.

**Where it usually goes wrong.**
- `int(x * 100)` or `Math.trunc(x * 100)` cuts `28.999999999999996` down to `28`.
- Subtracting the float amounts first and truncating afterwards: `(1.00 - 1.13) * 100` is `-12.99999999999999`, which
  truncates to `-12`.
- Printing a negative number instead of `short` and the missing amount.

**Try later.** Parse the amounts as text (split on the dot and pad the cents to two digits) so no float is involved at
all.
