Print what is left of `A man, a plan, a canal: Panama!` after cleaning it, before you compare anything. Is it only lowercase letters? [py.strings.basics]
---
Strings index from `0` to `len(s) - 1`, so position `i` mirrors position `len(s) - 1 - i`, not `len(s) - i`. Python's `s[::-1]` builds the reversed string; in JavaScript, `[...s].reverse().join("")` does. [py.strings.basics]
---
Lowercase the line and keep only the characters where `ch.isalnum()` is true (in JavaScript, remove `/[^a-z0-9]/g`). Compare the result with its reverse. Loop over the lines without inventing an empty one after the final newline.
---
```python
kept = "".join(ch for ch in line.lower() if ch.isalnum())
print("open" if kept == kept[::-1] else "shut")
```
