import { z } from "zod";

// Localization (ADR-0017). English is the project's source language: it is what the content files and the code hold,
// and every other locale is an overlay on top of it that may be partial. A missing translation is never an error and
// never an empty screen — it falls back to English, one string at a time.

export const LOCALES = ["en", "ja"] as const;
export const Locale = z.enum(LOCALES);
export type Locale = z.infer<typeof Locale>;

export const DEFAULT_LOCALE: Locale = "en";

/** Each locale named in its own language, which is how a language picker should read. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  en: "English",
  ja: "日本語",
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** The locale to use for `value`, falling back rather than failing: an unknown or absent one is English. */
export function toLocale(value: string | null | undefined): Locale {
  return value !== null && value !== undefined && isLocale(value) ? value : DEFAULT_LOCALE;
}
