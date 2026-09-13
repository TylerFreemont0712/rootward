# DevOps, containers, CI/CD, infrastructure (Cloud Citadel)

## Containers
- Images vs containers; layers and caching; Dockerfile best practices (small base, multi-stage builds, non-root user, `.dockerignore`, pinning, `COPY` order for cache); tags and digests; registries.
- Runtime: volumes vs bind mounts, networks, ports, env vars and secrets, healthchecks, resource limits (`--memory`, `--cpus`, `--pids-limit`), capabilities, read-only rootfs, `--network none`, logs, `exec`, `commit`, cleanup.
- Compose: multi-service dev stacks, depends_on and healthchecks, profiles, override files.
- Security: scanning (Trivy), least privilege, secrets not in images, rootless Docker/Podman, gVisor.
- OCI, containerd, how namespaces/cgroups make a container (bridge to Kernel Halls).

## CI/CD
- Pipelines as code (GitHub Actions, GitLab CI): triggers, jobs, steps, matrices, caching, artifacts, secrets, environments, approvals.
- Build once, deploy many; immutable artifacts; semantic versioning; changelogs; release automation.
- Test stages and gating; flaky-test policy; parallelism; fail fast.
- Deployment strategies: rolling, blue/green, canary, feature flags; rollbacks; database migrations in deploys (expand/contract).
- Supply chain: lockfiles, SBOMs, signing, dependabot/renovate.

## Infrastructure as code and platforms
- Declarative vs imperative; idempotency; Terraform/OpenTofu basics (providers, state, plan/apply, modules), Ansible (inventories, playbooks, idempotent tasks), cloud-init.
- Kubernetes: pods, deployments, services, ingress, configmaps/secrets, probes, requests/limits, namespaces, `kubectl` fluency, Helm/Kustomize; local clusters (kind, k3d).
- Networking in the cloud: VPCs, subnets, security groups, load balancers, DNS.
- Serverless and PaaS trade-offs.

## Observability and operations
- Logs (structured, levels, correlation ids), metrics (counters, gauges, histograms; RED/USE), traces (OpenTelemetry), dashboards, alerts (symptom-based), SLIs/SLOs/error budgets, runbooks, on-call, incident response and postmortems, chaos engineering intro.
- Backups and restores (test the restore), disaster recovery, capacity planning, cost awareness.

## Misconceptions / error tags
- Running as root in containers (`container-root`)
- Secrets baked into images or repos (`secret-in-image`)
- `latest` tag in production (`unpinned-image`)
- No healthchecks / readiness (`missing-healthcheck`)
- Cache-busting COPY order (`dockerfile-cache-order`)
- Alerts on causes not symptoms (`noisy-alerts`)

## Challenge ideas (Warden; Docker-in-Docker or a docker socket proxied read-only for image tasks; otherwise static checks)
1. **Dockerfile Dragon** — shrink an image from 1.2GB to <150MB with multi-stage builds; checks measure size and that the app runs.
2. **Compose Chimera** — wire app + db + cache with healthchecks and depends_on; checks curl the app.
3. **The Monolith** (boss) — split a single container config into services; then add a reverse proxy; then zero-downtime rolling update.
4. **CI Construct** — write a GitHub Actions workflow file that lints, tests on a matrix, caches deps; checks validate YAML and simulate with `act` if available (else static checks).
5. **Pin the Dependency Hellhound** — resolve conflicting version constraints in a lockfile; checks install cleanly.
6. **Healthcheck Hydra** — add liveness/readiness endpoints and probes to a k8s deployment manifest; checks use `kubectl --dry-run=server` on kind if available.
7. **Secret Sweeper II** — move secrets from env in a Dockerfile to a secrets file/mount; checks scan the image history.
8. **Ansible Ant** — idempotent playbook that installs and configures a service; checks run it twice and expect zero changes on the second run.
9. **Terraform Tortoise** — a module for a bucket with tags and versioning; checks `terraform validate` and plan against a local provider/mock.
10. **Alert Alchemist** (Puzzle) — choose symptom-based alerts from a list; explain error budgets.
11. **Backup Basilisk** — write and test a backup + restore script for a Postgres container; checks restore into a fresh container and diff.
