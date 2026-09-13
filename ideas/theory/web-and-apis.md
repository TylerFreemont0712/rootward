# Web and APIs (Spire of Applications)

## Backend
- Request lifecycle: routing, middleware, handlers, serialization, validation, error mapping, logging.
- REST design: resources and nouns, methods, status codes, versioning, pagination, filtering, sorting, HATEOAS (know it), OpenAPI as the contract; consistency and naming.
- GraphQL (schema, resolvers, N+1 and DataLoader), gRPC/protobuf (typed contracts, streaming), WebSockets and SSE, webhooks (signing, retries, idempotency).
- Authentication vs authorization: sessions and cookies, JWT (and its pitfalls), OAuth2/OIDC flows (authorization code + PKCE), API keys, RBAC/ABAC, password hashing (argon2/bcrypt), MFA basics.
- Validation and serialization at boundaries; DTOs; zod/pydantic.
- Background jobs and queues; scheduled tasks; idempotency; outbox pattern.
- Caching layers: HTTP caching, application cache, CDN; invalidation strategies.
- File uploads, streaming responses, rate limiting, CORS, security headers (CSP, HSTS).
- Frameworks: Fastify/Express/Hono (Node), FastAPI/Flask/Django (Python); know one deeply, the pattern generally.
- Configuration and secrets; environments; feature flags; health checks; graceful shutdown.

## Frontend
- HTML semantics and accessibility (landmarks, labels, keyboard); CSS fundamentals (box model, flex, grid, cascade, specificity, responsive units); the DOM and events; fetch; state management; component model (React: props, state, effects, keys, reconciliation); forms and validation; routing; performance (bundle size, lazy loading, Core Web Vitals); build tools (Vite); TypeScript in the browser.
- Browser security model: same-origin policy, CORS, cookies and SameSite, XSS/CSRF basics (see `security.md`), Content Security Policy.
- Testing: component tests, Playwright e2e.

## API design checklist (also a rubric for the Bard class)
Predictable naming; correct methods and status codes; errors as structured objects with codes; pagination with cursors; idempotency keys on unsafe retries; versioning strategy; documented with examples; rate limits documented; timeouts and retries documented; no secrets in URLs.

## Misconceptions / error tags
- Business logic in route handlers (`fat-controller`)
- Trusting client input (`unvalidated-input`)
- JWT in localStorage / no expiry (`jwt-misuse`)
- Blocking the event loop (`blocking-event-loop`)
- Storing passwords with fast hashes (`weak-password-hash`)
- Missing keys in React lists / effects without deps (`react-keys`, `effect-deps`)

## Challenge ideas
1. **URL Shortener** (boss, multi-phase) — schema, POST/GET endpoints, validation, 404s, rate limit, then a tiny HTML front end; integration tests via HTTP in the container.
2. **Pagination Pixie** — cursor pagination endpoint; hidden tests walk all pages and check no gaps.
3. **Auth Gate** — sessions with cookies and CSRF tokens; tests attempt CSRF.
4. **JWT Judge** — verify tokens correctly (alg, exp, aud); adversary sends `alg: none`.
5. **Middleware Mummy** — logging, auth, error mapping in the right order; tests check every combination.
6. **Webhook Wisp** — receive signed webhooks, verify HMAC, dedupe by event id; tests replay events.
7. **Validation Vault** — zod/pydantic schemas for a nested payload; hidden tests fuzz shapes.
8. **DOM Druid** (client) — build a todo list with keyboard accessibility; Playwright tests in the runner.
9. **Fetch and Render** — fetch, loading/error states, retry; tests mock the network with scripted failures.
10. **OpenAPI Oracle** (Bard) — write the spec for an existing server; contract tests validate every response.
11. **Graceful Shutdown Golem** — a server that drains in-flight requests on SIGTERM; tests send requests during shutdown.
