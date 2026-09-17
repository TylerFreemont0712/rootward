import type { ActionRequest, EncounterView, ShardrunCommandRequest } from "@rootward/shared";
import type { Cue } from "../shardrun/fx/timeline.ts";
import type { SoundId } from "./catalog.ts";
import { type PlayOptions, sound } from "./engine.ts";

// What makes a sound (ADR-0023). Three sources, each mapped here in one place so the whole palette can be read and
// tuned together: the battle stage's cues, which already know what every bolt did and when it lands (ADR-0019); the
// Shardrun commands a player's choices send; and a World fight's result. Pure, apart from `playSounds`.

export interface SoundCall {
  id: SoundId;
  options?: PlayOptions;
  /** Lower the music for this many seconds, so a fanfare is heard over it. */
  duck?: number;
}

const ELEMENT_RATE = { none: 1, fire: 0.88, frost: 1.12, spark: 1.24 } as const;

export function soundsForCue(cue: Cue, deck: boolean): SoundCall[] {
  switch (cue.kind) {
    case "launch":
      return [{ id: "sfx-cast", options: { volume: 0.55, rate: ELEMENT_RATE[cue.element] } }];
    case "impact":
      if (cue.outcome === "absorb") return [{ id: "sfx-glance", options: { volume: 0.7, rate: 0.75 } }];
      if (cue.outcome === "glance") return [{ id: "sfx-glance", options: { volume: 0.8 } }];
      // How hard a hit sounds follows how hard it lands: a share of the foe's health, not the raw number.
      return [{ id: cue.weight >= 0.35 ? "sfx-hit-heavy" : "sfx-hit", options: { volume: Math.min(1, 0.45 + cue.weight) } }];
    case "ward":
      return [{ id: "sfx-ward", options: { volume: 0.7 } }];
    case "blow":
      return cue.amount > 0 ? [{ id: "sfx-hurt", options: { volume: 0.85 } }] : [{ id: "sfx-ward", options: { volume: 0.6 } }];
    case "shield":
      return [{ id: "sfx-ward", options: { volume: 0.5, rate: 0.9 } }];
    case "heal":
      return [{ id: "sfx-chime", options: { volume: 0.5, rate: 0.8 } }];
    case "curse":
      return [{ id: "sfx-hurt", options: { volume: 0.5, rate: 1.2 } }];
    case "fizzle":
      return [{ id: "sfx-fail", options: { volume: 0.45 } }];
    case "defeat":
      return [{ id: "sfx-shatter", options: { volume: 0.8 } }];
    case "turn":
      return deck
        ? [
            { id: "sfx-turn", options: { volume: 0.55 } },
            { id: "sfx-draw", options: { volume: 0.7, delay: 0.25 } },
          ]
        : [{ id: "sfx-turn", options: { volume: 0.55 } }];
    case "victory":
      return [{ id: "cue-victory", duck: 5 }];
    case "loss":
      return [{ id: "cue-defeat", duck: 6 }];
    case "enter":
    case "charge":
    case "enemy":
    case "stoke":
      return [];
  }
}

/** A choice that changes the run makes its sound once the server accepts it. */
export function soundsForCommand(request: ShardrunCommandRequest): SoundCall[] {
  switch (request.type) {
    case "take":
      return request.shardId === null ? [] : [{ id: "sfx-coins", options: { volume: 0.8 } }];
    case "claim-relic":
    case "claim-spell":
      return [{ id: "sfx-chime" }];
    case "rest":
      return [{ id: "sfx-chime", options: { rate: 0.8 } }];
    case "forge":
      return request.shardId === null ? [] : [{ id: "sfx-glance", options: { rate: 0.85 } }];
    case "widen":
    case "bind":
    case "purge":
      return [{ id: "sfx-glance", options: { rate: 0.85 } }];
    case "compose":
    case "arrange":
      return [{ id: "sfx-card", options: { volume: 0.8 } }];
    case "enter":
    case "cast":
    case "end-turn":
    case "leave":
    case "abandon":
      return [];
  }
}

/** A fight in code: its end, or whether the tests just run passed. */
export function soundsForEncounter(action: ActionRequest["type"], encounter: EncounterView | undefined): SoundCall[] {
  if (!encounter || (action !== "cast" && action !== "probe")) return [];
  if (encounter.status === "won") return [{ id: "cue-victory", duck: 5 }];
  if (encounter.status === "exhausted" || encounter.status === "kernel-panic") return [{ id: "cue-defeat", duck: 6 }];
  if (encounter.tests.some((test) => test.status === "fail")) return [{ id: "sfx-fail", options: { volume: 0.8 } }];
  if (encounter.tests.some((test) => test.status === "pass")) return [{ id: "sfx-pass", options: { volume: 0.8 } }];
  return [];
}

export function playSounds(calls: readonly SoundCall[]): void {
  for (const call of calls) {
    if (call.duck !== undefined) sound.duckMusic(call.duck);
    sound.play(call.id, call.options);
  }
}
