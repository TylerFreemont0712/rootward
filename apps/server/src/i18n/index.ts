import { type Locale, makeTranslate, toLocale, type Translate } from "@rootward/shared";
import { currentLocale } from "../content.ts";
import { en, type MessageKey } from "./en.ts";
import { ja } from "./ja.ts";

const CATALOGS: Readonly<Record<Locale, Partial<Record<MessageKey, string>>>> = { en, ja };

export const translate = makeTranslate<MessageKey>(CATALOGS, en);

/**
 * A translator bound to the language of the request being served (ADR-0018). Outside a request it is English, which
 * is what a test or a background job should get.
 */
export function t(): Translate<MessageKey> {
  const locale = toLocale(currentLocale());
  return (key, params) => translate(locale, key, params);
}

export type { MessageKey };
