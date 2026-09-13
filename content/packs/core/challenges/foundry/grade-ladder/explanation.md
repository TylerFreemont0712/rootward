**What it required.** A guard for anything that is not a score from 0 to 100, then thresholds checked from the top
down, with each boundary belonging to the higher grade.

**The pattern to remember.** When every check returns, the first true condition decides [py.control.conditionals].
Put guard clauses first so the rest of the function only sees valid data, then order the remaining checks so each one
can assume the ones before it failed. Python's chained comparison `0 <= score <= 100` reads like the rule it checks.

**Where it usually goes wrong.**
- Using `>` instead of `>=`, which makes `90` a `B` and `60` an `F`.
- Rounding `89.99` up before grading.
- Comparing an empty value with a number: Python raises `TypeError` for `None > 90`, and in JavaScript `null > 90` is
  quietly `false`, so `banana` becomes an `F`.

**Try later.** Add `+` and `-` grades, such as `B+` from 87 up to 90, without writing fifteen separate comparisons.
