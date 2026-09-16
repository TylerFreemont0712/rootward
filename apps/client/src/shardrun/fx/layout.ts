import type { FoeSizeView } from "@rootward/shared";

// Where everyone stands on the stage (ADR-0019). Positions are fractions of the stage: `x` of its width, `y` and
// `height` of its height, with `y` at the feet. The DOM sprites and the effects canvas both place things from here, so a
// bolt always flies to where the foe is actually drawn. Bigger foes stand lower, nearer the viewer: a floor seen from
// the side puts what is close at the bottom, and that is most of what makes a guardian look big.

export interface Placement {
  x: number;
  /** The feet. */
  y: number;
  height: number;
  width: number;
}

/** A foe's sprite height, as a share of the stage's height. */
export const FOE_HEIGHT: Readonly<Record<FoeSizeView, number>> = {
  small: 0.24,
  medium: 0.32,
  large: 0.42,
  huge: 0.58,
  colossal: 0.8,
};

/** Where a foe's feet rest, as a share of the stage's height. */
const FOE_GROUND: Readonly<Record<FoeSizeView, number>> = {
  small: 0.7,
  medium: 0.72,
  large: 0.75,
  huge: 0.82,
  colossal: 0.92,
};

/** The Maintainer's spot, left of centre. */
export const HERO_SPOT = { x: 0.2, y: 0.8, height: 0.46 } as const;

/** The strip of the stage foes share, and the room kept between two of them. */
const FOE_BAND = { from: 0.5, to: 0.95 } as const;
const GAP = 0.012;

export interface FoeShape {
  uid: string;
  size: FoeSizeView;
  /** Width over height of its sprite; 1 until the image has loaded. */
  aspect?: number | undefined;
}

/**
 * Lay a foe group out left to right, in the engine's order (the front foe nearest the Maintainer). `stageAspect` is the
 * stage's width over its height. A group too wide for its band is shrunk as a whole, so sizes stay in proportion.
 */
export function layoutFoes(foes: readonly FoeShape[], stageAspect: number): Record<string, Placement> {
  const aspect = Math.max(0.5, stageAspect);
  const band = FOE_BAND.to - FOE_BAND.from;
  const widths = foes.map((foe) => (FOE_HEIGHT[foe.size] * (foe.aspect ?? 1)) / aspect);
  const bodies = widths.reduce((sum, width) => sum + width, 0);
  const needed = bodies + GAP * Math.max(0, foes.length - 1);
  const shrink = needed > band ? band / needed : 1;
  // Whatever room is left is shared out evenly, before, between and after: a pair stands apart, a lone foe centred.
  const gap = Math.max(GAP * shrink, (band - bodies * shrink) / (foes.length + 1));
  let left = FOE_BAND.from + (shrink < 1 ? 0 : gap);
  const placed: Record<string, Placement> = {};
  foes.forEach((foe, index) => {
    const width = (widths[index] ?? 0) * shrink;
    placed[foe.uid] = { x: left + width / 2, y: FOE_GROUND[foe.size], height: FOE_HEIGHT[foe.size] * shrink, width };
    left += width + gap;
  });
  return placed;
}

/** The Maintainer's placement, for a sprite of this width over height. */
export function heroPlacement(stageAspect: number, spriteAspect: number): Placement {
  return { x: HERO_SPOT.x, y: HERO_SPOT.y, height: HERO_SPOT.height, width: (HERO_SPOT.height * spriteAspect) / Math.max(0.5, stageAspect) };
}
