import { DEFAULT_LOCALE, type Locale } from "./locale.ts";

// The message-catalog mechanism, shared by the browser and the server (ADR-0017, ADR-0018).
//
// Both sides have prose of their own: the client owns its screens, and the server composes the sentences that belong
// to a view it builds — a foe's intent, a trait's rule, the label on a stat. They are the same problem, so they use
// the same three rules: English defines the keys, a locale may be partial, and a missing translation falls back to
// English one key at a time.
//
// Content strings are a different problem and are not translated here. They live in `content/` and are replaced at
// load time from a catalog keyed by the English text itself (ADR-0018).

/** Fill `{name}` placeholders. A placeholder with no value is left as written, so a bad key is visible, not silent. */
export function fillMessage(message: string, params: Readonly<Record<string, string | number>> | undefined): string {
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

export type Translate<K extends string> = (key: K, params?: Readonly<Record<string, string | number>>) => string;

/**
 * Build a translator over a set of catalogs. `source` is the English one and defines which keys exist; the others may
 * be partial, and anything missing from them falls back to it.
 */
export function makeTranslate<K extends string>(
  catalogs: Readonly<Record<Locale, Partial<Record<K, string>>>>,
  source: Readonly<Record<K, string>>,
): (locale: Locale, key: K, params?: Readonly<Record<string, string | number>>) => string {
  return (locale, key, params) => fillMessage(catalogs[locale][key] ?? source[key], params);
}

export { DEFAULT_LOCALE };
export type { Locale };
