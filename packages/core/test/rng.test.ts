import { describe, expect, it } from "vitest";
import { createRng, pickWeighted, randomFor } from "../src/index.ts";

describe("randomFor", () => {
  it("is deterministic and stays within [0, 1)", () => {
    const value = randomFor("seed", "enemy-move:room-1", 3);
    expect(randomFor("seed", "enemy-move:room-1", 3)).toBe(value);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it("differs across streams, indices, and seeds", () => {
    const base = randomFor("seed", "a", 0);
    expect(randomFor("seed", "b", 0)).not.toBe(base);
    expect(randomFor("seed", "a", 1)).not.toBe(base);
    expect(randomFor("other", "a", 0)).not.toBe(base);
  });
});

describe("createRng", () => {
  it("replays the same sequence for the same seed and stream", () => {
    const a = createRng("seed", "layout");
    const b = createRng("seed", "layout");
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
    expect(createRng("seed", "loot")()).not.toBe(createRng("seed", "layout")());
  });

  it("is roughly uniform", () => {
    const next = createRng("uniformity");
    const buckets = new Array<number>(10).fill(0);
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const value = next();
      sum += value;
      const bucket = Math.floor(value * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    expect(sum / 10_000).toBeGreaterThan(0.48);
    expect(sum / 10_000).toBeLessThan(0.52);
    for (const count of buckets) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
  });
});

describe("pickWeighted", () => {
  const items = [
    { id: "a", weight: 4 },
    { id: "b", weight: 1 },
  ];

  it("picks in proportion to weight", () => {
    const next = createRng("weights");
    let a = 0;
    for (let i = 0; i < 10_000; i++) if (pickWeighted(items, next())?.id === "a") a += 1;
    expect(a / 10_000).toBeGreaterThan(0.77);
    expect(a / 10_000).toBeLessThan(0.83);
  });

  it("handles the edges of the roll and empty weights", () => {
    expect(pickWeighted(items, 0)?.id).toBe("a");
    expect(pickWeighted(items, 0.9999)?.id).toBe("b");
    expect(pickWeighted([{ weight: 0 }], 0.5)).toBeUndefined();
    expect(pickWeighted<{ weight: number }>([], 0.5)).toBeUndefined();
  });
});
