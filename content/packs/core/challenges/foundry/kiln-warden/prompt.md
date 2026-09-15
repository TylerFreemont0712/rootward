# The Kiln Warden

The Kiln Warden tests every ingot that leaves the foundry's forge, calling out a verdict for each one: `temper` when
a batch holds, `crack` when it fails. Each line of input names a metal and its verdict, such as `iron temper` or
`steel crack`.

Define `tally(lines)` that returns a dict (JavaScript: a `Map`) mapping each metal to its net score across every
line that named it: `temper` adds one, `crack` subtracts one. A metal keeps the order it was first named in. The
starter's `main` already reads the input and prints one line per metal, in that order, as `<metal>: <score>`. Skip
blank lines.

```
input:  iron temper
        steel crack
        iron temper
        steel crack
        mythril temper
output: iron: 2
        steel: -2
        mythril: 1
```
