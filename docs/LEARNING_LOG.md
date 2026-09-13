# Learning log

Things worth understanding in this codebase, with pointers to where they live. Add to it whenever a decision or a
language feature took more than a minute to understand.

## TypeScript and tooling

- **TypeScript without a build step.** Node 26 removes type annotations and runs `.ts` files directly, even in worker
  threads. The price: only "erasable" syntax (no `enum`, `namespace`, or constructor parameter properties) and
  explicit `.ts` extensions in relative imports. See `tsconfig.base.json` and ADR-0001.
- **Strictness flags that catch real bugs.** `noUncheckedIndexedAccess` makes `items[i]` possibly `undefined`, so
  code must handle the empty case. `exactOptionalPropertyTypes` separates "property missing" from "property set to
  undefined"; `location()` in `packages/content-tools/src/diagnostics.ts` shows the pattern it forces.
- **Type-aware linting.** `eslint.config.js` uses typescript-eslint's `strictTypeChecked`, which asks the compiler
  for types and can flag floating promises or unsafe `any` flows, not just style.
- **One test command for many packages.** `vitest.config.ts` lists workspace folders as Vitest `projects`.
- **Source-first packages.** Each `packages/*/package.json` points `exports` at `src/index.ts`, so there is no
  compiled copy to go stale.

## Validation and content

- **The schema is the file format.** `packages/content-schema/src/*.ts` exports each zod schema and a type of the
  same name (`z.infer`). Strict objects reject unknown keys, which turns typos into errors (ADR-0002).
- **Exhaustive records.** `z.record(z.enum([...]), value)` requires every key; `balance.ts` uses it so a missing
  tuning value fails at load time instead of becoming `undefined` mid-fight.
- **Errors with line numbers.** `packages/content-tools/src/yaml.ts` parses with `parseDocument` and a
  `LineCounter`, then maps each zod issue path back to a YAML node's source position.
- **Collect, don't throw.** `Diagnostics` gathers every problem so one validation run shows all of them.
- **Topological sort.** `orderPacks` in `packages/content-tools/src/loader/load-content.ts` loads packs after their
  dependencies using Kahn's algorithm; leftovers are cycles.
- **Cycle detection.** `packages/content-tools/src/validate/graph.ts` is depth-first search with a "visiting" state.
- **A tiny lexer.** `packages/runners/src/static/scan.ts` blanks comments and string contents while keeping newlines,
  so banned-token checks ignore `# no for loops here`.

## Sandboxing

- **Why player code runs in a worker thread.** A spike showed that deep recursion inside QuickJS overflowed V8's
  native stack and killed the whole Node process before QuickJS's own stack limit fired. In a worker with a larger
  stack (`resourceLimits.stackSizeMb`), QuickJS reports a clean `InternalError: stack overflow`, and a worker that
  misbehaves can be terminated without touching the server.
