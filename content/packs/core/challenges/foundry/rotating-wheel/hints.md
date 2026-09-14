Rotate `a b c d` right by 6 on paper, one step at a time. After how many steps does the wheel look the same as at the start? [py.collections.list]
---
Rotating a list of length `n` by `n` changes nothing, so only `k % n` matters. In Python, `%` with a positive `n` always lands in `0` to `n - 1`, even for a negative `k`; in JavaScript `-1 % 4` is `-1`, so use `((k % n) + n) % n`. Slices do the rotation: the last `k` items, followed by the rest. [py.collections.list]
---
Handle a line with no items first. Reduce `k` with the modulo rule, cut the list at `n - k`, and put the part after the cut in front of the part before it.
---
```python
k %= len(items)
cut = len(items) - k
return items[cut:] + items[:cut]
```
