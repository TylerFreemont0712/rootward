# Content authoring

How to add or change game content. The schemas in `packages/content-schema/src/` are the source of truth (ADR-0002);
this guide explains them. Run `pnpm content:validate` after every change: it reports problems with file and line.

## Pack layout

```
content/packs/<pack>/
  pack.yaml                 id, name, version, engine_range, dependencies, description
  realms.yaml               the layers of the Machine (optional per pack)
  oaths.yaml                learning goals (optional)
  skills/*.yaml             skill nodes: { nodes: [...] }
  cards/*.yaml              review cards for one node: { node, cards: [...] }
  enemies/<id>.yaml         one enemy per file; the file name must match the id
  items/<id>.yaml           one Artifact per file; the file name must match the id
  classes/<id>/             class.yaml, abilities.yaml, lore.md (folder name = class id)
  challenges/<realm>/<folder>/
```

Conventions: keys are snake_case; unknown keys are errors; ids are lowercase segments joined by `.` or `-`
(`py.collections.dict`, `off-by-one-goblin`); tags may also use `+` and `#` (`n+1-query`).

## A challenge folder

The worked example is `content/packs/core/challenges/foundry/tally-wisp/`.

| File | Required | Purpose |
|---|---|---|
| `challenge.yaml` | yes | manifest: id, title, realm, concepts, difficulty 1-10, languages, enemy, constraints, tests |
| `prompt.md` | yes | the task, 150 words or fewer outside code blocks; examples must match the visible tests |
| `hints.md` | yes | exactly four levels separated by lines containing only `---`: nudge, concept reminder (with a node id in brackets), plan, partial solution |
| `explanation.md` | recommended | shown on Retreat: what was required, the pattern and its node id, common mistakes, a variant to try later |
| `lesson.md` | optional | Shrine content (M1) |
| `starter/<language>/` | yes | what the player starts with; must not already pass every test |
| `solution/<language>/` | yes | the reference solution, shown on Retreat, so make it idiomatic and commented |
| `tests/io.yaml` | io form | visible cases |
| `hidden/io.yaml` | io form | hidden cases (backend-only) and optional reserve cases |

### io tests

```yaml
form: io
normalize: { trailing_whitespace: true, newlines: true }   # must match between tests/ and hidden/
cases:
  - id: v1
    name: counts simple repeated words      # visible names are shown to the player
    stdin: "the cat and the hat\n"
    expected_stdout: "the 2\nand 1\ncat 1\nhat 1\n"
```

Hidden cases add `category` (shown as "boundary #1" instead of the name). Large inputs use
`generator: { repeat: "text ", times: 20000 }`; give them `category: large-input`, which marks the efficiency band.
A hidden case with `reserve: true` is not part of the fight until an enemy's Edge Case move reveals a case of its
category; reserve cases need a category and do not count toward `tests.hidden`.

`tests.visible` and `tests.hidden` in `challenge.yaml` must equal the number of cases (reserve cases excluded).
Entry files read stdin conventionally: `sys.stdin.read()` in Python, `require("fs").readFileSync(0, "utf8")` in
JavaScript.

### Constraints

`constraints.max_lines` counts non-blank lines that are not comments (docstring bodies do not count).
`constraints.banned_tokens` ignores comments and strings; word tokens such as `for` match whole words only. The
validator fails the challenge if the reference solution breaks its own constraints.

## Other content

- **Skill node:** add to a `skills/*.yaml` file with `prerequisites` (must exist; no cycles), `evidence_tags`, and
  optionally `transfers_to` a shared `concept.*` node. Sequencing advice: `ideas/pedagogy/curriculum-sequencing.md`.
- **Enemy:** `enemies/<id>.yaml` with weighted `moves` by id. Implemented moves: `strike`, `edge-case` (param
  `category`). Other move ids fall back to Strike and produce a validation warning. Optional `art` holds ASCII art;
  use `art: |2` so leading spaces survive.
- **Item:** `items/<id>.yaml`; `effects` are `{ type: camelCaseName, ...params }`; keep `implemented: false` until
  the engine supports every effect.
- **Class:** `classes/<id>/class.yaml` + `abilities.yaml` + `lore.md`. Passive effect implemented so far:
  `lootMultiplierOnCrit` (param `factor`).
- **Review cards:** `cards/<node>.yaml` with `{ node, cards: [{ id, q, a, kind? }] }`.

## Quality checklist (from ideas/solutions/content-pipeline.md)

Clear task in 150 words or fewer; prompt examples match visible tests; hidden tests cover empty input, boundaries, and
a large input when efficiency matters; test names say what is checked; hints escalate without leaking the answer;
the reference solution is idiomatic and commented; flavor text never changes the task; the time estimate is
realistic; no network needed.

## Commands

- `pnpm content:validate`: everything, including running reference solutions (languages without a runner are skipped
  with a warning).
- `pnpm content:validate core`: challenge checks and execution for one pack; references are still checked globally.
- `pnpm content:validate --no-exec`: static checks only.
