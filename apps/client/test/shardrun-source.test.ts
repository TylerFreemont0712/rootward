import type { ShardView, SpellRunView } from "@rootward/shared";
import { describe, expect, it } from "vitest";
import { composeSpell, playbackFrames } from "../src/shardrun/source.ts";

const bolt = (power: number) => ({ power, element: "none" as const, target: "front" as const, pierce: false, ward: false });

const SHARDS: Record<string, ShardView> = {
  amplify: {
    id: "amplify",
    name: "Amplify",
    rarity: "common",
    cost: 1,
    function: "amplify",
    code: 'def amplify(bolts, battle):\n    return [{**bolt, "power": bolt["power"] + 3} for bolt in bolts]\n',
    tags: [],
  },
  fork: {
    id: "fork",
    name: "Fork",
    rarity: "common",
    cost: 1,
    function: "fork",
    code: "def fork(bolts, battle):\n    split = []\n    for bolt in bolts:\n        split.append(bolt)\n    return split\n",
    tags: [],
  },
};

function run(extra: Partial<SpellRunView> = {}): SpellRunView {
  return {
    cost: 3,
    affordable: true,
    base: { bolts: [bolt(4)], outcome: { bolts: 1, damage: 4, block: 0 } },
    steps: [
      { shard: "amplify", given: 1, returned: 1, bolts: [bolt(7)], outcome: { bolts: 1, damage: 7, block: 0 } },
      { shard: "fork", given: 1, returned: 1, bolts: [bolt(7)], outcome: { bolts: 1, damage: 7, block: 0 } },
    ],
    result: { bolts: 1, damage: 7, block: 0 },
    console: "",
    ...extra,
  };
}

describe("the whole spell as code", () => {
  it("defines each shard once and calls them in slot order from a cast function", () => {
    const source = composeSpell("python", "Big Bolt", ["amplify", "fork", "amplify"], SHARDS, 4);
    const text = source.lines.map((line) => line.text).join("\n");
    expect(text.match(/def amplify\(/g)).toHaveLength(1);
    expect(text).toContain("def cast_big_bolt(battle):");
    // The cast reads first; the shards it calls follow underneath.
    const lineOf = (needle: string) => source.lines.findIndex((line) => line.text.includes(needle));
    expect(lineOf("def cast_big_bolt")).toBeLessThan(lineOf("def amplify"));
    expect(lineOf("def cast_big_bolt")).toBeLessThan(lineOf("def fork"));
    expect(source.calls.map((call) => source.lines[call.line - 1]?.text.trim())).toEqual([
      "bolts = amplify(bolts, battle)",
      "bolts = fork(bolts, battle)",
      "bolts = amplify(bolts, battle)",
    ]);
    expect(source.functions.get("fork")?.body).toHaveLength(4);
    expect(composeSpell("javascript", "Big Bolt", ["amplify"], SHARDS, 4).lines.some((line) => line.text === "function castBigBolt(battle) {")).toBe(true);
  });

  it("plays values only where they were measured: the base, after each shard, and the result", () => {
    const source = composeSpell("python", "Bolt", ["amplify", "fork"], SHARDS, 4);
    const frames = playbackFrames(source, run(), "fast");
    const measured = frames.filter((frame) => frame.outcome);
    expect(measured.map((frame) => frame.mark)).toEqual(["start", "step", "step", "result"]);
    expect(measured.map((frame) => frame.outcome?.damage)).toEqual([4, 7, 7, 7]);
    expect(frames.map((frame) => frame.at)).toEqual([...frames.map((frame) => frame.at)].sort((a, b) => a - b));
  });

  it("stops on the failing line of the shard that raised", () => {
    const source = composeSpell("python", "Bolt", ["amplify", "fork"], SHARDS, 4);
    const failed = run({ steps: run().steps.slice(0, 1), misfire: { reason: "TypeError", shard: "fork", line: 3 } });
    delete failed.result;
    const frames = playbackFrames(source, failed, "fast");
    const last = frames.at(-1);
    expect(last?.mark).toBe("error");
    expect(source.lines[(last?.line ?? 0) - 1]?.text.trim()).toBe("for bolt in bolts:");
  });
});
