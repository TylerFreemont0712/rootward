import type { EncounterView } from "@rootward/shared";
import { describe, expect, it } from "vitest";
import { MUSIC, SOUNDS, audioUrl } from "../src/audio/catalog.ts";
import { soundsForCommand, soundsForCue, soundsForEncounter } from "../src/audio/cues.ts";
import { positionIn } from "../src/audio/engine.ts";
import { BATTLE_THEME, DESCENT_THEME, FOCUS_THEME, GUARDIAN_THEME, musicFor, TITLE_THEME, TOWN_THEME } from "../src/audio/music.ts";
import { channelGain, DEFAULT_SOUND, readSettings } from "../src/audio/settings.ts";
import type { Cue } from "../src/shardrun/fx/timeline.ts";

describe("sound settings (ADR-0023)", () => {
  it("plays each channel at its volume times the master's, on a curve, and silent when either is muted", () => {
    const settings = { ...DEFAULT_SOUND, master: 1, music: 0.5, effects: 1 };
    expect(channelGain(settings, "music")).toBeCloseTo(0.25, 9);
    expect(channelGain(settings, "effects")).toBe(1);
    expect(channelGain({ ...settings, master: 0.5 }, "effects")).toBeCloseTo(0.25, 9);
    expect(channelGain({ ...settings, musicMuted: true }, "music")).toBe(0);
    expect(channelGain({ ...settings, musicMuted: true }, "effects")).toBe(1);
    expect(channelGain({ ...settings, masterMuted: true }, "effects")).toBe(0);
  });

  it("reads what was saved, and falls back to the defaults for anything missing, malformed, or out of range", () => {
    expect(readSettings(undefined)).toEqual(DEFAULT_SOUND);
    expect(readSettings("not json")).toEqual(DEFAULT_SOUND);
    expect(readSettings(JSON.stringify({ music: 7 }))).toEqual(DEFAULT_SOUND);
    expect(readSettings(JSON.stringify({ music: 0.25, effectsMuted: true }))).toEqual({ ...DEFAULT_SOUND, music: 0.25, effectsMuted: true });
  });
});

describe("the music a screen plays (ADR-0023)", () => {
  const layer = { music: "music-heap", battleMusic: "music-battle", bossMusic: "music-guardian" };
  const run = (status: "map" | "battle" | "reward" | "won", battleKind?: "fight" | "elite" | "boss") => ({ status, battleKind, layer });

  it("gives the title, the menus and the Codex the main theme, and a fight in code music to think to", () => {
    for (const screen of [undefined, "profiles", "menu", "codex"] as const) expect(musicFor({ screen, zoneMusic: undefined, shardrun: undefined })).toBe(TITLE_THEME);
    for (const screen of ["encounter", "map", "debrief"] as const) expect(musicFor({ screen, zoneMusic: undefined, shardrun: undefined })).toBe(FOCUS_THEME);
  });

  it("plays the World zone's own music, and the town's when a zone names none", () => {
    expect(musicFor({ screen: "world", zoneMusic: "music-foundry", shardrun: undefined })).toBe("music-foundry");
    expect(musicFor({ screen: "world", zoneMusic: undefined, shardrun: undefined })).toBe(TOWN_THEME);
    expect(musicFor({ screen: "board", zoneMusic: undefined, shardrun: undefined })).toBe(TOWN_THEME);
  });

  it("follows a Shardrun layer's music on its map, its fights, and its guardian, with themes when content names none", () => {
    expect(musicFor({ screen: "shardrun", zoneMusic: undefined, shardrun: run("map") })).toBe("music-heap");
    expect(musicFor({ screen: "shardrun", zoneMusic: undefined, shardrun: run("reward") })).toBe("music-heap");
    expect(musicFor({ screen: "shardrun", zoneMusic: undefined, shardrun: run("battle", "elite") })).toBe("music-battle");
    expect(musicFor({ screen: "shardrun", zoneMusic: undefined, shardrun: run("battle", "boss") })).toBe("music-guardian");
    // A fight's music plays on while its last blow does, even after the run has moved to its reward.
    expect(musicFor({ screen: "shardrun", zoneMusic: undefined, shardrun: run("reward", "fight") })).toBe("music-battle");
    const bare = { status: "battle" as const, battleKind: "boss" as const, layer: {} };
    expect(musicFor({ screen: "shardrun", zoneMusic: undefined, shardrun: bare })).toBe(GUARDIAN_THEME);
    expect(musicFor({ screen: "shardrun", zoneMusic: undefined, shardrun: { ...bare, battleKind: "fight" } })).toBe(BATTLE_THEME);
    expect(musicFor({ screen: "shardrun", zoneMusic: undefined, shardrun: run("won") })).toBe(DESCENT_THEME);
    expect(musicFor({ screen: "shardrun", zoneMusic: undefined, shardrun: undefined })).toBe(DESCENT_THEME);
  });

  it("only has a URL for the music and sounds in the catalog", () => {
    for (const id of [...MUSIC, ...SOUNDS]) expect(audioUrl(id)).toBe(`/generated/audio/${id}.ogg`);
    expect(audioUrl("music-that-was-never-made")).toBeUndefined();
  });
});

describe("where a looping track is (ADR-0023)", () => {
  const loop = { loopStart: 10, loopEnd: 40 };

  it("plays the introduction once, then wraps inside the loop", () => {
    expect(positionIn(0, 5, 60, loop)).toBe(5);
    expect(positionIn(0, 39, 60, loop)).toBe(39);
    expect(positionIn(0, 40, 60, loop)).toBe(10);
    expect(positionIn(30, 25, 60, loop)).toBe(25);
    expect(positionIn(0, 100, 60, loop)).toBe(10);
  });

  it("wraps a track without loop points at its end", () => {
    expect(positionIn(0, 70, 60, undefined)).toBe(10);
  });
});

describe("what makes a sound (ADR-0023)", () => {
  const impact = (outcome: "hit" | "absorb" | "glance", weight: number): Cue => ({
    kind: "impact",
    at: 0,
    duration: 100,
    outcome,
    foe: "wisp",
    element: "none",
    amount: 5,
    weight,
    affinity: undefined,
    blocked: 0,
    pierce: false,
    mult: 1,
    flight: "missile",
    bolt: 0,
  });

  it("makes a hit sound as hard as it lands, a glance ring, and a fight's end play its cue over lowered music", () => {
    expect(soundsForCue(impact("hit", 0.05), false)[0]?.id).toBe("sfx-hit");
    expect(soundsForCue(impact("hit", 0.6), false)[0]?.id).toBe("sfx-hit-heavy");
    expect(soundsForCue(impact("glance", 0), false)[0]?.id).toBe("sfx-glance");
    expect(soundsForCue({ kind: "victory", at: 0, duration: 100 }, false)).toEqual([{ id: "cue-victory", duck: 5 }]);
    expect(soundsForCue({ kind: "turn", at: 0, duration: 100, turn: 2 }, true).map((call) => call.id)).toEqual(["sfx-turn", "sfx-draw"]);
    expect(soundsForCue({ kind: "turn", at: 0, duration: 100, turn: 2 }, false).map((call) => call.id)).toEqual(["sfx-turn"]);
  });

  it("gives a claimed reward or forge work its sound, and a skipped reward none", () => {
    expect(soundsForCommand({ type: "take", shardId: "fork" })[0]?.id).toBe("sfx-coins");
    expect(soundsForCommand({ type: "take", shardId: null })).toEqual([]);
    expect(soundsForCommand({ type: "claim-relic", relicId: "clipboard" })[0]?.id).toBe("sfx-chime");
    expect(soundsForCommand({ type: "widen", spellId: "spell-1" })[0]?.id).toBe("sfx-glance");
    expect(soundsForCommand({ type: "end-turn" })).toEqual([]);
  });

  it("answers a fight in code: a win, a loss, failing tests, or passing ones", () => {
    const encounter = (status: EncounterView["status"], tests: ("pass" | "fail" | "idle")[]) =>
      ({ status, tests: tests.map((test, index) => ({ id: `t${index}`, label: "", visibility: "visible", status: test, revealed: false })) }) as unknown as EncounterView;
    expect(soundsForEncounter("cast", encounter("won", ["pass"]))[0]?.id).toBe("cue-victory");
    expect(soundsForEncounter("cast", encounter("kernel-panic", ["fail"]))[0]?.id).toBe("cue-defeat");
    expect(soundsForEncounter("probe", encounter("active", ["pass", "fail"]))[0]?.id).toBe("sfx-fail");
    expect(soundsForEncounter("probe", encounter("active", ["pass", "idle"]))[0]?.id).toBe("sfx-pass");
    expect(soundsForEncounter("hint", encounter("active", ["fail"]))).toEqual([]);
  });
});
