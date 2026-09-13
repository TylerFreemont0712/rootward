# Error tag taxonomy

Tags are kebab-case strings attached to attempts. They are evidence of *how* the player failed, which is more
useful than *that* they failed. Sources: test names (`test_empty_input` -> `empty-input`), static checks (banned
tokens, nesting depth), the runner (timeout -> `timeout`), the Reviewer (rubric comments mapped to tags), and the
Tutor (when the player explains their confusion). Tags drive Tutor prompt fragments, planner priorities, enemy move
selection, and Chronicle insights.

## Conventions
- One concept per tag; prefer the misconception name over the symptom (`aliasing`, not `wrong-output`).
- Every tag has a category, a one-line description, a detection hint, and a remediation node (where to learn).
- Tags decay like everything else: weight = count in the last 30 days, halved each month.
- Add new tags in `content/packs/<pack>/tags.yaml`; the schema requires all four fields.

## Catalog (starter set)
| Tag | Category | Description | Detection | Remediation node |
|---|---|---|---|---|
| off-by-one | logic | boundary error in loop/range/slice | test names with `boundary`, `last`, `first`; mutation of `<`/`<=` | concept.iteration |
| empty-input | logic | unhandled empty/zero-length input | tests named `empty` | concept.edge-cases |
| missing-base-case | logic | recursion without/with wrong base case | RecursionError / stack overflow | algo.recursion |
| missing-visited | logic | graph traversal loops forever | timeout on graph tests | algo.bfs |
| greedy-wrong | logic | greedy where DP is needed | fails the counterexample test | algo.dp.intro |
| binary-search-bounds | logic | wrong mid/lo/hi update | fails first/last occurrence tests | algo.search.binary |
| assignment-vs-equality | language | `=` vs `==` | syntax/static check | py.basics.variables |
| aliasing | language | shared reference mutation | tests named `original-unchanged` | py.collections.list |
| mutable-default | language | Python default arg mutation | static check | py.functions.args |
| closure-capture | language | loop variable captured late | tests on closures in loops | js.functions.closures |
| loose-equality | language | JS `==` coercion | static check | js.basics.values |
| identity-vs-equality | language | `is` vs `==` | static check | py.basics.values |
| string-immutability | language | item assignment on string | TypeError pattern | py.strings.basics |
| float-equality | numeric | exact float comparison | tests named `precision` | concept.floating-point |
| numeric-precision | numeric | int/float division and rounding | tests named `rounding` | py.basics.values |
| integer-overflow | numeric | overflow or 2^53 precision | large-number tests | sys.bits |
| mutating-while-iterating | data-structure | modifying collection during iteration | tests on removal loops | py.collections.list |
| quadratic-membership | performance | `in` on list inside loop | efficiency band failure + static | ds.hashmap |
| hidden-linear-op | performance | shift/insert/concat in loops | band failure + static | concept.complexity |
| missing-memo | performance | recomputation | band failure on overlapping subproblems | algo.dp.intro |
| sort-in-loop | performance | repeated sorting | static | concept.complexity |
| timeout | runtime | exceeded time limit | runner | concept.complexity |
| oom | runtime | exceeded memory | runner | concept.space |
| missing-await | async | promise used as value | tests on async results | js.async.await |
| unbounded-concurrency | async | too many in flight | instrumented fake | concept.concurrency |
| tocttou | async | check-then-act race | stress tests | concept.concurrency |
| lock-ordering | async | deadlock | timeout on lock tests | concept.concurrency |
| swallowed-error | errors | bare except / catch-all | static | py.errors.exceptions |
| continue-after-error | errors | proceeding with bad state | tests on error paths | concept.error-handling |
| unsafe-retry | errors | retrying non-idempotent ops | tests with side-effect counters | web.reliability |
| resource-leak | errors | missing cleanup | tests on finally/close | py.io.files |
| unquoted-variable | shell | word splitting bug | check.sh with spaces in names | sh.scripting.quoting |
| parsing-ls | shell | iterating `ls` output | static | sh.scripting.basics |
| dangerous-expansion | shell | `rm -rf $VAR/` patterns | static (never executed) | sh.scripting.quoting |
| unchecked-exit-code | shell | ignoring `$?` / no `set -e` | check.sh | sh.scripting.basics |
| root-everything | shell | unnecessary root/sudo | transcript analysis | os.users-groups |
| sigkill-first | shell | `kill -9` before TERM | transcript | sh.processes |
| null-comparison | sql | `= NULL` | static | sql.select |
| n+1-query | sql | one query per row inside a loop | statement counter in the SQL runner | sql.join |
| join-fanout | sql | duplicated rows inflate aggregates | result comparison | sql.join |
| offset-pagination | sql | OFFSET at scale | band | sql.pagination |
| missing-index | sql | seq scan where index expected | EXPLAIN check | sql.index |
| sql-injection | security | string-built SQL | static + exploit test | sec.injection |
| xss-encoding | security | wrong/no output encoding | exploit test | sec.xss |
| idor | security | missing object authorization | exploit test | sec.auth |
| path-traversal | security | unsanitized path join | exploit test | sec.input |
| weak-randomness | security | non-CSPRNG for secrets | static | sec.crypto-basics |
| secret-leak | security | secret in log/URL/repo | static/grep | sec.secrets |
| timing-leak | security | non-constant-time compare | statistical test | sec.crypto-basics |
| tautological-test | testing | test cannot fail | mutation survivors | test.tdd |
| mock-everything | testing | over-mocking | Reviewer | test.doubles |
| missing-edge-case | testing | tests lack boundaries | mutation survivors | test.tdd |
| sleep-in-test | testing | timing-based sync | static | test.determinism |
| god-object | design | class does everything | Reviewer/metrics | design.solid |
| premature-abstraction | design | abstraction before need | Reviewer | design.principles |
| arrow-code | design | deep nesting | static (depth >= 4) | design.readability |
| magic-number | design | unexplained constants | static | design.readability |
| flag-argument | design | boolean parameters switching behavior | Reviewer | design.readability |
| inheritance-misuse | design | inheritance for reuse | Reviewer | paradigm.oop.composition |
| unvalidated-input | design | trusting input at boundaries | tests with malformed input | web.validation |
| unread-error | process | ignored the error message | Tutor observation | debug.reading |
| shotgun-debugging | process | random edits between Casts | diff analysis (many unrelated changes) | debug.method |
| suspiciously-fast | process | full pass in seconds with no Probe | timing | none (honesty dashboard) |

## How tags flow
1. Attempt recorded with `tags: string[]` from all sources (deduped).
2. Learner model increments `errorTags[tag]` with timestamp.
3. Planner: nodes whose remediation is heavily tagged get priority; enemy templates with matching moves are preferred.
4. Tutor prompt includes the top 3 recent tags with their Socratic fragments (`pedagogy/hint-design.md`).
5. Chronicle shows tag trends; a tag that stops appearing is "retired" with a small celebration.
