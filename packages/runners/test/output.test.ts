import { describe, expect, it } from "vitest";
import { OutputBuffer, TRUNCATION_MARKER, truncateUtf8 } from "../src/output.ts";

describe("OutputBuffer", () => {
  it("keeps everything under the limit", () => {
    const buffer = new OutputBuffer(10);
    expect(buffer.write("hello")).toBe(true);
    expect(buffer.toString()).toBe("hello");
    expect(buffer.truncated).toBe(false);
  });

  it("keeps the part that fits, then refuses more and marks the truncation", () => {
    const buffer = new OutputBuffer(8);
    buffer.write("hello");
    expect(buffer.write("world")).toBe(false);
    expect(buffer.write("more")).toBe(false);
    expect(buffer.toString()).toBe(`hellowor${TRUNCATION_MARKER}`);
  });

  it("never splits a multi-byte character", () => {
    expect(truncateUtf8("héllo", 2)).toBe("h");
    expect(truncateUtf8("héllo", 3)).toBe("hé");
  });
});
