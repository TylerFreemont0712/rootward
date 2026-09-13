# Networking and HTTP

## Layers and concepts
- OSI vs TCP/IP models; what actually matters: link (MAC), IP (addresses, subnets, CIDR, routing, NAT), transport (TCP: handshake, reliability, ports, flow/congestion; UDP), application (HTTP, DNS, TLS, SSH, SMTP).
- DNS: recursive vs authoritative, record types (A, AAAA, CNAME, MX, TXT, SRV), TTL, caching, `dig`.
- TLS: certificates, chains, CA, SNI, handshake basics, why "HTTPS everywhere"; self-signed certs in dev.
- Sockets: bind/listen/accept/connect; blocking vs non-blocking; a TCP echo server from scratch; Nagle; keep-alive.
- Latency vs bandwidth; round trips; head-of-line blocking; HTTP/1.1 vs HTTP/2 vs HTTP/3 (QUIC) in one paragraph.
- Firewalls, ports, localhost vs 0.0.0.0, Docker networking (bridge, host, `--network none`).

## HTTP semantics
- Request/response anatomy; methods and their semantics (safe, idempotent); status code classes and the important ones (200, 201, 204, 301/302/304, 400, 401 vs 403, 404, 405, 409, 422, 429, 500, 502/503/504).
- Headers: Content-Type, Accept, Authorization, Cache-Control, ETag/If-None-Match, Cookie/Set-Cookie, CORS headers, Location, Retry-After.
- Bodies: JSON, forms (urlencoded vs multipart), streaming/chunked, compression.
- Caching: freshness, validation, CDNs, cache keys, `Vary`.
- Cookies vs tokens; sessions; SameSite; CSRF; CORS as a browser policy, not a server security feature.
- Redirects, content negotiation, conditional requests, range requests, long polling, SSE, WebSockets.
- Proxies and reverse proxies (nginx), load balancers, X-Forwarded-For.
- Rate limiting, retries with backoff, timeouts, idempotency keys.
- Tools: `curl -v`, browser DevTools network tab, `mitmproxy`, Postman/Bruno, `httpie`.

## Misconceptions / error tags
- 200 with an error body (`status-code-misuse`)
- GET with side effects (`unsafe-get`)
- Treating CORS as security (`cors-misunderstanding`)
- Missing timeouts on HTTP clients (`missing-timeout`)
- Confusing 401 and 403 (`auth-vs-authz`)
- Not URL-encoding (`unencoded-url`)

## Challenge ideas
1. **Echo Eel** — TCP echo server with sockets; hidden tests connect concurrently.
2. **HTTP by Hand** — parse a raw HTTP/1.1 request from bytes into method/path/headers/body; hidden tests include chunked bodies and folded headers.
3. **Status Sphinx** (Puzzle) — pick the right status code for 10 scenarios.
4. **curl Crawler** (terminal) — fetch a paginated API with `curl` and `jq`, follow `Link` headers, assemble results.
5. **DNS Drake** (terminal) — a service cannot resolve a host; fix `/etc/resolv.conf`/hosts; checks resolve.
6. **Cache Invalidation** — implement ETag/If-None-Match on a tiny server; tests count bytes transferred.
7. **Rate Limiter Rat** — token bucket middleware; tests with a fake clock and bursts; correct `Retry-After`.
8. **Retry Revenant (HTTP)** — client with timeouts, backoff, and idempotency keys; a fake server scripts failures.
9. **Proxy Poltergeist** — configure nginx to reverse-proxy two upstreams by path with correct forwarded headers (Warden).
10. **CORS Chimera** — a browser-like test harness; make the API respond correctly to preflights without `*` on credentialed requests.
11. **WebSocket Wisp** — a chat echo over WebSocket with ping/pong; tests check backpressure by sending faster than reading.
