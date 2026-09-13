Compare your output for `the lord OF the rings` with the expected line, word by word. Which words differ, and how? [py.strings.basics]
---
String methods return new strings: `lower()`, `upper()`, and slices like `word[1:]` never change `word` itself. `word[:1].upper() + word[1:].lower()` capitalizes one word and still works for an empty word, where `word[0]` fails. `str.title()` capitalizes the small words too, and even the letter after an apostrophe: `"don't".title()` is `"Don'T"`. [py.strings.basics]
---
Split the line on single spaces. Lowercase each word. If it is a small word and neither the first nor the last word, keep it that way; otherwise uppercase its first letter. Join the words back together with single spaces.
---
```python
lower = word.lower()
if lower in SMALL_WORDS and 0 < index < last:
    result.append(lower)
else:
    result.append(lower[:1].upper() + lower[1:])
```
