import type { ShardrunLogView } from "@rootward/shared";
import { describe, expect, it } from "vitest";
import { FOE_HEIGHT, layoutFoes } from "../src/shardrun/fx/layout.ts";
import { NOTHING_PENDING, pendingOf, settled, shownHp, shownIntegrity } from "../src/shardrun/fx/pending.ts";
import { planTimeline } from "../src/shardrun/fx/timeline.ts";

describe("where foes stand (ADR-0019)", () => {
  const STAGE = 2.8;

  it("draws bigger foes taller, and lower on the floor, nearer the viewer", () => {
    const sizes = ["small", "medium", "large", "huge", "colossal"] as const;
    const heights = sizes.map((size) => FOE_HEIGHT[size]);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    const feet = sizes.map((size) => layoutFoes([{ uid: size, size }], STAGE)[size]?.y ?? 0);
    expect(feet).toEqual([...feet].sort((a, b) => a - b));
  });

  it("centres a lone guardian in the foes' half of the stage", () => {
    const boss = layoutFoes([{ uid: "daemon", size: "colossal", aspect: 0.92 }], STAGE).daemon;
    expect(boss?.x).toBeCloseTo(0.725, 3);
  });

  it("keeps a group in order, apart, and inside the band, shrinking it when it cannot fit", () => {
    for (const group of [
      [{ uid: "a", size: "small" as const }, { uid: "b", size: "small" as const }],
      [{ uid: "a", size: "large" as const }, { uid: "b", size: "medium" as const }],
      [1, 2, 3, 4].map((n) => ({ uid: `g${n}`, size: "huge" as const })),
    ]) {
      const placed = group.map((foe) => layoutFoes(group, STAGE)[foe.uid]);
      for (const [index, at] of placed.entries()) {
        if (!at) throw new Error("a foe was not placed");
        expect(at.x - at.width / 2).toBeGreaterThanOrEqual(0.5 - 1e-9);
        expect(at.x + at.width / 2).toBeLessThanOrEqual(0.95 + 1e-9);
        const next = placed[index + 1];
        if (next) expect(at.x + at.width / 2).toBeLessThanOrEqual(next.x - next.width / 2 + 1e-9);
      }
    }
    // Four guardians cannot stand at full height in the band, so all four shrink together.
    const crowd = layoutFoes([1, 2, 3, 4].map((n) => ({ uid: `g${n}`, size: "huge" as const })), STAGE);
    expect(crowd.g1?.height).toBeLessThan(FOE_HEIGHT.huge);
    expect(crowd.g1?.height).toBeCloseTo(crowd.g4?.height ?? 0, 9);
  });
});

describe("numbers that wait for the hit (ADR-0019)", () => {
  const log: ShardrunLogView[] = [
    { kind: "cast", text: "", spell: "spell-1", amount: 3 },
    { kind: "curse", text: "", amount: 2 },
    { kind: "hit", text: "", foe: "a", amount: 6, bolt: 0 },
    { kind: "hit", text: "", foe: "a", amount: 4, bolt: 1 },
    { kind: "defeat", text: "", foe: "a" },
    { kind: "heal", text: "", foe: "b", amount: 5 },
    { kind: "enemy", text: "", foe: "b", amount: 7 },
    { kind: "heal", text: "", amount: 3 },
  ];

  it("owes back what a command's log took away, until each cue plays", () => {
    const pending = pendingOf(log);
    expect(pending).toEqual({ integrityLoss: 9, integrityGain: 3, damage: { a: 10 }, mending: { b: 5 }, defeats: ["a"] });
    // After the command foe a is dead and foe b healed to 20; the stage still shows them as they were.
    expect(shownHp(pending, { uid: "a", hp: 0, max: 14 })).toBe(10);
    expect(shownHp(pending, { uid: "b", hp: 20, max: 30 })).toBe(15);
    expect(shownIntegrity(pending, 40, 60)).toBe(46);
  });

  it("pays each amount back exactly once, however often a cue is replayed", () => {
    const { cues } = planTimeline(log);
    let pending = pendingOf(log);
    for (const cue of [...cues, ...cues]) pending = settled(pending, cue);
    expect(shownHp(pending, { uid: "a", hp: 0, max: 14 })).toBe(0);
    expect(shownHp(pending, { uid: "b", hp: 20, max: 30 })).toBe(20);
    expect(shownIntegrity(pending, 40, 60)).toBe(40);
    expect(pending.defeats).toEqual([]);
  });

  it("never shows more than the maximum or less than nothing", () => {
    expect(shownHp({ ...NOTHING_PENDING, damage: { a: 99 } }, { uid: "a", hp: 5, max: 20 })).toBe(20);
    expect(shownHp({ ...NOTHING_PENDING, mending: { a: 99 } }, { uid: "a", hp: 5, max: 20 })).toBe(0);
    expect(shownIntegrity({ ...NOTHING_PENDING, integrityGain: 99 }, 10, 60)).toBe(0);
    expect(shownHp(undefined, { uid: "a", hp: 5, max: 20 })).toBe(5);
  });
});
