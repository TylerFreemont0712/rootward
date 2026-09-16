import { DEFAULT_LOCALE, type Locale, toLocale } from "@rootward/shared";
import { create } from "zustand";
import { en, type MessageKey } from "./en.ts";
import { ja } from "./ja.ts";

// The client's message catalogs (ADR-0017). Three rules, and they are the whole design:
//
//  1. English is the source. `en.ts` defines which keys exist; every other locale is `Partial` of it.
//  2. A missing translation falls back to English *per key*, so a half-translated locale is a usable locale.
//  3. Nothing here touches content strings — shard names, foe flavor, dialogue. Those will be localized on the
//     server, from the pack's own locale overlay, because the server is what builds a view (ADR-0008). That half is
//     not built yet: content still arrives in English whatever the picker says.

const CATALOGS: Readonly<Record<Locale, Partial<Record<MessageKey, string>>>> = { en, ja };

const STORAGE_KEY = "rootward.locale";

/** Fill `{name}` placeholders. A placeholder with no value is left as written, so a bad key is visible, not silent. */
function fill(message: string, params: Readonly<Record<string, string | number>> | undefined): string {
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

export function translate(locale: Locale, key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  return fill(CATALOGS[locale][key] ?? en[key], params);
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

// The stored locale has to reach `<html lang>` on load, not only when the picker is used: the Japanese font stack and
// the "wrap anywhere" rule in menu.css both key off that attribute, so a reload in Japanese would otherwise come back
// styled as English. Setting it here, beside the store's initial value, keeps the two from drifting apart.
const startingLocale = readLocale();
applyDocumentLang(startingLocale);

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: startingLocale,
  setLocale: (locale) => {
    writeLocale(locale);
    applyDocumentLang(locale);
    set({ locale });
  },
}));

/** The bound translator for the current locale. Components call `const t = useT()` and then `t("menu.switch")`. */
export function useT(): (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string {
  const locale = useLocaleStore((state) => state.locale);
  return (key, params) => translate(locale, key, params);
}

export function useLocale(): Locale {
  return useLocaleStore((state) => state.locale);
}

function applyDocumentLang(locale: Locale): void {
  try {
    document.documentElement.lang = locale;
  } catch {
    // No document (tests run in Node); the attribute is presentation, so there is nothing to recover.
  }
}

// Browser storage can be unavailable (private windows, blocked site data); the locale is a preference, so a failure
// just means English.
function readLocale(): Locale {
  try {
    return toLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

function writeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // See the note above readLocale.
  }
}

export type { MessageKey };
