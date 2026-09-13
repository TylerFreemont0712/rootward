import { describe, expect, it } from "vitest";
import { compareOutput } from "../src/io/compare.ts";

const lenient = { trailingWhitespace: true, newlines: true };
const strict = { trailingWhitespace: false, newlines: false };

describe("compareOutput", () => {
  it("ignores trailing spaces, CRLF line breaks, and final blank lines when lenient", () => {
    expect(compareOutput("a 1  \r\nb 2\n\n", "a 1\nb 2", lenient).passed).toBe(true);
  });

  it("keeps leading whitespace significant", () => {
    expect(compareOutput("  a", "a", lenient).passed).toBe(false);
  });

  it("compares exactly when strict", () => {
    expect(compareOutput("a\n", "a", strict).passed).toBe(false);
    expect(compareOutput("a\n", "a\n", strict).passed).toBe(true);
  });

  it("points at the first line that differs", () => {
    expect(compareOutput("a\nb\nc", "a\nx\nc", lenient).firstDifferentLine).toBe(2);
    expect(compareOutput("a", "a\nb", lenient).firstDifferentLine).toBe(2);
  });
});
