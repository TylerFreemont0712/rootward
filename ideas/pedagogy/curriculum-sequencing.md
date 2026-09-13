# Curriculum sequencing

## Node design rules
- One node = a concept the player can reach mastery 3 on in 20-60 minutes of practice.
- Ids: `<track>.<topic>.<concept>`; tracks are languages (`py`, `js`, `ts`, `go`, `rs`, `c`, `sh`, `sql`) or shared (`concept`, `ds`, `algo`, `net`, `os`, `sec`, `web`, `db`, `git`, `devops`, `ai`, `sys`, `design`).
- Language nodes point up to shared concept nodes (`py.control.loops` -> `concept.iteration`); mastery of the shared node is the max over languages, which lets the planner skip repeats when switching languages.
- Every node has at least: 1 Shrine, 3 encounters at different difficulties, 4 review cards, 2 puzzles.

## Tiers and what they mean
| Tier | Name | Player can... |
|---|---|---|
| 0 | Apprentice | Write small scripts; basic control flow and collections; run and read errors. |
| 1 | Journeyman | Structure programs with functions/modules/classes; use git; write tests; shell basics. |
| 2 | Adept | Choose data structures and algorithms; HTTP and SQL; containers; debug systematically. |
| 3 | Expert | Design systems; concurrency; performance; security; refactor legacy code. |
| 4 | Master | Distributed systems; language internals; lead architecture; teach. |

## Suggested sequences (order within a track; each line is a node cluster)

**Python fundamentals**: values/types -> variables -> strings -> conditionals -> loops -> lists -> functions -> dicts -> sets/tuples -> comprehensions -> errors -> files/JSON -> modules/venv -> classes -> dunder/dataclasses -> generators/iterators -> typing -> pytest basics.

**JavaScript/TypeScript**: values/coercion -> let/const/scope -> functions/arrows/closures -> arrays and methods -> objects/destructuring -> Map/Set -> control flow -> errors -> modules -> async (callbacks -> promises -> async/await -> event loop) -> classes -> DOM basics (optional) -> Node basics (fs, process) -> TS types -> unions/narrowing -> generics -> zod.

**Linux/shell**: navigation -> files -> permissions -> pipes/redirection -> grep/sed/awk -> processes/signals -> env/PATH -> scripting basics -> quoting -> find/xargs -> archives -> cron -> systemd/logs -> networking tools -> ssh.

**Data structures and algorithms**: complexity intuition -> arrays/strings patterns (two pointers, sliding window) -> hash maps/sets -> stacks/queues -> recursion -> sorting -> binary search -> linked lists -> trees/BST -> heaps -> graphs (BFS/DFS) -> greedy -> DP -> advanced graphs (Dijkstra, topo, union-find) -> tries/strings -> bit tricks.

**SQL/data**: select/where/order -> aggregates -> joins -> subqueries/CTEs -> window functions -> DML/transactions -> schema design/normalization -> indexes/EXPLAIN -> migrations -> pandas/polars basics.

**Web/APIs**: HTTP semantics -> a server with routes -> validation -> persistence -> auth (sessions) -> REST design -> testing APIs -> caching -> background jobs -> frontend fundamentals -> a full small app.

**DevOps**: Dockerfile -> run/volumes/networks -> Compose -> CI pipeline -> IaC intro -> k8s basics -> observability -> deployment strategies.

**Security**: threat modeling -> input validation -> injection -> XSS/CSRF -> auth/passwords -> authorization/IDOR -> secrets -> crypto literacy -> Linux hardening -> forensics basics.

**Systems**: binary/hex -> bitwise -> encodings -> floats -> memory model -> C pointers/arrays -> heap/stack -> UB and sanitizers -> Rust ownership -> Rust enums/traits -> OS concepts (processes, syscalls) -> binary formats.

## Session templates (planner room grammars)
- **New concept**: Predict puzzle -> Shrine -> Parsons -> Encounter (d-1) -> Encounter (d) -> Rest -> Boss(light).
- **Practice**: Rest -> Encounter -> Puzzle x3 -> Encounter -> Elite? -> Boss.
- **Review sweep** (Bit Rot heavy): Rest -> Encounter(review) x3 -> Puzzle -> Boss(review composite).
- **Project day**: Shrine(project brief) -> Boss(multi-phase) only, with Merchant before.

## Oath weight examples
`Oath of the Interview`: ds 0.4, algo 0.4, concept 0.1, py/js 0.1; tiers 1-3; prefers Elites.
`Oath of the Citadel`: sh 0.3, os 0.2, devops 0.3, net 0.2; requires Docker runner.

## Granularity check
If a node has no failing challenge for the user within 3 runs at difficulty >= 6, it is too easy or too coarse: split it. If the user Retreats twice on the first encounter after the Shrine, the Shrine is too thin or a prerequisite is missing: add an edge.
