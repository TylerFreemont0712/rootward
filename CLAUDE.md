@AGENT.md

# Commands (Node 26, pnpm 12.4.1)

- Install: `pnpm install`
- Run client + server in dev: `pnpm dev` (client at http://127.0.0.1:5173, API on 127.0.0.1:7331, proxied)
- Single-process build + serve: `pnpm start` (http://127.0.0.1:7331)
- Tests (all packages, vitest): `pnpm test`. One package: `pnpm --filter @rootward/core test`. One file:
  `pnpm --filter @rootward/client exec vitest run test/<file>.test.ts`
- Lint / typecheck: `pnpm lint` · `pnpm typecheck`. **Never run `pnpm format`**: the tree has never been
  prettier-formatted, and it rewrites about 140 files.
- Validate content packs (runs reference solutions and shard examples): `pnpm content:validate`
- Translation coverage for a locale: `pnpm content:locale ja` (`--missing` prints the untranslated strings to fill in)
- Browser smoke test (builds the client; uses the locally cached Playwright Chromium): `pnpm test:e2e`
- Art (a local ComfyUI; its venv has Pillow and numpy): `~/personal-project/ComfyUI/.venv/bin/python
  scripts/art/generate.py --only '<ids>'` renders into `assets/.art-cache`; `--no-write` renders without writing, and
  `--reprocess` rewrites outputs from cached renders without the GPU (changing `pick` or `post` needs no new render).
  The client build copies `assets/generated` into `apps/client/dist`, so rebuild after writing art.

# Code conventions specific to this repo

- Node runs the TypeScript sources directly: relative imports need the `.ts` extension, and only erasable syntax is
  allowed (no `enum`, `namespace`, or constructor parameter properties). `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess` are on.
- Content files are snake_case and the zod schema output is the file shape (ADR-0002); runtime types are camelCase.
- Rules live in `packages/core`, pure and seeded. There are two engine shapes:
  - Classic fights and expeditions are event-sourced: `decide` returns events, and `evolve` applies them.
  - The world has its own rules in `core/world`.
  - Shardrun is a snapshot: `stepShardrun(state, command, catalog)` returns the next state and a log, or a refusal
    (`packages/core/src/shardrun/engine.ts`).

  The server orchestrates and builds views; the client renders them. Walking, fog of war, map layout, the battle
  stage's timeline, and hiding predictions are client-side presentation (ADR-0008, ADR-0019, ADR-0021, ADR-0022).
  Hidden-test data and run seeds never leave the server (`apps/server/src/runs/views.ts`, `ShardrunService.view`).
- Anything a player sees change must be data: numbers in `config/balance.yaml`, content in `content/packs/`. A new
  shard, relic effect, foe, or layer should not need engine code. If it does, add the primitive, not a one-off.
- Shardrun has two playstyles, `spellbook` and `deck` (ADR-0020). A character keeps one run of each, and every
  Shardrun route takes `?playstyle=`. A preview must follow the cast's order of operations exactly: the player reads
  the preview, then the cast has to land it (ADR-0022).
- Localization: English is the source. UI strings live in `apps/client/src/i18n/`; content overlays live in
  `content/packs/<pack>/locales/<locale>/` and are keyed by the English text. The engine always reads English
  (ADR-0017, ADR-0018).
- Art is optional. `assetUrl` in `apps/client/src/assets/AssetRegistry.ts` only returns files listed in its catalog,
  so add a catalog entry in the same commit as the file, and always keep a fallback for when the art is missing.
- React lint (the React Compiler rules) forbids setState in effects and reading refs during render. Adjust derived
  state while rendering, and read refs in handlers.
- Leave `// LEARN:` comments where a decision or a language feature is non-obvious, and add an entry to
  `docs/LEARNING_LOG.md`. The next ADR is ADR-0023.

# Working here

- `WIP.md` at the root is the player's list of what to do next. Read it first, address every point, and keep it
  current, but **never commit it**.
- Before a large engine change, commit and tag a checkpoint (as with `checkpoint-before-card-mode`). The spellbook
  Shardrun is the player's favorite, so experiments go in their own playstyle or behind an option.
- The player's launcher runs a server on port 7331 with `ROOTWARD_DEV=1`. Never stop or restart it. To test against a
  real server, start one on another port with its own data directory:
  `ROOTWARD_PORT=74xx ROOTWARD_DATA_DIR=$(mktemp -d) ROOTWARD_DEV=1 node apps/server/src/main.ts`. To test the
  launcher itself, run it inside one `bash -c` that exports `ROOTWARD_PORT`, `XDG_STATE_HOME`, `ROOTWARD_DATA_DIR`,
  `ROOTWARD_NO_OPEN=1` and `ROOTWARD_NO_NOTIFY=1`. Server code changes reach the player only when the launcher
  restarts (a launcher click updates and restarts it).
- Check client work with screenshots from headless Chromium (`playwright-core`, as `e2e/smoke.ts` does) before
  calling it done.

# Current state

See `docs/ROADMAP.md` for the milestone task list, kickoff decisions, and "Next session: start here", and
`docs/ARCHITECTURE.md` for how the pieces fit.
