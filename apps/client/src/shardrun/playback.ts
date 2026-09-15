import type { ShardrunLogView } from "@rootward/shared";
import { useEffect, useState } from "react";

// Replaying what a command did. The server answers with the new state and a log of every hit, ward, and enemy move in
// order; the arena already shows the new numbers, and these effects play the log over them one beat at a time so a
// volley of bolts reads as a volley.

export interface Effect {
  id: string;
  entry: ShardrunLogView;
}

/** How long each kind of entry holds the stage before the next one starts. */
const STEP_MS: Readonly<Partial<Record<string, number>>> = {
  cast: 260,
  hit: 220,
  absorb: 220,
  glance: 220,
  ward: 260,
  defeat: 360,
  enemy: 440,
  shield: 320,
  stoke: 320,
  heal: 320,
  fizzle: 320,
  curse: 320,
  turn: 240,
};
/** How long one effect stays on screen: long enough for its CSS animation to finish. */
export const EFFECT_MS = 900;

/** Total time the log takes to play, so the arena can stay up until the last hit lands. */
export function playbackMs(log: readonly ShardrunLogView[]): number {
  return log.reduce((sum, entry) => sum + (STEP_MS[entry.kind] ?? 0), 0) + EFFECT_MS;
}

/** The effects on screen right now for the log of command number `beat`. */
export function usePlayback(log: readonly ShardrunLogView[], beat: number): Effect[] {
  const [effects, setEffects] = useState<Effect[]>([]);
  useEffect(() => {
    const timers: number[] = [];
    let delay = 0;
    log.forEach((entry, index) => {
      const id = `${beat}:${index}`;
      timers.push(
        window.setTimeout(() => {
          setEffects((current) => [...current, { id, entry }]);
        }, delay),
        window.setTimeout(() => {
          setEffects((current) => current.filter((effect) => effect.id !== id));
        }, delay + EFFECT_MS),
      );
      delay += STEP_MS[entry.kind] ?? 0;
    });
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [log, beat]);
  return effects;
}
