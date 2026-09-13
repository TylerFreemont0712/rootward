import { describe, expect, it } from "vitest";
import { createNonce, endPrefix, parseHarnessOutput, resultPrefix } from "../src/protocol/sentinel.ts";

describe("parseHarnessOutput", () => {
  it("separates test results from the program's own output", () => {
    const nonce = createNonce();
    const stdout = [
      "hello",
      `${resultPrefix(nonce)}{"id":"t1","name":"adds","passed":true,"ms":1.5}`,
      "world",
      `${resultPrefix(nonce)}{"id":"t2","name":"subtracts","passed":false,"expected":"1","actual":"2","ms":0.2}`,
      `${endPrefix(nonce)}{"total":2,"passed":1,"ms":3}`,
    ].join("\n");

    const parsed = parseHarnessOutput(stdout, nonce);
    expect(parsed.tests.map((t) => [t.id, t.passed])).toEqual([
      ["t1", true],
      ["t2", false],
    ]);
    expect(parsed.tests[1]).toMatchObject({ expected: "1", actual: "2", status: "ok", durationMs: 0.2 });
    expect(parsed.programOutput).toBe("hello\nworld");
    expect(parsed.completed).toBe(true);
  });

  it("treats result lines with the wrong nonce as ordinary output", () => {
    const fake = `${resultPrefix("guessed")}{"id":"t1","name":"x","passed":true,"ms":0}`;
    const parsed = parseHarnessOutput(fake, createNonce());
    expect(parsed.tests).toEqual([]);
    expect(parsed.programOutput).toBe(fake);
  });

  it("reports a run without an end line as incomplete and keeps malformed lines", () => {
    const nonce = createNonce();
    const stdout = [
      `${resultPrefix(nonce)}not json`,
      `${resultPrefix(nonce)}{"id":"t1","name":"a","passed":true,"ms":0}`,
      `${resultPrefix(nonce)}{"id":"t1","name":"duplicate","passed":false,"ms":0}`,
    ].join("\n");
    const parsed = parseHarnessOutput(stdout, nonce);
    expect(parsed.completed).toBe(false);
    expect(parsed.tests).toHaveLength(1);
    expect(parsed.malformed).toHaveLength(2);
  });

  it("creates long random nonces", () => {
    expect(createNonce()).toMatch(/^[0-9a-f]{24}$/);
    expect(createNonce()).not.toBe(createNonce());
  });
});
