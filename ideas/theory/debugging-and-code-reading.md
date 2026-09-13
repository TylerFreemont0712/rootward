# Debugging and reading code (Ruins of Legacy)

## Debugging as a science
1. **Reproduce** reliably (minimal input, fixed seed, exact environment).
2. **Observe**: read the whole error, stack trace bottom-up and top-down, logs, state.
3. **Hypothesize** one cause; **predict** what you would see if true.
4. **Experiment** with the smallest change (a print, a breakpoint, a unit test).
5. **Confirm or reject**; repeat. Keep a written log of hypotheses (the game's Trace ability shows one).
6. **Fix root cause**, add a regression test, look for siblings of the bug.

## Techniques and tools
- Print/log debugging done well: structured, labeled, temporary; `console.table`, `pprint`, `repr`.
- Debuggers: breakpoints, conditional breakpoints, watch, step over/into/out, call stack, `pdb`/`breakpoint()`, Node `--inspect`, VS Code launch configs.
- Binary search over code/history: comment halves, `git bisect`, feature flags.
- Rubber duck (explain it aloud; the Rubber Duck artifact).
- Differential debugging: compare working vs broken inputs/versions/environments.
- Tracing: `strace`/`ltrace`, `sys.settrace`, OpenTelemetry spans, request ids.
- Memory and performance debugging: heap snapshots, leak hunting, profilers.
- Reading stack traces across async boundaries; source maps.
- Reproducing flaky bugs: stress loops, seeds, `for i in {1..100}`, thread sanitizers.
- Heisenbugs: observation changes timing; use logging with timestamps, not breakpoints.
- Post-mortems: blameless, timeline, contributing causes, action items.

## Reading unfamiliar code
- Start at the entry point and the tests; read the data structures first; find the "main loop".
- Build a map: modules, key types, who calls whom (`grep -r`, LSP "find references", `git log -S`).
- Read the diff history: `git log -p --follow file`, `git blame` for "why".
- Run it and change one thing; add a characterization test before refactoring.
- Recognize idioms and patterns; look for invariants and assumptions; note surprises.
- Summarize in your own words (Teach-back format).

## Refactoring
- Small, behavior-preserving steps with tests green between each: extract function/variable, inline, rename, move, replace conditional with polymorphism, introduce parameter object, replace magic number, decompose conditional, strangler fig for big rewrites.
- Refactor vs rewrite decision; seams; sprout method/class; characterization tests first (Michael Feathers).

## Misconceptions / error tags
- Changing code at random hoping it works (`shotgun-debugging`)
- Fixing the symptom (`symptom-fix`)
- Not reading the full error (`unread-error`)
- No regression test after a fix (`missing-regression-test`)
- Refactoring without tests (`unsafe-refactor`)

## Challenge ideas (Necromancer / Ruins)
1. **Read the Trace** (Puzzle) — a 40-line traceback; which line is the root cause? Which frame is library code?
2. **Bisect the Blight** — a seeded git repo with 60 commits and a failing test; find the culprit commit in <= 7 steps (each step costs Focus); the Bisect ability automates the run.
3. **Characterize the Beast** — untested legacy module; write characterization tests to reach branch coverage; then refactor with tests green.
4. **Heisenbug** — a race in a small async job runner; adding prints changes behavior; fix with proper synchronization; tests run under stress.
5. **Off-By-One Archaeology** — a function that has been "fixed" four times in history and is still wrong; read the history, write the table-driven test, fix properly.
6. **The Spaghetti Monster** (boss) — 400-line script with global state; phase 1: make hidden tests pass; phase 2: extract into functions with Reviewer rubric >= 7; phase 3: add a feature without breaking tests.
7. **Memory Leak Slime** — a Node service that grows; find the listener leak with a heap snapshot script; test asserts stable memory after N iterations.
8. **Strangler Fig** — replace a legacy function behind a facade one call site at a time; tests check both paths agree during migration.
9. **Log Forensics** — from 2000 log lines, determine what happened and write a fix; Puzzle + Encounter chain.
10. **Diff Detective** (Puzzle) — five diffs; which one introduced the bug? Explain.
