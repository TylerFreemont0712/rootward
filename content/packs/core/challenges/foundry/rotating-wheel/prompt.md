# The Rotating Wheel

The Guild's prize wheel sticks, and the Off-By-One Goblin keeps giving it one turn too many.

Each line of input holds an integer `k` followed by zero or more items. Rotate the items right by `k` places and print
them separated by single spaces: rotating `a b c d` right by 1 gives `d a b c`. A negative `k` rotates left, and `k` may
be larger than the number of items. A line with `k` but no items prints an empty line. Skip blank lines.

```
input:  1 a b c d
        -1 a b c d
        6 a b c d
output: d a b c
        b c d a
        c d a b
```
