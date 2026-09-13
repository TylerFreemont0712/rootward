import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Diagnostics, formatDiagnostic, loadBalance, loadContent } from "../src/index.ts";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");

describe("the repository's own content", () => {
  it("loads every core pack file without errors", async () => {
    const { index, diagnostics } = await loadContent({ contentDir: path.join(repoRoot, "content"), rootDir: repoRoot });
    expect(diagnostics.errors.map(formatDiagnostic)).toEqual([]);
    expect(index.packs.has("core")).toBe(true);

    const tallyWisp = index.challenges.get("foundry.py.dict-word-count");
    expect(tallyWisp?.hints).toHaveLength(4);
    expect(Object.keys(tallyWisp?.starter ?? {})).toEqual(["python", "javascript"]);
    expect(index.classes.get("artificer")?.abilities.length).toBeGreaterThan(0);
  });

  it("loads config/balance.yaml", async () => {
    const diagnostics = new Diagnostics();
    const balance = await loadBalance(path.join(repoRoot, "config"), diagnostics, repoRoot);
    expect(diagnostics.errors.map(formatDiagnostic)).toEqual([]);
    expect(balance?.planner.default_session).toBe("long");
  });
});
