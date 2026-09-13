Work out `-7 / 2` by hand: it is `-3.5`. Rounded down means toward negative infinity. Is that `-3` or `-4`? [py.basics.values]
---
`int(x)` and `Math.trunc(x)` round toward zero, while Python's `//` and JavaScript's `Math.floor()` round toward negative infinity. Python's `%` takes the sign of the divisor; JavaScript's `%` takes the sign of the dividend, so `-7 % 2` is `-1` there. [py.basics.values]
---
Check `b == 0` before dividing. Then take the floored quotient `q` and compute the remainder as `r = a - q * b`, which always satisfies `a == q * b + r`.
---
Python: `q, r = divmod(a, b)` does both at once. JavaScript: `const q = Math.floor(a / b);` then `const r = a - q * b;`.
