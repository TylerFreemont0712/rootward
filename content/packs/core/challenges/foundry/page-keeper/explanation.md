**What it required.** The arithmetic for one page of a list, counted from 1, plus every boundary where that arithmetic
stops making sense.

**The pattern to remember.** List the edge cases before writing code [concept.edge-cases]: empty input, the first and
last valid values, one past each end, zero, negative values, and a partly full last group. Then check each case by hand
against your formula.

**Where it usually goes wrong.**
- Counting pages from 0, which shifts every range by a whole page.
- Printing `21-30` for the last page instead of stopping at the total.
- Treating page 0, a negative page, or an empty catalog as if it were page 1.

**Try later.** Also print how many pages there are, and decide what a `per_page` of 0 should do.
