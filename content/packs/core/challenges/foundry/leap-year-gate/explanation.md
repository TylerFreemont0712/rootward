**What it required.** Three divisibility rules applied in the right order: every 400th year is a leap year, other
centuries are common, and other years divisible by 4 are leap years.

**The pattern to remember.** When rules have exceptions, test the most specific case first and return early
[py.control.conditionals]. The same rules also fit a single condition:
`year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)`.

**Where it usually goes wrong.**
- Checking `% 4` first and returning, so the century rules never run.
- Joining the exceptions with `and` where `or` belongs, which makes 2000 a common year.
- Assuming years are positive: the rules hold for 0 and negative years too (in JavaScript `-4 % 4` is `-0`, which
  still equals `0`).

**Try later.** Print how many days a given month has in a given year.
