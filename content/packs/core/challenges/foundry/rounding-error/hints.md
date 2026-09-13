Print `0.29 * 100` in Python or JavaScript and look closely at the result. Is it `29`? [py.basics.values]
---
A float stores the nearest binary fraction to the decimal you typed, so `0.29 * 100` is `28.999999999999996`. `int()` and `Math.trunc()` cut toward zero and lose a cent; `round()` and `Math.round()` go to the nearest whole number. Once amounts are whole cents, integer arithmetic is exact. [py.basics.values]
---
Convert each amount to whole cents with rounding, subtract the two integers, and print the result, or `short` and the missing cents when the result is negative.
---
```python
def to_cents(amount):
    return round(float(amount) * 100)

change = to_cents(paid) - to_cents(price)
print(change if change >= 0 else f"short {-change}")
```
