# Design patterns

Patterns are named solutions to recurring design problems. Teach each with: the problem, the shape, a minimal
example, a "when not to" (the most important part), and how modern languages often replace the pattern with a
language feature (first-class functions replace Strategy/Command; generators replace Iterator; etc.).

## Creational
- **Factory function / Factory method**: hide construction; choose subclass by input. Not-to: when a plain constructor suffices.
- **Builder**: step-by-step construction of complex objects; fluent APIs. Not-to: keyword args exist.
- **Singleton**: one instance; usually replaced by a module-level instance or DI. Teach why it hurts testing.
- **Prototype**: clone existing objects; JS prototypes literally.
- **Dependency injection**: pass collaborators in; the key to testable code (Oracle class cares).
- **Object pool**: reuse expensive objects (connections, buffers).

## Structural
- **Adapter**: make one interface look like another (wrapping a third-party client).
- **Decorator / wrapper**: add behavior around an object; Python decorators, middleware.
- **Facade**: simple front over a complex subsystem.
- **Proxy**: control access (lazy loading, caching, permissions).
- **Composite**: tree of parts treated uniformly (UI trees, file systems, expression trees).
- **Flyweight**: share immutable state (interned strings, tile data).
- **Bridge**: separate abstraction from implementation (Renderer interface in this game).

## Behavioral
- **Strategy**: swappable algorithm; in Python/JS just pass a function.
- **Command**: actions as objects; undo/redo; the game's event log is this.
- **Observer / pub-sub**: event emitters, signals; beware leaks (unsubscribe).
- **Iterator / generator**: lazy sequences.
- **State machine**: explicit states and transitions; the run/room lifecycle in this game.
- **Template method**: skeleton with overridable steps; often replaced by composition.
- **Chain of responsibility**: middleware pipelines, handlers.
- **Visitor**: operations over an object structure (AST walking); double dispatch; compare with pattern matching.
- **Mediator**: central coordinator to reduce coupling.
- **Memento**: snapshot and restore (Git Stash artifact, Snapshot ability).
- **Interpreter**: evaluate a small language (see `compilers-and-languages.md`).
- **Null object**: avoid null checks with a do-nothing implementation.

## Architectural and modern patterns
- MVC/MVP/MVVM; unidirectional data flow (Flux/Redux); hexagonal / ports and adapters; clean architecture layers; repository pattern; unit of work; CQRS; event sourcing (used here); plugin architecture (used here); pipes and filters; saga (distributed transactions); circuit breaker, retry with backoff, bulkhead (resilience); cache-aside, write-through.
- Anti-patterns: god object, spaghetti, lava flow, golden hammer, premature abstraction, anemic domain model (debated), shotgun surgery, feature envy.

## Misconceptions / error tags
- Pattern for its own sake (`pattern-overuse`)
- Observer leak (`missing-unsubscribe`)
- Singleton hiding global state (`hidden-global`)
- Deep inheritance where Strategy/composition fits (`inheritance-misuse`)

## Challenge ideas (Spire, difficulty 4-8)
1. **Strategy Sprite** — pluggable pricing strategies; then the same with plain functions; Reviewer compares.
2. **Undo Undine** — implement Command with undo/redo for a text buffer; hidden tests replay random sequences.
3. **Middleware Mummy** — a chain of request handlers (auth, logging, rate limit) with next(); order matters in tests.
4. **Adapter Ant** — make two payment gateway fakes conform to one interface; tests run the same suite through both.
5. **Composite Coral** — a file-system tree with size totals and glob search.
6. **State Machine Sentinel** — traffic light / order lifecycle with illegal-transition errors; tests enumerate transitions.
7. **Observer Owl II** — a tiny reactive store with computed values and unsubscribe; leak test counts listeners.
8. **Circuit Breaker Crab** — wraps a flaky function; tests use a fake clock and a scripted failure sequence.
9. **Repository Raven** — in-memory and SQLite implementations behind one interface; the same contract test suite runs against both.
10. **Visitor Viper** — evaluate and pretty-print an expression tree using Visitor, then with match; Teach-back on the trade-off.
11. **Plugin Portal** — a registry that discovers plugins from a folder and validates their manifest (mirrors this game's content packs).

## References
- GoF; "Head First Design Patterns"; refactoring.guru; "Patterns of Enterprise Application Architecture"; Python Patterns (Brandon Rhodes).
