# Floor and Remainder

The Off-By-One Goblin sorts the vault's coins into piles and argues about every negative coin.

Each line of input holds two integers, `a` and `b`. Print `q r`, where `q` is `a / b` rounded down (toward negative
infinity) and `r` is what remains, so that `a == q * b + r`. The remainder `r` is zero or has the same sign as `b`. If
`b` is `0`, print `undefined`. Skip blank lines.

```
input:  7 2
        -7 2
        7 0
output: 3 1
        -4 1
        undefined
```
