# Testing

The Oracle class fights with tests; every other class is graded by them. This file is both curriculum and a guide
for authoring the game's own tests.

## Kinds of tests
- **Unit**: one unit, fast, isolated; arrange-act-assert; one behavior per test; naming as sentences.
- **Integration**: components together (DB, filesystem, HTTP) with real or containerized dependencies.
- **End-to-end**: through the UI or CLI; few, slow, valuable.
- **Contract**: consumer and provider agree on an API shape (Pact-style, OpenAPI validation).
- **Property-based**: generate inputs, assert invariants (hypothesis, fast-check); shrinking; encode "for all" laws (round-trip, idempotence, commutativity, oracle comparison against a naive implementation).
- **Mutation testing**: mutate the code, run tests, survivors reveal weak tests (see `solutions/mutation-testing.md`).
- **Snapshot/golden**: compare against stored output; use sparingly; review diffs.
- **Fuzzing**: random/malformed inputs for crashes (security bridge).
- **Performance/benchmark tests**: bands, regressions.
- **Smoke, regression, characterization tests** (the last: pin existing behavior before refactoring legacy code; Necromancer's first move).

## Practices
- TDD red-green-refactor; the transformation priority premise; triangulation.
- Test doubles: dummy, stub, spy, mock, fake; prefer fakes and real implementations; mock at boundaries only; don't mock what you don't own.
- Deterministic tests: fake clocks, seeded RNG, no network, no sleeps; flaky test causes (order dependence, shared state, timing).
- Fixtures and factories; parametrized tests; table-driven tests (Go style).
- Coverage: line vs branch; coverage is a smell detector, not a goal.
- Test pyramid vs testing trophy; testing behavior not implementation; avoid testing private methods.
- Assertions: specific, with messages; custom matchers; approximate float comparison.
- Test organization: mirrors source; naming; one assertion concept per test.
- CI: run on every push; fail fast; parallelize; quarantine flaky tests visibly.

## Misconceptions / error tags
- Test that cannot fail (`tautological-test`)
- Over-mocking (`mock-everything`)
- Order-dependent tests (`test-coupling`)
- Asserting on implementation details (`implementation-coupled-test`)
- Sleeping in tests (`sleep-in-test`)
- Missing edge cases: empty, single, max, duplicates, unicode (`missing-edge-case`)

## Challenge ideas (Oracle, difficulty 3-8)
1. **Mutant Hunt** — given `is_leap_year()` with 6 mutants; write tests that kill them all; each kill deals damage.
2. **Property Pixie** — write properties for `sort()`: length preserved, sorted, permutation; hidden mutants include "returns sorted copy of wrong list".
3. **Fake Clock Phantom** — test a rate limiter using an injected clock; the enemy is real-time flakiness.
4. **Characterize the Beast** — legacy function with no tests; write characterization tests until coverage of all branches (branch coverage is the HP).
5. **The Flaky Poltergeist** — a test suite with 3 flaky tests; find and fix the root causes (shared state, time, order).
6. **Contract Crab** — write an OpenAPI schema and tests that validate a fake server against it.
7. **Fuzz Fiend** — fuzz a parser; find the crashing input; fix; regression test.
8. **TDD Kata: Bowling / Roman / Bank** — classic katas as multi-phase bosses where each phase reveals a new requirement.
9. **Snapshot Sphinx** — decide which of 5 tests should be snapshot tests (Puzzle).
10. **Coverage Chameleon** — 100% line coverage but a bug remains; write the test that finds it; Teach-back on coverage limits.
