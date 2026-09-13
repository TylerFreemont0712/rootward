# Programming fundamentals (Foundry realm)

The tier-0/1 curriculum. Everything here should exist for Python and JavaScript first, with shared conceptual
nodes above the language-specific ones so mastery transfers.

## Concept list (each is a skill-graph node candidate)
- **Values and types**: numbers (int vs float, integer division, floating point error), strings, booleans, null/None/undefined, truthiness rules per language.
- **Variables and binding**: assignment vs equality, rebinding vs mutation, naming, constants, shadowing.
- **Expressions and operators**: precedence, short-circuit evaluation, comparison chains, integer overflow (JS numbers vs BigInt), string concatenation vs formatting.
- **Control flow**: if/elif/else, match/switch, loops (for-each, index loops, while), break/continue, early return, guard clauses.
- **Functions**: parameters vs arguments, defaults, keyword args, variadics, return values, pure vs impure, first-class functions, closures, recursion basics.
- **Scope and lifetime**: local/global/enclosing, block scope (`let`/`const` vs `var`), the `global`/`nonlocal` keywords, closures capturing variables (the loop-variable trap).
- **Collections**: list/array, tuple, dict/object/Map, set; indexing, slicing, iteration, membership, nested structures, copying (shallow vs deep), mutability and aliasing.
- **Strings**: immutability, indexing, slicing, common methods (split/join/strip/replace/find), formatting (f-strings, template literals), Unicode basics (code points vs bytes), escaping.
- **Iteration patterns**: accumulate, filter, map, find, count, group-by, zip, enumerate, sliding pairs; comprehensions and generator expressions; iterator protocol.
- **Errors**: exceptions vs error values, try/except/finally, raising with context, custom exception types, when not to catch.
- **Input/output**: stdin/stdout, files (read/write/append, context managers), paths, encoding, JSON and CSV.
- **Modules and packages**: import mechanics, `__name__ == "__main__"`, ESM import/export, package layout, virtual environments / `node_modules`.
- **Basic OOP**: classes, instances, attributes, methods, `__init__`/constructors, `self`/`this`, dunder methods (`__repr__`, `__eq__`, `__len__`), class vs instance attributes.
- **Basic testing**: assert, writing a first test with pytest / node:test, arrange-act-assert.
- **Reading errors**: parsing a traceback / stack trace, off-by-one, NameError/ReferenceError, TypeError, KeyError/undefined property.
- **Tooling**: REPL, running scripts, formatters (black/prettier), linters, package managers.

## Common misconceptions (map to error tags in `game-content/error-tag-taxonomy.md`)
- `=` means "is equal to" -> `assignment-vs-equality`
- Mutating a list while iterating over it -> `mutating-while-iterating`
- Aliasing: `b = a` copies the list -> `aliasing`
- Off-by-one in ranges and slices (`range(n)` excludes n) -> `off-by-one`
- Integer division and float rounding surprises -> `numeric-precision`
- `0.1 + 0.2 != 0.3` -> `float-equality`
- Default mutable argument in Python -> `mutable-default`
- `var` hoisting and closures in loops in JS -> `closure-capture`
- Strings are immutable: `s[0] = 'x'` -> `string-immutability`
- Returning vs printing -> `print-vs-return`
- Comparing with `is` instead of `==` -> `identity-vs-equality`
- Not handling empty input -> `empty-input`
- `==` vs `===` in JS -> `loose-equality`
- Forgetting `await` / treating a promise as a value -> `missing-await`

## Challenge ideas (Foundry, difficulty 1-4)
1. **Tally Wisp** — word frequency count (dict basics). Variants: case-insensitive, ignore punctuation, top-k.
2. **FizzBuzz Golem** — with the Constraint Curse "no `if`" (use a lookup) on the Elite version.
3. **Palindrome Mirror** — is a string a palindrome? Variants: ignore non-alphanumerics; longest palindromic substring (Grove).
4. **Slice Serpent** — implement `chunk(list, n)`, `window(list, k)`, `flatten(nested)`.
5. **Caesar's Cipher Gate** — rotate letters; variant: decrypt with unknown shift via letter frequency.
6. **The Ledger** — parse CSV lines of transactions, compute balance per account; handle malformed rows.
7. **Guard Clause Gate** — refactor a nested if-pyramid into guard clauses (Reviewer-graded + tests).
8. **Anagram Twins** — group anagrams (sorted key or char count).
9. **Roman Numeral Golem** — to and from roman numerals.
10. **Temperature Oracle** — unit conversion with rounding rules (float pitfalls).
11. **Inventory Keeper** — merge two dicts of item counts; nested defaultdict.
12. **Bracket Balancer** — stack-based matcher (bridges to Grove).
13. **Run-Length Wraith** — encode/decode RLE.
14. **Two Sum Sprites** — first brute force, then dict; efficiency band teaches the difference.
15. **The Config Reader** — read a key=value file with comments and blanks; produce a dict; raise on duplicates.
16. **Date Drake** — validate dates without libraries (leap years); variant: day of week (Zeller).
17. **Matrix Mimic** — transpose, rotate 90 degrees, spiral order.
18. **Generator Glowworm** — write `fibonacci()` as a generator; take first n; infinite iterator protocol.
19. **Exception Exorcism** — given code that swallows errors, make it raise the right exception types with messages (tests assert on exception type and message).
20. **Closure Counter** — make_counter() closures; explain why each counter is independent (Teach-back).
21. **JSON Juggler** — deep-get by path `a.b[2].c` with defaults.
22. **String Builder Bat** — efficient string building (join vs += in a loop) with an efficiency band.
23. **Log Line Lurker** — parse `[LEVEL] timestamp message` lines; count per level; find the first ERROR after a WARN.
24. **The Deduplicator** — dedupe preserving order (set + list), then dedupe by key.
25. **Recursive Rat** — sum a nested list of arbitrary depth (first recursion).

## References
- Python docs tutorial; "Automate the Boring Stuff"; MDN JavaScript Guide; Exercism Python/JS concept lists.
