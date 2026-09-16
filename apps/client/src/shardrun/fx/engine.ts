import type { ElementView } from "@rootward/shared";
import {
  beamFx,
  bezier,
  type Effect,
  emitterFx,
  ease,
  envelope,
  flashFx,
  lightningFx,
  type Point,
  projectileFx,
  ringFx,
  spriteFx,
  vignetteFx,
} from "./effects.ts";
import { CURSE_LOOK, type ElementLook, empowerment, GOLD, HEAL_LOOK, HURT_LOOK, LOOKS, WARD_LOOK } from "./looks.ts";
import { Particles } from "./particles.ts";
import { glowColor, type SpriteBank } from "./sprites.ts";
import { cadence, type Cue, type ImpactCue, type LaunchCue, TIMING } from "./timeline.ts";

// The effects canvas's engine (ADR-0019): it keeps its own clock, turns each cue of a timeline into effects and
// particles, and knows where everyone stands. Two tricks carry most of the "impact":
//  - hit-stop: on a heavy hit the clock stops for a few frames, so the blow seems to land with weight;
//  - trauma: hits add to one number that decays over time, and the stage shakes by its square, so small hits barely
//    move it and big ones really do.
// Nothing here is a rule. It draws what the server's log already decided.

/** A body on the stage, in canvas pixels: centered on `x`, standing on `feet`. */
export interface Body {
  x: number;
  feet: number;
  width: number;
  height: number;
}

export interface Scene {
  width: number;
  height: number;
  hero: Body;
  foes: Readonly<Record<string, Body>>;
}

export interface FxOptions {
  /** Fewer particles, no shaking, no flashes: prefers-reduced-motion. */
  reduced: boolean;
  shake: boolean;
}

export interface FoeArt {
  /** Its sprite's URL, for its pixels. */
  url: string | undefined;
  /** Guardians glow and shed embers the whole fight. */
  aura: boolean;
}

/** Where the Maintainer's casting hand is, as a share of the sprite from its feet and its middle. */
const HAND = { dx: 0.36, dy: 0.62 };
const STEEL = "#a9c4de";

export class FxEngine {
  /** Milliseconds of effect time; stands still during hit-stop. */
  clock = 0;
  scene: Scene = { width: 0, height: 0, hero: { x: 0, feet: 0, width: 0, height: 0 }, foes: {} };
  foeArt: Readonly<Record<string, FoeArt>> = {};
  readonly particles: Particles;
  private effects: Effect[] = [];
  private wall = 0;
  private freezeLeft = 0;
  private trauma = 0;
  private lastStop = -Infinity;
  private lastFlash = -Infinity;
  private ready: ElementView | undefined;
  private readyGlow = 0;
  private readySpin = 0;
  private dust: { x: number; y: number; speed: number; phase: number }[] = [];
  private auraColors = new Map<string, string>();
  readonly sprites: SpriteBank;
  private options: FxOptions;
  private readonly random: () => number;

  constructor(sprites: SpriteBank, options: FxOptions, random: () => number = Math.random) {
    this.sprites = sprites;
    this.options = options;
    this.random = random;
    this.particles = new Particles(options.reduced ? 450 : 1800);
  }

  setOptions(options: FxOptions): void {
    this.options = options;
  }

  /** One pixel of the art, in canvas pixels: effects are sized in these so they scale with the stage. */
  get grid(): number {
    return Math.max(2, Math.round(this.scene.height / 170));
  }

  /** The spell the player is about to cast (a hovered card): a faint circle gathers under the Maintainer. */
  setReady(element: ElementView | undefined): void {
    this.ready = element;
  }

  update(dt: number): void {
    this.wall += dt;
    this.trauma = Math.max(0, this.trauma - dt * 0.0017);
    this.readyGlow += ((this.ready !== undefined ? 1 : 0) - this.readyGlow) * Math.min(1, dt / 160);
    if (this.freezeLeft > 0) {
      this.freezeLeft -= dt;
      return;
    }
    this.clock += dt;
    this.readySpin += dt * 0.0006;
    this.particles.update(dt);
    const alive: Effect[] = [];
    for (const effect of this.effects) {
      if (effect.delay > 0) {
        effect.delay -= dt;
        alive.push(effect);
        continue;
      }
      effect.age += dt;
      const t = Math.min(1, effect.age / effect.life);
      effect.update?.(t, dt);
      if (effect.age < effect.life) alive.push(effect);
    }
    this.effects = alive;
    this.ambient(dt);
  }

  /** How far to move the stage this frame. */
  shakeOffset(): Point {
    if (!this.options.shake || this.options.reduced || this.trauma <= 0) return { x: 0, y: 0 };
    const power = this.trauma * this.trauma * Math.max(6, this.scene.height * 0.035);
    const t = this.wall / 1000;
    // LEARN: sums of sines at unrelated frequencies wander without repeating visibly, a cheap stand-in for noise that
    // stays smooth from frame to frame (random offsets every frame would jitter rather than shake).
    return {
      x: power * (Math.sin(t * 61.3) * 0.6 + Math.sin(t * 37.1 + 1.3) * 0.4),
      y: power * (Math.sin(t * 53.7 + 2.1) * 0.6 + Math.sin(t * 29.9 + 0.4) * 0.4),
    };
  }

  /** What lies on the floor, under the bodies: casting circles, rings, drifting dust. */
  drawBack(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.scene.width, this.scene.height);
    this.drawDust(ctx);
    this.drawReady(ctx);
    this.drawLayer(ctx, 0);
  }

  /** What flies over them: particles, projectiles, bursts, and (unless motion is reduced) flashes. */
  drawFront(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.scene.width, this.scene.height);
    this.particles.draw(ctx, this.grid, this.sprites);
    this.drawLayer(ctx, 1);
    if (!this.options.reduced) this.drawLayer(ctx, 2);
  }

  private drawLayer(ctx: CanvasRenderingContext2D, layer: 0 | 1 | 2): void {
    for (const effect of this.effects) {
      if (effect.layer === layer && effect.delay <= 0) effect.draw(ctx, Math.min(1, effect.age / effect.life));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  play(cue: Cue): void {
    switch (cue.kind) {
      case "enter":
        this.enter(cue.duration);
        break;
      case "charge":
        this.charge(cue.element, cue.bolts, cue.duration);
        break;
      case "launch":
        this.launch(cue);
        break;
      case "impact":
        this.impact(cue);
        break;
      case "ward":
        this.ward(cue.amount);
        break;
      case "defeat":
        this.defeat(cue.foe);
        break;
      case "blow":
        this.blow(cue.amount, cue.blocked);
        break;
      case "shield":
        this.foeShield(cue.foe);
        break;
      case "stoke":
        this.stoke(cue.foe);
        break;
      case "heal":
        this.heal(cue.foe);
        break;
      case "curse":
        this.curse();
        break;
      case "fizzle":
        this.fizzle();
        break;
      case "victory":
        this.victory();
        break;
      case "loss":
        this.loss();
        break;
      case "enemy":
        this.lunge(cue.foe);
        break;
      case "turn":
        break;
    }
  }

  // --- Geometry ----------------------------------------------------------------------------------------------------

  private hand(): Point {
    const { hero } = this.scene;
    return { x: hero.x + hero.width * HAND.dx, y: hero.feet - hero.height * HAND.dy };
  }

  private chestOf(body: Body): Point {
    return { x: body.x, y: body.feet - body.height * 0.52 };
  }

  private foeChest(uid: string, bolt = 0): Point {
    const body = this.scene.foes[uid];
    if (!body) return { x: this.scene.width * 0.9, y: this.scene.height * 0.5 };
    // A volley spreads over the body instead of stacking every hit on one pixel. The spread is fixed per bolt, so the
    // same bolt always strikes the same place.
    const spreadX = (((bolt * 0.618034) % 1) - 0.5) * body.width * 0.45;
    const spreadY = (((bolt * 0.414214) % 1) - 0.5) * body.height * 0.35;
    return { x: body.x + spreadX, y: body.feet - body.height * 0.5 + spreadY };
  }

  private count(n: number): number {
    return Math.max(1, Math.round(n * (this.options.reduced ? 0.35 : 1)));
  }

  private add(effect: Effect): void {
    this.effects.push(effect);
  }

  private addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /**
   * Light the whole stage. At most one flash in any 400ms, so a volley of big hits can never strobe: guidance for
   * flashing content is fewer than three flashes a second, and motion-reduced play gets none at all.
   */
  private flash(color: string, alpha: number, life: number): void {
    if (this.options.reduced || this.wall - this.lastFlash < 400) return;
    this.lastFlash = this.wall;
    this.add(flashFx({ width: this.scene.width, height: this.scene.height, color, alpha, life }));
  }

  /** Stop the clock for a moment. Volleys only stop once every 180ms, or a burst of hits would crawl. */
  private hitStop(ms: number): void {
    if (this.options.reduced || this.clock - this.lastStop < 180) return;
    this.freezeLeft = Math.max(this.freezeLeft, ms);
    this.lastStop = this.clock;
  }

  // --- Casting -----------------------------------------------------------------------------------------------------

  private charge(element: ElementView, bolts: number, duration: number): void {
    const look = LOOKS[element];
    const hero = this.scene.hero;
    const feet = { x: hero.x + hero.width * 0.05, y: hero.feet - this.grid * 2 };
    const volley = Math.min(TIMING.volleyMax, cadence(bolts).gap * Math.max(1, bolts));
    const hold = duration + volley + 320;
    this.add(
      spriteFx({
        sprites: this.sprites,
        key: "circle",
        tint: look.main,
        at: feet,
        size: hero.height * 1.05,
        life: hold,
        layer: 0,
        squash: 0.3,
        scale: (t) => ease.back(Math.min(1, t * 5)) * (1 + 0.04 * Math.sin(t * 30)),
        alpha: (t) => envelope(t, 0.08, 0.25) * 0.95,
        rotation: (t) => t * hold * 0.0025,
        fallback: { color: look.main, shape: "ring" },
      }),
    );
    // Light gathering in the hand, and motes drawn in toward it.
    const hand = () => this.hand();
    this.add(
      spriteFx({
        sprites: this.sprites,
        key: `dot:${look.main}`,
        at: hand,
        size: hero.height * 0.34,
        life: duration + 160,
        scale: (t) => 0.2 + ease.out(t) * 0.9 + 0.08 * Math.sin(t * 40),
        alpha: (t) => envelope(t, 0.3, 0.2),
        fallback: { color: look.main, shape: "glow" },
      }),
    );
    const center = this.hand();
    const reach = hero.height * 0.55;
    for (let i = 0; i < this.count(26); i++) {
      const angle = this.random() * Math.PI * 2;
      const distance = reach * (0.6 + this.random() * 0.5);
      const life = duration * (0.7 + this.random() * 0.3);
      this.particles.add({
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance,
        vx: (-Math.cos(angle) * distance) / (life / 1000),
        vy: (-Math.sin(angle) * distance) / (life / 1000),
        life,
        delay: this.random() * 120,
        size: this.grid * 2,
        endSize: this.grid,
        color: i % 3 === 0 ? look.core : look.main,
        shape: i % 4 === 0 ? "glow" : "square",
      });
    }
    if (bolts >= 8) {
      // A big volley: a column of light and the floor trembling under it.
      this.addTrauma(0.18);
      this.add(ringFx({ at: feet, from: hero.width * 0.2, to: hero.height * 0.9, width: this.grid * 3, color: look.main, life: 520, squash: 0.3, layer: 0 }));
    }
  }

  private launch(cue: LaunchCue): void {
    const look = LOOKS[cue.element];
    const from = this.hand();
    const power = empowerment(cue.mult);
    const size = this.scene.height * (0.14 + power * 0.05);
    const halo = power > 0 ? GOLD : undefined;
    const targets = cue.targets.length > 0 ? cue.targets : [""];
    this.add(ringFx({ at: from, from: this.grid * 2, to: size * 0.5, width: this.grid * 2, color: look.core, life: 180 }));
    for (const [index, uid] of targets.entries()) {
      const to = this.foeChest(uid, cue.bolt);
      const path = this.pathFor(cue, from, to, index);
      this.add(
        projectileFx({
          sprites: this.sprites,
          head: look.head,
          path,
          life: cue.duration,
          size,
          color: look.main,
          core: look.core,
          random: this.random,
          halo,
          afterimages: power > 0 ? 4 : cue.pierce ? 3 : 1,
          trail: (at, heading) => {
            this.trail(look, at, heading, power);
          },
        }),
      );
      if (cue.pierce) {
        // The wake of a piercing bolt runs on through its target, a little way: far enough to read as "through", short
        // of the next foe, which it did not touch.
        const reach = this.scene.width * 0.06;
        const length = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
        const beyond = { x: to.x + ((to.x - from.x) / length) * reach, y: to.y + ((to.y - from.y) / length) * reach };
        this.add(beamFx({ from, to: beyond, width: this.grid * 3, color: look.main, core: look.core, life: 260, delay: cue.duration * 0.6 }));
      }
    }
    if (cue.element === "spark" && !cue.pierce && this.random() < 0.5) {
      const to = this.foeChest(targets[0] ?? "", cue.bolt);
      this.add(lightningFx({ from, to, color: look.main, core: look.core, life: cue.duration + 60, jag: this.scene.height * 0.08, random: this.random, width: this.grid }));
    }
  }

  private pathFor(cue: LaunchCue, from: Point, to: Point, index: number): (t: number) => Point {
    switch (cue.flight) {
      case "lance":
        return (t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      case "rain": {
        // Up and over, then down onto every foe at once.
        const control = { x: (from.x + to.x) / 2 + (index - 1) * 20, y: -this.scene.height * 0.35 };
        return bezier(from, control, to);
      }
      case "seeker": {
        const bend = (cue.bolt % 2 === 0 ? -1 : 1) * this.scene.height * 0.45;
        return bezier(from, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + bend }, to);
      }
      case "missile": {
        const lift = this.scene.height * 0.08;
        return bezier(from, { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift }, to);
      }
    }
  }

  private trail(look: ElementLook, at: Point, heading: number, power: number): void {
    const grid = this.grid;
    const back = heading + Math.PI;
    const n = this.options.reduced ? (this.random() < 0.4 ? 1 : 0) : 1 + power;
    for (let i = 0; i < n; i++) {
      switch (look.mote) {
        case "ember":
          this.particles.add({ x: at.x, y: at.y, vx: Math.cos(back) * 40 + (this.random() - 0.5) * 50, vy: Math.sin(back) * 40 - 30, gravity: look.gravity, life: 420, size: grid * 2, endSize: grid, color: this.random() < 0.4 ? look.core : look.main, shape: "square" });
          break;
        case "shard":
          this.particles.add({ x: at.x, y: at.y, vx: (this.random() - 0.5) * 60, vy: (this.random() - 0.5) * 40, gravity: look.gravity * 0.3, drag: 0.2, life: 380, size: grid * 2, endSize: grid, color: this.random() < 0.5 ? look.core : look.main, shape: "diamond" });
          break;
        case "spark":
          this.particles.add({ x: at.x + (this.random() - 0.5) * grid * 6, y: at.y + (this.random() - 0.5) * grid * 6, life: 140, size: grid * 2, endSize: grid, color: look.core, shape: "square" });
          break;
        case "mote":
          this.particles.add({ x: at.x, y: at.y, vx: (this.random() - 0.5) * 50, vy: (this.random() - 0.5) * 50, gravity: look.gravity, drag: 0.3, life: 460, size: grid * 1.5, endSize: grid, color: this.random() < 0.3 ? GOLD : look.main, shape: this.random() < 0.3 ? "plus" : "square" });
          break;
      }
    }
    if (power > 0 && this.random() < 0.5) {
      this.particles.add({ x: at.x, y: at.y, vx: (this.random() - 0.5) * 30, vy: (this.random() - 0.5) * 30, life: 300, size: grid * 2, endSize: grid, color: GOLD, shape: "square" });
    }
  }

  private impact(cue: ImpactCue): void {
    const look = LOOKS[cue.element];
    const at = this.foeChest(cue.foe, cue.bolt);
    const body = this.scene.foes[cue.foe];
    const scale = body ? Math.max(0.6, Math.min(1.6, body.height / (this.scene.height * 0.32))) : 1;
    const grid = this.grid;
    if (cue.outcome === "absorb") {
      this.absorb(at, look, scale);
      return;
    }
    if (cue.outcome === "glance") {
      this.glance(at, look);
      return;
    }

    const power = empowerment(cue.mult);
    const resisted = cue.affinity === "resist";
    const weak = cue.affinity === "weak";
    const heft = Math.min(1, cue.weight * (resisted ? 0.6 : 1) + power * 0.15 + (weak ? 0.12 : 0));
    const burst = this.scene.height * (0.16 + heft * 0.3) * (resisted ? 0.7 : 1) * Math.sqrt(scale);
    if (cue.blocked > 0) {
      // Shield first: a steel shell cracks, then whatever got through lands.
      this.add(spriteFx({ sprites: this.sprites, key: "ward", tint: STEEL, at, size: burst * 1.1, life: 260, scale: (t) => 1 + t * 0.25, alpha: (t) => 1 - t, fallback: { color: STEEL, shape: "ring" } }));
      this.particles.burst(this.count(10), { x: at.x, y: at.y, life: 520, gravity: 700, drag: 0.4, size: grid * 3, endSize: grid, color: STEEL, shape: "diamond", additive: false }, { speed: [120, 320] }, this.random);
    }
    this.add(
      spriteFx({
        sprites: this.sprites,
        key: look.burst,
        at,
        size: burst,
        life: 380 + heft * 220,
        scale: (t) => 0.35 + ease.out(Math.min(1, t * 2.6)) * 0.85,
        alpha: (t) => (resisted ? 0.6 : 1) * (1 - ease.in(t)),
        rotation: this.random() * Math.PI * 2,
        fallback: { color: look.main, shape: "glow" },
      }),
    );
    this.add(ringFx({ at, from: grid * 3, to: burst * 0.75, width: grid * (2 + heft * 3), color: resisted ? STEEL : look.main, life: 340 + heft * 160 }));
    const sparks = this.count(8 + heft * 34 + power * 8);
    const outward = cue.pierce ? 0 : Math.PI; // a piercing bolt carries its debris on through
    this.particles.burst(
      sparks,
      { x: at.x, y: at.y, life: 520 + heft * 280, gravity: look.gravity * 0.8, drag: 0.08, size: grid * (2 + heft * 2), endSize: grid, color: look.main, shape: look.mote === "shard" ? "diamond" : "square" },
      { angle: outward, spread: cue.pierce ? Math.PI * 0.6 : Math.PI * 2, speed: [90 + heft * 60, 260 + heft * 420] },
      this.random,
    );
    this.particles.burst(this.count(4 + heft * 10), { x: at.x, y: at.y, life: 300, size: grid * 4, endSize: grid, color: look.core, shape: "glow" }, { speed: [30, 120] }, this.random);
    if (cue.element === "spark") {
      for (let i = 0; i < this.count(2 + heft * 3); i++) {
        const angle = this.random() * Math.PI * 2;
        const length = burst * (0.5 + this.random() * 0.6);
        this.add(lightningFx({ from: at, to: { x: at.x + Math.cos(angle) * length, y: at.y + Math.sin(angle) * length }, color: look.main, core: look.core, life: 160, jag: length * 0.35, random: this.random, width: grid }));
      }
    }
    if (cue.element === "fire" && heft > 0.2) {
      const emberAt = at;
      this.add(emitterFx({ life: 520, rate: 26, spawn: () => { this.particles.add({ x: emberAt.x + (this.random() - 0.5) * burst * 0.5, y: emberAt.y + (this.random() - 0.3) * burst * 0.4, vy: -40, gravity: -220, life: 600, size: grid * 2, endSize: grid, color: this.random() < 0.5 ? look.core : look.main }); } }));
    }
    if (weak) {
      this.add(spriteFx({ sprites: this.sprites, key: "flare", at, size: burst * 1.1, life: 420, scale: (t) => 0.4 + ease.back(Math.min(1, t * 3)) * 0.8, alpha: (t) => 1 - ease.in(t), rotation: (t) => t * 2.5, fallback: { color: GOLD, shape: "glow" } }));
      this.add(ringFx({ at, from: grid * 6, to: burst, width: grid * 2, color: GOLD, life: 460, delay: 60 }));
    }
    if (power === 2 || heft >= 0.75) this.flash(look.core, 0.14 + heft * 0.1, 170);
    this.addTrauma(0.05 + heft * 0.42);
    if (heft >= 0.3) this.hitStop(40 + heft * 80);
  }

  private absorb(at: Point, look: ElementLook, scale: number): void {
    // Swallowed: everything is drawn into the foe instead of thrown out of it.
    const radius = this.scene.height * 0.14 * scale;
    for (let i = 0; i < this.count(22); i++) {
      const angle = this.random() * Math.PI * 2;
      const life = 320 + this.random() * 120;
      this.particles.add({ x: at.x + Math.cos(angle) * radius, y: at.y + Math.sin(angle) * radius, vx: (-Math.cos(angle) * radius) / (life / 1000), vy: (-Math.sin(angle) * radius) / (life / 1000), life, size: this.grid * 2, endSize: this.grid, color: i % 2 ? "#7a52c7" : look.main, shape: "square" });
    }
    this.add(ringFx({ at, from: radius, to: this.grid, width: this.grid * 3, color: "#9b6bff", life: 360 }));
    this.add(spriteFx({ sprites: this.sprites, key: "dot:#2a0f4a", at, size: radius * 1.6, life: 420, additive: false, scale: (t) => 1 - ease.in(t), alpha: (t) => 0.85 * (1 - t), fallback: { color: "#2a0f4a", shape: "glow" } }));
  }

  private glance(at: Point, look: ElementLook): void {
    // Deflected: sparks skip back off the hide toward the caster.
    this.particles.burst(this.count(12), { x: at.x, y: at.y, life: 380, gravity: 900, drag: 0.3, size: this.grid * 2, endSize: this.grid, color: "#fff4d6", shape: "streak" }, { angle: Math.PI * 1.15, spread: Math.PI * 0.7, speed: [220, 480] }, this.random);
    this.add(ringFx({ at, from: this.grid * 2, to: this.scene.height * 0.06, width: this.grid * 2, color: look.core, life: 200 }));
    this.addTrauma(0.04);
  }

  private ward(amount: number): void {
    const hero = this.scene.hero;
    const at = this.chestOf(hero);
    const size = hero.height * 1.2;
    this.add(spriteFx({ sprites: this.sprites, key: "ward", tint: WARD_LOOK.main, at, size, life: 700, scale: (t) => 0.55 + ease.back(Math.min(1, t * 3.2)) * 0.5, alpha: (t) => envelope(t, 0.1, 0.55) * (0.85 + 0.15 * Math.sin(t * 50)), fallback: { color: WARD_LOOK.main, shape: "ring" } }));
    this.add(ringFx({ at: { x: hero.x, y: hero.feet - this.grid * 2 }, from: hero.width * 0.3, to: hero.height * 0.75, width: this.grid * 3, color: WARD_LOOK.main, life: 460, squash: 0.28, layer: 0 }));
    for (let i = 0; i < this.count(12 + Math.min(20, amount)); i++) {
      const angle = this.random() * Math.PI * 2;
      const distance = size * 0.7;
      const life = 380;
      this.particles.add({ x: at.x + Math.cos(angle) * distance, y: at.y + Math.sin(angle) * distance, vx: (-Math.cos(angle) * distance * 0.8) / (life / 1000), vy: (-Math.sin(angle) * distance * 0.8) / (life / 1000), life, size: this.grid * 3, endSize: this.grid, color: i % 3 ? WARD_LOOK.main : WARD_LOOK.core, shape: "diamond" });
    }
  }

  private defeat(uid: string): void {
    const body = this.scene.foes[uid];
    if (!body) return;
    const big = body.height >= this.scene.height * 0.5;
    const center = this.chestOf(body);
    const art = this.foeArt[uid];
    const pixels = art?.url !== undefined ? this.sprites.pixels(art.url) : undefined;
    if (pixels) {
      // The foe's own pixels become the debris: sample its sprite on a coarse grid and throw each block outward.
      const budget = this.options.reduced ? 160 : big ? 900 : 420;
      const step = Math.max(1, Math.ceil(Math.sqrt((pixels.width * pixels.height * 0.5) / budget)));
      const drawnHeight = body.height;
      const drawnWidth = (pixels.width / pixels.height) * drawnHeight;
      const cell = (drawnHeight / pixels.height) * step;
      for (let y = 0; y < pixels.height; y += step) {
        for (let x = 0; x < pixels.width; x += step) {
          const i = (y * pixels.width + x) * 4;
          if ((pixels.data[i + 3] ?? 0) < 128) continue;
          const px = body.x - drawnWidth / 2 + (x / pixels.width) * drawnWidth;
          const py = body.feet - drawnHeight + (y / pixels.height) * drawnHeight;
          const angle = Math.atan2(py - center.y, px - center.x);
          const speed = 60 + this.random() * (big ? 420 : 300);
          this.particles.add({
            x: px,
            y: py,
            vx: Math.cos(angle) * speed + (this.random() - 0.5) * 60,
            vy: Math.sin(angle) * speed - 140 - this.random() * 140,
            gravity: 780,
            drag: 0.45,
            life: 700 + this.random() * (big ? 900 : 500),
            delay: this.random() * (big ? 260 : 80),
            size: cell,
            endSize: cell * 0.5,
            color: `rgb(${pixels.data[i] ?? 0} ${pixels.data[i + 1] ?? 0} ${pixels.data[i + 2] ?? 0})`,
            shape: "square",
            additive: false,
          });
        }
      }
    }
    const glow = this.auraColors.get(uid) ?? "#fff1d6";
    this.add(spriteFx({ sprites: this.sprites, key: `dot:${glow}`, at: center, size: body.height * 1.3, life: 380, scale: (t) => 0.5 + ease.out(t), alpha: (t) => 1 - t, fallback: { color: glow, shape: "glow" } }));
    this.add(ringFx({ at: { x: body.x, y: body.feet - this.grid * 2 }, from: body.width * 0.2, to: body.width * 1.6, width: this.grid * 4, color: glow, life: 620, squash: 0.3, layer: 0 }));
    this.addTrauma(big ? 0.7 : 0.3);
    this.hitStop(big ? 220 : 90);
    if (big) {
      this.lastFlash = -Infinity; // a guardian's fall always gets its flash
      this.flash("#ffffff", 0.4, 420);
    }
  }

  // --- The foes' turn ----------------------------------------------------------------------------------------------

  private lunge(uid: string): void {
    const body = this.scene.foes[uid];
    if (!body) return;
    this.particles.burst(this.count(8), { x: body.x, y: body.feet - this.grid, life: 420, gravity: -40, drag: 0.1, size: this.grid * 3, endSize: this.grid * 5, color: "#6f5e46", shape: "square", additive: false }, { angle: 0, spread: Math.PI * 0.5, speed: [30, 90] }, this.random);
  }

  private blow(amount: number, blocked: number): void {
    const hero = this.scene.hero;
    const at = this.chestOf(hero);
    const grid = this.grid;
    const felt = Math.min(1, amount / 24);
    if (blocked > 0) {
      this.add(spriteFx({ sprites: this.sprites, key: "ward", tint: WARD_LOOK.main, at, size: hero.height * 1.15, life: 320, scale: (t) => 1 + t * 0.1, alpha: (t) => (1 - t) * (0.8 + 0.2 * Math.sin(t * 60)), fallback: { color: WARD_LOOK.main, shape: "ring" } }));
      this.particles.burst(this.count(8 + Math.min(12, blocked)), { x: at.x + hero.width * 0.3, y: at.y, life: 380, gravity: 500, drag: 0.3, size: grid * 3, endSize: grid, color: WARD_LOOK.main, shape: "diamond" }, { angle: 0, spread: Math.PI * 0.9, speed: [120, 300] }, this.random);
    }
    if (amount <= 0) {
      this.add(ringFx({ at, from: grid * 4, to: hero.height * 0.5, width: grid * 3, color: WARD_LOOK.core, life: 260 }));
      this.addTrauma(0.08);
      return;
    }
    this.add(spriteFx({ sprites: this.sprites, key: "slash", at, size: hero.height * (0.6 + felt * 0.4), life: 300, scale: (t) => 0.7 + ease.out(Math.min(1, t * 3)) * 0.4, alpha: (t) => 1 - ease.in(t), rotation: (this.random() - 0.5) * 0.6, fallback: { color: HURT_LOOK.main, shape: "glow" } }));
    this.particles.burst(this.count(10 + felt * 20), { x: at.x, y: at.y, life: 460, gravity: 600, drag: 0.2, size: grid * 2, endSize: grid, color: HURT_LOOK.main, shape: "square" }, { angle: Math.PI, spread: Math.PI * 0.8, speed: [100, 340] }, this.random);
    this.add(vignetteFx({ width: this.scene.width, height: this.scene.height, color: HURT_LOOK.edge, alpha: 0.35 + felt * 0.35, life: 420 }));
    this.addTrauma(0.12 + felt * 0.4);
    if (felt > 0.4) this.hitStop(60);
  }

  private foeShield(uid: string): void {
    const body = this.scene.foes[uid];
    if (!body) return;
    const at = this.chestOf(body);
    this.add(spriteFx({ sprites: this.sprites, key: "ward", tint: STEEL, at, size: body.height * 1.15, life: 560, scale: (t) => 0.6 + ease.back(Math.min(1, t * 3)) * 0.45, alpha: (t) => envelope(t, 0.1, 0.5), fallback: { color: STEEL, shape: "ring" } }));
    this.particles.burst(this.count(10), { x: at.x, y: at.y, life: 420, size: this.grid * 2, endSize: this.grid, color: STEEL, shape: "diamond" }, { speed: [60, 160] }, this.random);
  }

  private stoke(uid: string): void {
    const body = this.scene.foes[uid];
    if (!body) return;
    this.add(ringFx({ at: { x: body.x, y: body.feet - this.grid * 2 }, from: body.width * 0.2, to: body.width * 0.9, width: this.grid * 3, color: HURT_LOOK.main, life: 420, squash: 0.3, layer: 0 }));
    this.add(emitterFx({ life: 700, rate: 40, spawn: () => { this.particles.add({ x: body.x + (this.random() - 0.5) * body.width * 0.8, y: body.feet - this.random() * body.height * 0.6, vy: -60, gravity: -260, life: 600, size: this.grid * 2, endSize: this.grid, color: this.random() < 0.5 ? LOOKS.fire.main : HURT_LOOK.main }); } }));
  }

  private heal(uid: string | undefined): void {
    const body = uid === undefined ? this.scene.hero : this.scene.foes[uid];
    if (!body) return;
    this.add(emitterFx({ life: 620, rate: 34, spawn: () => { this.particles.add({ x: body.x + (this.random() - 0.5) * body.width * 0.9, y: body.feet - this.random() * body.height * 0.4, vy: -70, gravity: -80, life: 700, size: this.grid * 2, endSize: this.grid * 2, color: this.random() < 0.4 ? HEAL_LOOK.core : HEAL_LOOK.main, shape: this.random() < 0.35 ? "plus" : "square" }); } }));
    this.add(ringFx({ at: { x: body.x, y: body.feet - this.grid * 2 }, from: body.width * 0.2, to: body.width, width: this.grid * 2, color: HEAL_LOOK.main, life: 500, squash: 0.3, layer: 0 }));
  }

  private curse(): void {
    const hero = this.scene.hero;
    this.add(emitterFx({ life: 480, rate: 50, spawn: () => { this.particles.add({ x: hero.x + (this.random() - 0.5) * hero.width, y: hero.feet - this.random() * hero.height * 0.8, vx: (this.random() - 0.5) * 30, vy: -90, gravity: -120, life: 520, size: this.grid * 2, endSize: this.grid, color: this.random() < 0.5 ? CURSE_LOOK.main : CURSE_LOOK.edge }); } }));
    this.add(vignetteFx({ width: this.scene.width, height: this.scene.height, color: CURSE_LOOK.edge, alpha: 0.4, life: 460 }));
    this.addTrauma(0.1);
  }

  private fizzle(): void {
    const at = this.hand();
    this.particles.burst(this.count(14), { x: at.x, y: at.y, vy: -30, gravity: -50, drag: 0.15, life: 700, size: this.grid * 3, endSize: this.grid * 7, color: "#8a8174", shape: "square", additive: false }, { speed: [20, 80] }, this.random);
    this.add(ringFx({ at, from: this.grid * 2, to: this.scene.height * 0.05, width: this.grid, color: "#c9bfae", life: 220 }));
  }

  // --- Beginnings and endings --------------------------------------------------------------------------------------

  private enter(duration: number): void {
    const boss = Object.values(this.scene.foes).some((body) => body.height >= this.scene.height * 0.5);
    if (!boss) return;
    this.add(vignetteFx({ width: this.scene.width, height: this.scene.height, color: "#000000", alpha: 0.8, life: duration, darken: true }));
    for (const [uid, body] of Object.entries(this.scene.foes)) {
      const glow = this.auraColors.get(uid) ?? HURT_LOOK.main;
      this.add(ringFx({ at: { x: body.x, y: body.feet - this.grid * 2 }, from: body.width * 0.1, to: body.width * 1.8, width: this.grid * 5, color: glow, life: 900, delay: duration * 0.45, squash: 0.28, layer: 0 }));
      this.add(emitterFx({ life: duration * 0.7, delay: duration * 0.2, rate: 60, spawn: () => { this.particles.add({ x: body.x + (this.random() - 0.5) * body.width * 1.2, y: body.feet - this.random() * this.grid * 8, vy: -120 - this.random() * 160, gravity: -60, life: 900, size: this.grid * 2, endSize: this.grid, color: glow }); } }));
    }
    this.add(emitterFx({ life: duration * 0.6, rate: 18, spawn: () => { this.addTrauma(0.04); } }));
  }

  private victory(): void {
    const hero = this.scene.hero;
    this.add(emitterFx({ life: 900, rate: 40, spawn: () => { this.particles.add({ x: hero.x + (this.random() - 0.5) * hero.width * 1.4, y: hero.feet - this.random() * hero.height, vy: -50, gravity: -40, life: 800, size: this.grid * 2, endSize: this.grid, color: this.random() < 0.5 ? GOLD : "#fff6d8", shape: this.random() < 0.4 ? "plus" : "square" }); } }));
  }

  private loss(): void {
    this.add(vignetteFx({ width: this.scene.width, height: this.scene.height, color: HURT_LOOK.edge, alpha: 0.7, life: 1200 }));
    this.addTrauma(0.5);
  }

  // --- Always on ---------------------------------------------------------------------------------------------------

  private ambient(dt: number): void {
    const { width, height } = this.scene;
    if (width === 0) return;
    const wanted = this.options.reduced ? 10 : 34;
    while (this.dust.length < wanted) this.dust.push({ x: this.random() * width, y: this.random() * height, speed: 6 + this.random() * 14, phase: this.random() * Math.PI * 2 });
    for (const mote of this.dust) {
      mote.x += (mote.speed * dt) / 1000;
      mote.y += (Math.sin(this.clock / 1400 + mote.phase) * 6 * dt) / 1000;
      if (mote.x > width + 4) {
        mote.x = -4;
        mote.y = this.random() * height;
      }
    }
    // Guardians shed embers the whole fight, in the color of their own glow.
    for (const [uid, art] of Object.entries(this.foeArt)) {
      const body = this.scene.foes[uid];
      if (!art.aura || !body) continue;
      if (!this.auraColors.has(uid) && art.url !== undefined) {
        const pixels = this.sprites.pixels(art.url);
        if (pixels) this.auraColors.set(uid, glowColor(pixels) ?? HURT_LOOK.main);
      }
      const color = this.auraColors.get(uid) ?? HURT_LOOK.main;
      const rate = (this.options.reduced ? 3 : 14) * (body.height / (this.scene.height * 0.5));
      if (this.random() < (rate * dt) / 1000) {
        this.particles.add({ x: body.x + (this.random() - 0.5) * body.width * 0.9, y: body.feet - this.random() * body.height * 0.9, vy: -30 - this.random() * 40, vx: (this.random() - 0.5) * 20, gravity: -30, life: 1400, size: this.grid * 2, endSize: this.grid, color });
      }
    }
  }

  private drawDust(ctx: CanvasRenderingContext2D): void {
    const grid = this.grid;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgb(255 220 170 / 0.18)";
    for (const mote of this.dust) ctx.fillRect(Math.round(mote.x / grid) * grid, Math.round(mote.y / grid) * grid, grid, grid);
    ctx.globalCompositeOperation = "source-over";
  }

  private drawReady(ctx: CanvasRenderingContext2D): void {
    if (this.readyGlow < 0.02 || this.options.reduced) return;
    const element = this.ready ?? "none";
    const look = LOOKS[element];
    const hero = this.scene.hero;
    const image = this.sprites.tinted("circle", look.main);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.45 * this.readyGlow;
    ctx.translate(hero.x + hero.width * 0.05, hero.feet - this.grid * 2);
    ctx.scale(1, 0.3);
    ctx.rotate(this.readySpin);
    const size = hero.height * 0.95 * (0.9 + 0.1 * this.readyGlow);
    if (image) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
    } else {
      ctx.strokeStyle = look.main;
      ctx.lineWidth = this.grid * 2;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
