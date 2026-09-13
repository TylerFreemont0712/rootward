# Algorithms (Grove of Structures, tiers 1-4)

## Families and canonical members
- **Searching**: linear, binary search (and its many off-by-one variants: first/last occurrence, insertion point, search on answer), ternary search, exponential search.
- **Sorting**: bubble/insertion/selection (teaching), merge sort, quicksort (partition schemes, pivot choice), heapsort, counting/radix/bucket sort, stability, when to use the built-in (Timsort) and how `key` functions work.
- **Recursion and divide and conquer**: base cases, recursion trees, master theorem intuition, converting recursion to iteration with an explicit stack, tail calls.
- **Two pointers / sliding window**: pair sums in sorted arrays, dedupe in place, longest/shortest window satisfying a predicate.
- **Hashing tricks**: prefix sums + hash for subarray sums, anagram grouping, rolling hash (Rabin-Karp).
- **Greedy**: interval scheduling, coin change (when greedy fails), Huffman coding, activity selection; proving greedy choice property.
- **Dynamic programming**: memoization vs tabulation; 1D (climbing stairs, house robber), 2D (grid paths, LCS, edit distance), knapsack (0/1, unbounded), LIS, partition problems; reconstructing solutions; space optimization.
- **Backtracking**: permutations, combinations, subsets, N-queens, sudoku; pruning.
- **Graph algorithms**: BFS (shortest path unweighted, levels), DFS (components, cycle detection, topological sort), Dijkstra, Bellman-Ford (negative edges), Floyd-Warshall, A*, MST (Kruskal, Prim), bipartite check, union-find.
- **Strings**: KMP/Z-algorithm (Expert), edit distance, longest common prefix, palindromes, tries.
- **Math**: GCD/LCM, primes (sieve), modular arithmetic, fast exponentiation, combinatorics basics, bit manipulation (popcount, power of two, XOR tricks).
- **Randomized**: reservoir sampling, Fisher-Yates shuffle, Monte Carlo estimation.
- **Streaming / online**: running median with two heaps, moving average, top-k with heap.

## Problem-solving process to teach (UPER / Polya)
1. Understand: restate, identify inputs/outputs, list edge cases (empty, one element, duplicates, negatives, huge).
2. Plan: brute force first; name the bottleneck; pick a pattern (hash, sort, two pointers, DP...).
3. Execute: write the simplest correct version; then optimize.
4. Reflect: complexity, alternative approaches, what the tests missed.
The tutor's hint ladder mirrors these stages.

## Misconceptions / error tags
- Off-by-one in binary search bounds (`binary-search-bounds`)
- Missing memoization causing exponential time (`exponential-recursion`)
- Wrong base case / infinite recursion (`missing-base-case`)
- Modifying the input when the problem needs the original (`unintended-mutation`)
- Greedy applied where DP is required (`greedy-wrong`)
- Visited set forgotten in graph traversal (`missing-visited`)
- Integer overflow in JS above 2^53 (`precision-loss`)

## Challenge ideas (difficulty 3-9)
1. **Binary Search Sphinx** — five variants in one Elite: exact, first >=, last <=, rotated array, sqrt via search-on-answer.
2. **Merge Sort Marionette** — implement; then count inversions with it.
3. **Quicksort Quarrel** — implement Lomuto and Hoare; Elite adds "must be in-place".
4. **Dijkstra's Drake** — shortest path on a weighted grid; efficiency band forces a heap.
5. **Topological Troll** — order build tasks from dependencies; detect cycles and report them.
6. **Knapsack Kobold** — 0/1 knapsack with reconstruction.
7. **Edit Distance Echo** — Levenshtein with backtrace; variant: spellcheck suggestions from a word list.
8. **N-Queens Nightmare** — count solutions; Elite: return one solution for n up to 12 in time band.
9. **Coin Change Chimera** — min coins (DP) after greedy fails on a crafted coin set (the enemy taunts with the counterexample).
10. **Island Counter** — flood fill; variant: largest island; variant: number of lakes.
11. **Word Ladder Wraith** — BFS over word transformations.
12. **LIS Lamia** — O(n^2) then O(n log n) with patience sorting; efficiency band on the Elite.
13. **Sieve Serpent** — primes below n; efficiency band excludes trial division at scale.
14. **Reservoir Revenant** — sample k items from a stream; hidden statistical test over many seeds.
15. **Median Mimic** — running median with two heaps.
16. **Rabin-Karp Rogue** — substring search with rolling hash; adversary generates collision-prone inputs.
17. **A\* Automaton** — path on a grid with obstacles; heuristic must be admissible (tests compare path lengths).
18. **Huffman Harpy** — build codes; round-trip encode/decode; measure compression ratio.
19. **Bit Basilisk** — popcount, isPowerOfTwo, single number (XOR), reverse bits.
20. **Sudoku Sentinel** — backtracking solver with constraint propagation for the time band.

## References
- CLRS, Skiena "Algorithm Design Manual", "Competitive Programmer's Handbook" (free), NeetCode roadmap categories.
