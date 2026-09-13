# Sandboxing options for code execution

## Threat model
- Player's own code: low malice, high accident (infinite loops, fork bombs by mistake, huge output).
- AI-generated code (Forge reference solutions, Adversary tests): untrusted; must be fully isolated.
- Goal: no host filesystem access, no network, bounded CPU/memory/pids/output, always cleaned up.

## Tier comparison
| Tier | Tech | Isolation | Setup | Languages | Latency | Notes |
|---|---|---|---|---|---|---|
| WASM JS | `quickjs-emscripten` | strong (no I/O unless exposed) | none | JS only | ~ms | `setMemoryLimit`, `setInterruptHandler` for deadlines; expose only `print`; no `fetch`, no `require`. Run in a worker thread so a stuck handler cannot hang the server. |
| WASM Python | Pyodide in Node (`pyodide` npm) | strong | download ~10-20MB at first run (cache it) | Python + pure-Python wheels, numpy etc. | 100ms-1s startup (reuse instances; reset globals between runs) | Timeouts: run in `worker_threads` and `terminate()` on deadline; capture stdout via `setStdout`. No threads/sockets. |
| Container | Docker via `dockerode` (Podman works via the Docker-compatible socket) | strong with hardening | Docker installed; images built once | any | 200ms-1s per container (pool warm containers for the Warden) | See hardening list. |
| Container + gVisor | `--runtime=runsc` | very strong (user-space kernel) | install gVisor | any | slower syscalls | Use when available; detect at startup. |
| External engine | Piston / Judge0 (self-hosted, Docker Compose) | strong (isolate) | compose stack | 50+ languages | fast | Great breadth; but no persistent interactive shell, so it complements rather than replaces the Warden container. |
| Process | `child_process` with `ulimit` | weak | none | any installed | fastest | Only behind an explicit setting; show a warning badge. |

## Docker hardening checklist (dockerode `HostConfig`)
`NetworkMode: "none"` (or a private bridge when the challenge declares `network: true`), `Memory` (e.g. 256MB) +
`MemorySwap` = Memory (no swap), `NanoCpus` (e.g. 1 CPU), `PidsLimit` (e.g. 128), `ReadonlyRootfs: true` +
`Tmpfs: {"/tmp": "rw,size=64m", "/work": "rw,size=64m"}`, `CapDrop: ["ALL"]`, `SecurityOpt: ["no-new-privileges"]`,
`User: "1000:1000"` (except Warden `setup.sh` which runs as root then drops), `AutoRemove: true`, `Ulimits`
(nofile, fsize, core=0), `LogConfig` off or capped, timeout via `container.wait()` race with a timer then
`container.kill()`. Copy files in with `putArchive` (tar stream), never bind-mount host paths. Warden containers
need write access to some paths: use a per-run volume, not the host.

## Cleanup and orphans
- Label every container `rootward.run=<runId>`; on startup, remove any with the label older than the run TTL.
- One reaper interval; also on SIGTERM.
- Tests: kill the server mid-run; restart; assert no labeled containers remain.

## Output and time limits
- Cap stdout/stderr at `outputKb` while streaming; append a truncation marker.
- Per-test timeouts inside the harness plus a whole-job wall timeout outside.
- Measure time inside the harness for efficiency bands (exclude startup).

## Language images (docker/)
`rootward/base` (Debian slim, non-root user, `tini`), `rootward/py` (python 3.12, pytest, hypothesis),
`rootward/node` (node 22, tsx, vitest, fast-check), `rootward/go`, `rootward/rust`, `rootward/c` (gcc, clang,
sanitizers, valgrind), `rootward/sql` (sqlite3, optional postgres), `rootward/warden` (Debian with coreutils,
procps, iproute2, curl, jq, vim, git, openssh-server, nginx, cron, a supervisor shim for "systemd-like" units),
`rootward/shell-target` (a deliberately vulnerable tiny web app for Shade). Build with `pnpm docker:build`; pin
base image digests; keep images small.

## Malicious test suite (run in CI against the sandbox)
Infinite loop; memory balloon; fork bomb; write to `/etc/passwd`; read `/proc/1/environ`; open a socket; 1GB
stdout; deep recursion; symlink escape attempt; `require("child_process")` in JS; `import os; os.system` in
Pyodide (should be harmless). Each must fail safely with the right status.

## Recommendation
M0: `wasm-js`. M1: add `wasm-python`. M3: Docker with the hardening list and a warm pool for Warden. Detect gVisor
and use it if present. Keep Piston as an optional adapter for breadth later. Never ship `process` enabled by default.
