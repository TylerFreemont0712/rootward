# ADR-0005: Run Python in Pyodide inside a permission-restricted Node process

- **Status:** accepted
- **Date:** 2026-09-13
- **Related:** PROMPT.md sections 12.2, 12.5; ideas/solutions/sandboxing.md; ADR-0003 (the JavaScript tier)

## Context
M1 needs Python without Docker. Pyodide (CPython compiled to WebAssembly, npm `pyodide` 314.0.6, about 14 MB with the
standard library) runs in Node. `ideas/solutions/sandboxing.md` rated its isolation as strong. Three spikes on Node 26
showed that is not true when Pyodide runs in Node:
- `os.system("...")` runs a **real shell on the host**: Emscripten implements `system()` with Node's
  `child_process.spawnSync`.
- `pyodide.code.run_js` and `import js` reach the host's JavaScript globals (and so `process` and the filesystem), and
  Emscripten's NODEFS can mount host directories into Python's filesystem.
- Node 26's permission model (`--permission`) denies filesystem access outside allowed paths, network, child
  processes, workers, addons, and WASI for a whole process. Pyodide refused to start under it because Emscripten
  calls the deprecated `process.binding("constants")`; a shim that returns only the file-flag constants fixes that.
- Under the permission model, with `jsglobals: {}` and read access limited to the Pyodide folder: `os.system` was
  denied (and killed the interpreter), `run_js` failed because `js.eval` no longer exists, `import js` exposed nothing
  useful, `subprocess` reported processes unsupported, sockets could not connect, and IPC over `fork` still worked.
  `--disallow-code-generation-from-strings` did not stop Pyodide from loading. Loading took about 1.4 s and 170 MB.

## Options considered
1. **Pyodide in a worker thread**, like QuickJS. Fast to build, but player code can escape to the host (the
   `os.system` result alone rules it out).
2. **Pyodide in a child process under Node's permission model.** Real OS-level walls that do not depend on
   Pyodide's internals; costs a process and a Pyodide load per job.
3. **Docker only.** Strongest, but requires Docker and contradicts M1's zero-setup goal; it arrives in M3 as a
   stronger tier for everything.
4. **A pool of long-lived interpreters reused across jobs.** Fastest, but state leaks between jobs, and a permission
   denial kills the interpreter anyway.

## Decision
Option 2 (`packages/runners/src/wasm-python/`):
- `process.ts` forks `host.mts` with `--permission`, read access only to the Pyodide package and the host folder,
  `--disallow-code-generation-from-strings`, and an **empty environment** so server secrets never reach the sandbox.
- `host.mts` installs the `process.binding` shim, loads Pyodide with `jsglobals: {}`, removes `process.kill` (not
  covered by the permission model), runs one job, and exits if the parent disconnects.
- `harness.py` runs each case with fresh stdin, captured and size-capped stdout/stderr, fresh globals, and resets
  modules, builtins, `sys.path`, the recursion limit, the working directory, and `/work` files afterwards.
  Tracebacks are trimmed to the player's own frames.
- Expected outputs never enter the sandbox: the parent compares output. Every message from the child is validated
  with zod.
- A case that exceeds its CPU budget, exceeds the memory limit (RSS polled from `/proc` every 100 ms), or crashes the
  interpreter costs that process; the remaining cases continue in a fresh one. One warm spare process keeps Probe
  latency low.

## Consequences
- A Python job costs one Pyodide load (about 1.4 s) unless the warm spare is ready; the server pre-warms one at
  start. Each process uses about 170 MB.
- The memory limit is best effort: Linux only, with 100 ms granularity. The CPU and wall-clock limits hold everywhere.
- A player who deliberately attacks their own sandbox process could forge their own results. They still cannot reach
  host files outside the two allowed folders, the network, other processes, or the environment.
- Output written directly to file descriptors 1 and 2 (for example `os.write(1, ...)`) is dropped; `print` and
  `sys.stdout` are captured.
- Third-party packages (micropip) are unavailable because they need the network. Revisit per challenge if a lesson
  needs one, with packages vendored into the Pyodide folder.
- The malicious-code suite is `packages/runners/test/wasm-python-safety.test.ts`.
- ADR-0003's worker-thread design stays right for QuickJS, which exposes no host bridge at all.
