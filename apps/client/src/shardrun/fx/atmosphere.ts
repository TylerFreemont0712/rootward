import type { ArenaAmbienceView } from "@rootward/shared";
import { type Effect, ringFx } from "./effects.ts";
import { Particles } from "./particles.ts";
import { type SpriteBank, withAlpha } from "./sprites.ts";

// The air of an arena (ADR-0019): what drifts, falls, and glints in front of the backdrop and behind the fighters, so a
// still painting reads as a place. Each layer names a preset in content (`ambience` in shardrun/run.yaml); everything
// here is drawn on the canvas under the bodies, and none of it is ever in the way of a number or a bolt.

interface Preset {
  /** The light the fighters stand in (see the engine's spots). */
  light: string;
  /** Motes that hang in the air: how many, their color, and how they drift (pixels a second). */
  motes: { count: number; color: string; vx: [number, number]; vy: [number, number]; wobble: number };
  /** Soft bands of fog lying over the floor. */
  fog: { color: string; alpha: number };
  /** Beams of light falling from the ceiling. */
  shafts: string | undefined;
  /** Crystals catching the light far back: twinkles. */
  glints: { color: string; rate: number } | undefined;
  /** Leaks dripping from the ceiling and splashing on the floor. */
  drips: { color: string; rate: number } | undefined;
  /** Sparks of data rising fast through the air. */
  streaks: { color: string; rate: number } | undefined;
}

const PRESETS: Readonly<Record<ArenaAmbienceView, Preset>> = {
  dust: {
    light: "#ffd9a0",
    motes: { count: 36, color: "rgb(255 222 176 / 0.22)", vx: [5, 18], vy: [-3, 3], wobble: 6 },
    fog: { color: "#8a6c52", alpha: 0.09 },
    shafts: "#ffe2b0",
    glints: { color: "#d8b8ff", rate: 1.6 },
    drips: undefined,
    streaks: undefined,
  },
  spores: {
    light: "#a8f0d0",
    motes: { count: 44, color: "rgb(160 255 140 / 0.3)", vx: [-5, 5], vy: [-20, -6], wobble: 12 },
    fog: { color: "#3f7a5e", alpha: 0.12 },
    shafts: undefined,
    glints: undefined,
    drips: { color: "#9dff8a", rate: 1.1 },
    streaks: undefined,
  },
  embers: {
    light: "#ffc890",
    motes: { count: 46, color: "rgb(255 196 104 / 0.36)", vx: [-7, 7], vy: [-42, -14], wobble: 9 },
    fog: { color: "#6b3a2a", alpha: 0.1 },
    shafts: undefined,
    glints: undefined,
    drips: undefined,
    streaks: { color: "#fff1c4", rate: 1.3 },
  },
};

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

export class Atmosphere {
  private preset: Preset = PRESETS.dust;
  private name: ArenaAmbienceView = "dust";
  private motes: Mote[] = [];
  private readonly particles = new Particles(240);
  private readonly fog = [
    { y: 0.68, width: 1.3, speed: 7, offset: 0.1 },
    { y: 0.8, width: 1.1, speed: -5, offset: 0.55 },
    { y: 0.93, width: 1.5, speed: 4, offset: 0.3 },
  ];
  private time = 0;

  /** The color of the light the fighters stand in. */
  get light(): string {
    return this.preset.light;
  }

  /** Change what hangs in the air; the motes start over, since a spore does not become an ember. */
  setAmbience(name: ArenaAmbienceView): void {
    if (name === this.name) return;
    this.name = name;
    this.preset = PRESETS[name];
    this.motes = [];
  }

  update(dt: number, width: number, height: number, grid: number, reduced: boolean, random: () => number, add: (effect: Effect) => void): void {
    if (width === 0) return;
    this.time += dt;
    const seconds = dt / 1000;
    const { motes, glints, drips, streaks } = this.preset;
    const wanted = Math.round(motes.count * (reduced ? 0.35 : 1));
    const between = (range: [number, number]) => range[0] + random() * (range[1] - range[0]);
    while (this.motes.length < wanted) {
      this.motes.push({ x: random() * width, y: random() * height, vx: between(motes.vx), vy: between(motes.vy), phase: random() * Math.PI * 2 });
    }
    for (const mote of this.motes) {
      mote.x += mote.vx * seconds + Math.sin(this.time / 1300 + mote.phase) * motes.wobble * seconds;
      mote.y += mote.vy * seconds;
      if (mote.x > width + 4) mote.x = -4;
      if (mote.x < -4) mote.x = width + 4;
      if (mote.y < -4) mote.y = height + 4;
      if (mote.y > height + 4) mote.y = -4;
    }
    const chance = (rate: number) => random() < rate * seconds * (reduced ? 0.4 : 1);
    if (glints && chance(glints.rate)) {
      this.particles.add({ x: width * (0.18 + random() * 0.64), y: height * (0.22 + random() * 0.34), life: 700 + random() * 500, size: grid, endSize: grid * 3.5, color: glints.color, shape: "diamond" });
    }
    if (drips && chance(drips.rate)) {
      // A drip falls from the ceiling to a spot on the floor, and splashes when it gets there.
      const x = width * (0.1 + random() * 0.8);
      const from = height * (0.04 + random() * 0.12);
      const floor = height * (0.7 + random() * 0.24);
      const gravity = 1300;
      const fall = Math.sqrt((2 * (floor - from)) / gravity) * 1000;
      this.particles.add({ x, y: from, vy: 0, gravity, life: fall, size: grid * 2, endSize: grid * 2, color: drips.color, shape: "streak" });
      add(ringFx({ at: { x, y: floor }, from: grid, to: grid * 9, width: grid, color: drips.color, life: 420, delay: fall, squash: 0.3, layer: 0 }));
    }
    if (streaks && chance(streaks.rate)) {
      this.particles.add({ x: width * (0.08 + random() * 0.84), y: height * (0.9 + random() * 0.1), vy: -380 - random() * 260, life: 520 + random() * 380, size: grid * 2, endSize: grid, color: withAlpha(streaks.color, 0.7), shape: "streak" });
    }
    this.particles.update(dt);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, grid: number, sprites: SpriteBank): void {
    const { fog, shafts, motes } = this.preset;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (shafts !== undefined) {
      // Three beams from high on the left, breathing slowly, fading before they reach the floor.
      for (const [index, x] of [0.3, 0.52, 0.76].entries()) {
        const breath = 0.55 + 0.45 * Math.sin(this.time / 2600 + index * 1.7);
        const gradient = ctx.createLinearGradient(0, 0, 0, height * 0.85);
        gradient.addColorStop(0, withAlpha(shafts, 0.1 * breath));
        gradient.addColorStop(1, withAlpha(shafts, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(width * (x - 0.03), 0);
        ctx.lineTo(width * (x + 0.02), 0);
        ctx.lineTo(width * (x + 0.12), height * 0.85);
        ctx.lineTo(width * (x - 0.01), height * 0.85);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Fog: wide, soft, and slow, wrapping around the stage so it never runs out.
    const blob = sprites.dot(fog.color);
    if (blob) {
      ctx.globalAlpha = fog.alpha;
      for (const band of this.fog) {
        const bandWidth = width * band.width;
        const travel = ((band.offset * width + (this.time / 1000) * band.speed) % (width + bandWidth) + width + bandWidth) % (width + bandWidth);
        const x = travel - bandWidth;
        ctx.drawImage(blob, x, height * band.y - height * 0.09, bandWidth, height * 0.18);
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = motes.color;
    for (const mote of this.motes) ctx.fillRect(Math.round(mote.x / grid) * grid, Math.round(mote.y / grid) * grid, grid, grid);
    ctx.restore();
    this.particles.draw(ctx, grid, sprites);
  }
}
