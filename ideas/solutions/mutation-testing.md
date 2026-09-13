# Mutation testing (the Oracle's combat system)

## Concept
Mutate the program under test with small changes (mutants). Run the tests. A mutant that makes a test fail is
"killed". Survivors reveal untested behavior. Mutation score = killed / (total - equivalent).

## Operators (start small)
Relational (`<` -> `<=`, `==` -> `!=`), arithmetic (`+` -> `-`, `*` -> `/`), boolean (`and` <-> `or`, negate
condition), constants (`0` -> `1`, `"a"` -> `""`), boundary (`n` -> `n-1`), return values (`return x` -> `return
None`), statement deletion, swap arguments, remove a loop iteration (`break` insertion). Add language-specific ones
later (Python: `is` <-> `==`; JS: `===` -> `==`; SQL: `INNER` -> `LEFT`).

## Implementation phases
1. **Hand-written mutants** (M5 v1): challenge folder `mutants/<id>.diff` or full files; deterministic, curated, no equivalent mutants. The enemy's HP = number of mutants. This alone makes the Oracle playable.
2. **Regex/token operators** on the reference solution for extra mutants; validate each mutant compiles and differs in behavior on at least one reference test (otherwise discard as likely equivalent).
3. **AST-based mutation**: Python via `ast` + `ast.unparse`; JS/TS via `ts-morph` or Babel; pick nodes by seed.
4. Use existing tools as references: `mutmut`, `cosmic-ray` (Python), `Stryker` (JS/TS). Running them in the container is possible but slow; the in-house runner is simpler for the game's needs.

## Running
For each mutant: copy job dir, apply mutant, run the player's tests with a short timeout (timeout = killed). Run in
parallel up to the sandbox concurrency limit. Report per mutant: killed/survived + which test killed it (for
Mutant Bane's reveal ability).

## Scoring in combat
- Each killed mutant deals damage; survivors are the enemy's remaining HP; tests that fail on the *reference* heal the enemy (your test is wrong).
- Elite: mutants are hidden until killed; the Coverage ability shows which lines have surviving mutants.
- Efficiency band: number of tests (fewer, sharper tests are better) and total test runtime.

## Pitfalls
Equivalent mutants (curate; allow challenge authors to mark), flaky tests, tests that depend on execution order, mutants in unreachable code (discard by coverage), long-running mutants (timeouts count as killed but flag them).
