import { SpellRunView, type SpellView } from "@rootward/shared";
import { describe, expect, it } from "vitest";
import { withoutPredictions } from "../src/shardrun/predictions.ts";

const bolt = { power: 4, element: "none" as const, target: "front" as const, pierce: false, ward: false, mult: 1 };
const measured = { bolts: 2, damage: 8, potential: 12, block: 0 };

describe("turning predictions off (ADR-0022)", () => {
  const preview: SpellRunView = {
    cost: 3,
    affordable: true,
    base: { bolts: [bolt], outcome: { ...measured, bolts: 1, damage: 4, potential: 4 } },
    steps: [{ shard: "fork", given: 1, returned: 2, work: 1, bolts: [bolt, bolt], outcome: measured }],
    result: measured,
    console: "hello\n",
  };
  const bolted = { id: "spell-1", name: "Bolt", capacity: 2, shards: ["fork"], spent: false, preview };
  const run: { spells: SpellView[] } = { spells: [bolted, { id: "spell-2", name: "Ward", capacity: 2, shards: [], spent: false }] };

  it("keeps what a spell costs and prints, and drops what it would do, as a difficulty without predictions sends it", () => {
    const hidden = withoutPredictions(run);
    expect(hidden.spells[0]?.preview).toEqual({ cost: 3, affordable: true, base: { bolts: [bolt] }, steps: [], console: "hello\n" });
    expect(() => SpellRunView.parse(hidden.spells[0]?.preview)).not.toThrow();
    // A spell still running in the sandbox has nothing to hide.
    expect(hidden.spells[1]).toBe(run.spells[1]);
  });

  it("keeps a misfire, and leaves the run it was given alone, so turning the option back on shows everything at once", () => {
    const misfire = { reason: "TypeError: bolts is not iterable", shard: "fork", line: 2 };
    const failing = withoutPredictions({ spells: [{ ...bolted, preview: { ...preview, misfire } }] });
    expect(failing.spells[0]?.preview.misfire).toEqual(misfire);
    expect(bolted.preview.result).toEqual(measured);
    expect(bolted.preview.steps).toHaveLength(1);
  });
});
