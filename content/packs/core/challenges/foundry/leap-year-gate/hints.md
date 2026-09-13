Which rule decides `1900`, and which decides `2000`? Write the three rules as questions, in the order you would need to ask them. [py.control.conditionals]
---
When rules have exceptions, ask the most specific question first and return as soon as you know the answer. `and`, `or`, and `not` can also combine all three rules into a single condition. [py.control.conditionals]
---
Check `year % 400 == 0` first (leap), then `year % 100 == 0` (common), then `year % 4 == 0` (leap). Anything else is common.
---
```python
if year % 400 == 0:
    return True
if year % 100 == 0:
    return False
return year % 4 == 0
```
