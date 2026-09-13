# Test harness per language (the sentinel protocol)

## Protocol
The harness (injected by the runner, never editable by the player) runs tests and prints one JSON line per test:
```
__ROOTWARD__ {"id":"t3","name":"handles empty input","passed":false,"expected":"0","actual":"KeyError","ms":1.2,"hidden":true}
```
plus a final `__ROOTWARD_END__ {"total":7,"passed":5,"ms":42}`. The runner parses stdout for lines with the
prefix, treats everything else as program output, and never trusts the summary over the individual lines. If the
process exits before `__ROOTWARD_END__`, status becomes `runtime-error`/`timeout` with partial results kept. Hidden
test *names* are shown as categories ("boundary #2"), expected/actual only for visible tests.

## Test forms
- **io**: harness runs the entry point per case with stdin (entry points read stdin conventionally: `sys.stdin.read()`, `fs.readFileSync(0, "utf8")`; the WASM adapters shim `require("fs")` / `sys.stdin` so the same file runs in every tier), compares normalized stdout (trim trailing whitespace per line, normalize newlines; optional float tolerance and order-insensitive modes declared per case).
- **unit**: language-native tests import the player's module; visible file `tests/...`, hidden file added by the runner.
- **check**: terminal rooms; `check.sh` prints sentinel lines itself (helper `rw_check <id> <name> <cmd>` sourced from `/opt/rootward/lib.sh`).

## Adapters
| Language | Visible tests written as | Harness | Notes |
|---|---|---|---|
| Python | pytest functions `def test_x():` | a tiny in-house runner (`rootward_runner.py`) that imports the test modules, discovers `test_*`, runs each with a per-test `signal.alarm`/thread timeout, catches `AssertionError` (with `pytest`-style introspection off) and prints sentinel lines. Optionally run real `pytest` with a JSON plugin in the Docker tier. | In Pyodide, no `signal`; use the worker deadline for the whole job and record per-test times. hypothesis available in Docker tier with a fixed `derandomize=True`. |
| JavaScript/TypeScript | `test("name", () => {...})` with a minimal `expect` shim (`toBe`, `toEqual`, `toThrow`, `toBeCloseTo`) | in-house harness that registers tests then runs them sequentially with per-test timeouts; deep-equal via a small function. In Docker, optionally `node:test` with `--test-reporter=tap` parsed into sentinels, or vitest. TS is transpiled with `esbuild` (fast) before running. | QuickJS has no timers by default; provide `setTimeout` shim only if the challenge needs it. fast-check in Docker tier with a fixed seed. |
| Go | `func TestX(t *testing.T)` | `go test -json ./...` parsed into sentinel lines | compile errors -> `compile-error` with the message. |
| Rust | `#[test]` fns | `cargo test -- -Z unstable-options --format json` (nightly) or parse the stable stdout lines (`test x ... ok`) | prefer parsing stable output; per-test timing from wall clock. |
| C | harness header `rw_test.h` with `RW_TEST(name) { ... RW_ASSERT_EQ(a,b); }` macros | compiled with `-fsanitize=address,undefined -Wall -Wextra`; the macro prints sentinels | sanitizer errors map to `runtime-error` with the report in stderr. |
| Bash (terminal) | `check.sh` | sourced helper prints sentinels; each check is a shell predicate | run as root or the player user per check; timeouts with `timeout`. |
| SQL | expected result sets (CSV/JSON) per query file | runner executes the player's query against the fixture DB and compares (ordered if the spec says so; numeric tolerance) | for DML challenges, compare table state after execution. |
| "Should not compile"/type tests | expected error snippets | run `tsc --noEmit` / `mypy` / `cargo check` and match diagnostics | used by the type-systems content. |
| Mutation (Oracle) | player's tests + `mutants/` | run the player's test file against the reference and each mutant; sentinel per mutant (`killed`/`survived`) | see `mutation-testing.md`. |

## Efficiency measurement
The harness records `ms` per test with a monotonic clock inside the process. The band check uses the max over the
"large" tests declared in `challenge.yaml` and compares to `targets.time_ms` scaled by a per-runner calibration
factor measured at startup (a fixed benchmark), so WASM vs Docker differences do not make bands unfair.

## Static checks (before running)
Banned tokens (tokenizer-aware, not regex on strings/comments where possible), max lines (non-blank, non-comment),
required identifiers, recursion required (call graph check), complexity hints (nested loop depth) as *warnings*.

## Anti-cheat the harness must survive
Player code monkey-patching the harness (`print` override, redefining `test`), printing fake sentinel lines
(prefix with a per-run random nonce: `__ROOTWARD_<nonce>__`), exiting early (`sys.exit`), reading the hidden test
file (it is added only in the runner's job directory and, in Docker, is unreadable by the player user; in WASM, it
is passed as a string to the harness scope, not written to the visible filesystem).
