# Software design principles

The Reviewer's rubric and the Spire's curriculum come from here. Teach principles as heuristics with tensions,
not laws.

## Principles
- **SOLID**: Single responsibility (one reason to change), Open/closed (extend via new code), Liskov substitution (subtypes honor contracts), Interface segregation (small interfaces), Dependency inversion (depend on abstractions; inject).
- **DRY** vs **WET/AHA**: duplicate until the abstraction is obvious; the rule of three.
- **KISS**, **YAGNI**: do the simplest thing; do not build for imagined futures.
- **Separation of concerns** and **layering**: UI, domain, infrastructure; keep I/O at the edges (functional core, imperative shell).
- **High cohesion, low coupling**: measure by "what changes together".
- **Law of Demeter**: talk to friends, not strangers (`a.b().c().d()` smell).
- **Composition over inheritance**.
- **Encapsulation and information hiding**: expose intent, hide representation.
- **Explicit is better than implicit**; principle of least astonishment; fail fast; make illegal states unrepresentable (types).
- **Command-query separation**; idempotency; immutability by default.
- **Boundaries and contracts**: validate at the edges (zod here); parse, don't validate.
- **Naming**: intention-revealing names; consistent vocabulary (ubiquitous language); avoid encodings and abbreviations; functions named as verbs, predicates as questions.
- **Small functions, small files, small diffs**; one level of abstraction per function.
- **Comments**: explain why, not what; delete dead code; TODOs with owners.
- **Error handling as design**: which layer handles what; no swallowed errors.
- **Twelve-factor app** (config in env, stateless processes, logs as streams) for services.
- **Conway's law**, **technical debt** as a metaphor (and the Technical Debt Collector enemy).

## Code smells (refactoring targets; each can be a Ruins challenge)
Long method, long parameter list, primitive obsession, data clumps, feature envy, shotgun surgery, divergent change, switch on type, speculative generality, dead code, duplicated code, magic numbers, boolean parameters, temporal coupling, global mutable state, deep nesting, comments that lie.

## Reviewer rubric (0-10 each; used for the Elegance bonus)
1. Correctness beyond tests (obvious unhandled cases).
2. Readability (naming, structure, one idea per function).
3. Idiomatic use of the language.
4. Simplicity (no needless abstraction, no cleverness).
5. Error handling and edge-case awareness.
6. Complexity awareness (no hidden quadratic work).
Return three concrete, line-referenced comments; praise one thing that is genuinely good.

## Misconceptions / error tags
- Abstraction before the third use (`premature-abstraction`)
- Boolean flag parameters (`flag-argument`)
- Deep nesting (`arrow-code`)
- Magic numbers (`magic-number`)
- Mixed abstraction levels (`mixed-abstraction`)
- Swallowed exception (`swallowed-error`)

## Challenge ideas
1. **The Refactoring Ruins** — a 120-line function with five smells; tests are green; Reviewer rubric must reach 7 to win; each fixed smell deals damage (deterministic smell detectors: nesting depth, function length, magic numbers, duplicate blocks).
2. **Liskov's Lament** — a subclass that breaks a contract (Square extends Rectangle); tests fail on substitution; fix by redesign.
3. **Dependency Doorway** — make untestable code (calls `datetime.now()`, reads a file, hits the network) testable by injecting collaborators; the tests are the enemy's HP.
4. **Illegal States** — model an order lifecycle so invalid combinations cannot be constructed (TS discriminated unions / Python enums + dataclasses); tests try to construct invalid states and expect type/validation errors.
5. **Name the Things** — identifiers are `a, b, tmp, data2`; rename for a Reviewer score (this is the "Naming Things" enemy).
6. **Demeter's Chain** — refactor `order.customer.address.city.name` chains behind intention-revealing methods.
