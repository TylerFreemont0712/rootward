import type { Head } from "./looks.ts";
import type { SpriteBank } from "./sprites.ts";
import { withAlpha } from "./sprites.ts";

// Timed shapes for the effects canvas (ADR-0019): a sprite that swells and fades, a ring, a beam, lightning, a flash, a
// projectile on a path, an emitter. Each is a small record with a lifetime and a draw function taking its progress from
// 0 to 1, so the engine only has to age them and draw them in layers.

export interface Point {
  x: number;
  y: number;
}

/** 0: on the floor, under the bodies' light. 1: in the air. 2: over everything (flashes). */
export type Layer = 0 | 1 | 2;

export interface Effect {
  layer: Layer;
  delay: number;
  age: number;
  life: number;
  update?: (t: number, dt: number) => void;
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
}

export const ease = {
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t * t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  /** Overshoots a little before it settles: a thing that snaps into being. */
  back: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};

/** Fades in over the first `rise` of its life and out over the last `fall`. */
export function envelope(t: number, rise = 0.12, fall = 0.45): number {
  if (t < rise) return t / rise;
  if (t > 1 - fall) return Math.max(0, (1 - t) / fall);
  return 1;
}

export interface SpriteSpec {
  sprites: SpriteBank;
  key: string;
  tint?: string | undefined;
  at: Point | (() => Point);
  /** The sprite's longer side at scale 1, in screen pixels. */
  size: number;
  life: number;
  delay?: number;
  layer?: Layer;
  scale?: (t: number) => number;
  alpha?: (t: number) => number;
  rotation?: number | ((t: number) => number);
  /** Squash vertically, for things lying on the floor. */
  squash?: number;
  additive?: boolean;
  /** Drawn when the art is missing. */
  fallback?: { color: string; shape: "glow" | "ring" };
}

export function spriteFx(spec: SpriteSpec): Effect {
  return {
    layer: spec.layer ?? 1,
    delay: spec.delay ?? 0,
    age: 0,
    life: spec.life,
    draw(ctx, t) {
      const at = typeof spec.at === "function" ? spec.at() : spec.at;
      const scale = spec.scale ? spec.scale(t) : 1;
      const alpha = spec.alpha ? spec.alpha(t) : envelope(t);
      if (alpha <= 0 || scale <= 0) return;
      // `dot:<color>` names a generated glow rather than art: light with no shape of its own.
      const image = spec.key.startsWith("dot:")
        ? spec.sprites.dot(spec.key.slice(4))
        : spec.tint !== undefined
          ? spec.sprites.tinted(spec.key, spec.tint)
          : spec.sprites.image(spec.key);
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.globalCompositeOperation = spec.additive === false ? "source-over" : "lighter";
      ctx.translate(at.x, at.y);
      ctx.scale(1, spec.squash ?? 1);
      const rotation = typeof spec.rotation === "function" ? spec.rotation(t) : (spec.rotation ?? 0);
      ctx.rotate(rotation);
      if (image) {
        const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
        const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
        const fit = (spec.size * scale) / Math.max(width, height);
        // Pixel art stays crisp; a generated glow is a gradient and wants smoothing.
        ctx.imageSmoothingEnabled = spec.key.startsWith("dot:");
        ctx.drawImage(image, (-width * fit) / 2, (-height * fit) / 2, width * fit, height * fit);
      } else if (spec.fallback) {
        const radius = (spec.size * scale) / 2;
        if (spec.fallback.shape === "glow") {
          const dot = spec.sprites.dot(spec.fallback.color);
          if (dot) ctx.drawImage(dot, -radius, -radius, radius * 2, radius * 2);
        } else {
          ctx.strokeStyle = spec.fallback.color;
          ctx.lineWidth = Math.max(2, radius * 0.08);
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };
}

export function ringFx(spec: {
  at: Point;
  from: number;
  to: number;
  width: number;
  color: string;
  life: number;
  delay?: number;
  squash?: number;
  layer?: Layer;
}): Effect {
  return {
    layer: spec.layer ?? 1,
    delay: spec.delay ?? 0,
    age: 0,
    life: spec.life,
    draw(ctx, t) {
      const radius = spec.from + (spec.to - spec.from) * ease.out(t);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = Math.max(1, spec.width * (1 - t));
      ctx.beginPath();
      ctx.ellipse(spec.at.x, spec.at.y, radius, radius * (spec.squash ?? 1), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
  };
}

/** A straight line of light: a piercing bolt's wake. */
export function beamFx(spec: { from: Point; to: Point; width: number; color: string; core: string; life: number; delay?: number }): Effect {
  return {
    layer: 1,
    delay: spec.delay ?? 0,
    age: 0,
    life: spec.life,
    draw(ctx, t) {
      const fade = 1 - ease.in(t);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const [width, color, alpha] of [
        [spec.width * 2.4, spec.color, 0.35],
        [spec.width, spec.color, 0.9],
        [spec.width * 0.35, spec.core, 1],
      ] as const) {
        ctx.globalAlpha = alpha * fade;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, width * (1 - t * 0.7));
        ctx.beginPath();
        ctx.moveTo(spec.from.x, spec.from.y);
        ctx.lineTo(spec.to.x, spec.to.y);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/** A jagged bolt of lightning between two points, redrawn every few frames so it crackles. */
export function lightningFx(spec: {
  from: Point;
  to: Point;
  color: string;
  core: string;
  life: number;
  delay?: number;
  jag: number;
  random: () => number;
  width?: number;
}): Effect {
  let path: Point[] = [];
  let redrawn = -1;
  const rebuild = () => {
    const points: Point[] = [spec.from];
    const steps = 7;
    const dx = spec.to.x - spec.from.x;
    const dy = spec.to.y - spec.from.y;
    const length = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < steps; i++) {
      const along = i / steps;
      const offset = (spec.random() - 0.5) * spec.jag * Math.sin(along * Math.PI);
      points.push({ x: spec.from.x + dx * along + (-dy / length) * offset, y: spec.from.y + dy * along + (dx / length) * offset });
    }
    points.push(spec.to);
    path = points;
  };
  return {
    layer: 1,
    delay: spec.delay ?? 0,
    age: 0,
    life: spec.life,
    draw(ctx, t) {
      const frame = Math.floor((t * spec.life) / 45);
      if (frame !== redrawn) {
        rebuild();
        redrawn = frame;
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineJoin = "miter";
      for (const [width, color, alpha] of [
        [(spec.width ?? 3) * 2.5, spec.color, 0.45],
        [spec.width ?? 3, spec.core, 1],
      ] as const) {
        ctx.globalAlpha = alpha * (1 - t);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        path.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/** The whole stage lit up at once: a big hit, a guardian's fall. */
export function flashFx(spec: { width: number; height: number; color: string; alpha: number; life: number; delay?: number }): Effect {
  return {
    layer: 2,
    delay: spec.delay ?? 0,
    age: 0,
    life: spec.life,
    draw(ctx, t) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = spec.alpha * (1 - ease.out(t));
      ctx.fillStyle = spec.color;
      ctx.fillRect(0, 0, spec.width, spec.height);
      ctx.restore();
    },
  };
}

/** Color creeping in from the edges: being hurt, being cursed, a guardian arriving. */
export function vignetteFx(spec: { width: number; height: number; color: string; alpha: number; life: number; delay?: number; darken?: boolean }): Effect {
  return {
    layer: 2,
    delay: spec.delay ?? 0,
    age: 0,
    life: spec.life,
    draw(ctx, t) {
      const strength = spec.alpha * envelope(t, 0.15, 0.6);
      const radius = Math.hypot(spec.width, spec.height) / 2;
      const gradient = ctx.createRadialGradient(spec.width / 2, spec.height / 2, radius * 0.35, spec.width / 2, spec.height / 2, radius);
      gradient.addColorStop(0, withAlpha(spec.color, 0));
      gradient.addColorStop(1, withAlpha(spec.color, strength));
      ctx.save();
      ctx.globalCompositeOperation = spec.darken ? "source-over" : "lighter";
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, spec.width, spec.height);
      ctx.restore();
    },
  };
}

/** A projectile following `path` over its life, trailing whatever `trail` emits and leaving afterimages behind it. */
export function projectileFx(spec: {
  sprites: SpriteBank;
  head: Head;
  path: (t: number) => Point;
  life: number;
  delay?: number;
  size: number;
  color: string;
  core: string;
  halo?: string | undefined;
  afterimages?: number;
  random: () => number;
  trail?: (at: Point, heading: number) => void;
}): Effect {
  let last: Point | undefined;
  let spin = 0;
  const ghosts: { at: Point; heading: number }[] = [];
  return {
    layer: 1,
    delay: spec.delay ?? 0,
    age: 0,
    life: spec.life,
    update(t, dt) {
      const at = spec.path(t);
      const heading = last ? Math.atan2(at.y - last.y, at.x - last.x) : 0;
      spin += dt * 0.012;
      spec.trail?.(at, heading);
      ghosts.unshift({ at, heading });
      ghosts.length = Math.min(ghosts.length, (spec.afterimages ?? 0) + 1);
      last = at;
    },
    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ghosts.forEach((ghost, index) => {
        ctx.globalAlpha = index === 0 ? 1 : 0.45 * (1 - index / ghosts.length);
        ctx.save();
        ctx.translate(ghost.at.x, ghost.at.y);
        ctx.rotate(ghost.heading);
        if (index === 0 && spec.halo !== undefined) glow(ctx, spec.sprites, spec.halo, spec.size * 1.1, spec.size * 1.1);
        drawHead(ctx, spec, spin);
        ctx.restore();
      });
      ctx.restore();
    },
  };
}

function glow(ctx: CanvasRenderingContext2D, sprites: SpriteBank, color: string, width: number, height: number, dx = 0): void {
  const dot = sprites.dot(color);
  if (dot) ctx.drawImage(dot, dx - width / 2, -height / 2, width, height);
}

/** A bolt's head, drawn facing +x (the canvas is already turned along the flight). */
function drawHead(ctx: CanvasRenderingContext2D, spec: { sprites: SpriteBank; head: Head; size: number; color: string; core: string; random: () => number }, spin: number): void {
  const { size, color, core, sprites } = spec;
  switch (spec.head) {
    case "comet":
      // A flame drawn out behind its head.
      glow(ctx, sprites, color, size * 1.3, size * 0.6, -size * 0.3);
      glow(ctx, sprites, core, size * 0.5, size * 0.4, size * 0.05);
      break;
    case "crystal": {
      // A shard of ice, long along the flight, pale at its edge.
      glow(ctx, sprites, color, size, size * 0.5);
      const length = size * 0.42;
      const width = size * 0.12;
      ctx.beginPath();
      ctx.moveTo(length, 0);
      ctx.lineTo(0, width);
      ctx.lineTo(-length * 0.8, 0);
      ctx.lineTo(0, -width);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.strokeStyle = core;
      ctx.stroke();
      break;
    }
    case "orb": {
      // A ball of charge with arcs flickering off it.
      glow(ctx, sprites, color, size * 0.9, size * 0.9);
      glow(ctx, sprites, core, size * 0.4, size * 0.4);
      ctx.strokeStyle = core;
      ctx.lineWidth = Math.max(1, size * 0.025);
      for (let i = 0; i < 3; i++) {
        const angle = spec.random() * Math.PI * 2;
        const reach = size * (0.3 + spec.random() * 0.25);
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * size * 0.12, Math.sin(angle) * size * 0.12);
        ctx.lineTo(Math.cos(angle + 0.4) * reach * 0.6, Math.sin(angle + 0.4) * reach * 0.6);
        ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
        ctx.stroke();
      }
      break;
    }
    case "star": {
      // A four-pointed star of arcane light, turning as it flies.
      glow(ctx, sprites, color, size * 0.9, size * 0.9);
      ctx.save();
      ctx.rotate(spin);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const radius = i % 2 === 0 ? size * 0.3 : size * 0.08;
        const angle = (i / 8) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fillStyle = core;
      ctx.fill();
      ctx.restore();
      break;
    }
  }
}

/** Something that keeps spawning particles for a while: embers off a stoked foe, motes rising from a heal. */
export function emitterFx(spec: { life: number; delay?: number; rate: number; spawn: () => void }): Effect {
  let owed = 0;
  return {
    layer: 1,
    delay: spec.delay ?? 0,
    age: 0,
    life: spec.life,
    update(_t, dt) {
      owed += (spec.rate * dt) / 1000;
      while (owed >= 1) {
        spec.spawn();
        owed -= 1;
      }
    },
    draw() {
      // Its particles draw themselves.
    },
  };
}

/** A quadratic Bezier curve: a straight line bent toward `control`. */
export function bezier(from: Point, control: Point, to: Point): (t: number) => Point {
  return (t) => ({
    x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t * t * to.x,
    y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t * t * to.y,
  });
}
