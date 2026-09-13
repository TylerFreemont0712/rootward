import { Enemy, SkillsFile } from "@rootward/content-schema";
import { describe, expect, it } from "vitest";
import { Diagnostics } from "../src/diagnostics.ts";
import { parseYaml } from "../src/yaml.ts";

describe("parseYaml", () => {
  it("reports schema errors with the line of the offending key", () => {
    const diagnostics = new Diagnostics();
    const text = [
      "nodes:",
      "  - id: concept.values",
      "    name: Values",
      "    realm: foundry",
      "    tier: 0",
      "    prerequisite: []",
      "    summary: Numbers and text.",
      "    evidence_tags: [values]",
    ].join("\n");
    expect(parseYaml(text, "skills.yaml", SkillsFile, diagnostics)).toBeUndefined();
    expect(diagnostics.errors).toHaveLength(1);
    expect(diagnostics.errors[0]).toMatchObject({ code: "schema", file: "skills.yaml", line: 6 });
    expect(diagnostics.errors[0]?.message).toContain("nodes[0]");
  });

  it("rejects duplicate keys as YAML errors", () => {
    const diagnostics = new Diagnostics();
    parseYaml("version: 1\nversion: 2\n", "balance.yaml", SkillsFile, diagnostics);
    expect(diagnostics.errors[0]).toMatchObject({ code: "yaml", line: 2 });
  });

  it("keeps the leading spaces of ASCII art with an indentation indicator", () => {
    const diagnostics = new Diagnostics();
    const text = [
      "id: blob",
      "name: Blob",
      "tier: 1",
      "realm_affinity: [foundry]",
      "moves: [{ move: strike, weight: 1 }]",
      "loot_table: tier1-common",
      "flavor: { intro: hi, defeat: bye }",
      "art: |2",
      "     .-.",
      "    (o o)",
    ].join("\n");
    const enemy = parseYaml(text, "blob.yaml", Enemy, diagnostics);
    expect(diagnostics.items).toEqual([]);
    expect(enemy?.art).toBe("   .-.\n  (o o)\n");
  });
});
