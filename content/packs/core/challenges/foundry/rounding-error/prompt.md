# The Rounding Error

The Guild's till counts change in cents, and lately it keeps handing out one cent too many.

Each line of input holds two amounts, `price` and `paid`, each written with at most two decimal places (`0.29`, `5`,
`3.1`). Print the change in whole cents. If `paid` is less than `price`, print `short` followed by the missing cents.
Skip blank lines.

```
input:  0.29 1.00
        3.1 5
        2 1.5
output: 71
        190
        short 50
```
