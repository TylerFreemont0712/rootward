import type { ContentIndex, Sourced } from "../content-index.ts";
import { TRANSLATABLE_FIELDS, type TranslatableKind } from "./fields.ts";
import type { LocaleOverlay } from "./overlay.ts";

// Applying an overlay (ADR-0018). One traversal does both jobs: with a visitor that returns a translation it
// localizes, and with one that only records it extracts every translatable string for the coverage report. Keeping
// them the same walk is what guarantees the report cannot claim coverage of a string the game never asks for.

type Visit = (text: string) => string | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rebuild `value` with `visit` applied to every string at `segments`. Returns the original object when nothing
 * changed, so an untranslated record is shared rather than copied.
 */
function walk(value: unknown, segments: readonly string[], visit: Visit): unknown {
  if (segments.length === 0) return typeof value === "string" ? (visit(value) ?? value) : value;
  const [head, ...rest] = segments;
  if (head === undefined) return value;

  if (head === "*") {
    if (Array.isArray(value)) {
      const next = value.map((item) => walk(item, rest, visit));
      return next.some((item, i) => item !== value[i]) ? next : value;
    }
    if (isRecord(value)) return rebuild(value, Object.keys(value), rest, visit);
    return value;
  }
  return isRecord(value) && head in value ? rebuild(value, [head], rest, visit) : value;
}

function rebuild(value: Record<string, unknown>, keys: string[], rest: readonly string[], visit: Visit): unknown {
  let changed = false;
  const next: Record<string, unknown> = { ...value };
  for (const key of keys) {
    const child = walk(value[key], rest, visit);
    if (child !== value[key]) changed = true;
    next[key] = child;
  }
  return changed ? next : value;
}

function visitRecord<T>(record: T, kind: TranslatableKind, visit: Visit): T {
  let current: unknown = record;
  for (const path of TRANSLATABLE_FIELDS[kind]) current = walk(current, path.split("."), visit);
  return current as T;
}

/** Where each translatable kind lives in the index. Adding a kind is one line here and one in `fields.ts`. */
function sourcedMaps(index: ContentIndex): Partial<Record<TranslatableKind, Map<string, Sourced<unknown>>>> {
  return {
    shard: index.shards,
    shardrunFoe: index.shardrunFoes,
    shardrunRelic: index.shardrunRelics,
  };
}

function eachKind(index: ContentIndex, run: (kind: TranslatableKind, value: unknown, set: (next: unknown) => void) => void): void {
  for (const [kind, map] of Object.entries(sourcedMaps(index)) as [TranslatableKind, Map<string, Sourced<unknown>>][]) {
    for (const [id, sourced] of map) {
      run(kind, sourced.value, (next) => {
        map.set(id, { ...sourced, value: next });
      });
    }
  }
  if (index.shardrun) {
    const sourced = index.shardrun;
    run("shardrun", sourced.value, (next) => {
      index.shardrun = { ...sourced, value: next as typeof sourced.value };
    });
  }
}

/**
 * A copy of `index` with every translatable field replaced by `overlay` where it has one. Untranslated strings keep
 * their English, one string at a time — a half-translated locale is a usable locale, exactly as in the UI catalogs.
 */
export function localizeIndex(index: ContentIndex, overlay: LocaleOverlay): ContentIndex {
  const copy: ContentIndex = {
    ...index,
    shards: new Map(index.shards),
    shardrunFoes: new Map(index.shardrunFoes),
    shardrunRelics: new Map(index.shardrunRelics),
  };
  const visit: Visit = (text) => overlay.strings.get(text);
  eachKind(copy, (kind, value, set) => {
    const next = visitRecord(value, kind, visit);
    if (next !== value) set(next);
  });
  return copy;
}

/** Every string the game could show from a translatable field, in index order, without duplicates. */
export function translatableStrings(index: ContentIndex): string[] {
  const seen = new Set<string>();
  eachKind(index, (kind, value) => {
    visitRecord(value, kind, (text) => {
      seen.add(text);
      return undefined;
    });
  });
  return [...seen];
}
