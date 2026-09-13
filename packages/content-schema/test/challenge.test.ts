import { describe, expect, it } from "vitest";
import { ChallengeManifest } from "../src/index.ts";

const tallyWisp = {
  id: "foundry.py.dict-word-count",
  title: "The Tally Wisp",
  version: 1,
  realm: "foundry",
  kind: "code",
  concepts: ["py.collections.dict", "py.strings.split"],
  tags: ["dict", "counting"],
  difficulty: 3,
  tier: 1,
  languages: ["python", "javascript"],
  estimated_minutes: 6,
  enemy: { template: "tally-wisp", hp_override: null },
  retreatable: true,
  tests: { form: "io", visible: 3, hidden: 4, entry: { python: "main.py", javascript: "main.js" } },
  flavor: { intro: "A wisp of tallies flickers.", defeat: "The tallies settle." },
  author: "core",
};

describe("ChallengeManifest", () => {
  it("parses a valid manifest and fills defaults", () => {
    const parsed = ChallengeManifest.parse(tallyWisp);
    expect(parsed.constraints).toEqual({ banned_tokens: [] });
    expect(parsed.scoring).toEqual({ crit: true, efficiency: true, elegance: true });
    expect(parsed.generated).toBeNull();
    expect(parsed.deprecated).toBe(false);
  });

  it("rejects unknown keys so typos surface instead of being ignored", () => {
    const result = ChallengeManifest.safeParse({ ...tallyWisp, concept: ["x"] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.code).toBe("unrecognized_keys");
  });

  it("requires an io entry file for every language", () => {
    const result = ChallengeManifest.safeParse({
      ...tallyWisp,
      tests: { ...tallyWisp.tests, entry: { python: "main.py" } },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("tests.entry.javascript");
  });

  it("rejects entry paths that escape the starter folder", () => {
    const result = ChallengeManifest.safeParse({
      ...tallyWisp,
      tests: { ...tallyWisp.tests, entry: { python: "../main.py", javascript: "main.js" } },
    });
    expect(result.success).toBe(false);
  });
});
