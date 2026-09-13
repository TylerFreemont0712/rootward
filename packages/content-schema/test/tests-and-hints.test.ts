import { describe, expect, it } from "vitest";
import { HintLadder, IoCase, IoTestFile, resolveStdin, splitHintLadder } from "../src/index.ts";

describe("IoCase", () => {
  it("needs exactly one of stdin or generator", () => {
    const base = { id: "h1", name: "empty input", expected_stdout: "" };
    expect(IoCase.safeParse({ ...base, stdin: "" }).success).toBe(true);
    expect(IoCase.safeParse({ ...base, generator: { repeat: "a ", times: 3 } }).success).toBe(true);
    expect(IoCase.safeParse(base).success).toBe(false);
    expect(IoCase.safeParse({ ...base, stdin: "x", generator: { repeat: "a", times: 1 } }).success).toBe(false);
  });

  it("expands generators when resolving stdin", () => {
    const parsed = IoCase.parse({ id: "h4", name: "large", generator: { repeat: "ab ", times: 3 }, expected_stdout: "" });
    expect(resolveStdin(parsed)).toBe("ab ab ab ");
  });
});

describe("IoTestFile", () => {
  it("defaults normalization to lenient trailing whitespace and newlines", () => {
    const parsed = IoTestFile.parse({ form: "io", cases: [{ id: "v1", name: "n", stdin: "", expected_stdout: "" }] });
    expect(parsed.normalize).toEqual({ trailing_whitespace: true, newlines: true });
    expect(parsed.cases[0]?.reserve).toBe(false);
  });
});

describe("splitHintLadder", () => {
  it("splits on lines that contain only ---", () => {
    const levels = splitHintLadder("nudge\n---\nconcept `a --- b`\n---\nplan\n---   \npartial\n");
    expect(levels).toEqual(["nudge", "concept `a --- b`", "plan", "partial"]);
    expect(HintLadder.safeParse(levels).success).toBe(true);
  });

  it("keeps empty levels so validation can report them", () => {
    const levels = splitHintLadder("one\n---\n\n---\nthree\n---\nfour");
    expect(levels[1]).toBe("");
    expect(HintLadder.safeParse(levels).success).toBe(false);
  });
});
