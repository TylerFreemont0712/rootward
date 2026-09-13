**What it required.** Two variables that change as input arrives: the running total, and the largest total seen so
far.

**The pattern to remember.** A variable is a name bound to a value. `total = total + n` rebinds `total` to a new value
built from its old one [py.basics.variables]. When there may be no value yet, start from a marker that means "nothing
yet" (`None` in Python, `null` in JavaScript) instead of a number that could be a real answer.

**Where it usually goes wrong.**
- `total = n` replaces the total instead of adding to it.
- Starting `best` at `0` prints `max 0` when every total is negative.
- Printing a `max` line when the input has no numbers.

**Try later.** Also print the smallest total, and the line on which the largest total was reached.
