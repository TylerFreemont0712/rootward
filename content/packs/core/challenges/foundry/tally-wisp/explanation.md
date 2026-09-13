**What it required.** Count every normalized word, then print the counts sorted by count (highest first) and by
word (alphabetical) when counts tie.

**The pattern to remember.** Counting is a map from key to running total: `counts[w] = counts.get(w, 0) + 1` in
Python, `counts.set(w, (counts.get(w) ?? 0) + 1)` in JavaScript [py.collections.dict]. Sorting by two keys means one
compound key: negate the number you want descending and keep the text ascending.

**Where it usually goes wrong.**
- Splitting on a single space (`split(" ")`) keeps empty strings when words are separated by several spaces, tabs,
  or newlines. Split on any whitespace instead [py.strings.split].
- Removing punctuation everywhere (`replace`) instead of only at the ends turns `don't` into `dont`.
- Sorting by count alone leaves ties in insertion order, which is exactly what "breaks ties alphabetically" catches.

**Try later.** Print only the three most common words, and decide what should happen when the third place is a tie.
