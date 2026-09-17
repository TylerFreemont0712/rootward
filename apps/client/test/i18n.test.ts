import { LOCALES, makeTranslate } from "@rootward/shared";
import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en.ts";
import { translate, useLocaleStore } from "../src/i18n/index.ts";
import { ja } from "../src/i18n/ja.ts";

// The localization skeleton (ADR-0017). These test the *mechanism*, not the wording: that English is the source, that
// a partial locale is a usable locale, and that placeholders survive being moved around a translated sentence.

describe("message catalogs", () => {
  it("falls back to English one key at a time", () => {
    const switchJa = ja["menu.switch"];
    expect(translate("ja", "menu.switch")).toBe(switchJa);
    if (switchJa === undefined) throw new Error("menu.switch should be translated");
    // A key a locale does not translate yet still renders, in English, rather than blank. The real catalogs can be
    // complete at any moment, so the fallback is shown on a partial Japanese catalog built from them.
    const partial = makeTranslate<keyof typeof en>({ en, ja: { "menu.switch": switchJa } }, en);
    expect(partial("ja", "menu.switch")).toBe(switchJa);
    expect(partial("ja", "menu.codex")).toBe(en["menu.codex"]);
  });

  it("fills placeholders by name, wherever a translation puts them", () => {
    expect(translate("en", "menu.world.here", { zone: "the Bastion" })).toBe("You are in the Bastion");
    expect(translate("ja", "menu.world.here", { zone: "城塞" })).toContain("城塞");
    // Three values, and Japanese orders the sentence differently: filling by name is what makes that possible.
    const running = translate("ja", "menu.shardrun.running", { layer: "残骸", integrity: 40, max: 60 });
    expect(running).toContain("残骸");
    expect(running).toContain("40/60");
  });

  it("leaves an unfilled placeholder visible instead of silently blanking it", () => {
    expect(translate("en", "menu.world.here")).toBe("You are in {zone}");
  });

  it("loads without a browser at all", () => {
    // These tests run in Node: no `window`, no `document`. Importing the module ran its initialization, so reaching
    // the store at all proves the storage read and the `<html lang>` write both failed softly rather than throwing.
    expect(useLocaleStore.getState().locale).toBe("en");
  });

  it("uses only keys English defines, in every locale", () => {
    for (const locale of LOCALES) {
      const catalog: Record<string, string | undefined> = locale === "ja" ? ja : en;
      for (const key of Object.keys(catalog)) expect(en).toHaveProperty(key);
    }
  });
});
