import { describe, expect, it } from "vitest";
import { findCycles } from "../src/validate/graph.ts";

describe("findCycles", () => {
  it("returns nothing for an acyclic graph", () => {
    const edges = new Map([
      ["a", ["b", "c"]],
      ["b", ["c"]],
      ["c", []],
    ]);
    expect(findCycles(edges)).toEqual([]);
  });

  it("reports a cycle as a closed path", () => {
    const edges = new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["a"]],
    ]);
    expect(findCycles(edges)).toEqual([["a", "b", "c", "a"]]);
  });

  it("finds a cycle that does not include the first node visited", () => {
    const edges = new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["b"]],
    ]);
    expect(findCycles(edges)).toEqual([["b", "c", "b"]]);
  });
});
