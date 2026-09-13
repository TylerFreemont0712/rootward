# The Leap Year Gate

The calendar gate counts the days before it lets anyone through, and the Off-By-One Goblin insists that every fourth
year is special, no exceptions.

Each line of input holds a year, a whole number that may be `0` or negative. Print `leap` for a leap year and `common`
otherwise. A year is a leap year when it is divisible by 4, except for years divisible by 100, which are leap years
only when they are also divisible by 400. Skip blank lines.

```
input:  2024
        2023
        1900
        2000
output: leap
        common
        common
        leap
```
