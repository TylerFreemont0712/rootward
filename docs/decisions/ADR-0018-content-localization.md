# ADR-0018 — Translate content by overlay, keyed by the English text, and carry the locale in the request

Status: accepted (2026-09-16)
Extends ADR-0017 (English is the source language) to the content in `content/`.
Related: ADR-0008 (the server builds the view); ADR-0011 (the world is content); ADR-0012 (Shardrun).

## Context

ADR-0017 localized the interface. The larger half was left: the *content* — shard names and summaries, foe names and
flavor, relic text, layer names, and eventually quests, dialogue, lore and challenge prompts. It is several times the
volume of the interface, it lives in `content/` rather than in code, and it is authored in English and will go on
being authored in English, because that is the language the project is written and learned in.

Three constraints shaped the answer:

- **The English source files must not change.** Not their shape, not their fields, not one line. English is what an
  author writes and what every existing tool reads; a locale is a layer over it. A `{en, ja}` map inside every prose
  field would make every content file worse to author in order to serve a language most of them will never have.
- **The engine must not learn about languages.** `packages/core` is pure and seeded, and a run made in one language
  must be identical to the same run made in another.
- **The server must not learn about languages either, in thirty places.** Every service method, view builder and
  route already exists and works. Threading a `locale` parameter through all of them is a large diff whose main
  product is thirty new opportunities to forget it.

## Options considered

1. **Per-field maps in the content files** (`name: {en: "Compound", ja: "複利"}`). Rejected on the first constraint.
   Every schema, every loader and every author pays for it forever.
2. **Parallel overlay files keyed by structure** (`locales/ja/shards/compound.yaml`, mirroring the original's shape,
   deep-merged). Better — the source stays clean — but the key is a *position*: rename an id, reorder a list of
   dialogue choices, move a file, and translations silently land on the wrong string or vanish. Worse, when an
   English sentence is edited, the overlay still matches its path and keeps showing a confident translation of a
   sentence that no longer exists.
3. **An overlay catalog keyed by the English text itself**, gettext-style. Chosen.

## Decision

### Content: a catalog keyed by the source string

`content/packs/<pack>/locales/<locale>/*.yaml` is a list of `{en, to}` pairs. The key is the English exactly as the
content holds it, so nothing in a catalog names a file, an id or a position:

```yaml
- en: Compound
  to: 複利
```

Two properties follow, and they are the reason for the choice. Content can be renamed, reordered and moved without
touching a translation. And when an English string is **edited**, its entry stops matching: the game falls back to
English, and `pnpm content:locale ja` lists the entry as stale, naming the line to redo. Stale translations — the
expensive failure of key-based catalogs, because they are wrong and silent — cannot happen here. The cost is that
identical English always translates identically; for this corpus, where the repeats are "Goodbye." and "Another
time.", that is a feature.

### What a catalog may reach: a declared allowlist

`TRANSLATABLE_FIELDS` names the paths that hold prose. An overlay can reach nothing else, so no catalog — however
wrong, however machine-generated — can touch an id, a tag, a sprite, a number, or the code the player reads and runs.
"Translate every string in the response" would be less code and a worse idea, and this codebase can point at three
reasons it would have broken something:

- `LeftPane.tsx` looks a classic-mode enemy portrait up by `slugify(enemy.name)`. Translating an enemy's name would
  silently lose its art, so `enemy.name` is not in the table until that lookup uses the id.
- A Shardrun spell's name becomes a function name in the code view (`cast_bolt`), and `snakeCase` of a Japanese name
  is empty — every spell would read `cast_spell`. Spell names are identifiers as much as labels, so they stay
  English, which is also what the roadmap says about code.
- A shard's worked examples never reach a view at all. They were in the table for an hour and cost 64 strings of pure
  waste before being taken out. **A field earns its line by being shown.**

### The locale travels in the request, not in the signatures

The client sends `x-rootward-locale` from the one `request()` wrapper it already has. The server sets that locale in
an `AsyncLocalStorage` in a single `onRequest` hook, and `GameContent.index` is a **getter** that answers with the
localized index for the request in flight. Each locale's index is built once at startup by `localizeIndex`.

So no route, service or view builder takes a locale, and none of them changed. This is the part of the decision most
worth questioning, because request-scoped implicit context is easy to misuse: it is invisible at the call site, and
a value that escapes its request reads as English rather than failing loudly. It earns its place here because the
locale is genuinely ambient — it is a property of *who is being answered*, not of what is being asked — and because
the failure mode of getting it wrong is the same as the failure mode of having no translation at all.

### The engine reads English, always

`ShardrunService` keeps its English catalog for `startShardrun` and `stepShardrun`, and uses a localized one only
where it builds views. Two concrete reasons, not tidiness:

- Foe names reach **player code**: a shard receives `battle.foes[].name`. A localized catalog would mean a shard
  could behave differently in Japanese, which breaks the seeded, deterministic core.
- The engine writes its battle log into the **saved run**. A localized catalog would bake one reader's language into
  a save file.

A foe's name and flavor are therefore read back from the catalog *by id* at view time, while everything the rules use
stays the copy made when it spawned.

### The server has a message catalog of its own

Some view prose has no English string in any file for a catalog to match, because the server assembles it from
content plus numbers: "Strike for 14", "Bolts under 4 power glance off", "Mana each turn". That is interface text
that happens to be composed on the server, so it uses the interface's mechanism: `apps/server/src/i18n/`, English
defining the keys, over the same `makeTranslate` in `@rootward/shared` that the browser uses.

## Consequences

Translating a pack is now: run `pnpm content:locale ja --missing`, paste, fill in, run it again until it says 100%.
Adding a locale is a folder. Adding a translatable field is one line in `TRANSLATABLE_FIELDS`. Nothing about any of
that touches the engine, the routes, or the English content.

**What is still English, and why.** The battle log is the visible one: the engine composes 37 sentences in
`packages/core` and stores them in the run. The fix is not to give the core a translator — it is for `LogEntry` to
carry a key and its parameters alongside `kind`, `foe`, `amount` and `element`, which it half does already, and let
the client render it. That is a schema version bump and a pass over the core's tests, so it is its own piece of work.
Until then a Japanese fight has a Japanese foe, Japanese shards and an English commentary.

The client screens converted so far are the ones ADR-0017 named; the rest are still inline English, which the per-key
fallback makes harmless but visible. And the language picker lives on the title screen and the main menu, so language
cannot be changed mid-run — fine while it is a setting, wrong once someone wants to switch to check a word.

Revisit when: the battle log is restructured; or a locale needs a plural rule English does not have; or content grows
enough that one catalog file per pack stops being comfortable (it is already a directory, so this is a split, not a
redesign).
