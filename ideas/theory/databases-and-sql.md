# Databases and SQL (The Archives; the Keeper's home)

## Relational foundations
- Tables, rows, columns, keys (primary, foreign, composite, surrogate vs natural), constraints (NOT NULL, UNIQUE, CHECK, FK actions), NULL semantics (three-valued logic), data types, schemas and migrations.
- Normalization (1NF-3NF, BCNF) and deliberate denormalization; ER modeling; one-to-many, many-to-many via junction tables; modeling hierarchies (adjacency list, closure table, recursive CTE), soft deletes, audit columns, time (UTC, timestamptz).

## SQL
- `SELECT` pipeline order (FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY, LIMIT) and why aliases fail in WHERE.
- Joins (inner, left/right, full, cross, self, anti/semi joins via NOT EXISTS), join pitfalls (fan-out duplication).
- Aggregates, GROUP BY, HAVING, DISTINCT, window functions (ROW_NUMBER, RANK, LAG/LEAD, running totals), CTEs and recursive CTEs, subqueries (correlated vs not), CASE, COALESCE, string/date functions, set operations (UNION/INTERSECT/EXCEPT), upserts (ON CONFLICT), returning clauses.
- DML and DDL, transactions (BEGIN/COMMIT/ROLLBACK), views, materialized views, stored procedures (know they exist), triggers (use sparingly).

## Performance
- Indexes: B-tree, composite (column order matters), covering, partial, unique; when indexes hurt (writes); `EXPLAIN`/`EXPLAIN ANALYZE`; seq scan vs index scan; selectivity; statistics; N+1 queries; pagination (keyset over OFFSET); batching; connection pooling.

## Transactions and concurrency
- ACID; isolation levels (read uncommitted, read committed, repeatable read, serializable) and anomalies (dirty read, non-repeatable read, phantom, write skew, lost update); locking vs MVCC; deadlocks; optimistic concurrency with version columns; idempotent writes.

## Beyond relational
- Key-value (Redis: data structures, TTL, caching patterns), document (MongoDB: schema design, embedding vs referencing), wide-column, graph, time-series, search (inverted indexes), embeddings/vector stores (see `ai-engineering.md`). CAP intuition and consistency models (see `system-design.md`). When SQLite is the right answer (often).
- ORMs: what they do, N+1, lazy vs eager loading, when to drop to SQL; query builders; migrations tooling (Drizzle in this project).
- Data pipelines: ETL/ELT, idempotent loads, schema evolution, CSV/JSON/Parquet, pandas/polars basics, data quality checks.

## Misconceptions / error tags
- `NULL = NULL` (`null-comparison`)
- Fan-out from joins inflating aggregates (`join-fanout`)
- OFFSET pagination on large tables (`offset-pagination`)
- Missing index on FK / WHERE column (`missing-index`)
- String concatenation into SQL (`sql-injection`)
- Long transactions holding locks (`long-transaction`)
- Storing money as float (`float-money`)

## Challenge ideas (Keeper; SQLite in-process first, Postgres in a container later)
1. **The Ledger of Joins** — 5 queries of increasing join complexity over a seeded shop schema; hidden tests compare result sets (order-insensitive unless ORDER BY required).
2. **N+1 Query Swarm** — an ORM-ish script issuing 101 queries; rewrite as one join; the runner counts statements.
3. **Window Wraith** — running totals, rank per group, top-3 per category with window functions.
4. **Recursive Roots** — org chart depth and paths with a recursive CTE.
5. **Index Imp** — given a slow query and EXPLAIN output, add the right composite index; runner compares plan (index scan) and timing band.
6. **Normalize** (boss) — a denormalized spreadsheet-table; design 3NF schema, write migration, migrate data, all queries still answerable; multi-phase checks.
7. **Transaction Troll** — implement a money transfer with correct transaction boundaries; tests run concurrent transfers and check invariants.
8. **Upsert Undine** — idempotent import with ON CONFLICT; tests run the import twice.
9. **Keyset Kraken** — keyset pagination over a composite sort; hidden tests check no duplicates/gaps across pages.
10. **SQL Murder Mystery** (narrative puzzle chain) — solve a case by querying; each clue is a check.
11. **Schema Sight** (Puzzle) — pick the right cardinality/keys for 5 mini domains.
12. **Redis Rune** — implement rate limiting and a leaderboard with Redis data structures (container).
13. **pandas Pipeline** — clean and aggregate a messy CSV; tests on the output frame (Python track).
