# Security (Shadow Bazaar; the Shade's home)

Teaching context is defensive: recognize, exploit in a sandbox to understand, then fix and harden. All targets are
local containers seeded by the challenge. Nothing in the game touches real systems.

## Foundations
- CIA triad; threat modeling (assets, actors, entry points, STRIDE); defense in depth; least privilege; fail closed; secure defaults; attack surface.
- Trust boundaries: all input is untrusted (users, files, network, environment, other services); validation vs sanitization vs encoding (output encoding is the XSS fix).

## OWASP-style web vulnerabilities
Injection (SQL, command, LDAP, template), XSS (stored/reflected/DOM), CSRF, broken auth (credential stuffing, weak sessions), broken access control (IDOR, privilege escalation), security misconfiguration (debug on, default creds, directory listing), sensitive data exposure (secrets in logs/URLs/repos), insecure deserialization, SSRF, path traversal, open redirects, XXE, race conditions (TOCTOU), mass assignment, insecure file upload, clickjacking, rate-limit gaps, dependency vulnerabilities (SCA), logging/monitoring gaps.

## Auth and crypto (use, don't roll your own)
- Password hashing (argon2id/bcrypt/scrypt with salts), MFA, session management, OAuth2/OIDC flows, JWT pitfalls (alg none, weak secrets, no expiry, storage), API keys and rotation, secrets management (env, vaults), TLS (certs, chains, pinning intro).
- Crypto concepts: symmetric (AES-GCM) vs asymmetric (RSA/ECC), hashing vs encryption vs encoding (base64 is not encryption), HMAC and signatures, randomness (CSPRNG vs `random`), nonces/IVs, key derivation, constant-time comparison, why ECB is bad, hash collisions.

## Systems and infra security
- Linux hardening: users, permissions, setuid, sudoers, SSH config, firewalls, fail2ban idea, updates; container security (non-root, read-only, capabilities, seccomp); network segmentation; secrets in CI; supply chain (lockfiles, typosquatting, signing); backups and ransomware resilience; logging and detection.
- Forensics basics: persistence locations (cron, systemd, shell rc, setuid binaries), suspicious processes and connections, timelines.

## Secure coding checklist (Reviewer rubric axis for Shade content)
Parameterized queries; output encoding by context; allow-lists over deny-lists; bounded input sizes; no secrets in code/logs; explicit authorization checks on every resource access; safe file handling (canonicalize paths); timeouts everywhere; dependency audit; principle of least privilege in configs.

## CTF categories to borrow (sandbox only)
Web (injection, auth), crypto puzzles (classical ciphers, XOR, weak RSA parameters as math), forensics (log analysis, file carving lite), reverse engineering lite (read obfuscated JS/Python), misc (encoding chains: base64 -> hex -> rot13), pwn is out of scope beyond a conceptual buffer-overflow demo in the Silicon Depths.

## Misconceptions / error tags
- String-built SQL (`sql-injection`)
- Escaping instead of encoding by context (`xss-encoding`)
- Authorization missing on the object (`idor`)
- Home-made crypto / `random` for tokens (`weak-randomness`)
- Secrets in logs or URLs (`secret-leak`)
- Path joined from user input (`path-traversal`)
- Comparing secrets with `==` (`timing-leak`)

## Challenge ideas (Shade)
1. **SQL Injection Serpent** — a vulnerable login in a container; phase 1: demonstrate bypass (Exploit ability doubles damage), phase 2: parameterize and add a regression test.
2. **XSS Xorn** — stored XSS in a comment box; fix with context-aware encoding and CSP; adversary sends payload variants.
3. **IDOR Imp** — `/invoices/{id}` leaks other users' data; add authorization; tests try 20 ids as 3 users.
4. **Path Traversal Troll** — file download endpoint; canonicalize and allow-list; hidden tests use `..%2f` variants.
5. **JWT Judge** — validate properly; adversary sends `alg: none`, expired, wrong audience.
6. **Timing Leak Lamia** — token comparison with `==`; the test measures timing variance over many tries (statistical); fix with constant-time compare.
7. **Password Vault** — replace MD5 with argon2id, migrate on login; tests verify old hashes still work once.
8. **Rootkit** (boss) — forensic cleanup of a compromised container (see linux).
9. **Cipher Sphinx** (Puzzle chain) — decode an encoding chain; break a Caesar/Vigenere with frequency analysis; explain why it is not encryption.
10. **SSRF Shade** — an image-fetch endpoint that reaches internal metadata; block private ranges and follow-redirect traps.
11. **Dependency Audit** (terminal) — find the vulnerable package from a lockfile and an advisory list; upgrade without breaking tests.
12. **Secrets Sweep** (terminal) — find secrets in a repo history and config files; rotate (narratively) and add a pre-commit scanner.
