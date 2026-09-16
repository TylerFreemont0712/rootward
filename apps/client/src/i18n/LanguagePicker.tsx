import { isLocale, LOCALE_NAMES, LOCALES } from "@rootward/shared";
import { useLocaleStore, useT } from "./index.ts";

/**
 * The language control (ADR-0017). Each language is written in its own language, because someone looking for their
 * own language cannot be assumed to read the current one. The choice is a browser preference and never leaves the
 * machine; content strings follow it because the client sends the locale with every request.
 */
export function LanguagePicker() {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const t = useT();
  return (
    <label className="lang-picker">
      <span className="meta">{t("language.label")}</span>
      <select
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) setLocale(event.target.value);
        }}
      >
        {LOCALES.map((option) => (
          <option key={option} value={option}>
            {LOCALE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
