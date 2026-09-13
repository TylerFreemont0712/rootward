# Error handling

## Concepts
- Errors vs exceptions vs panics vs bugs. Expected failures (user input, network) vs programmer errors (assertions).
- Exception mechanics: try/except/else/finally, exception hierarchies, chaining (`raise ... from`), re-raising, custom exceptions with fields, catching narrowly, never bare `except:`.
- Error values: Go's `(value, err)`, Rust `Result<T, E>` and `?`, TS discriminated result types; when a language prefers which.
- Where to handle: handle where you can do something meaningful; convert at boundaries (infrastructure error -> domain error -> HTTP status); log once, not at every layer.
- Fail fast, validate inputs at the edge, invariants with assertions.
- Cleanup: context managers (`with`), `try/finally`, RAII (Rust/C++ Drop), `defer` (Go), `using` (TS explicit resource management).
- Retries: idempotency, exponential backoff with jitter, retry budgets, circuit breakers, dead-letter queues; which errors are retryable.
- Timeouts and cancellation: AbortSignal, deadlines, cooperative cancellation.
- Partial failure in batches; all-or-nothing vs best-effort; reporting multiple errors (error aggregation).
- Error messages: actionable, include context (ids, values), never leak secrets; user-facing vs log-facing.
- Async errors: unhandled promise rejections, errors inside callbacks, `Promise.allSettled`.
- Exit codes and stderr in CLIs; signals.
- Observability: structured logging, error tracking, correlation ids.

## Misconceptions / error tags
- Bare except / catch-all swallowing (`swallowed-error`)
- Catching to print and continue with bad state (`continue-after-error`)
- Using exceptions for control flow in hot loops (`exception-control-flow`)
- Retrying non-idempotent operations (`unsafe-retry`)
- Missing finally/cleanup (`resource-leak`)
- Error message without context (`vague-error`)

## Challenge ideas
1. **Exception Exorcism** — replace `except: pass` with proper handling; tests assert specific exception types and messages.
2. **Result Rat** — implement `Result` type in TS/Python with `map`, `andThen`, `unwrapOr`; tests chain operations.
3. **Retry Revenant** — write `retry(fn, {attempts, backoff, jitter, retryOn})` with a fake clock; hidden tests script failure sequences.
4. **Context Manager Crypt** — write a context manager that always releases a lock; tests raise inside the block.
5. **Boundary Bouncer** — map internal errors to HTTP status codes in a tiny handler; tests check no stack traces leak.
6. **The Partial Batch** — process 100 records; some fail; return a report; never lose successful work.
7. **Timeout Troll** — wrap an async function with a timeout using AbortSignal; test that the underlying work is cancelled.
8. **Panic Room** (Rust/Go track) — convert panics/unwraps to proper error propagation.
