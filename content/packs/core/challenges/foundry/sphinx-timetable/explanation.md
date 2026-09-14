**What it required.** Read a duration piece by piece (digits, then a unit), with the units in order and each used at
most once, and reject everything else.

**The pattern to remember.** Tokenize before you compute [py.strings.split]. Walk the characters, group them into
tokens (a number and its unit), and check each token against the rules as soon as it is complete. Splitting on a fixed
letter only works when every part is always there.

**Where it usually goes wrong.**
- `text.split("h")` assumes there is an `h`, so `45m` breaks.
- Accepting a number with no unit (`90`) or a unit with no number (`hm`).
- Treating an empty line as zero seconds instead of as no duration at all.

**Try later.** Print each total back in normalized form, so that `90m` becomes `1h30m`.
