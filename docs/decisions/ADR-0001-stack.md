# ADR-0001: Build Rootward as a source-first TypeScript monorepo on Node 26

- **Status:** accepted
- **Date:** 2026-09-13
- **Related:** PROMPT.md section 14; kickoff answers 1 and 7 (docs/ROADMAP.md); ideas/solutions/sandboxing.md,
  ideas/solutions/editor-and-terminal.md

## Context
PROMPT.md section 14 chose a TypeScript monorepo (Vite + React client, Fastify server, pure `core`, zod schemas) and
asked to confirm it at kickoff. The user confirmed TypeScript and asked to rename the repo from ProgramMe to
Rootward. Since the spec was written, several tools moved a major version: TypeScript 7 (the native compiler),
Vite 8, Vitest 5, ESLint 10, zod 4, pnpm 12. The machine runs Node 26.0.0, which executes `.ts` files directly by
stripping type annotations, including inside `worker_threads` (verified with a spike before choosing).

## Options considered
1. **Classic monorepo with a build step per package** (tsc or tsup to `dist/`, server runs compiled JS). Works on
   any Node version and allows every TypeScript feature. Costs a watch-and-build pipeline, source maps, and a second
   copy of every file; worker thread paths differ between dev and production.
2. **Source-first packages on Node's native type stripping.** Packages export `src/index.ts`; the server and CLIs
   run with `node file.ts`; Vite and Vitest compile TypeScript for the browser and tests. No build step outside the
   client. Requires Node 26, `.ts` extensions in relative imports, and "erasable" syntax only (no `enum`,
   `namespace`, or constructor parameter properties).
3. **Python + Textual (PROMPT.md Appendix F).** Declined at kickoff.

## Decision
Option 2. It removes a whole build layer from a project that is also meant to be read and learned from, and the
same file runs in dev, tests, workers, and production. Versions are pinned exactly (see root `package.json` and each
package): TypeScript 6.0.3, Vite 8.3.0, Vitest 5.0.0, ESLint 10.10.0 with typescript-eslint 8.70.0, zod 4.6.4,
yaml 2.9.1, Fastify 5.12.4, React 19.3.0, Zustand 5.0.15, CodeMirror 6, quickjs-emscripten 0.32.0, pnpm 12.4.1.

TypeScript is pinned to 6.0.3, not 7.0.2: typescript-eslint 8.70 declares `typescript: >=4.8.4 <6.1.0`, and
type-aware linting is worth more here than the faster compiler. The client styles with plain CSS custom properties
(the mockup's tokens) rather than Tailwind, to keep the CRT theme readable in one file.

## Consequences
- `pnpm dev` runs the server with `node --watch`; there is no `dist/` for any package except the client build.
- `tsconfig.base.json` sets `erasableSyntaxOnly`, `verbatimModuleSyntax`, and `allowImportingTsExtensions` so the
  compiler rejects anything Node cannot strip. Strictness flags include `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`.
- Publishing packages to npm would need a build step; that is not planned.
- pnpm 12 enforces a minimum release age for new dependency versions; it recorded an exclusion for zod 4.6.4 in
  `pnpm-workspace.yaml` during the first install. Review that list when upgrading.
- Revisit TypeScript 7 when typescript-eslint supports it. Drizzle ORM 0.45 has no driver for Node's built-in
  `node:sqlite`, so the persistence choice gets its own ADR at the start of M1.
- LEARN pointers: `tsconfig.base.json` (why each flag), `packages/*/package.json` (`exports` pointing at source).
