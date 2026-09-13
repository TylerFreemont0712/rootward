# Plugin architecture

Everything that the user might want to add later is a plugin point with a documented contract, a registry, and a
validation step. In-repo TypeScript plugins are fine; **no remote code execution** (content packs are data only).

## Plugin points and contracts
| Point | Contract | Registry | Adding one |
|---|---|---|---|
| Content pack | folder with `pack.yaml` (id, version, engineRange, dependencies), data files per schema | `ContentIndex` merges packs in dependency order; later packs may override by id with `override: true` | drop a folder in `content/packs/`, run `content:validate` |
| Runner | `Runner` interface (`PROMPT.md` 12.1) | `RunnerRegistry.pick(language, kind)` by availability and tier preference | add `packages/runners/src/<id>.ts`, register in `index.ts` |
| Room controller | `RoomController` (`enter/act/exit`) + a React panel component keyed by room kind | `RoomRegistry` | add controller in core, panel in client, entry in both registries |
| Puzzle grader | `Grader<TInput, TAnswer>` pure function + generator | `PuzzleRegistry` | add grader + generator + schema |
| Enemy move | `Move` = `(state, ctx) => StateDelta` with a param schema | `MoveRegistry` | add a move file; enemies reference by id |
| Ability / Artifact effect | declarative effect primitives (`revealHiddenTest`, `refundFocus`, `negateNextMove`, `modifyDamage`, ...) composed in YAML; custom effects as TS files registered by id | `EffectRegistry` | prefer composing primitives; write TS only when needed |
| AI role | prompt file + config entry + typed call site | `RoleRouter` | add `config/prompts/<role>.md`, schema, and a function in `packages/ai` |
| Renderer | `Renderer` interface (`draw(mapState)`, `theme`) | `RendererRegistry` | ascii first, tiles later |
| Theme | JSON (palette, fonts, renderer, tileset) | `ThemeRegistry` | add `config/themes/<id>.json` |
| Class | data files + optional TS effects | via content pack | see PROMPT.md section 6 |
| Command | `{ id, title, shortcut?, when?, run }` | `CommandRegistry` | register from any panel |

## Rules
- Registries are filled at startup from explicit `index.ts` lists (no magic directory scanning in the engine); content packs are scanned (data only).
- Every registry validates ids (namespaced, unique) and fails loudly with the file path.
- Engine compatibility: packs declare `engineRange` (semver); the loader refuses incompatible packs with a clear message.
- Hot reload in dev for content and prompts (chokidar) without restarting runs.
- Docs: `docs/EXTENDING.md` with one worked example per plugin point, kept in sync by a test that checks each registry has at least the documented example.
