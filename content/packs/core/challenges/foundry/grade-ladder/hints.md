Trace your `if` checks for exactly `90`, and then for `banana`. Which line runs each time? [py.control.conditionals]
---
When every check `return`s, the first true condition wins, so the order of the checks is part of the logic. A guard clause deals with bad input first and returns early. `>=` includes the boundary; `>` does not. [py.control.conditionals]
---
Start `grade` with a guard: if the parsed score is `None` (`null` in JavaScript) or it is below 0 or above 100, return `invalid`. Then check `score >= 90`, `>= 80`, `>= 70`, and `>= 60` in that order, and return `F` when none of them match.
---
```python
if score is None or not 0 <= score <= 100:
    return "invalid"
if score >= 90:
    return "A"
if score >= 80:
    return "B"
```
