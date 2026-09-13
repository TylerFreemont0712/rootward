import { describe, expect, it } from "vitest";
import { Id, RelativePath, Semver, SemverRange, Tag } from "../src/index.ts";

describe("Id", () => {
  it.each(["py.collections.dict", "off-by-one-goblin", "foundry.py.dict-word-count", "v1"])("accepts %s", (id) => {
    expect(Id.safeParse(id).success).toBe(true);
  });

  it.each(["Py.Dict", "a..b", "-leading", "trailing.", "snake_case", ""])("rejects %j", (id) => {
    expect(Id.safeParse(id).success).toBe(false);
  });
});

describe("Tag", () => {
  it("allows the separators error tags need", () => {
    expect(Tag.safeParse("n+1-query").success).toBe(true);
    expect(Tag.safeParse("Off-By-One").success).toBe(false);
  });
});

describe("Semver and SemverRange", () => {
  it("accepts versions and the supported range forms", () => {
    expect(Semver.safeParse("1.2.3").success).toBe(true);
    expect(Semver.safeParse("1.2").success).toBe(false);
    for (const range of ["*", "1.2.3", ">=0.0.0", "^1.2.0", "~0.3.1"]) {
      expect(SemverRange.safeParse(range).success, range).toBe(true);
    }
    expect(SemverRange.safeParse("<2.0.0").success).toBe(false);
  });
});

describe("RelativePath", () => {
  it.each(["main.py", "src/main.js", "a-b_c/d.e.ts"])("accepts %s", (path) => {
    expect(RelativePath.safeParse(path).success).toBe(true);
  });

  it.each(["/etc/passwd", "../secret", "a/../../b", "./main.py", "a\\b"])("rejects %j", (path) => {
    expect(RelativePath.safeParse(path).success).toBe(false);
  });
});
