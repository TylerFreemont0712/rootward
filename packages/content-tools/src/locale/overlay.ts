import path from "node:path";
import { z } from "zod";
import type { Diagnostics } from "../diagnostics.ts";
import { listDirectories, listFiles } from "../loader/files.ts";
import { readYamlFile } from "../yaml.ts";

// A locale overlay is a catalog keyed by the English text itself (ADR-0018), not by `shard.compound.summary`.
//
// That choice buys two things. Ids can be renamed, lists reordered and files moved without touching a translation,
// because nothing in the catalog refers to where a string lives. And when an English string is *edited*, its
// translation stops matching and the screen falls back to English — loudly, in the coverage report — instead of
// showing a confident translation of a sentence that no longer exists. Stale translations are the expensive failure
// of key-based catalogs, and this shape does not have them.
//
// The cost is that identical English always translates identically. For a corpus like this one, where the repeats are
// "Goodbye." and "Another time.", that is a feature.

/** One entry: the English as it appears in the content, and what this locale says instead. */
export const LocaleEntry = z.strictObject({
  en: z.string().min(1),
  to: z.string().min(1),
  /** Optional context for whoever translates or reviews it. Never shown to a player. */
  note: z.string().optional(),
});
export type LocaleEntry = z.infer<typeof LocaleEntry>;

export const LocaleCatalogFile = z.array(LocaleEntry);

export interface LocaleOverlay {
  locale: string;
  /** English source text -> translation. */
  strings: ReadonlyMap<string, string>;
}

/**
 * Read every catalog under `<packDir>/locales/<locale>/*.yaml`. Catalogs merge, so a pack can split them by area as
 * it grows; the same English translated twice inside one locale is an error, because only one of them could win.
 */
export async function loadPackLocales(
  packDir: string,
  displayFor: (file: string) => string,
  diagnostics: Diagnostics,
): Promise<Map<string, LocaleOverlay>> {
  const overlays = new Map<string, LocaleOverlay>();
  const localesDir = path.join(packDir, "locales");
  // Locales are whatever folders exist. Content does not need to know which of them the interface can be shown in;
  // the server asks for one by name and gets English if the pack has never heard of it.
  for (const locale of await listDirectories(localesDir)) {
    const dir = path.join(localesDir, locale);
    const strings = new Map<string, string>();
    const seenIn = new Map<string, string>();
    for (const name of await listFiles(dir, ".yaml")) {
      const file = path.join(dir, name);
      const display = displayFor(file);
      const entries = await readYamlFile(file, display, LocaleCatalogFile, diagnostics);
      if (!entries) continue;
      for (const entry of entries) {
        const previous = seenIn.get(entry.en);
        if (previous !== undefined) {
          diagnostics.error("duplicate-translation", `"${clip(entry.en)}" is already translated in ${previous}`, {
            file: display,
          });
          continue;
        }
        seenIn.set(entry.en, display);
        strings.set(entry.en, entry.to);
      }
    }
    if (strings.size > 0) overlays.set(locale, { locale, strings });
  }
  return overlays;
}

/** Merge overlays of the same locale from several packs. Later packs win, matching how content itself merges. */
export function mergeOverlays(all: readonly Map<string, LocaleOverlay>[]): Map<string, LocaleOverlay> {
  const merged = new Map<string, Map<string, string>>();
  for (const overlays of all) {
    for (const [locale, overlay] of overlays) {
      const target = merged.get(locale) ?? new Map<string, string>();
      for (const [en, to] of overlay.strings) target.set(en, to);
      merged.set(locale, target);
    }
  }
  return new Map([...merged].map(([locale, strings]) => [locale, { locale, strings }]));
}

export function clip(text: string, limit = 60): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= limit ? oneLine : `${oneLine.slice(0, limit - 1)}…`;
}
