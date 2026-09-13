Start with the shape: read everything, split, count, sort, print. Which step do the failing tests point at? [py.collections.dict]
---
`str.split()` with no argument splits on any whitespace and drops empties. `str.strip(chars)` removes characters from both ends only. A dict (or `collections.Counter`) maps each word to a count. [py.strings.split]
---
Plan: `words = text.split()`; for each word, `w = word.lower().strip('.,!?;:"\'()')`; skip if empty; `counts[w] = counts.get(w, 0) + 1`. Then `sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))` and print.
---
The sort key must be a tuple: negative count first (so higher counts come first), then the word. `sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))`. Printing: `print(f"{w} {c}")`.
