# Type systems

## Concepts
- Static vs dynamic typing; strong vs weak; gradual typing (Python type hints + mypy/pyright, TypeScript over JS).
- Type inference; annotations as documentation and as tests that run at compile time.
- Primitive vs reference types; value semantics vs reference semantics; boxing.
- Nullability: `Optional[T]`, `T | null`, strict null checks; the billion-dollar mistake; `Maybe`/`Option`.
- Generics/parametric polymorphism: `List[T]`, `Map<K,V>`, generic functions, constraints (`T extends`), variance (covariant/contravariant/invariant: why `List[Dog]` is not `List[Animal]`).
- Structural vs nominal typing: TS interfaces and Python `Protocol` are structural; classes in Java are nominal; duck typing at runtime.
- Union and intersection types; discriminated (tagged) unions; exhaustiveness checking with `never`/`assert_never`; pattern matching (Python 3.10 `match`, Rust `match`).
- Algebraic data types: product (records/tuples) and sum (enums with payloads); modelling state machines with ADTs.
- Type narrowing and guards; user-defined type guards in TS; `isinstance` and `TypeGuard` in Python.
- Literal types, enums, branded/opaque types (UserId vs string) to prevent mixing.
- Immutability in types: `readonly`, `Final`, frozen dataclasses.
- Function types, callbacks, overloads; higher-kinded types (mention only).
- Runtime validation vs static types: zod/pydantic bridge the gap at boundaries ("parse, don't validate").
- Rust ownership and borrowing as a type-system feature (see `low-level-systems.md`); lifetimes.
- Type-level pitfalls: `any` escape hatch, unsound casts, `as` abuse, `# type: ignore` sprawl.

## Misconceptions / error tags
- `any` to silence errors (`any-escape`)
- Non-exhaustive switch on a union (`non-exhaustive-match`)
- Optional not handled (`unchecked-null`)
- Stringly-typed ids (`stringly-typed`)
- Confusing `interface` structural matching with class identity (`nominal-assumption`)

## Challenge ideas (TS and Python tracks)
1. **Exhaustive Enum** — add a new variant to a union; tests compile-check (via `tsc --noEmit` in the runner) that every switch is exhaustive.
2. **Branded Basilisk** — make `UserId` and `OrderId` non-interchangeable; tests include a "should not compile" case (the runner supports expected type errors).
3. **Parse Don't Validate** — write a zod/pydantic schema for a config; hidden tests feed malformed JSON; the parsed type must be narrow.
4. **Generic Golem** — implement `groupBy<T, K>` with correct generic signature; tests check inference.
5. **Optional Ogre** — refactor null-check-heavy code into Option-style chaining; hidden tests include null at every level.
6. **Variance Vulture** (Puzzle) — which assignments are legal? Multiple choice with explanations.
7. **Protocol Phantom** — Python `Protocol` making three classes satisfy `Drawable`; mypy runs as a hidden test.
8. **State ADT** — model a connection state machine as a tagged union; illegal transitions are type errors.
