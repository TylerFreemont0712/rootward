# Boss and project ideas

Bosses ("Legacy Systems") are multi-phase. Each phase has its own check set; phases may add constraints; the enemy
"changes form" between phases. Project bosses are what makes the game more than a quiz: they leave the player
with a real artifact they built. Every boss below lists phases and the verification approach.

## Tier 1-2 bosses (30-45 min)
1. **Tally Titan** — word counting tool. P1: count words from stdin. P2: CLI flags (top-k, ignore-case). P3: read multiple files with error handling. Verify: io tests + argument parsing tests.
2. **The Ledger** — CSV bank ledger. P1: parse. P2: balances per account. P3: detect anomalies (duplicate ids, negative balances) with a report. Verify: unit + golden report.
3. **Inventory Keeper** — classes + persistence. P1: item model with validation. P2: JSON save/load with versioning. P3: undo. Verify: unit tests, round-trip property tests.
4. **Maze Runner** — grid maze. P1: parse maze. P2: BFS shortest path. P3: render path; P4 (Elite): A* with time band on large mazes.
5. **Text Adventure Engine** — data-driven rooms. P1: room graph from JSON. P2: commands parser. P3: inventory and win condition. Verify: scripted playthrough tests.

## Tier 2-3 bosses (45-90 min)
6. **URL Shortener** — P1: schema + create/resolve. P2: validation, 404, collision handling. P3: rate limiting and stats. P4: HTML front end. Verify: HTTP integration tests in container; Playwright for P4.
7. **Calculator Language** — lexer -> parser -> evaluator. P1: tokens. P2: precedence. P3: variables + functions. P4: error messages with positions. Verify: AST and evaluation golden tests.
8. **Mini Shell** — P1: run commands with args. P2: pipes. P3: redirection. P4: `cd`, env vars, exit codes. Verify: scripted sessions in a container comparing outputs.
9. **HTTP Server from Sockets** — P1: parse requests. P2: static files with correct types. P3: keep-alive and concurrency. P4: a tiny router. Verify: curl-based tests; concurrent client harness.
10. **Key-Value Store** — P1: in-memory GET/SET/DEL over TCP with a RESP-like protocol. P2: TTL. P3: append-only log persistence and recovery. P4: snapshotting. Verify: protocol tests + crash/recover script.
11. **Mini Git** — P1: hash objects (blob/tree). P2: commit and log. P3: checkout. P4: diff. Verify: compare object hashes with real git for the same tree.
12. **Task Queue with Workers** — P1: enqueue/dequeue with SQLite. P2: worker pool with retries. P3: visibility timeout and dead letters. P4: metrics endpoint. Verify: chaos script kills workers mid-job.
13. **Static Site Generator** — P1: Markdown subset. P2: templates and front matter. P3: index and tags. P4: incremental builds. Verify: golden site output.
14. **Log Analytics Pipeline** — P1: parse nginx logs. P2: aggregates (SQL). P3: alerts on error rate. P4: scheduled job in a container. Verify: golden aggregates; cron check.
15. **The Spaghetti Monster** — legacy refactor. P1: characterization tests to coverage target. P2: extract modules with Reviewer >= 7. P3: add a feature. Verify: hidden tests + rubric.
16. **Merge Conflict** — P1: resolve 3 conflicting branches so tests pass. P2: interactive rebase to clean history. P3: write the PR description (Examiner). Verify: git checks.
17. **Normalize** — P1: 3NF schema. P2: migration script from the flat table. P3: rewrite queries. P4: indexes for the slow ones. Verify: result-set equivalence + EXPLAIN checks.
18. **Dependency Resolver** — P1: parse version constraints. P2: resolve a DAG with semver ranges. P3: detect conflicts with a helpful message. P4 (Elite): backtracking resolver. Verify: fixture manifests.
19. **Regex Engine** — P1: parse pattern to AST. P2: NFA simulation. P3: classes/anchors/quantifiers. P4: ReDoS-resistant time band. Verify: test suite vs Python `re` results.
20. **Text Editor Core** — P1: piece table or gap buffer. P2: undo/redo. P3: search/replace. P4: large-file performance band. Verify: property tests against a naive string model.

## Tier 3-4 bosses (multi-session projects)
21. **The Monolith** — split a monolith Compose into services with a reverse proxy, then rolling updates and a rollback drill. Verify: chaos and uptime script.
22. **Rootkit** — forensic cleanup and hardening of a compromised container; final phase writes the incident report (Examiner). Verify: persistence checks and hardening checks.
23. **Chat Server** — WebSocket rooms, presence, backpressure, persistence, then a load test. Verify: harness with 500 fake clients.
24. **Lisp** — a Scheme subset with closures, TCO, macros-lite, and a REPL. Verify: golden programs.
25. **Bytecode VM** — compile the calculator language to bytecode; VM with a call stack; then a garbage-collected heap for lists. Verify: instruction counts and results.
26. **Event-Driven Order System** (The Assembly final) — three services, a queue, outbox, idempotent consumers, saga compensation, dashboard; chaos script; design doc (Examiner). Verify: invariants after chaos.
27. **RAG Librarian** — index the game's own Library, retrieval with evals, injection resistance, cost budget. Verify: eval set thresholds.
28. **Interpreter for the Game** (Automation realm) — expose a scripting API (JS in the wasm-js runner) that lets scripts play Puzzle rooms automatically; the player writes bots; verify by bot success rate. Bitburner-style meta.
29. **Bring Your Own Repo** — the game analyzes a user-provided repo (in a container) and generates characterization-test, refactor, and documentation phases from it. Verify: tests the player writes must pass and coverage must rise. (Needs Forge; late backlog.)
30. **Own Language Track** — the player designs a small language spec (Examiner) then implements it via bosses 7, 24, 25.

## Boss design rules
- Every phase is independently checkable and saves progress (a boss can span sessions).
- Phase 1 should be winnable by anyone who reached the boss; the final phase should need everything the run taught.
- Provide a `README` in the starter files describing the project like a real ticket.
- Bosses drop a **Tome** (reference for the domain) and a **Spell Fragment** (the player picks a function to keep).
- Boss forms: the enemy card shows a different sprite/glyph per phase and taunts with the failing checks' themes.
