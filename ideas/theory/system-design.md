# System design and distributed systems (The Assembly)

## Building blocks
- Load balancers (L4/L7, health checks, sticky sessions), reverse proxies, CDNs, DNS-based routing.
- Stateless services and horizontal scaling; vertical scaling limits; autoscaling signals.
- Caching: client, CDN, application (Redis/Memcached), database; cache-aside/write-through/write-behind; TTLs; invalidation; thundering herd; hot keys; cache stampede protection.
- Databases at scale: replication (leader/follower, sync/async, lag), partitioning/sharding (keys, rebalancing, hot spots), indexes, read replicas, connection pooling, CQRS, materialized views, search indexes.
- Queues and streams: at-least-once vs at-most-once vs exactly-once (and why it is mostly a lie), idempotent consumers, ordering and partitions, dead-letter queues, backpressure, outbox pattern, event-driven architecture, Kafka vs RabbitMQ vs SQS mental models.
- Storage: object stores, blob vs block vs file; durability; lifecycle; presigned URLs.
- Consistency and availability: CAP and PACELC intuition, consistency models (strong, eventual, causal, read-your-writes), quorums, consensus (Raft in one paragraph), leader election, leases, fencing tokens, clocks and ordering (Lamport, vector clocks intro), idempotency keys, sagas for distributed transactions, two-phase commit and why it is avoided.
- Reliability: timeouts, retries with jitter, circuit breakers, bulkheads, rate limiting, load shedding, graceful degradation, redundancy, failover, chaos testing; SLOs and error budgets; capacity estimation (back-of-envelope: QPS, storage, bandwidth).
- Architecture styles: monolith (modular!), microservices (costs), serverless, event-driven, hexagonal; API gateways; service discovery; configuration; secrets; multi-tenancy; feature flags.
- Security at scale: authn/authz services, zero trust intro, secrets rotation, audit logs.
- Observability at scale: sampling, cardinality, tracing across services.

## The interview-style method (also the Architect class rubric)
1. Clarify requirements (functional, non-functional: scale, latency, consistency, availability).
2. Estimate (users, QPS, data size, growth).
3. High-level design (boxes and arrows; Mermaid in this game).
4. Deep dive on the hard parts (data model, hot paths, failure modes).
5. Trade-offs and alternatives; what you would monitor; how it evolves.

## Misconceptions / error tags
- Microservices for a small app (`premature-distribution`)
- Cache without invalidation strategy (`stale-cache`)
- Assuming exactly-once delivery (`exactly-once-assumption`)
- No timeouts/retries budget (`missing-resilience`)
- Single point of failure (`spof`)
- Ignoring hot partitions (`hot-key`)

## Challenge ideas (mostly rubric-graded with deterministic parts)
1. **Design a URL Shortener** — Mermaid diagram + written trade-offs; deterministic checks: diagram parses, includes required components; Examiner rubric.
2. **Rate Limiter at Scale** — design and then implement a sliding-window limiter over Redis (deterministic part).
3. **Idempotent Consumer** — implement a consumer that survives redelivery; tests replay messages out of order.
4. **Outbox Owl** — implement the transactional outbox with a poller; tests kill the poller mid-batch.
5. **Consistent Hashing Hydra** — implement a hash ring with virtual nodes; tests measure key movement on node add/remove.
6. **Leader Election Lease** — implement lease-based leadership with fencing tokens against a fake store; tests simulate clock skew.
7. **Capacity Calculator** (Puzzle) — back-of-envelope estimates within tolerance.
8. **Circuit Breaker Crab II** — state machine with half-open probing; tests with scripted failures.
9. **Saga Sentinel** — order/payment/inventory saga with compensations; tests inject failure at each step.
10. **The Assembly** (final boss) — design + implement a small event-driven system with three services in Compose, a queue, idempotent consumers, and a dashboard endpoint; checks run a chaos script.
