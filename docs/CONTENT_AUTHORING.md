# Content authoring

How to add or change game content. The schemas in `packages/content-schema/src/` are the source of truth (ADR-0002);
this guide explains them. Run `pnpm content:validate` after every change: it reports problems with file and line.

## Pack layout

```
content/packs/<pack>/
  pack.yaml                 id, name, version, engine_range, dependencies, description
  realms.yaml               the layers of the Machine (optional per pack)
  oaths.yaml                learning goals (optional)
  terrain.yaml              ground kinds for zones: walkable or not, and a fallback color (optional)
  props.yaml                buildings, trees, furniture: footprint and whether it blocks (optional)
  skills/*.yaml             skill nodes: { nodes: [...] }
  cards/*.yaml              review cards for one node: { node, cards: [...] }
  enemies/<id>.yaml         one enemy per file; the file name must match the id
  items/<id>.yaml           one Artifact per file; the file name must match the id
  zones/<id>.yaml           a walkable zone of the world (ADR-0011)
  npcs/<id>.yaml            a person and their conversation
  quests/<id>.yaml          a quest: who gives it, objectives, reward flags
  shardrun/run.yaml         Shardrun: starting spells, floors, encounters, reward odds (ADR-0012)
  shardrun/shards/<id>.yaml a shard: a function in Python and JavaScript, with worked examples
  shardrun/foes/<id>.yaml   a Shardrun foe: HP, weaknesses, a trait, and its intents
  shardrun/relics/<id>.yaml a Shardrun relic: a passive item built from effect primitives
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

### Classes: playable and planned

A class (`classes/<id>/class.yaml`) can be `status: playable` (the default) or `status: planned`. Planned classes are
listed at character creation with their `subjects` (a few words each: what the class teaches) but cannot be chosen, and
the server refuses them. `order` sets their place in the picker. A planned class needs only `class.yaml` and
`lore.md`; give it portrait and sprite art (`portraits/<id>`, `avatars/<id>`) so the picker is not a row of letters.

## The world: zones, people, and quests

The worked examples are `zones/bastion.yaml` (a town), `zones/foundry.yaml` (wilds with fights), `npcs/guildmaster.yaml`
(a quest line), and `quests/the-foundry-cools.yaml`.

### Conditions and effects

Anything that can appear, open, or be offered only sometimes takes an `if:` with one condition:

| Condition | Holds when |
|---|---|
| `{ flag: kiln-gate-open }` | some effect or quest reward has set the flag |
| `{ quest: the-foundry-cools, status: ready }` | the quest is `not-started`, `active`, `ready` (every objective met), or `done` |
| `{ cleared: foundry/foundry-loops }` | the character has won that marker's fight |
| `{ cleared_in: foundry, at_least: 3 }` | at least that many markers are won in the zone |
| `{ mastery: py.control.loops, at_least: 2 }` | the learner model has that mastery level on the node |
| `{ all: [...] }`, `{ any: [...] }`, `{ not: ... }` | combinations |

Effects happen when a dialogue choice is picked or a feature is used, in order: `{ start_quest: id }`,
`{ complete_quest: id }` (only works once the quest is `ready`, and sets its reward flags), `{ set_flag: id }`, and
`{ open: guild-board | chronicle | practice }`.

### Zones

```yaml
id: foundry
name: The Foundry
kind: wild                 # town | wild
realm: foundry             # optional
sight: 7                   # optional: tiles lit around the Maintainer; omit for a fully visible town
ambience: embers           # none | embers | leaves
music: music-foundry       # optional: a music id (generated/audio/<id>.ogg); the Bastion's theme plays without one
arrival: "Molten glyphs drip from the ceiling."
legend: { "#": rock, ".": ash, ",": basalt, "~": lava }   # tile character -> terrain id
tiles: |
  ############
  #....,,....#
  ############
entry: { x: 21, y: 2 }
props:    [{ prop: anvil, x: 9, y: 7 }, { prop: kiln-gate, x: 20, y: 21, if: { not: { flag: kiln-gate-open } } }]
npcs:     [{ npc: pell, x: 27, y: 5, if: { not: { flag: pell-rescued } } }]
markers:  [{ id: foundry-loops, kind: encounter, x: 27, y: 8, node: py.control.loops, challenges: [foundry.py.staircase] }]
features: [{ id: kiln-inscription, x: 24, y: 20, label: Inscription, text: "THE KILN KEEPS COUNT." }]
portals:  [{ id: to-bastion, x: 21, y: 1, label: Waystone, to: { zone: bastion, portal: to-foundry }, arrive: { x: 21, y: 2 } }]
```

- Coordinates count from the top-left tile, `x` across and `y` down. A prop's `x`/`y` is the top-left of its footprint;
  its art is drawn bottom-aligned on the footprint, so tall buildings rise over the rows behind them.
- **Markers** are fights: walking onto one starts the best fit from `challenges` for the player (ranked against
  mastery on `node`). Marker ids are saved in each character's progress, so do not rename them.
- **Portals** are walked onto; `arrive` is where someone coming *through* this portal stands, next to it. A portal with
  an `if` is locked until it holds and shows `locked_text`.
- **Features** (signs, doors) are used from an adjacent tile with E.
- Exactly one zone in all content has `start: true`.
- The validator checks that nothing stands on a blocked tile and that every marker, portal, arrival point, person, and
  feature can be walked to from `entry` (with conditional props treated as open).

### People

```yaml
id: compiler
name: Brannoc
title: The Compiler
dialogue:
  start:                   # tried in order; the first whose `if` holds opens the conversation
    - { if: { quest: hammer-and-test, status: ready }, goto: turn-in }
    - { goto: hello }      # keep a last entry without `if`
  nodes:
    hello:
      text: "Bring me the function. And its tests.\n\nNo tests, no spell."   # a blank line starts a new page
      choices:
        - { text: "Test me.", if: { quest: hammer-and-test, status: not-started }, effects: [{ start_quest: hammer-and-test }] }
        - { text: "Later, smith." }          # no `goto`: the conversation ends
    turn-in:
      text: "You returned the value. Good."
      choices:
        - { text: "Thank you.", effects: [{ complete_quest: hammer-and-test }] }
```

A node with no choices ends the conversation when the player moves on. `speaker: lint` on a node lets someone else say
that line. A "!" appears over a person when a conversation started now could hand out a quest, and a "?" when one of
their quests is ready to hand in. Guard quest-starting choices with a `not-started` condition, as above, so the choice
disappears once the quest is in the journal. Voices: `ideas/game-content/lore-and-narrative.md`.

### Quests

```yaml
id: the-foundry-cools
name: The Foundry Cools
giver: guildmaster          # the NPC whose dialogue hands it in
summary: "Clear three of the Foundry's fights, then report back to Guildmaster Orin."
objectives:
  - { text: "Clear fights in the Foundry", cleared_in: foundry, at_least: 3 }
rewards:
  flags: [kiln-gate-open]
  text: "The kiln gate at the bottom of the Foundry has been unsealed."
```

Objectives use the leaf conditions above (`cleared`, `cleared_in`, `mastery`, `flag`). Progress counts the world as it
is, so fights won before the quest started count too. Only ask for things the game really records: no building or
quest may stand in for a mechanic that does not exist yet (ADR-0011).

### Art for the world

Art is optional; without it props show a letter, people and monsters a glyph, and terrain its `color`. To generate
some, add entries to `scripts/art/manifest.json` and run `scripts/art/generate.py` (see `assets/README.md`), then add
the new ids to the catalog in `apps/client/src/assets/AssetRegistry.ts`. People use `npcs/<sprite>` and
`portraits/<portrait>`, monsters on markers use `creatures/<enemy id>`, props use `props/<id>`, and terrain uses four
seamless variants `terrain/<id>-0..3`.

Music works the same way (ADR-0023): add a `music` entry to `scripts/audio/manifest.json`, run
`scripts/audio/generate.py`, add the id to `MUSIC` in `apps/client/src/audio/catalog.ts`, and name it in a zone's
`music` (or a Shardrun layer's, below).

## Shardrun: shards, foes, and the run

Shardrun (ADR-0012) is the roguelite mode. Its schemas are in `packages/content-schema/src/shardrun.ts`.

### Shards

A shard is one function with the signature `(bolts, battle) -> bolts`. A bolt is
`{ power, element: none|fire|frost|spark, target: front|back|weakest|strongest|all, pierce, ward }`; `battle` is
`{ turn, me: { hp, max, block, mana }, foes: [{ name, hp, max, shield, weak, resist }] }`, living foes only.

```yaml
id: amplify
name: Amplify
rarity: common              # common, uncommon, or rare: how often rewards offer it
cost: 1                     # mana added to every cast of a spell holding it
function: amplify           # snake_case; the JavaScript code uses the camelCase form (lazy_fork -> lazyFork)
summary: "Adds 3 power to every bolt."
tags: [lists, comprehension]
forge: { into: amplify-plus, verb: upgrade }   # optional: what a forge turns it into (upgrade or repair)
curse: { integrity: 3 }     # optional: Integrity burned on every cast
draftable: true             # false for forge results, so rewards never offer them
code:
  python: |
    def amplify(bolts, battle):
        return [{**bolt, "power": bolt["power"] + 3} for bolt in bolts]
  javascript: |
    function amplify(bolts, battle) {
      return bolts.map((bolt) => ({ ...bolt, power: bolt.power + 3 }));
    }
examples:                   # run in both languages by content:validate; power is compared with a small tolerance
  - name: one bolt
    bolts: [{ power: 4, element: none, target: front, pierce: false, ward: false }]
    expect: [{ power: 7, element: none, target: front, pierce: false, ward: false }]
```

Quote a `summary` that contains a colon. Keep shards short enough to read in a card, and let each teach one idea (a
comprehension, a filter, an accumulator, reading the battle). A shard never needs to guard against huge outputs or bad
bolts: the engine clamps power, caps bolts, and charges mana for the work. A buggy shard is fine content if a forge can
repair it (`lazy-fork`).

### Foes

```yaml
id: null-wraith
name: Null Wraith
sprite: null-wraith          # a creatures/<id> art id
hp: 18
weak: [fire]                 # x1.5 from balance.yaml
resist: []                   # x0.5
trait: { kind: nullify-first }   # or thick-hide {threshold}, shifting-weakness {cycle}, pattern-ward {pattern}
intents:                     # played in order, one per turn, then repeated
  - { kind: strike, power: 5 }   # also multi {power, times}, shield {amount}, stoke, heal {amount}
flavor: The first thing you throw at it becomes nothing.
```

### Relics

```yaml
id: cache-hit
name: Cache Hit
rarity: uncommon            # common, uncommon, rare, or boss (boss relics are offered by guardians)
icon: cache-hit             # shardrun/relic-<icon> art
summary: "Your first spell each turn costs 1 less mana."
flavor: "The answer was already there. Why compute it twice?"
effects:
  - { kind: first-cast-discount, amount: 1 }
```

Effect kinds: `bolt-power {add}`, `damage-multiplier {factor}`, `weak-bonus {add}`, `mana-per-turn {add}`,
`first-cast-discount {amount}`, `turn-block {amount}`, `heal-after-fight {amount}`, and the one-time
`spell-capacity {add}` and `max-integrity {add}`. A new effect is an engine change (a primitive), never a one-off.

### The run

`shardrun/run.yaml` has these parts (ADR-0013, ADR-0020):

- `start`: spells (name, capacity, shards), spare shards, and relics.
- `deck` (optional): the cards a deck run starts with and the blank spells they are played into (ADR-0020). A pack
  without it offers only the spellbook playstyle.
- `spell_slots` (optional): the names and capacity of the empty spells a forge can bind or a relic can grant, in order.
- `difficulties`: each with `show_summaries`, `show_predictions`, and a `foe_hp` multiplier. The first is the default.
- `layers`: each a generated map (`rows`, `columns`, `paths`, `fixed_rows` like `{ "0": fight, "-1": rest }`, room
  `weights`, `elite_from_row`), a `foe_hp` multiplier, `encounters` for fights, elites, and the boss, and an optional
  `boss_spell` granted for beating it. The rest is presentation, by id: the arena (`backdrop`, required, and
  `boss_backdrop` for the guardian's room), what drifts in its air (`ambience` and `boss_ambience`: `dust`,
  `spores`, or `embers`), and the music of its map (`music`), its fights (`battle_music`), and its guardian
  (`boss_music`). A layer without its own music plays a theme instead (`apps/client/src/audio/music.ts`).
- `rewards`: shard rarity odds per battle kind, and relic rarity odds for elites, treasure rooms, and bosses.

Only one pack may define it. Validation checks every shard, foe, and relic it names.

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
- `pnpm content:locale ja`: translation coverage for a locale, plus anything stale. `--missing` prints the
  untranslated strings as catalog entries to paste and fill in.

## Translating a pack (ADR-0018)

English is the source: **never edit a content file to translate it.** A locale is an overlay beside it, at
`content/packs/<pack>/locales/<locale>/<area>.yaml`, and it is a list of pairs keyed by the English text itself:

```yaml
- en: Compound
  to: 複利
- en: "Squares every bolt's multiplier."
  to: "すべての矢の倍率を二乗します。"
- en: Ward            # `note:` is optional context for a reviewer and is never shown to a player
  to: 防護
  note: the shard, not the verb
```

Keying by the English means nothing refers to an id or a position, so content can be renamed and reordered freely.
It also means that if you **edit an English string**, its translation stops matching: the game falls back to English
and `pnpm content:locale <locale>` lists the entry as stale, so you always know what to redo.

The workflow is:

1. `pnpm content:locale ja --missing` — prints every untranslated string as a ready-to-fill entry.
2. Paste into a file under `locales/ja/`, fill in the `to:` values, split across files by area if it helps.
3. `pnpm content:locale ja` until it says 100% and reports nothing stale.
4. `pnpm content:validate` as usual.

Only prose is translatable, and only the paths listed in `packages/content-tools/src/locale/fields.ts`. Ids, tags,
sprite and icon names, numbers, and the code in a shard are out of reach on purpose — as are a few things that look
like prose and are not:

- **Spell names** become function names in the code view (`cast_bolt`), so they stay English, like the code.
- **Enemy names** in the classic mode are how the client finds a portrait (`slugify(enemy.name)`).
- **Shard worked examples** are validation fixtures and never reach a screen.

If you want a new field translated, add its path to `TRANSLATABLE_FIELDS` — but first check what else derives a value
from it. A field earns its line there by being *shown*.
