Walk through `a a b b b c` by hand. After each item, how long is the current run? [py.control.loops]
---
A loop can carry state from one item to the next: the previous item and the length of the current run. The run starts again at 1 when the item changes. `>` keeps the first of two equal runs, while `>=` would replace it with the later one. [py.control.loops]
---
Keep `previous`, `run_length`, `best_length`, and `best_item`. For each item, add 1 to `run_length` if it equals `previous`, otherwise set it to 1. Remember the item, then update the best when `run_length` is strictly greater.
---
```python
run_length = run_length + 1 if item == previous else 1
previous = item
if run_length > best_length:
    best_length, best_item = run_length, item
```
