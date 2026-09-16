import type { SpriteBank } from "./sprites.ts";

// The particle half of the effects canvas (ADR-0019). Particles are plain records updated with a fixed recipe:
// velocity, then gravity, then drag. Positions snap to the art's pixel grid when drawn, so embers and shards read as
// pixel art at any stage size rather than as smooth vector dots.

export type Shape = "square" | "streak" | "diamond" | "glow" | "plus";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Pixels per second squared; negative rises. */
  gravity: number;
  /** Share of speed kept per second (1 keeps it all). */
  drag: number;
  age: number;
  life: number;
  /** Milliseconds before it appears. */
  delay: number;
  size: number;
  endSize: number;
  color: string;
  shape: Shape;
  additive: boolean;
}

export type Spawn = Partial<Particle> & Pick<Particle, "x" | "y" | "life" | "color">;

export class Particles {
  readonly list: Particle[] = [];
  private readonly cap: number;

  constructor(cap: number) {
    this.cap = cap;
  }

  add(spawn: Spawn): void {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push({
      vx: 0,
      vy: 0,
      gravity: 0,
      drag: 1,
      age: 0,
      delay: 0,
      size: 2,
      endSize: spawn.size ?? 2,
      shape: "square",
      additive: true,
      ...spawn,
    });
  }

  /** `count` particles thrown out of a point, at speeds between `speed[0]` and `speed[1]`, within `spread` of `angle`. */
  burst(
    count: number,
    base: Spawn,
    { angle = 0, spread = Math.PI * 2, speed = [80, 240] }: { angle?: number; spread?: number; speed?: [number, number] },
    random: () => number,
  ): void {
    for (let i = 0; i < count; i++) {
      const direction = angle + (random() - 0.5) * spread;
      const velocity = speed[0] + random() * (speed[1] - speed[0]);
      this.add({
        ...base,
        vx: Math.cos(direction) * velocity + (base.vx ?? 0),
        vy: Math.sin(direction) * velocity + (base.vy ?? 0),
        life: base.life * (0.6 + random() * 0.6),
      });
    }
  }

  update(dt: number): void {
    const seconds = dt / 1000;
    let kept = 0;
    for (const particle of this.list) {
      if (particle.delay > 0) {
        particle.delay -= dt;
      } else {
        particle.age += dt;
        // LEARN: drag as "share kept per second" raised to the frame's length in seconds makes the slowdown the same
        // at 30 and at 144 frames a second; multiplying by a fixed factor every frame would not be.
        const keep = particle.drag === 1 ? 1 : particle.drag ** seconds;
        particle.vx *= keep;
        particle.vy = particle.vy * keep + particle.gravity * seconds;
        particle.x += particle.vx * seconds;
        particle.y += particle.vy * seconds;
      }
      if (particle.age < particle.life) this.list[kept++] = particle;
    }
    this.list.length = kept;
  }

  draw(ctx: CanvasRenderingContext2D, grid: number, sprites: SpriteBank): void {
    for (const particle of this.list) {
      if (particle.delay > 0) continue;
      const t = particle.age / particle.life;
      const size = Math.max(grid, particle.size + (particle.endSize - particle.size) * t);
      ctx.globalAlpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
      ctx.globalCompositeOperation = particle.additive ? "lighter" : "source-over";
      const x = Math.round(particle.x / grid) * grid;
      const y = Math.round(particle.y / grid) * grid;
      switch (particle.shape) {
        case "glow": {
          const dot = sprites.dot(particle.color);
          if (dot) ctx.drawImage(dot, particle.x - size, particle.y - size, size * 2, size * 2);
          break;
        }
        case "streak": {
          const speed = Math.hypot(particle.vx, particle.vy) || 1;
          const length = Math.min(size * 6, speed * 0.05);
          ctx.strokeStyle = particle.color;
          ctx.lineWidth = Math.max(grid, size * 0.6);
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(particle.x - (particle.vx / speed) * length, particle.y - (particle.vy / speed) * length);
          ctx.stroke();
          break;
        }
        case "diamond": {
          ctx.fillStyle = particle.color;
          ctx.beginPath();
          ctx.moveTo(x, y - size);
          ctx.lineTo(x + size * 0.6, y);
          ctx.lineTo(x, y + size);
          ctx.lineTo(x - size * 0.6, y);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case "plus": {
          ctx.fillStyle = particle.color;
          const arm = Math.round(size / grid) * grid;
          ctx.fillRect(x - arm, y - grid / 2, arm * 2, grid);
          ctx.fillRect(x - grid / 2, y - arm, grid, arm * 2);
          break;
        }
        case "square":
          ctx.fillStyle = particle.color;
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
          break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
