@AGENT.md

# Commands (Node 26, pnpm 12.4.1)

- Install: `pnpm install`
- Run client + server in dev: `pnpm dev` (client at http://127.0.0.1:5173, API on 127.0.0.1:7331, proxied)
- Single-process build + serve: `pnpm start` (http://127.0.0.1:7331)
- Tests (all packages, vitest): `pnpm test` — one package: `pnpm --filter @rootward/core test`
- Lint / typecheck / format: `pnpm lint` · `pnpm typecheck` · `pnpm format`
- Validate content packs (runs reference solutions): `pnpm content:validate`
- Translation coverage for a locale: `pnpm content:locale ja` (`--missing` prints the untranslated strings to fill in)
- Browser smoke test (builds the client; uses the locally cached Playwright Chromium): `pnpm test:e2e`

# Code conventions specific to this repo

- Node runs the TypeScript sources directly: relative imports need the `.ts` extension, and only erasable syntax is
  allowed (no `enum`, `namespace`, or constructor parameter properties).
- Content files are snake_case and the zod schema output is the file shape (ADR-0002); runtime types are camelCase.
- Rules live in `packages/core` (`decide` returns events, `evolve` applies them); the server orchestrates and the
  client renders server `RunView`s (walking the map and fog of war are client-side presentation, ADR-0008). Hidden-test
  data and the run seed leave the server only through `apps/server/src/runs/views.ts` (the seed never does).

# Current state

See `docs/ROADMAP.md` for the milestone task list, kickoff decisions, and what is next.
