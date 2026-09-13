# Data structures (Grove of Structures)

For each structure: what it is, operations and their complexities, when to use it, what it looks like in Python
and JS, and challenge hooks. Complexities are typical, not universal.

| Structure | Core ops (avg) | Use when | Python / JS |
|---|---|---|---|
| Dynamic array | index O(1), append amortized O(1), insert/delete middle O(n) | ordered sequence, random access | `list` / `Array` |
| Linked list | insert/delete at known node O(1), index O(n) | queues, LRU internals, teaching pointers | build your own |
| Stack | push/pop O(1) | LIFO: parsing, DFS, undo | `list` / `Array` |
| Queue / deque | enqueue/dequeue O(1) | BFS, sliding window, schedulers | `collections.deque` / build (Array shift is O(n)) |
| Hash map | get/set/delete O(1) avg, O(n) worst | key lookup, counting, memo | `dict` / `Map`, `Object` |
| Hash set | add/has O(1) | membership, dedupe | `set` / `Set` |
| Binary heap / priority queue | push/pop O(log n), peek O(1) | top-k, Dijkstra, schedulers | `heapq` / build |
| Binary search tree | search/insert O(log n) balanced, O(n) degenerate | ordered data, range queries | build; `sortedcontainers` |
| Balanced BST (AVL, red-black) | O(log n) guaranteed | ordered maps | libs |
| Trie | insert/search O(L) | prefix search, autocomplete | build |
| Graph (adjacency list/matrix) | edge check O(deg) / O(1) | relationships, routing | dict of lists |
| Union-find | near O(1) amortized (path compression + rank) | connectivity, Kruskal | build |
| Bloom filter | O(k) | probabilistic membership | build (Silicon Depths) |
| LRU cache | O(1) get/put | caching | `OrderedDict` / Map order |
| Segment tree / Fenwick | O(log n) range query/update | competitive programming, analytics | build (Expert) |
| Ring buffer | O(1) | streaming, fixed memory | build |
| Immutable / persistent structures | structural sharing | FP, undo history | libs |

## Concepts to teach explicitly
- Contiguous vs linked memory and why cache matters (see `complexity-and-performance.md`).
- Hashing: what a hash function does, collisions, why keys must be immutable/hashable, load factor and resizing.
- Amortized analysis via dynamic array growth.
- Invariants: heap property, BST ordering, balanced height; write the invariant as a test.
- Choosing a structure from the operations required (the "operations first" heuristic).
- Iterators and lazy sequences as a structure-agnostic interface.

## Misconceptions / error tags
- Using a list for membership tests in a loop (`quadratic-membership`)
- `Array.shift()` in a loop in JS (`hidden-linear-op`)
- Mutating a dict while iterating (`mutating-while-iterating`)
- Assuming dict/Map order semantics from older languages (`ordering-assumption`)
- Deep vs shallow copy of nested structures (`aliasing`)
- Recursion without a base case on trees (`missing-base-case`)
- Comparing floats as dict keys (`float-keys`)

## Challenge ideas (difficulty 2-7)
1. **Bracket Balancer II** — stack with multiple bracket types and error position.
2. **Queue of Two Stacks** — amortized O(1) queue; efficiency band forces it.
3. **Min-Stack Golem** — `push/pop/min` in O(1).
4. **The Linked List Necropolis** — implement singly linked list: append, insert, delete, reverse (iterative and recursive), detect cycle (Floyd).
5. **LRU Cache Lich** — O(1) LRU with capacity; hidden tests hammer eviction order.
6. **Heap Hydra** — implement a binary heap; then top-k frequent words with it.
7. **Trie Treant** — insert/search/startsWith; then autocomplete with ranking.
8. **BST Warden** — insert/search/delete/in-order; validate BST (the classic min/max bounds trap).
9. **Graph Gatekeeper** — build adjacency list from edge list; degree counts; detect self-loops and duplicates.
10. **Union-Find Fungus** — count connected components; then Kruskal (Grove tier 3).
11. **Ring Buffer Rat** — fixed-size circular buffer with overwrite semantics.
12. **Sliding Window Wisp** — max sum subarray of size k; then longest substring without repeats.
13. **Matrix Prefix Sums** — 2D prefix sums for O(1) rectangle sums.
14. **Interval Imp** — merge overlapping intervals; then insert interval.
15. **Bloom Filter Basilisk** — implement with k hash functions; measure false positive rate against a target band.
16. **Deque Drake** — sliding window maximum with a monotonic deque.
17. **Ordered Dict Oracle** — implement insertion-ordered map with O(1) delete (doubly linked + hash).
18. **Immutable Stack** — persistent stack with structural sharing; show that push does not copy (test with identity).

## References
- CLRS, "Grokking Algorithms", Python `collections` docs, "Open Data Structures" (free), VisuAlgo.
