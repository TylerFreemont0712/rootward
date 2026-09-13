import { describe, expect, it } from "vitest";
import { parseVersion, satisfies } from "../src/semver.ts";

describe("satisfies", () => {
  it.each([
    ["0.1.0", "*", true],
    ["0.1.0", ">=0.0.0", true],
    ["0.1.0", ">=0.2.0", false],
    ["1.4.2", "^1.2.0", true],
    ["2.0.0", "^1.2.0", false],
    ["0.2.9", "^0.2.3", true],
    ["0.3.0", "^0.2.3", false],
    ["0.0.4", "^0.0.3", false],
    ["1.2.9", "~1.2.3", true],
    ["1.3.0", "~1.2.3", false],
    ["1.2.3", "1.2.3", true],
    ["1.2.4", "1.2.3", false],
  ])("%s in %s is %s", (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });

  it("rejects unparseable input instead of guessing", () => {
    expect(satisfies("one", ">=0.0.0")).toBe(false);
    expect(satisfies("1.0.0", "<2.0.0")).toBe(false);
    expect(parseVersion("1.2")).toBeUndefined();
  });
});
