# Runners

A runner executes code for a job and reports results. Everything lives in `packages/runners`. Background:
`PROMPT.md` section 12, `ideas/solutions/sandboxing.md`, ADR-0003.

## The contract (`src/contract.ts`)

- `RunJob`: `language`, `kind` (`tests` | `script` | `terminal-check`), `files` (relative path to contents, never host
  paths), optional `entry` and `stdin`, `limits`, and an optional `testSpec`.
- `RunLimits`: `wallMs` (whole job, hard kill), `cpuMs` (per execution; for io tests, per case), `memMb`, `pids`,
  `outputKb`. Defaults come from `sandbox_defaults` in `config/balance.yaml`.
- `RunResult`: job `status`, `stdout`, `stderr`, per-test `tests`, and `metrics.wallMs`.
- `TestResult`: `id`, `name`, `passed`, the test's own `status`, optional `expected`, `actual`, `stderr`, `message`,
  and `durationMs` (execution time of that case only, used for efficiency).
- `Runner`: `id`, `languages`, `kinds`, `tier` (`wasm` | `container` | `process`), `isAvailable()`, `run(job, signal)`.

The contract is written as zod schemas because results cross thread and process boundaries and are validated when
they arrive.

## Statuses

| Status | Meaning for a job | Meaning for a test |
|---|---|---|
| `ok` | the harness finished; look at each test | ran to completion (may still have wrong output) |
| `compile-error` | the entry file does not parse | skipped because the source does not parse |
| `runtime-error` | (script jobs) the program threw or exited non-zero | threw, exited non-zero, overflowed the stack, or exceeded the output cap |
| `timeout` | the whole job passed `wallMs` and was killed | this case passed `cpuMs` |
| `oom` | (script jobs) memory limit | this case hit the memory limit |
| `sandbox-error` | infrastructure failure (worker crash, invalid message, cancellation) | could not run |

## Tiers

| Tier | Runner | Languages | Status |
|---|---|---|---|
| wasm | `wasm-js` (QuickJS in a worker thread) | JavaScript | M0, shipped |
| wasm | `wasm-python` (Pyodide in a permission-restricted child process) | Python | M1, shipped |
| container | `docker` (hardened containers via dockerode; gVisor when installed) | Python, Node, Go, Rust, C, C++, SQL, shell | M3 |
| process | `process` (unsandboxed, opt-in flag, warning badge) | whatever is installed | M3, never on by default |

`RunnerRegistry.pick(language, kind)` returns the first available runner in that order.

## `wasm-js` in detail

| Layer | Limit | Where |
|---|---|---|
| QuickJS memory | `limits.memMb` | `runtime.setMemoryLimit` in `src/wasm-js/sandbox.ts` |
| QuickJS stack | 1 MB | `QUICKJS_STACK_BYTES` in `src/wasm-js/constants.ts` |
| Native stack of the worker | 32 MB (far above QuickJS's limit, so QuickJS always reports the overflow) | `WORKER_STACK_MB` |
| CPU time per execution | `limits.cpuMs` | interrupt handler |
| Output | `limits.outputKb`, then the program is interrupted | `OutputBuffer` |
| Wall clock for the job | `limits.wallMs` + 1 s startup grace, then `worker.terminate()` | `src/wasm-js/runner.ts` |

What programs can use: `console.log/info/debug/warn/error`, `process.stdout.write`, `process.stderr.write`,
`process.exit`, `process.argv`, `process.env` (empty), `require("fs").readFileSync(0, "utf8")` for stdin, and
`require("./other")` for the job's own files. There is no network, filesystem, timers, or child processes. ES module
syntax is not supported yet.

io tests run outside the player's VM: the worker executes the entry once per case in a fresh runtime and compares
normalized stdout itself (`src/io/compare.ts`). A syntax error is detected on the first case and reported for every
case without re-running.

## `wasm-python` in detail

Pyodide running inside Node is **not** a sandbox on its own: `os.system` reaches a real shell and `run_js` reaches
Node's globals. The walls come from the process around it (ADR-0005).

| Layer | Limit | Where |
|---|---|---|
| Node permission model | reads only the Pyodide package and `src/wasm-python/`; no writes, network, child processes, workers, addons, WASI, or code from strings | `sandboxFlags` in `src/wasm-python/process.ts` |
| Environment | empty, so server secrets never reach the sandbox | `process.ts` |
| JavaScript bridge | `jsglobals: {}` (no host globals, no `run_js`), `process.kill` removed | `src/wasm-python/host.mts` |
| CPU time per case | `limits.cpuMs` + 250 ms, then the process is killed and the remaining cases continue in a fresh one | `src/wasm-python/runner.ts` |
| Memory | `limits.memMb` above the loaded baseline, polled from `/proc` every 100 ms (Linux) | `runner.ts` |
| Output | `limits.outputKb` characters per stream, raised as an exception `except Exception` cannot catch | `src/wasm-python/harness.py` |
| Wall clock for the job | `limits.wallMs` plus a start-up allowance for loading Pyodide | `runner.ts` |

Between cases the harness resets stdin, stdout, stderr, globals, `sys.path`, imported modules, builtins, the recursion
limit, the working directory, and the player's files in `/work`. Expected outputs never enter the sandbox; the parent
compares. Loading Pyodide takes about 1.4 s, so the runner keeps one warm spare process (`prewarm()`), and callers
should `dispose()` the runner on shutdown.

What programs can use: the standard library, `input()` and `sys.stdin`, `print`, and importing their own modules.
Not available: `subprocess` and `os.system` (blocked), sockets and HTTP, third-party packages.

## The sentinel protocol (`src/protocol/sentinel.ts`)

For harnesses that must run *inside* a sandbox (JavaScript unit tests and Pyodide in M1, Docker in M3): each test is a
line `__ROOTWARD_<nonce>__ {json}` and the run ends with `__ROOTWARD_END_<nonce>__ {json}`. The nonce is random per run
and only the harness knows it; lines with the wrong prefix are ordinary program output; the summary is never trusted
over individual lines; a missing end line means the harness crashed or was killed.

## Adding a runner

1. Implement `Runner` in `src/<id>/runner.ts`; keep untrusted execution out of the server's main thread.
2. Enforce every field of `RunLimits` and map failures to the statuses above.
3. Add a malicious-code suite modeled on `test/wasm-js-safety.test.ts` (infinite loop, memory balloon, deep
   recursion, output flood, forbidden modules or syscalls, path escape, wall-clock kill, cancellation).
4. Export it from `src/index.ts` and register it in `apps/server/src/main.ts` and
   `packages/content-tools/src/cli/validate.ts`.
5. Run `pnpm content:validate`: the challenges in that language now execute instead of being skipped.
