Print `"  spaced   out  ".split(" ")` in Python. How many of the pieces are words? [py.strings.split]
---
`str.split()` with no argument splits on any run of whitespace and never returns empty strings, and `" ".join(words)` puts words back together with single spaces. `reversed(words)` flips the order of a list, while `line[::-1]` flips the characters. In JavaScript, `line.split(/\s+/).filter(Boolean)` gives the words. [py.strings.split]
---
Split the line into words on whitespace, reverse the list of words, and join it with single spaces.
---
```python
print(" ".join(reversed(line.split())))
```
