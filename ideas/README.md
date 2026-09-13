# Ideas and reference material for Rootward

This folder is **context, not spec.** `PROMPT.md` (repo root) is the build spec and `AGENT.md` is the standing
working agreement. Everything in here is raw material the build session (or the user) can draw on: programming
theory to turn into curriculum, learning-science rules that shape mechanics, banks of concrete challenge and boss
ideas, and technical options with trade-offs already worked out. Nothing here is mandatory. If a file here
conflicts with `PROMPT.md`, `PROMPT.md` wins.

**How to use this folder in a session**
- Read this index. Then read only the files relevant to the milestone at hand (the table says which).
- When authoring content, pull concept lists from `theory/`, misconception tags from
  `game-content/error-tag-taxonomy.md`, and concrete tasks from `game-content/challenge-bank.md`.
- When choosing an implementation, read the matching `solutions/` file first; each ends with a recommendation.
- Add to these files as the project grows. They are living documents. Keep the format: short sections, bullets,
  concrete examples, "challenge ideas" at the end of every theory file.

## Index

| File | What it is | Most useful for |
|---|---|---|
| `theory/fundamentals.md` | Variables, control flow, functions, scope, collections, strings, errors, I/O | M1 Foundry content |
| `theory/data-structures.md` | Arrays through graphs, tries, heaps, with operations and complexities | M1 Grove content |
| `theory/algorithms.md` | Search, sort, recursion, DP, graph algorithms, greedy, backtracking | M1+ Grove content |
| `theory/complexity-and-performance.md` | Big-O, amortized, cache effects, profiling, benchmarking | Efficiency scoring, Grove |
| `theory/paradigms.md` | Procedural, OOP, FP, declarative, reactive, data-oriented | Spire content |
| `theory/design-patterns.md` | GoF and modern patterns with when-not-to-use | Spire content, engine code |
| `theory/design-principles.md` | SOLID, DRY, KISS, YAGNI, cohesion, coupling, boundaries | Reviewer rubric, Spire |
| `theory/type-systems.md` | Static/dynamic, generics, ADTs, nullability, variance | Foundry/Spire, TS/Rust tracks |
| `theory/error-handling.md` | Exceptions, result types, panics, retries, idempotency | Foundry/Spire |
| `theory/testing.md` | Unit/integration/property/mutation/contract/snapshot testing, TDD | Oracle class |
| `theory/debugging-and-code-reading.md` | Scientific debugging, bisect, tracing, reading unfamiliar code | Necromancer, Ruins |
| `theory/git-and-version-control.md` | Git model, workflows, history surgery, recovery | Ruins, Merge Conflict boss |
| `theory/linux-and-shell.md` | Filesystem, processes, permissions, pipes, text tools, systemd | Warden, Kernel Halls |
| `theory/networking-and-http.md` | TCP/IP, DNS, HTTP semantics, TLS, sockets | Kernel Halls, Spire |
| `theory/databases-and-sql.md` | Relational model, SQL, indexes, transactions, modeling, NoSQL | Keeper, Archives |
| `theory/web-and-apis.md` | REST, GraphQL, auth flows, caching, frontend basics | Spire |
| `theory/concurrency-and-async.md` | Threads, async/await, locks, races, actors, channels | Spire (Race Condition Twins) |
| `theory/devops-containers-ci.md` | Docker, Compose, CI/CD, IaC, Kubernetes, observability | Cloud Citadel |
| `theory/security.md` | OWASP, injection, auth, crypto basics, secure coding, CTF categories | Shade, Shadow Bazaar |
| `theory/low-level-systems.md` | Memory, pointers, C/Rust, binary, CPU, OS internals | Silicon Depths |
| `theory/compilers-and-languages.md` | Lexing, parsing, ASTs, interpreters, regex engines | Artificer late game |
| `theory/system-design.md` | Scalability, caching, queues, consistency, trade-offs | The Assembly |
| `theory/ai-engineering.md` | Prompting, evals, embeddings, RAG, agents, tool use | Summoner, Observatory |
| `theory/language-idioms.md` | Idioms and gotchas per language (Python, JS/TS, Go, Rust, C, Bash, SQL) | All content, hint ladders |
| `theory/cs-foundations.md` | Discrete math, logic, number encoding, automata, information theory | Puzzle rooms |
| `pedagogy/learning-science.md` | The research behind the mechanics | Planner, room design |
| `pedagogy/assessment-and-difficulty.md` | Rubrics, evidence, Elo/IRT, mastery decay | Learner model |
| `pedagogy/hint-design.md` | Hint ladders, Socratic prompting, worked examples | Tutor prompts, hints.md |
| `pedagogy/curriculum-sequencing.md` | Prerequisite graphs, spiral curricula, tracks per language | Skill graph authoring |
| `game-content/challenge-bank.md` | Hundreds of concrete challenge ideas by realm and difficulty | Content authoring |
| `game-content/boss-and-project-ideas.md` | Multi-phase bosses and project-shaped challenges | Boss rooms |
| `game-content/puzzle-formats.md` | Non-editor puzzle types with grading rules | Puzzle rooms |
| `game-content/mechanics-backlog.md` | Extra mechanics, abilities, artifacts, modifiers | M6+ |
| `game-content/lore-and-narrative.md` | World bible, NPC voices, naming conventions, flavor banks | Loremaster prompts |
| `game-content/error-tag-taxonomy.md` | Misconceptions and bug classes as tags; maps to enemy moves | Learner model, tests |
| `solutions/sandboxing.md` | WASM, containers, gVisor, Piston/Judge0, limits, escapes | M0, M3 |
| `solutions/test-harness-per-language.md` | Sentinel protocol and adapters per language | M0, M1, M3 |
| `solutions/editor-and-terminal.md` | CodeMirror 6, xterm.js, pty plumbing, vim mode | M0, M3 |
| `solutions/ai-integration.md` | Provider abstraction, routing, structured output, caching, cost | M2 |
| `solutions/procedural-generation.md` | Dungeon graph generation, seeded RNG, constraint layouts | M1 planner |
| `solutions/persistence-and-event-sourcing.md` | Event log, snapshots, migrations, export | M1 |
| `solutions/mutation-testing.md` | Mutant operators per language, scoring, performance | M5 Oracle |
| `solutions/adaptive-difficulty.md` | Elo, Glicko, IRT, bandits for challenge selection | M1 planner |
| `solutions/plugin-architecture.md` | Content packs, runner plugins, room controllers, class hooks | M0 |
| `solutions/content-pipeline.md` | Validation, generation, promotion, CI | M0, M4 |

See also `assets/README.md` for optional CC0/OFL art, fonts, and sound already downloaded, `mockups/README.md` for
the clickable UI mock, and `content/packs/core/` + `config/` for seed files in the target formats.
