**What it required.** Clean each line (lowercase, letters and digits only), then compare it with its reverse.

**The pattern to remember.** A string is a sequence indexed from `0` to `len(s) - 1` [py.strings.basics]. Pairing
`s[i]` with `s[len(s) - 1 - i]` walks inward from both ends, and Python's `s[::-1]` or JavaScript's
`[...s].reverse().join("")` builds the reversed string. Clean the data first, compare second.

**Where it usually goes wrong.**
- `s[len(s) - i]` is one past the end when `i` is `0`: the Goblin's favourite mistake.
- Comparing before removing spaces and punctuation, so `A man, a plan` never opens.
- In JavaScript, `input.split("\n")` returns an empty string after the final newline, which prints one extra `open`.

**Try later.** Print the longest mirrored stretch inside each line instead of just open or shut.
