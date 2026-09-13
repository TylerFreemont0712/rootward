# The Tally Wisp

The Guild's ledger has been read aloud so many times that the words have come loose. Count them.

Read all of standard input. Split it into words on whitespace. Normalize each word: lowercase it and strip these
characters from both ends: `.,!?;:"'()`. Discard words that become empty. Print one line per distinct word as
`word count`, sorted by count descending, then by word ascending.

```
input:  The cat and the hat. The end!
output: the 3
        and 1
        cat 1
        end 1
        hat 1
```

Empty input prints nothing.
