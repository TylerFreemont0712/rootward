Print just the step number on each line for `n = 4`. Which numbers does your loop produce, and which do you need? [py.control.loops]
---
`range(a, b)` counts from `a` up to, but not including, `b`, so `range(1, n + 1)` gives 1 to `n`. In JavaScript, `for (let i = 1; i <= n; i++)` does the same. `str.rjust(width)` (or `padStart(width)` in JavaScript) adds spaces on the left. [py.control.loops]
---
Loop the step count from 1 to `n` inclusive. On each line, build `step` copies of `#` and pad them on the left to a width of `n`.
---
```python
for step in range(1, n + 1):
    print(("#" * step).rjust(n))
```
