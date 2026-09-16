import type { ElementView } from "@rootward/shared";

// What each element looks like on the stage (ADR-0019). Colors match the element tags in shardrun.css; burst ids are
// generated effect art in `assets/generated/fx/` (every effect still draws, as plain shapes, without them).

export type Mote = "ember" | "shard" | "spark" | "mote";
/** How a bolt of this element is drawn in flight. Projectiles are drawn in code: generated ones never came out as a
 * single object flying one way (frost gave ice caves), and a drawn head can turn along its path. */
export type Head = "comet" | "crystal" | "orb" | "star";

export interface ElementLook {
  /** The hottest part of the effect, the body of it, and the edge where it fades. */
  core: string;
  main: string;
  edge: string;
  burst: string;
  head: Head;
  mote: Mote;
  /** Particles drift up (embers), fall (ice), or neither. */
  gravity: number;
}

export const LOOKS: Readonly<Record<ElementView, ElementLook>> = {
  fire: { core: "#fff1b8", main: "#ff9147", edge: "#c4381c", burst: "burst-fire", head: "comet", mote: "ember", gravity: -260 },
  frost: { core: "#f2fbff", main: "#82d8ff", edge: "#3673d9", burst: "burst-frost", head: "crystal", mote: "shard", gravity: 520 },
  spark: { core: "#ffffff", main: "#ffe066", edge: "#d99a00", burst: "burst-spark", head: "orb", mote: "spark", gravity: 0 },
  none: { core: "#f6edff", main: "#b48cff", edge: "#6b4fa8", burst: "burst-arcane", head: "star", mote: "mote", gravity: -60 },
};

export const WARD_LOOK = { core: "#e6fffb", main: "#5cc8b8", edge: "#2f6f66" } as const;
export const HURT_LOOK = { core: "#fff0ec", main: "#ff5a4e", edge: "#8e1d18" } as const;
export const CURSE_LOOK = { core: "#f6dcff", main: "#d68cff", edge: "#5b2a86" } as const;
export const HEAL_LOOK = { core: "#effff0", main: "#8bc96a", edge: "#3f7a2a" } as const;
export const GOLD = "#ffd166";

/** How loud a multiplier looks: nothing at x1, a golden halo from x2, and a flare past x5. */
export function empowerment(mult: number): 0 | 1 | 2 {
  if (mult >= 5) return 2;
  if (mult >= 2) return 1;
  return 0;
}
