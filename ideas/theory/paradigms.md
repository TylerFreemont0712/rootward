# Programming paradigms

## The paradigms
- **Procedural / imperative**: sequences of statements mutating state; good for scripts and hot loops. Teaching: structured programming, avoiding goto-like control flow.
- **Object-oriented**: encapsulation, inheritance, polymorphism, composition. Message passing view (Smalltalk) vs class view (Java). Interfaces/protocols, duck typing, abstract base classes, mixins, dataclasses/records. Pitfalls: deep hierarchies, god objects, inheritance for code reuse (prefer composition).
- **Functional**: pure functions, immutability, first-class and higher-order functions, map/filter/reduce, closures, currying, partial application, recursion, algebraic data types, pattern matching, referential transparency, function composition and pipelines, lazy evaluation, monads as a pattern (Optional/Result/Promise) without the jargon. Pitfalls: performance of naive immutability, over-abstraction.
- **Declarative**: SQL, regex, HTML/CSS, build files, Terraform: describe *what*, not *how*. Teaching: constraint thinking, idempotency.
- **Reactive / event-driven**: callbacks, event loops, observables/streams, UI state as a function of data (React model), backpressure.
- **Data-oriented design**: layout data for the machine (arrays of components, ECS in games); relevant to the game engine itself.
- **Logic programming** (Prolog, Datalog): facts and rules; unification; useful for a single Puzzle set and the Assembly realm (access-control rules as Datalog).
- **Concurrent paradigms**: actors, CSP/channels, STM (see `concurrency-and-async.md`).

## Multi-paradigm reality
Python and JS are multi-paradigm; the skill is choosing per situation: FP for data transformation, OOP for stateful domain models with behavior, procedural for glue and scripts, declarative wherever a DSL exists.

## Concepts to make into nodes
`paradigm.oop.encapsulation`, `paradigm.oop.polymorphism`, `paradigm.oop.composition`, `paradigm.fp.pure-functions`,
`paradigm.fp.immutability`, `paradigm.fp.higher-order`, `paradigm.fp.adt-pattern-matching`, `paradigm.declarative.thinking`,
`paradigm.reactive.event-loop`, `paradigm.data-oriented.basics`.

## Misconceptions / error tags
- Mutating shared state inside a "pure" function (`impure-function`)
- Inheritance where composition fits (`inheritance-misuse`)
- God class / everything in one class (`god-object`)
- Using classes for what a function or dict does (`unnecessary-class`)
- Side effects in map/filter callbacks (`side-effect-in-map`)

## Challenge ideas
1. **Three Faces of Sum** — solve the same task procedurally, with OOP (an Accumulator class), and functionally (reduce); Reviewer grades idiom fit.
2. **Shape Shifter** — polymorphic `area()` across shapes; then the same with a tagged union + match; Teach-back: which is better when adding a new shape vs a new operation (the expression problem).
3. **Pipeline Pixie** — compose `parse | validate | transform | render` as functions; tests inject a failing stage.
4. **Immutable Inventory** — update nested state without mutation; tests check the original is untouched.
5. **Observer Owl** — implement an event emitter with subscribe/unsubscribe; then a tiny reactive `computed()`.
6. **Duck Typing Duel** — make three unrelated classes satisfy a protocol; Python `Protocol` / TS structural typing.
7. **Reduce Everything** — implement map, filter, flatMap using only reduce.
8. **Mixins and Traits** — logging mixin without diamond problems; Rust trait version on the Depths track.
9. **Datalog Door** — write rules to derive `can_open(user, door)` from facts (Puzzle format with a tiny evaluator).
10. **ECS Elemental** — turn a class-hierarchy of game entities into components + systems; tests check behavior equivalence.
