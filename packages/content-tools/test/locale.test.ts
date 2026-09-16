import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type ContentIndex, loadContent, localeReport, localizeIndex, translatableStrings } from "../src/index.ts";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");

async function index(): Promise<ContentIndex> {
  const { index: loaded } = await loadContent({ contentDir: path.join(repoRoot, "content"), rootDir: repoRoot });
  return loaded;
}

// Content localization (ADR-0018). These test the mechanism against the repository's real content, because the whole
// design rests on claims about that content: that translations are keyed by English text, that a partial locale is a
// usable locale, and — the important one — that nothing outside the declared prose fields can ever be touched.

describe("locale overlays", () => {
  it("replaces prose and leaves ids, code and numbers exactly as they were", async () => {
    const english = await index();
    const overlay = english.locales.get("ja");
    expect(overlay).toBeDefined();
    if (!overlay) return;
    const japanese = localizeIndex(english, overlay);

    const before = english.shards.get("compound")?.value;
    const after = japanese.shards.get("compound")?.value;
    expect(before?.name).toBe("Compound");
    expect(after?.name).toBe("複利");
    expect(after?.summary).not.toBe(before?.summary);
    // Everything a rule or a sandbox reads is identical, and identical by value, not merely similar.
    expect(after?.id).toBe("compound");
    expect(after?.function).toBe("compound");
    expect(after?.code).toEqual(before?.code);
    expect(after?.cost).toBe(before?.cost);
    expect(after?.complexity).toBe(before?.complexity);
    expect(after?.tags).toEqual(before?.tags);
    expect(after?.examples).toEqual(before?.examples);
  });

  it("leaves the English index untouched, so the engine can keep using it", async () => {
    const english = await index();
    const overlay = english.locales.get("ja");
    if (!overlay) throw new Error("the core pack has no Japanese");
    localizeIndex(english, overlay);
    expect(english.shards.get("compound")?.value.name).toBe("Compound");
    expect(english.shardrunFoes.get("root-daemon")?.value.name).toBe("The Root Daemon");
  });

  it("falls back to English one string at a time", async () => {
    const english = await index();
    const partial = { locale: "xx", strings: new Map([["Compound", "Kompound"]]) };
    const localized = localizeIndex(english, partial);
    expect(localized.shards.get("compound")?.value.name).toBe("Kompound");
    // Untranslated neighbours keep their English rather than going blank.
    expect(localized.shards.get("compound")?.value.summary).toBe(english.shards.get("compound")?.value.summary);
    expect(localized.shards.get("echo")?.value.name).toBe("Echo");
  });

  it("only offers strings the game actually shows", async () => {
    const strings = translatableStrings(await index());
    expect(strings).toContain("Compound");
    expect(strings).toContain("The Root Daemon");
    expect(strings).toContain("The Salvage");
    // Worked examples are validation fixtures and never reach a view, so they are not translatable.
    expect(strings).not.toContain("one squared is one, so order is the whole lesson");
    // Nor is anything that is an identifier rather than prose.
    expect(strings).not.toContain("compound");
  });

  it("reports the repository's Japanese as complete and unstale", async () => {
    const report = localeReport(await index(), "ja");
    expect(report.missing).toEqual([]);
    // A stale entry means an English string was edited after it was translated; the game already fell back.
    expect(report.stale).toEqual([]);
    expect(report.translated.length).toBeGreaterThan(100);
  });
});
