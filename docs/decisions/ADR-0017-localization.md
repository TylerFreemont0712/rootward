# ADR-0017 — English is the source language, and every other locale is a partial overlay

Status: accepted (2026-09-16)
Related: PROMPT.md section 2 (pillars); ADR-0008 (the server builds the view); ADR-0011 (the world is content).

## Context

The game has a second audience: the user's daughters, who are learning to program and read Japanese more comfortably
than English. That is a real requirement, not a hypothetical one, and it arrives with an awkward shape — the codebase
is already several thousand lines of English UI text across two modes, and the *content* (shard names, foe flavor,
lore, dialogue) is a second, larger body of English living in `content/`.

Three constraints pin the decision down:

- **English stays the source.** The code is written in English, the content files are authored in English, and the
  user is learning to program in English. A locale is a layer over that, never a fork of it.
- **Translating everything at once is not a change anyone would finish.** Whatever is chosen has to let one screen be
  translated on a Tuesday and the next one in a month, with the game fully playable in between, in both languages.
- **A missing translation must never be a blank screen or a thrown error.** The worst outcome of a partial locale is
  that the game becomes less usable in Japanese than it was in English.

## Options considered

1. **A library — i18next, or FormatJS/react-intl.** Both are the right answer for an app with translators, a
   translation-management system, and ICU plurals in forty languages. Here they buy machinery the project does not
   need yet (message extraction, lazy namespace loading, a compiler step) and cost the thing the project does need:
   `t("some.key")` in these libraries is typed as `string -> string` unless extra generation is wired up, so a
   mistyped key in the Japanese catalog is a runtime blank, not a build failure. It also adds a dependency to a
   client that currently has twelve, for about eighty lines of behavior.
2. **Localize on the server, send finished strings.** Consistent with ADR-0008 (the server builds the `RunView`) and
   it is the right answer for *content*. For UI chrome it is wrong: button labels, panel headings and aria-labels are
   presentation, the client already owns presentation, and routing them through the API would mean a round trip to
   change language and a view shape that carries prose it has no other reason to know about.
3. **Typed catalogs in the client, English as the type.** `en.ts` is a plain `as const` object; `MessageKey` is
   `keyof typeof en`; every other locale is `Partial<Record<MessageKey, string>>`. Chosen.

## Decision

Option 3, with three rules that are the whole design:

1. **English defines which keys exist.** `MessageKey` is derived from `en.ts`, so a typo or a stale key in `ja.ts` is
   a type error at build time rather than a hole at runtime.
2. **Fallback is per key, not per locale.** `translate()` reads `CATALOGS[locale][key] ?? en[key]`. A locale that
   translates nine strings out of eighty is a usable locale, which is what makes translating a screen at a time
   possible.
3. **Placeholders are filled by name.** `"Integrity {integrity}/{max}"`, not positional `%s`. Japanese word order is
   not English word order, and a translation has to be free to move a value to the other end of the sentence. An
   unfilled placeholder renders as written (`{zone}`), so a wrong parameter name is visible rather than silently
   blank.

The locale is a browser preference in `localStorage` and never leaves the machine (no telemetry, no accounts). The
language picker lists each language in its own language, because someone looking for their own language cannot be
assumed to read the current one.

Two pieces of the decision are typographic, and easy to forget because they are not code:

- Neither IBM Plex Mono nor VT323 has kana or kanji, so both font stacks now end with the system Japanese faces
  (`--font-jp`). A browser falls through *per glyph*, so Latin still renders in the CRT face and only Japanese text
  reaches the fallback. Pinning a webfont (`@fontsource/noto-sans-jp`) would make it identical on every machine; that
  is a dependency and a few hundred KB, so it waits until the look actually matters on a machine that lacks the face.
- Japanese has no spaces to break at, so `<html lang="ja">` turns on `overflow-wrap: anywhere` for the prose blocks.
  That attribute is set from the stored locale on load, not only when the picker changes, or a reload in Japanese
  comes back styled as English.

## What this deliberately does not do yet

- **Content strings are still English.** Shard names, foe flavor, dialogue and lore live in `content/` and belong to
  the server, which is what builds a view (ADR-0008). The intended shape is a per-pack locale overlay
  (`content/packs/<pack>/locales/ja/*.yaml`) merged at load with the same per-key fallback, and the client sending
  its locale with each request. That is the larger half of the work and it is the next step, not this one.
- **No ICU plural syntax.** Where English inflects — "1 fight" / "4 fights" — the two forms are two keys and a
  ternary at the call site (`whereabouts` in `screens/title.ts`). Japanese translates both keys to the same string,
  which is the common case, not a workaround: most languages the game is likely to reach have fewer forms than
  English, not more. `Intl.PluralRules` is in the platform for the first locale that needs six.
- **No number or date formatting.** The game shows small integers; `Intl.NumberFormat` arrives with the first string
  that needs grouping.

## Consequences

Easier: a screen is localized by lifting its strings into `en.ts` and adding the keys to `ja.ts`, with no build step,
no extraction tool, and no way to ship a key that does not exist. The mechanism is about eighty lines, all readable
in one sitting, which matters because this codebase is itself a teaching artifact.

Harder: every new UI string is now a decision — inline English, or a key. The rule is that anything a player reads
gets a key; a `// LEARN:` comment or a thrown developer error does not. And the catalogs will drift out of sync as
English gains strings Japanese lacks; that drift is intended and visible (the fallback test asserts it happens
gracefully), but it means "is Japanese complete?" is a question someone has to ask on purpose. A coverage count in
the test would answer it cheaply if it starts to matter.

Revisit when: content localization lands (it may move the picker's locale onto the API contract), or when a third
locale arrives and the single-file-per-locale shape starts to hurt.
