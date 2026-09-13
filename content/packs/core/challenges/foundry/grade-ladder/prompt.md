# The Grade Ladder

The Type Mimic has slipped fake scores onto the Guild's exam sheets. Grade the real ones and unmask the rest.

Each line of input holds a score. Print its grade:

- `A` from 90 to 100
- `B` from 80 up to, but not including, 90
- `C` from 70 up to 80, `D` from 60 up to 70, and `F` from 0 up to 60

Scores can have decimals and are never rounded, so `89.99` is a `B`. Print `invalid` for anything that is not a number
from 0 to 100. Skip blank lines. The starter code already turns text into a number, or into `None` (`null` in
JavaScript) when the text is not a number.

```
input:  95
        89.99
        banana
output: A
        B
        invalid
```
