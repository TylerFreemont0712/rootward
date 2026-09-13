import { describe, expect, it } from "vitest";
import { countCodeLines, findBannedTokens, stripCommentsAndStrings } from "../src/index.ts";

describe("stripCommentsAndStrings", () => {
  it("keeps the number of lines so positions still line up", () => {
    const source = 's = """\nfor\n"""\n# for\nfor i in y: pass\n';
    expect(stripCommentsAndStrings(source, "python").split("\n")).toHaveLength(source.split("\n").length);
  });

  it("leaves languages without a known syntax untouched", () => {
    expect(stripCommentsAndStrings("# for", "brainfudge")).toBe("# for");
  });
});

describe("findBannedTokens", () => {
  it("ignores Python comments and strings", () => {
    expect(findBannedTokens('x = "for"  # for loops\n', "python", ["for"])).toEqual([]);
    expect(findBannedTokens('x = "for"\nfor i in y: pass\n', "python", ["for"])).toEqual(["for"]);
  });

  it("ignores JavaScript block comments, template literals, and escaped quotes", () => {
    const source = "/* sort() */ const s = `a.sort()`; const t = 'it\\'s .sort('; // .sort(\nlist.map((x) => x)";
    expect(findBannedTokens(source, "javascript", [".sort(", "map"])).toEqual(["map"]);
  });

  it("matches word tokens as whole words only", () => {
    expect(findBannedTokens("const format = 1", "javascript", ["for"])).toEqual([]);
  });
});

describe("countCodeLines", () => {
  it("skips blank lines, comments, and the body of docstrings", () => {
    const source = 'import sys\n\n# comment\ndef f():\n    """Doc\n    more doc\n    """\n    return 1\n';
    // import, def, the two docstring quote lines, return
    expect(countCodeLines(source, "python")).toBe(5);
  });
});
