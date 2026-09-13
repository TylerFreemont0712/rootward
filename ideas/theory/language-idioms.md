# Language idioms and gotchas

Use for hint ladders, Reviewer prompts, and the "idiomatic" rubric axis. Each language: idioms to teach, traps,
tooling, and what its track adds beyond the shared concepts.

## Python
- Idioms: comprehensions, `enumerate`/`zip`, unpacking, `dict.get`/`setdefault`/`defaultdict`/`Counter`, context managers, generators, `with open`, f-strings, `dataclasses`, `pathlib`, `typing`, `match`, `itertools`/`functools` (`lru_cache`, `partial`), `sorted(key=)`, truthiness, EAFP vs LBYL, `__repr__`, `if __name__ == "__main__"`.
- Traps: mutable default args, late-binding closures, `is` vs `==`, integer division `/` vs `//`, modifying list while iterating, shallow copies, `global`, exceptions as control flow cost, `sort` vs `sorted`, string immutability, `range` end exclusive, `round` banker's rounding, mutable class attributes, circular imports, `except Exception: pass`.
- Tooling: `venv`/`uv`, `pip`, `pytest`, `ruff`/`black`, `mypy`/`pyright`, `pdb`, `python -m`.

## JavaScript / TypeScript
- Idioms: `const` by default, arrow functions, destructuring, spread/rest, optional chaining, nullish coalescing, template literals, array methods (`map/filter/reduce/find/some/every/flatMap`), `Map`/`Set`, `async/await`, `Promise.all`, modules (ESM), classes and private fields, `Object.entries`, `structuredClone`, `Intl`.
- TS: strict mode, unions and narrowing, `unknown` over `any`, generics, `satisfies`, discriminated unions, `readonly`, utility types (`Partial`, `Pick`, `Record`), type guards, `never` exhaustiveness, `as const`, zod at boundaries.
- Traps: `==` coercion, `this` binding, `var` hoisting, floating point ints > 2^53, `typeof null`, array holes, `sort` default lexicographic, `Array.shift` O(n), mutating props, forgetting `await`, unhandled rejections, closures in loops with `var`, `for...in` on arrays, NaN comparisons, `parseInt` radix, date handling (use Temporal/date-fns), event loop ordering.
- Tooling: Node 22, pnpm, `tsc`, ESLint, Prettier, vitest, `node --inspect`, `npx`.

## Go
- Idioms: `(value, err)` returns, early return, small interfaces, composition via embedding, `defer`, goroutines + channels + `select`, `context`, table-driven tests, `gofmt`, packages and exported names, slices vs arrays, maps, `struct` methods with pointer receivers.
- Traps: nil slices vs empty, slice aliasing/append surprises, loop variable capture (pre-1.22), unbuffered channel deadlocks, ignoring errors, `interface{}` overuse, goroutine leaks, map iteration order, shadowing with `:=`.

## Rust
- Idioms: ownership/borrowing, `Option`/`Result` + `?`, iterators and adapters, `match`, enums with data, traits and generics, `impl` blocks, `Vec`/`HashMap`, `String` vs `&str`, `derive`, modules, `cargo test`, clippy.
- Traps: fighting the borrow checker (restructure instead of clone), lifetimes in structs, `unwrap` in library code, integer overflow in debug vs release, `&&str`, string indexing by bytes, `Rc<RefCell>` overuse.

## C
- Idioms: clear ownership conventions, `const` correctness, header guards, `size_t`, checking return values, `static` for file scope, `enum` for constants, `-Wall -Wextra -Werror`, sanitizers.
- Traps: buffer overflows, off-by-one in `malloc` sizes, uninitialized memory, dangling pointers, undefined behavior (signed overflow, strict aliasing), `strcpy`/`gets`, integer promotion, macro pitfalls, forgetting `free`.

## Bash
- Idioms: `set -euo pipefail`, quote everything, `[[ ]]`, functions, `local`, `$(...)`, arrays, `trap`, `mktemp`, `getopts`, `shellcheck`, `printf` over `echo`.
- Traps: word splitting, globbing surprises, `for f in $(ls)`, `cd` without check, `rm -rf "$DIR/"` with unset var, `pipefail` interplay, subshell variable loss (`while read` in pipe), `sudo` with redirection, non-portable `sed -i`.

## SQL
- Idioms: explicit column lists, CTEs for readability, window functions over self-joins, `EXISTS` over `IN` with subqueries, keyset pagination, parameterized queries, `EXPLAIN` habit, migrations reviewed.
- Traps: NULL logic, join fan-out, `SELECT *`, implicit type conversion killing indexes, functions on indexed columns in WHERE, `OFFSET` at scale, timezone-naive timestamps, float money.

## Cross-language "translation" exercises (great for transfer)
- Same challenge in two languages; Reviewer compares idiom usage.
- "Port this Python to TypeScript preserving behavior" with the original's tests translated.
- Puzzle: "Which language is this idiomatic in?"; "Spot the non-idiom".
