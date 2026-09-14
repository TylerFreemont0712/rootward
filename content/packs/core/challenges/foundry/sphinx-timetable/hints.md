Try your code on `45m` and on `15s30m`. What should each give, and what happens instead? [py.strings.split]
---
Tokenizing means walking through text and grouping characters into meaningful pieces. Here a piece is some digits followed by one unit letter. Keep the digits seen so far, and when a unit arrives, check that it comes after the previous unit in the order h, m, s. [py.strings.split]
---
Loop over the characters and collect digits into a string. On `h`, `m`, or `s`, fail if no digits were collected or the unit does not come after the last one; otherwise add the number times the unit's seconds and start over. Any other character fails. At the end, fail if digits are left over or no unit was seen at all.
---
```python
for char in text:
    if char.isdigit():
        digits += char
    elif char in UNITS and digits:
        position = ORDER.index(char)
        if position <= last_unit:
            return None
        total += int(digits) * UNITS[char]
        digits, last_unit = "", position
    else:
        return None
```
