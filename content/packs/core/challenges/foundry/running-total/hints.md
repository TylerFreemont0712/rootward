Feed the program `1`, `2`, `3` in your head. What does it print on the second line, and what should it print? [py.basics.variables]
---
`total = int(line)` binds `total` to the new number and forgets the old one. `total = total + int(line)` (or `total += int(line)`) builds the new value from the old one. A second variable can remember the largest total so far. [py.basics.variables]
---
Before the loop, set `total = 0` and `best = None` (`null` in JavaScript), meaning "no total yet". For each number, add it to `total`, print `total`, and if `best` is still empty or `total > best`, set `best = total`. After the loop, print the `max` line only if `best` is not empty.
---
```python
total += int(line)
print(total)
if best is None or total > best:
    best = total
```
