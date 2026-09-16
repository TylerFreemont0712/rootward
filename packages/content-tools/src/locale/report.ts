import type { ContentIndex } from "../content-index.ts";
import type { Diagnostics } from "../diagnostics.ts";
import { translatableStrings } from "./apply.ts";
import { clip } from "./overlay.ts";

export interface LocaleReport {
  locale: string;
  /** English strings this locale translates and the content still uses. */
  translated: string[];
  /** English strings the content uses and this locale has no translation for. */
  missing: string[];
  /**
   * Translations whose English no longer appears in any content file. Almost always an English string that was
   * edited after it was translated: the game has already fallen back to English, and this says which line to redo.
   */
  stale: string[];
}

export function localeReport(index: ContentIndex, locale: string): LocaleReport {
  const source = translatableStrings(index);
  const overlay = index.locales.get(locale);
  const strings = overlay?.strings ?? new Map<string, string>();
  const used = new Set(source);
  return {
    locale,
    translated: source.filter((text) => strings.has(text)),
    missing: source.filter((text) => !strings.has(text)),
    stale: [...strings.keys()].filter((text) => !used.has(text)),
  };
}

/**
 * Warn about translations that no longer match any English in the content. This runs at load, so a drifted
 * translation is visible in the server's startup output rather than only when someone thinks to look.
 */
export function warnAboutStaleTranslations(index: ContentIndex, diagnostics: Diagnostics): void {
  for (const locale of index.locales.keys()) {
    const { stale } = localeReport(index, locale);
    for (const text of stale) {
      diagnostics.warn(
        "stale-translation",
        `${locale}: "${clip(text)}" no longer matches any content; it falls back to English`,
      );
    }
  }
}
