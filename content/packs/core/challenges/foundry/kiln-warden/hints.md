Run the starter on the example above. Which metal's score comes out wrong, and why? [py.collections.dict]
---
A plain `scores[metal] = delta` assignment replaces the running total instead of adding to it. And `tally` prints
instead of returning, so `main`'s loop over the result fails — the same trap as any other function that reaches its
end without `return`. [py.functions.define]
---
Track each metal's total with `scores[metal] = scores.get(metal, 0) + delta` (Python) or
`scores.set(metal, (scores.get(metal) ?? 0) + delta)` (JavaScript), where `delta` is `1` for `temper` and `-1` for
`crack`. Then `return scores` instead of printing it.
---
```python
def tally(lines: list[str]) -> dict[str, int]:
    scores: dict[str, int] = {}
    for line in lines:
        metal, verdict = line.split()
        delta = 1 if verdict == "temper" else -1
        scores[metal] = scores.get(metal, 0) + delta
    return scores
```
