**What it required.** Rebuild each line word by word: small words stay lowercase in the middle, and every other word
gets one capital letter followed by lowercase.

**The pattern to remember.** Strings are immutable sequences: methods like `lower()` and slices like `word[1:]` return
new strings, and `" ".join(words)` puts the pieces back together [py.strings.basics]. Slices are forgiving where
indexing is not: `word[:1]` is `""` for an empty word, but `word[0]` raises an error in Python and is `undefined` in
JavaScript.

**Where it usually goes wrong.**
- `str.title()` turns `don't` into `Don'T` and capitalizes the small words too.
- Forgetting that the first and last words are always capitalized, even when they are small words.
- Crashing on an empty line, where splitting on a space gives one empty word.

**Try later.** Leave words that are already all capitals, such as `HTTP`, exactly as they are.
