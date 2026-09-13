# ADR-0003: Run JavaScript in QuickJS inside a fresh worker thread per job

- **Status:** accepted
- **Date:** 2026-09-13
- **Related:** PROMPT.md sections 12.1-12.5; ideas/solutions/sandboxing.md, ideas/solutions/test-harness-per-language.md

## Context
M0 needs a zero-setup sandbox for JavaScript challenges (tier 1, `wasm-js`). Player code is mostly accidental in its
harm (infinite loops, runaway recursion, huge output), but AI-generated code arrives later and must be fully
isolated. Two spikes against quickjs-emscripten 0.32 on Node 26 shaped the design:
- QuickJS's interrupt handler stopped `while (true) {}` precisely at its deadline, and `setMemoryLimit` turned an
  object balloon into a clean `out of memory` error.
- Deep recursion **crashed the whole Node process**: the WebAssembly frames exhausted V8's native stack before
  QuickJS's own stack limit fired. In a worker thread with a larger native stack (`resourceLimits.stackSizeMb`),
  the same code produced a catchable `InternalError: stack overflow`.
- A leaked QuickJS handle made `runtime.dispose()` abort; the module kept working, but that is not guaranteed.

## Options considered
1. **QuickJS on the server's main thread.** Fastest, simplest. One stack overflow takes the server down. Rejected.
2. **QuickJS in a fresh worker thread per job.** Each job gets its own thread, native stack, and WASM instance; the
   host terminates the worker on a wall-clock deadline and on cancellation. Costs a worker start (tens of ms).
3. **A warm pool of workers.** Lower latency; needs recycling rules after crashes, poisoning, or memory growth.
4. **Node's `vm` module or `isolated-vm`.** `vm` is documented as not a security boundary; `isolated-vm` is a native
   addon (build friction on new Node versions) and still shares the process.

## Decision
Option 2. Limits, from inside out: QuickJS memory limit (`limits.memMb`), QuickJS stack 1 MB against a 32 MB worker
stack, a per-execution CPU deadline (`limits.cpuMs`) enforced by the interrupt handler, an output cap that also
interrupts the program once exceeded, and a host timer that terminates the worker at `limits.wallMs` plus a 1 s
startup grace. The worker validates its job with zod and the host validates every worker message.

For io tests the harness runs **outside** the player's VM: the worker executes the entry file once per case in a
fresh QuickJS runtime and compares normalized stdout itself, so player code cannot tamper with grading. The sentinel
protocol with a per-run nonce (`src/protocol/sentinel.ts`) is implemented and tested for harnesses that must run
inside a sandbox (JavaScript unit tests, Pyodide, Docker), which arrive in M1 and M3.

A small prelude gives programs a Node-shaped surface: `console`, `process.stdout.write`, `process.exit`,
`require("fs").readFileSync(0)` for stdin, and `require()` of the job's own files. Nothing else exists: no network,
timers, host files, or child processes (asserted by `packages/runners/test/wasm-js-safety.test.ts`).

## Consequences
- A Tally Wisp Cast (visible, hidden, and a 120k-word case) takes about 350 ms including worker start; QuickJS runs
  that case in about 225 ms, much slower than V8. Efficiency bonuses therefore compare against the reference
  solution on the same runner instead of fixed milliseconds (ADR-0004).
- Not supported yet: ES module syntax (a syntax error explains this), timers, `console.log` format specifiers, and
  JavaScript unit-form tests (moved to M1).
- If cleanup fails, the worker replaces its QuickJS module before the next case (`poisoned`).
- A worker pool can replace per-job workers later behind the same `Runner` interface if latency matters.
- Package quirk: the QuickJS variant's types describe CommonJS while Node loads its ES module build; the worker
  passes `import("@jitl/quickjs-wasmfile-release-sync")` to the library, which unwraps it correctly for both.
