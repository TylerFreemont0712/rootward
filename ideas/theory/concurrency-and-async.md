# Concurrency and asynchrony

## Concepts
- Concurrency vs parallelism; CPU-bound vs I/O-bound; processes vs threads vs green threads vs async tasks; the GIL (Python) and the single-threaded event loop (JS).
- Event loop model: call stack, task queue, microtasks; `async/await` as syntax over promises/futures/coroutines; `Promise.all/allSettled/race/any`; `asyncio.gather`, `TaskGroup`, cancellation; structured concurrency.
- Shared-memory concurrency: race conditions, critical sections, mutexes, RW locks, condition variables, semaphores, atomics, memory ordering (mention), deadlock (four conditions), livelock, starvation, priority inversion, lock ordering.
- Message passing: channels (Go, Rust), actors (Erlang/Akka), CSP; worker pools; producer/consumer with bounded queues; backpressure.
- Immutability and thread confinement as the easy way out; functional cores.
- Parallel patterns: map-reduce, pipelines, fork-join, work stealing; `multiprocessing`, worker threads, Web Workers.
- Async pitfalls: blocking the loop, forgotten awaits, unhandled rejections, unbounded concurrency (use semaphores), ordering assumptions, async in constructors.
- Timeouts, retries, cancellation tokens, graceful shutdown.
- Testing concurrency: deterministic schedulers, stress loops, fake clocks, invariants, sanitizers.
- Distributed concurrency: idempotency, leases, leader election (see `system-design.md`).

## Misconceptions / error tags
- Missing await (`missing-await`)
- Check-then-act race (`tocttou`)
- Locking inconsistently / deadlock (`lock-ordering`)
- Unbounded `Promise.all` over 10k items (`unbounded-concurrency`)
- Sleeping to "fix" a race (`sleep-sync`)
- Shared mutable state across workers (`shared-mutable-state`)

## Challenge ideas
1. **Race Condition Twins** — two workers increment a shared counter; tests run 10k iterations and require exact totals; fix with a lock or atomic; second twin: make it lock-free by redesign (per-worker counters + sum).
2. **Deadlock** — two enemies each holding a lock the other needs; fix by lock ordering; tests must complete within a time band.
3. **Bounded Builder** — download 200 URLs (fake) with at most 5 in flight; tests measure max concurrency via an instrumented fake.
4. **Producer/Consumer Pit** — bounded queue with backpressure; tests check no unbounded memory growth.
5. **Cancellation Crab** — a pipeline that stops all stages on cancel; tests assert no work after cancel.
6. **Event Loop Elemental** (Puzzle) — predict the output order of a snippet mixing microtasks, timers, and awaits.
7. **Worker Pool Wyrm** — CPU-bound hashing distributed to worker threads/processes; efficiency band demands parallel speedup.
8. **Rate Limiter Rat (async)** — token bucket with async waiters.
9. **Structured Concurrency Sentinel** — TaskGroup that cancels siblings on first failure; tests assert cleanup ran.
10. **Actor Arena** — implement a tiny actor mailbox system; tests send interleaved messages and check per-actor ordering.
