# Complexity and performance

## Big-O and friends
- Definitions: O (upper), Omega (lower), Theta (tight). Worst, average, best case. Amortized (dynamic array append, union-find).
- Common classes with intuition: O(1) hash lookup; O(log n) binary search; O(n) scan; O(n log n) sort; O(n^2) nested loops; O(2^n) subsets; O(n!) permutations.
- Space complexity, including recursion stack depth and hidden allocations (slicing copies in Python).
- Rules: drop constants and lower terms; nested loops multiply; sequential steps add; recursion via recurrence (T(n) = 2T(n/2) + n).
- Where Big-O misleads: constants matter (insertion sort beats merge sort on tiny inputs), cache locality (arrays beat linked lists in practice), hash constant factors, branch prediction.

## Real-world performance topics
- Memory hierarchy: registers, L1/L2/L3 caches, RAM, disk; cache lines; sequential vs random access; why "array of structs" vs "struct of arrays" matters.
- Interpreter overhead: Python loops vs vectorized NumPy; JS JIT warm-up; why benchmarks need warm-up and repetition.
- Profiling: `cProfile`, `py-spy`, Node `--prof`, Chrome DevTools, flame graphs; measure before optimizing.
- Benchmarking pitfalls: timer resolution, GC pauses, dead-code elimination, noisy machines; report medians and distributions.
- Algorithmic vs micro optimization; the 80/20 rule; premature optimization.
- I/O bound vs CPU bound; batching; buffering; streaming instead of loading whole files.
- Database performance: indexes, N+1 queries, EXPLAIN (see `databases-and-sql.md`).
- Concurrency for throughput vs latency (see `concurrency-and-async.md`).

## How the game uses this
- Every code challenge can declare an **efficiency band** (`targets.time_ms`, `targets.complexity`). The runner measures wall time on hidden large inputs; falling inside the band grants the Efficiency bonus.
- **Tome of Big-O** unlocks a HUD panel showing measured time vs input size across the hidden tests (a mini empirical complexity plot: doubling n, what happens to t?).
- Puzzle format "complexity quiz": show code, ask for the class; show two implementations, ask which is faster and why.
- Enemy moves Timeout Breath and Memory Bloat are the mechanical face of this topic.

## Misconceptions / error tags
- Hidden O(n) inside a loop (`in` on a list, `Array.shift`, string concatenation) -> `hidden-linear-op`
- Recomputing instead of caching -> `missing-memo`
- Copying slices in recursion (`s[1:]`) making O(n^2) -> `slice-copy-in-recursion`
- Sorting inside a loop -> `sort-in-loop`
- Believing O(1) means "fast" -> `bigo-vs-constant`

## Challenge ideas
1. **Doubling Test** — given a black-box function, measure it at n, 2n, 4n and classify its complexity (Puzzle with numeric answer within tolerance).
2. **Two Sum, Three Ways** — brute force passes tests but fails the band; hash map passes; explain (Teach-back).
3. **String Builder** — `+=` in a loop vs join; the band exposes it on 1e6 pieces.
4. **Memoize Me** — add caching to a naive recursive function without changing its signature.
5. **Cache-Friendly Matrix** — row-major vs column-major traversal timing (Silicon Depths bridge).
6. **Profile the Beast** — a slow script with three hotspots; fix the top one to pass the band; fix all for Crit.
7. **The Amortized Array** — implement a growable array with doubling; count copies; test asserts amortized bound.

## References
- "Big-O Cheat Sheet"; Jeff Dean's "Numbers Everyone Should Know" (latency table); Brendan Gregg's profiling material.
