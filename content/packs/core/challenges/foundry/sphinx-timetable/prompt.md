# The Sphinx's Timetable

The Regex Sphinx guards the Guild's timetable and lets through only durations written exactly right.

Each line of input holds a duration of up to three parts, always in this order: hours, minutes, seconds. Each part is a
whole number followed by its unit (`h`, `m`, or `s`) with nothing in between, as in `1h30m15s`, `45m`, or `2h5s`. Print
the total number of seconds. Print `invalid` for anything else: an empty line, parts out of order or repeated, a number
without a unit, or a unit without a number. Spaces at the start and end of a line are ignored. The input is ASCII.

```
input:  1h30m15s
        2h5s
        15s30m
output: 5415
        7205
        invalid
```
