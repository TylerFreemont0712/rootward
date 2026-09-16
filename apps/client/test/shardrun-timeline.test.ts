import type { ShardrunLogView } from "@rootward/shared";
import { describe, expect, it } from "vitest";
import { cadence, type Cue, flightOf, planTimeline, TIMING } from "../src/shardrun/fx/timeline.ts";

const hit = (foe: string, amount: number, extra: Partial<ShardrunLogView> = {}): ShardrunLogView => ({
  kind: "hit",
  text: `${foe} takes ${amount}.`,
  foe,
  amount,
  element: "none",
  target: "front",
  ...extra,
});
const cast = (spell = "spell-1"): ShardrunLogView => ({ kind: "cast", text: "Bolt: 1 bolt for 2 mana.", spell, amount: 2 });

function only<K extends Cue["kind"]>(cues: readonly Cue[], kind: K): Extract<Cue, { kind: K }>[] {
  return cues.filter((cue): cue is Extract<Cue, { kind: K }> => cue.kind === kind);
}

describe("the battle timeline (ADR-0019)", () => {
  it("gathers a cast, then launches its bolt, then lands it where the flight ends", () => {
    const { cues, durationMs } = planTimeline([cast(), hit("a", 7, { bolt: 0 })], { maxHp: { a: 14 } });
    const [charge] = only(cues, "charge");
    const [launch] = only(cues, "launch");
    const [impact] = only(cues, "impact");
    expect(charge).toMatchObject({ at: 0, duration: TIMING.charge, spell: "spell-1", bolts: 1 });
    expect(launch).toMatchObject({ at: TIMING.charge, flight: "missile", targets: ["a"] });
    expect(impact).toMatchObject({ at: TIMING.charge + TIMING.flight.missile, foe: "a", amount: 7, weight: 0.5 });
    expect(durationMs).toBe(Math.max(...cues.map((cue) => cue.at + cue.duration)));
  });

  it("flies a bolt by what it does: a piercing lance, a scattered rain, a seeker, or a plain missile", () => {
    expect(flightOf({ pierce: true, target: "all" })).toBe("lance");
    expect(flightOf({ target: "all" })).toBe("rain");
    expect(flightOf({ target: "weakest" })).toBe("seeker");
    expect(flightOf({ target: "front" })).toBe("missile");
    expect(flightOf({})).toBe("missile");
  });

  it("lands every hit of a bolt aimed at all foes at once, from one launch", () => {
    const { cues } = planTimeline([cast(), hit("a", 3, { bolt: 0, target: "all" }), hit("b", 3, { bolt: 0, target: "all" })]);
    const launches = only(cues, "launch");
    const impacts = only(cues, "impact");
    expect(launches).toHaveLength(1);
    expect(launches[0]?.targets).toEqual(["a", "b"]);
    expect(new Set(impacts.map((impact) => impact.at)).size).toBe(1);
  });

  it("keeps a thousand-bolt volley to a couple of seconds by launching several bolts per beat", () => {
    expect(cadence(1)).toEqual({ gap: TIMING.maxGap, perBeat: 1 });
    expect(cadence(10).gap).toBe(130);
    const huge = cadence(96);
    expect(huge.gap).toBe(TIMING.minGap);
    expect(huge.perBeat).toBeGreaterThan(1);

    const log = [cast(), ...Array.from({ length: 96 }, (_, bolt) => hit("a", 1, { bolt }))];
    const launches = only(planTimeline(log).cues, "launch");
    expect(launches).toHaveLength(96);
    const last = Math.max(...launches.map((launch) => launch.at));
    expect(last - TIMING.charge).toBeLessThanOrEqual(TIMING.volleyMax);
  });

  it("breaks a foe apart just after the hit that killed it, not at the end of the volley", () => {
    const log = [cast(), hit("a", 5, { bolt: 0 }), hit("a", 9, { bolt: 1 }), { kind: "defeat", text: "a breaks apart.", foe: "a" }, hit("b", 4, { bolt: 2 })];
    const { cues } = planTimeline(log);
    const killing = only(cues, "impact").filter((impact) => impact.foe === "a").at(-1);
    const [defeat] = only(cues, "defeat");
    expect(defeat?.at).toBe((killing?.at ?? 0) + TIMING.defeatAfterHit);
  });

  it("carries what the engine logged about each hit: affinity, shield, pierce, multiplier", () => {
    const log = [cast(), hit("a", 12, { bolt: 0, affinity: "weak", blocked: 3, pierce: true, mult: 4, element: "fire" })];
    const [impact] = only(planTimeline(log).cues, "impact");
    expect(impact).toMatchObject({ affinity: "weak", blocked: 3, pierce: true, mult: 4, element: "fire", flight: "lance" });
    // A heavy bolt flies a little slower than a plain one of the same kind.
    const [launch] = only(planTimeline(log).cues, "launch");
    expect(launch?.duration).toBe(TIMING.flight.lance + TIMING.heavyFlight);
  });

  it("raises a ward on its beat, with no flight", () => {
    const log = [cast(), { kind: "ward", text: "A ward gathers 6 block.", amount: 6, element: "none" as const, bolt: 0 }];
    const { cues } = planTimeline(log);
    expect(only(cues, "launch")).toHaveLength(0);
    expect(only(cues, "ward")[0]).toMatchObject({ at: TIMING.charge, amount: 6 });
  });

  it("still plays an older log with no bolt indexes, one launch per hit", () => {
    const old = [cast(), { kind: "hit", text: "", foe: "a", amount: 2 }, { kind: "hit", text: "", foe: "a", amount: 2 }];
    expect(only(planTimeline(old).cues, "launch")).toHaveLength(2);
  });

  it("gathers and fizzles a spell whose code failed", () => {
    const { cues } = planTimeline([{ kind: "fizzle", text: "Bolt fizzles: boom", spell: "spell-1", amount: 1 }]);
    expect(cues.map((cue) => cue.kind)).toEqual(["charge", "fizzle"]);
  });

  it("plays the foes' turn blow by blow, a flurry faster than separate strikes, then the new turn", () => {
    const log: ShardrunLogView[] = [
      { kind: "enemy", text: "", foe: "x", amount: 4 },
      { kind: "enemy", text: "", foe: "x", amount: 0, blocked: 4 },
      { kind: "shield", text: "", foe: "y", amount: 5 },
      { kind: "turn", text: "Turn 2.", amount: 2 },
    ];
    const { cues } = planTimeline(log);
    const lunges = only(cues, "enemy");
    const blows = only(cues, "blow");
    expect(lunges.map((lunge) => lunge.at)).toEqual([0, TIMING.enemy]);
    expect(blows[0]).toMatchObject({ at: TIMING.enemyStrikeAt, amount: 4, blocked: 0 });
    expect(blows[1]).toMatchObject({ amount: 0, blocked: 4 });
    expect((blows[1]?.at ?? 0) - (lunges[1]?.at ?? 0)).toBeLessThan(TIMING.enemyStrikeAt);
    const [shield] = only(cues, "shield");
    const [turn] = only(cues, "turn");
    expect(shield?.at).toBe(TIMING.enemy + TIMING.enemyRepeat);
    expect(turn).toMatchObject({ at: TIMING.enemy + TIMING.enemyRepeat + TIMING.foeAction, turn: 2 });
  });

  it("gives a guardian's entrance its own long beat", () => {
    const enter = [{ kind: "enter", text: "The Root Daemon blocks the way." }];
    expect(planTimeline(enter, { boss: true }).durationMs).toBe(TIMING.bossEnter);
    expect(planTimeline(enter).durationMs).toBe(TIMING.enter);
  });

  it("orders cues by time and ignores what has nothing to show", () => {
    const { cues } = planTimeline([{ kind: "relic", text: "You claim a relic." }, cast(), hit("a", 1, { bolt: 0 }), { kind: "note", text: "" }]);
    expect(cues.map((cue) => cue.at)).toEqual([...cues.map((cue) => cue.at)].sort((a, b) => a - b));
    expect(cues.every((cue) => ["charge", "launch", "impact"].includes(cue.kind))).toBe(true);
  });
});
