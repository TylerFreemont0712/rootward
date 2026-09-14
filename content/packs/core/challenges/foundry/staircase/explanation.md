**What it required.** A loop that runs exactly `n` times with its counter going from 1 to `n`, and lines padded on the
left to one fixed width.

**The pattern to remember.** `range(start, stop)` never includes `stop` [py.control.loops]. When a loop has to reach
`n`, count from `1` to `n + 1`, or use the counter plus one. Padding (`rjust` in Python, `padStart` in JavaScript)
aligns text without counting spaces by hand.

**Where it usually goes wrong.**
- `range(n)` starts at 0, which prints an empty first line and stops one step short: the Goblin's staircase.
- Building the spaces by hand with a count that is off by one, which tilts every line.
- Putting the spaces after the `#` characters instead of before them.

**Try later.** Print a pyramid that is centered instead of leaning right.
