# The Mirror Gate

The gate opens only for phrases that read the same in both directions, and the Off-By-One Goblin always miscounts the
middle.

For each line of input, keep only its letters and digits, in lowercase. Print `open` if what is left reads the same
forwards and backwards, and `shut` otherwise. A line with no letters or digits is `open`. The input is ASCII and ends
with a newline: there is no extra line after the last one.

```
input:  Racecar
        Guild hall
        A man, a plan, a canal: Panama!
output: open
        shut
        open
```
