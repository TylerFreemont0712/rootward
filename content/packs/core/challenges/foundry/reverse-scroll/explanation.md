**What it required.** Split each line into words on any whitespace, reverse the order of the words, and join them
with single spaces.

**The pattern to remember.** Split, transform, join [py.strings.split]. `split()` with no argument (or
`split(/\s+/)` plus dropping empty strings in JavaScript) turns messy spacing into a clean list of words, and
`" ".join(...)` decides the spacing on the way out.

**Where it usually goes wrong.**
- Reversing the characters (`line[::-1]`) instead of the words.
- Splitting on a single space, which leaves an empty word for every extra space.
- In JavaScript, `input.split("\n")` returns an empty string after the final newline, which prints an extra empty
  line.

**Try later.** Reverse the letters inside each word but keep the words in their original order.
