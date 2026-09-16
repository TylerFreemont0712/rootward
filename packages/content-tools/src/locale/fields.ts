// Which content fields hold prose, and may therefore be replaced by a translation (ADR-0018).
//
// This table is an allowlist on purpose. A locale overlay can only reach a path named here, so no overlay — however
// wrong, however machine-generated — can touch an id, a tag, a sprite name, a balance number, or the code a player
// reads and runs. "Translate every string in the response" would be less code and a worse idea, for two reasons this
// codebase can point at:
//
//   - `LeftPane.tsx` looks a classic-mode enemy portrait up by `slugify(enemy.name)`, so translating an enemy's name
//     would silently lose its art. `enemy.name` is deliberately absent below until that lookup uses the enemy's id.
//   - A Shardrun spell's name becomes the function name in the code view (`cast_bolt`), and `snakeCase` of a Japanese
//     name is empty, so every spell would read `cast_spell`. Spell names are identifiers as much as labels, which is
//     the same reason the roadmap keeps code English. They are absent below too.
//
// A path is dotted. `*` matches every element of an array and every value of a record, so one line covers a list of
// dialogue choices or a record of nodes.

/** The content kinds a locale overlay can reach, and the paths within each one that hold prose. */
export const TRANSLATABLE_FIELDS = {
  // Shardrun (ADR-0012). A shard's `function` and `code` stay English: they are the program.
  // `examples.*.name` is deliberately absent: worked examples are validation fixtures and never reach a view, so
  // translating them would be a hundred strings of pure waste. A field earns a line here by being *shown*.
  shard: ["name", "summary"],
  shardrunFoe: ["name", "flavor"],
  shardrunRelic: ["name", "summary", "flavor"],
  // `shardrun/run.yaml`. `start.spells.*.name` and `spell_slots.names.*` are excluded: see the note above.
  shardrun: ["difficulties.*.name", "difficulties.*.summary", "layers.*.name", "layers.*.flavor"],
} as const satisfies Record<string, readonly string[]>;

export type TranslatableKind = keyof typeof TRANSLATABLE_FIELDS;

export const TRANSLATABLE_KINDS = Object.keys(TRANSLATABLE_FIELDS) as TranslatableKind[];
