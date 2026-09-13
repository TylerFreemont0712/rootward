# Challenge bank

Concrete, one-line challenge ideas beyond those listed at the end of each `ideas/theory/*.md` file. Columns:
kind (code/terminal/sql/tests/fix/readcode/parsons/predict/design), difficulty 1-10, concepts (node ids or tags),
spec, and a twist (Elite/variant). Enemy names are suggestions; reuse the bestiary in `PROMPT.md` Appendix A.

## Foundry (fundamentals)
| Name | Kind | Diff | Concepts | Spec | Twist |
|---|---|---|---|---|---|
| Vowel Counter | code | 1 | strings, loops | count vowels case-insensitively | Constraint: no loops (use comprehension/regex) |
| Grade Ladder | code | 1 | conditionals | score -> letter with boundaries | Edge Case: 100, negative, float |
| Sum of Digits | code | 1 | numbers, loops | digit sum of an int | recursive variant |
| Leap Year Gate | code | 1 | conditionals | leap year rules | Mutants for Oracle |
| Reverse Words | code | 2 | strings, split/join | reverse word order, normalize spaces | keep punctuation attached |
| Title Case Troll | code | 2 | strings | title case with small-word exceptions | unicode names |
| List Rotator | code | 2 | lists, slicing | rotate by k (negative k too) | in-place, O(1) extra |
| Max Streak | code | 2 | loops, state | longest run of equal elements | streak of increasing values |
| Nested Sum | code | 2 | recursion | sum arbitrarily nested lists | with dicts too |
| Flatten Dict | code | 3 | dicts, recursion | `{a:{b:1}}` -> `{"a.b":1}` | unflatten back |
| Merge Intervals Lite | code | 3 | sorting, lists | merge overlapping ranges | streaming input |
| FizzBuzz Elite | code | 3 | control flow | classic | Constraint: no `if`/ternary |
| Shopping Cart | code | 3 | dicts, classes | add/remove/total with discounts | float money trap -> use ints |
| Word Wrap Wisp | code | 3 | strings | wrap text at width without breaking words | hyphenate long words |
| Matrix Spiral | code | 4 | 2D lists | spiral order traversal | rotate matrix in place |
| Bank Account | code | 3 | classes, errors | deposit/withdraw with custom exceptions | transaction history + undo |
| Parse Duration | code | 3 | strings, parsing | "1h30m15s" -> seconds | back to string, normalize |
| Group By Key | code | 3 | dicts, higher-order | `group_by(items, keyfn)` | stable ordering guaranteed |
| Pagination Helper | code | 2 | arithmetic | page count, slice for page n | 1-indexed vs 0-indexed trap |
| Simple Calculator REPL | code | 4 | parsing, loops, errors | evaluate `a op b` lines from stdin | precedence (bridge to compilers) |
| Roman to Int Elite | code | 4 | mapping | with subtractive notation | validate malformed input |
| Deep Equal | code | 4 | recursion, types | structural equality for nested data | cycles detection |
| Config Merger | code | 4 | dicts, recursion | deep merge with override rules | list merge strategies |
| Frequency Sort | code | 4 | dicts, sorting keys | sort by frequency then value | stable, ties |
| Iterator Chain | code | 4 | generators | `take`, `chunked`, `pairwise` lazily | infinite inputs must work |
| Money Type | code | 5 | classes, dunder | Money with currency, `__add__`, `__eq__`, formatting | rounding rules per currency |
| JSON Pretty Printer | code | 5 | recursion, strings | pretty print without json lib | sort keys, indent option |
| Retry Decorator | code | 5 | decorators, closures | `@retry(times, exceptions)` | with backoff and fake sleep |
| Event Emitter | code | 4 | closures, dicts | on/off/emit with once | wildcard events |
| LRU Lite | code | 5 | OrderedDict/Map | capacity-bound cache | TTL variant |

## Grove (data structures and algorithms)
| Name | Kind | Diff | Concepts | Spec | Twist |
|---|---|---|---|---|---|
| Valid Parentheses | code | 3 | stack | balanced brackets | return error index |
| Two Sum Sorted | code | 3 | two pointers | pair summing to target in sorted array | three sum |
| Anagram Groups | code | 3 | hashing | group anagrams | unicode normalization |
| Kth Largest | code | 4 | heap/quickselect | kth largest element | streaming variant |
| Merge K Lists | code | 5 | heap | merge k sorted iterables lazily | memory band |
| Binary Tree Traversals | code | 4 | trees, recursion | in/pre/post/level order | iterative with explicit stack |
| Lowest Common Ancestor | code | 5 | trees | LCA in binary tree | in BST (easier) |
| Serialize Tree | code | 5 | trees, strings | serialize/deserialize | compact encoding band |
| Course Schedule | code | 5 | topo sort | can finish courses? | return an order |
| Number of Islands | code | 4 | BFS/DFS | count components in grid | perimeter of largest |
| Rotten Oranges | code | 5 | multi-source BFS | minutes until all rotten | 3D grid |
| Min Cost Path | code | 5 | DP | grid path min sum | with obstacles and teleports |
| Longest Common Subsequence | code | 5 | DP | LCS length | reconstruct string |
| Word Break | code | 6 | DP, memo | segment string by dictionary | all segmentations |
| Trie Autocomplete | code | 5 | trie | top-3 completions by frequency | fuzzy (1 edit) |
| Union Find Friends | code | 5 | DSU | friend circles count | dynamic queries |
| Dijkstra Grid | code | 6 | shortest path | weighted grid path | A* for time band |
| Cycle in Linked List | code | 4 | Floyd | detect and find start | remove cycle |
| Sliding Window Max | code | 6 | monotonic deque | max in each window | min and max together |
| Top K Frequent | code | 4 | heap, counting | most frequent k | bucket sort O(n) band |
| Meeting Rooms | code | 5 | intervals, heap | min rooms needed | schedule assignment |
| Subsets and Permutations | code | 5 | backtracking | generate all | with duplicates |
| Sudoku Validator | code | 4 | 2D, sets | valid board? | solver (Elite 8) |
| Rabin-Karp | code | 7 | rolling hash | substring search | multiple patterns |
| KMP | code | 8 | prefix function | linear substring search | count occurrences |
| Segment Tree | code | 8 | range queries | sum with point updates | lazy propagation |
| Bit Counter | code | 4 | bits | count bits 0..n | O(n) DP band |

## Kernel Halls (terminal)
| Name | Kind | Diff | Concepts | Spec | Twist |
|---|---|---|---|---|---|
| Find the Flag | terminal | 1 | find, cat | locate a file by name pattern | by size and mtime |
| Hidden in Plain Sight | terminal | 1 | ls -a, dotfiles | read a hidden config | in a hidden dir tree |
| Count the Lines | terminal | 1 | wc, pipes | count lines matching pattern across files | unique matches |
| Top Talkers | terminal | 3 | sort, uniq, awk | top 5 IPs in access log | by bytes not hits |
| Rename Rampage | terminal | 3 | for loops, mv, parameter expansion | rename 100 files `.txt` -> `.md` | with spaces in names |
| Backup Bundle | terminal | 2 | tar, gzip, sha256sum | archive and checksum | exclude patterns |
| Who Owns This | terminal | 2 | chown, chmod | fix a web root's ownership and modes | setgid on dirs |
| Kill the Right One | terminal | 2 | ps, pgrep, kill | stop the runaway process, not its sibling | graceful then force |
| Env Enigma | terminal | 2 | env, export, .bashrc | make a var persistent for the user | for a systemd service |
| Sed Surgeon | terminal | 3 | sed -i | replace a config value in place, keep a backup | multi-file |
| Awk Accountant | terminal | 4 | awk | per-category totals from CSV | with header and quoted fields (trap) |
| Cron Keeper | terminal | 3 | crontab | schedule with logging | timer unit instead |
| Link Labyrinth | terminal | 3 | ln -s, readlink | fix a broken symlink chain | relative vs absolute |
| Port Detective | terminal | 3 | ss, lsof | which process holds :8080 | free it and restart the right one |
| Disk Detective | terminal | 3 | du, find -size | free 500MB safely | log rotation config |
| Script Doctor | terminal | 4 | shellcheck, quoting | fix a broken script | pipefail interplay |
| DNS Doctor | terminal | 4 | resolv.conf, hosts, dig | fix name resolution | split DNS |
| SSH Setup | terminal | 4 | ssh-keygen, authorized_keys, sshd_config | key auth to a second container | disable root login |
| Service Sentinel | terminal | 5 | systemd units | write and enable a unit | with EnvironmentFile and restart policy |
| Log Rotation | terminal | 4 | logrotate | configure rotation for an app | compress and postrotate |
| Firewall Fixer | terminal | 5 | nftables/ufw | allow 22 and 80 only | rate limit ssh |
| Permission Escalation Audit | terminal | 6 | find -perm, setuid | find and neutralize a suspicious setuid binary | capabilities |
| Namespace Nook | terminal | 7 | unshare, nsenter | run a process in its own PID namespace | mount namespace |
| Zombie Hunt | terminal | 4 | ps, signals | reap zombies via parent | write a reaper |

## Archives (SQL and data)
| Name | Kind | Diff | Concepts | Spec | Twist |
|---|---|---|---|---|---|
| Top Customers | sql | 2 | joins, group by | top 5 by total spend | last 30 days only |
| Orphan Orders | sql | 3 | anti join | orders without customers | fix with FK migration |
| Monthly Revenue | sql | 3 | date functions, group | revenue per month | fill missing months |
| Running Balance | sql | 4 | window | balance over time per account | reset per year |
| Rank Per Category | sql | 4 | window | top 3 products per category | ties handling |
| Employee Tree | sql | 5 | recursive CTE | reports chain and depth | path string |
| Dedupe Rows | sql | 4 | window, delete | remove duplicates keeping newest | in one statement |
| Slow Query Surgery | sql | 6 | EXPLAIN, indexes | make query use index | composite order matters |
| Upsert Import | sql | 4 | ON CONFLICT | idempotent load | partial updates |
| Schema Design: Library | design+sql | 5 | modeling | design and create tables for loans | overdue report |
| Time Zone Trap | sql | 5 | timestamptz | events per local day | DST boundary test |
| Inventory Transaction | code+sql | 6 | transactions | decrement stock safely under concurrency | isolation level choice |
| CSV to Table | code | 3 | csv, sqlite | load CSV with types | malformed rows report |
| Pandas Cleanup | code | 4 | pandas | normalize messy columns | polars variant |
| Keyset Pages | code+sql | 5 | pagination | cursor API over composite key | backwards paging |

## Spire (software and web)
| Name | Kind | Diff | Concepts | Spec | Twist |
|---|---|---|---|---|---|
| Todo API | code | 4 | routes, validation | CRUD with zod/pydantic | ETag caching |
| Health and Ready | code | 3 | endpoints | liveness/readiness with dependency checks | graceful shutdown |
| Session Gate | code | 5 | cookies, auth | login/logout with sessions | CSRF token |
| Rate Limit Middleware | code | 5 | middleware, time | token bucket per IP | Redis-backed |
| File Upload | code | 5 | multipart, validation | upload with size/type limits | streaming to disk |
| Job Queue Lite | code | 6 | workers, retries | in-memory queue with retries and DLQ | SQLite-backed |
| Webhook Receiver | code | 5 | HMAC, idempotency | verify and dedupe | replay attack test |
| Feature Flags | code | 4 | config, design | flag service with percentage rollout | deterministic bucketing |
| Config Loader | code | 4 | env, validation | typed config from env with defaults | secret masking in logs |
| Plugin Loader | code | 6 | modules, validation | discover and validate plugins | version compatibility |
| Undo Stack | code | 5 | command pattern | text buffer undo/redo | group edits |
| Dependency Injection | code | 5 | DI | make code testable | container with scopes |
| Observer Store | code | 5 | reactive | tiny store with computed | batching updates |
| Markdown to HTML Lite | code | 6 | parsing | headings, lists, links, code | escaping (XSS bridge) |
| React Todo (client) | code | 4 | components, state | keyboard-accessible list | optimistic updates |
| Fetch with Cache | code | 5 | async, caching | dedupe in-flight, TTL | stale-while-revalidate |
| Contract Test | tests | 6 | OpenAPI | validate server against spec | consumer-driven |

## Cloud Citadel (DevOps)
| Name | Kind | Diff | Concepts | Spec | Twist |
|---|---|---|---|---|---|
| Dockerfile Diet | terminal | 4 | multi-stage | shrink image | distroless |
| Compose Stack | terminal | 5 | compose, healthchecks | app + db + cache | profiles for dev/test |
| CI Matrix | code | 5 | GitHub Actions | lint/test matrix with cache | reusable workflow |
| Rolling Update | terminal | 7 | compose/k8s | zero-downtime update | rollback |
| Secrets Hygiene | terminal | 5 | secrets | move secrets out of image | docker secrets |
| Ansible Idempotence | terminal | 6 | ansible | playbook runs clean twice | handlers |
| Terraform Module | code | 6 | IaC | module with variables/outputs | validate + fmt checks |
| k8s Deployment | code | 6 | manifests | deployment+service+probes | HPA |
| Log Pipeline | terminal | 6 | structured logs, jq | parse and alert on error rate | vector/fluent config |
| Backup and Restore | terminal | 6 | pg_dump | verified restore | point-in-time narrative |
| Runbook Writer | design | 5 | ops | write a runbook for a scenario | Examiner rubric |

## Shadow Bazaar (security)
| Name | Kind | Diff | Concepts | Spec | Twist |
|---|---|---|---|---|---|
| Parameterize It | fix | 4 | SQLi | fix injection | ORM misuse variant |
| Encode by Context | fix | 5 | XSS | fix template escaping | DOM XSS |
| Check the Owner | fix | 5 | IDOR | add authz checks | tenant isolation |
| Canonical Path | fix | 5 | traversal | safe file serving | symlink escape |
| Constant Time | fix | 6 | timing | secure compare | rate limit too |
| Hash the Password | fix | 4 | argon2 | replace md5 | migrate on login |
| Sign the Webhook | code | 5 | HMAC | verify signatures | key rotation |
| CSP Builder | code | 6 | headers | build a CSP that blocks inline scripts | nonce-based |
| JWT Verify | fix | 6 | JWT | validate alg/exp/aud | key rotation with kid |
| SSRF Guard | fix | 7 | SSRF | block internal ranges | DNS rebinding |
| Secrets Scan | terminal | 4 | git, grep | find and purge secrets | pre-commit hook |
| Cipher Chain | puzzle | 3 | encodings | decode base64/hex/rot | frequency analysis |
| Forensic Timeline | terminal | 7 | forensics | reconstruct an intrusion from logs | persistence removal |
| Dependency Audit | terminal | 5 | SCA | upgrade vulnerable dep | lockfile pinning |

## Ruins of Legacy (debugging/refactoring)
| Name | Kind | Diff | Concepts | Spec | Twist |
|---|---|---|---|---|---|
| Read the Trace | readcode | 2 | stack traces | root cause line | across async |
| Bisect | terminal | 5 | git bisect | find bad commit | automated with a script |
| Characterization | tests | 5 | legacy | pin behavior | then refactor |
| Extract Function | fix | 4 | refactoring | split a long function | Reviewer rubric |
| Rename Rampage (code) | fix | 3 | naming | rename bad identifiers | across files |
| Kill the Global | fix | 5 | state | remove global mutable state | DI |
| Flaky Fix | fix | 6 | tests | fix 3 flaky tests | root causes vary |
| Leak Hunt | fix | 7 | memory | find listener leak | heap snapshot script |
| Strangler | fix | 7 | migration | replace legacy module incrementally | dual-run verification |
| Obfuscated Oracle | readcode | 6 | reading | explain what minified code does | rewrite readable |
| Dead Code Sweep | fix | 4 | tooling | remove unused code safely | coverage-guided |

## Silicon Depths (low level)
| Name | Kind | Diff | Concepts | Spec | Twist |
|---|---|---|---|---|---|
| Hex Dump | code | 3 | bytes | implement xxd-like output | reverse |
| UTF-8 Codec | code | 6 | encodings | encode/decode | invalid sequences |
| Two's Complement | puzzle | 3 | ints | convert/add | overflow |
| Float Facts | puzzle | 4 | IEEE 754 | which are true | ulp |
| C Strings | code (C) | 5 | pointers | strlen/strcpy/strcat safely | sanitizer tests |
| Dynamic Array in C | code (C) | 6 | malloc | growable vector | realloc failure handling |
| Rust Ownership Fix | fix (Rust) | 6 | borrowing | make it compile without clone | lifetimes |
| Rust Enum Parser | code (Rust) | 6 | enums, match | parse tokens into enum | error type |
| PNG Chunks | code | 5 | binary formats | list chunks with CRC check | write a chunk |
| Bit Fields | code | 5 | bits | pack/unpack a header | endianness |
| Syscall Trace | terminal | 6 | strace | diagnose a hang | ltrace |
| Fork Pipe | code | 6 | processes | spawn and pipe | exec chain |

## Observatory (AI)
| Name | Kind | Diff | Concepts | Spec | Twist |
|---|---|---|---|---|---|
| Prompt for JSON | code+eval | 4 | structured output | pass eval set | schema evolution |
| Cosine Search | code | 4 | embeddings | top-k over vectors | normalized vs not |
| Chunk and Retrieve | code+eval | 6 | RAG | chunking strategy hits targets | rerank |
| Tool Loop | code | 6 | agents | loop with budget and validation | parallel tools |
| Injection Shield | code+eval | 6 | safety | ignore embedded instructions | multi-language |
| Eval Harness | code | 5 | evals | rubric + regression | LLM judge calibration |
| Token Packer | code | 5 | tokens | never exceed limit | priority packing |
| Tiny Classifier | code | 5 | sklearn | F1 band | leakage check |

## Assembly (system design)
| Name | Kind | Diff | Concepts | Spec | Twist |
|---|---|---|---|---|---|
| Design: Shortener | design | 5 | fundamentals | diagram + trade-offs | rubric |
| Design: Chat | design | 7 | realtime | presence, fan-out | scale to 1M |
| Consistent Hashing | code | 7 | partitioning | ring with vnodes | rebalancing test |
| Idempotent Consumer | code | 6 | queues | survive redelivery | ordering |
| Outbox | code | 7 | transactions | poller with crash test | exactly-once-ish |
| Lease Election | code | 8 | coordination | fencing tokens | clock skew |
| Saga | code | 8 | workflows | compensations | partial failures |
| Capacity Math | puzzle | 5 | estimation | numbers within tolerance | cost |

## Cross-realm quest chains (multi-run arcs)
- **The Shortener Saga**: Foundry (parse URLs) -> Archives (schema) -> Spire (API) -> Citadel (container + CI) -> Shadow (security fixes) -> Assembly (scale design).
- **The Log Pipeline**: Kernel Halls (shell parsing) -> Foundry (parser) -> Archives (load to SQL) -> Spire (dashboard endpoint) -> Citadel (scheduled job).
- **The Language**: Foundry (tokenizer) -> Grove (parser trees) -> Spire (interpreter design) -> Depths (bytecode VM) -> Observatory (LLM writes programs, your evals grade them).
- **The Incident**: Citadel (alerts) -> Kernel Halls (investigate) -> Shadow (forensics) -> Ruins (fix the bug) -> Assembly (postmortem design rubric).
