@AGENT.md

# Commands (Node 26, pnpm 12.4.1)

- Install: `pnpm install`
- Run client + server in dev: `pnpm dev` (client at http://localhost:5173, API proxied to the server)
- Tests (all packages, vitest): `pnpm test` — one package: `pnpm --filter @rootward/core test`
- Lint / typecheck / format: `pnpm lint` · `pnpm typecheck` · `pnpm format`
- Validate content packs: `pnpm content:validate`
- Browser smoke test (uses the locally cached Playwright Chromium): `pnpm test:e2e`

# Current state

See `docs/ROADMAP.md` for the milestone task list, kickoff decisions, and what is next.
