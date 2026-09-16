import type { ElementView } from "@rootward/shared";
import { type RefObject, useEffect, useRef } from "react";
import { assetUrl } from "../../assets/AssetRegistry.ts";
import { type FoeArt, FxEngine, type Scene } from "./engine.ts";
import type { Placement } from "./layout.ts";
import { SpriteBank } from "./sprites.ts";
import type { Cue, Timeline } from "./timeline.ts";

// The effects canvas over the stage (ADR-0019). The engine keeps the clock, so cues fire on effect time: when a heavy
// hit stops the clock, the next bolt waits too, and the DOM (numbers, poses, HP bars) stays in step with the canvas.

const FX_ART = ["burst-fire", "burst-frost", "burst-spark", "burst-arcane", "circle", "ward", "slash", "flare"];

export interface StagePlacements {
  hero: Placement;
  foes: Readonly<Record<string, Placement>>;
}

export interface FxLayerProps {
  /**
   * A new timeline object starts playing at once, and whatever was left of the last one is dropped. Undefined starts
   * nothing and stops nothing, so a caller can let go of a timeline once `onStart` has said it began.
   */
  timeline: Timeline | undefined;
  placements: StagePlacements;
  foeArt: Readonly<Record<string, FoeArt>>;
  /** The element of the spell under the pointer, for the gathering circle. */
  ready: ElementView | undefined;
  /** The Maintainer is standing idle: a little mana drifts up from the hand. */
  idle: boolean;
  shake: boolean;
  /** The element that shakes: the stage's world, not its overlays. */
  worldRef: RefObject<HTMLDivElement | null>;
  onStart: () => void;
  onCue: (cue: Cue) => void;
  /** The timeline has played every cue. */
  onDone: () => void;
}

export function FxLayer(props: FxLayerProps) {
  const backRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The animation loop reads the newest props through this ref rather than restarting whenever they change.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const engineRef = useRef<FxEngine | undefined>(undefined);
  const runner = useRef<{ timeline: Timeline; start: number; next: number } | undefined>(undefined);

  // One engine and one animation loop for the life of the stage.
  useEffect(() => {
    const canvas = canvasRef.current;
    const back = backRef.current;
    const ctx = canvas?.getContext("2d");
    const backCtx = back?.getContext("2d");
    if (!canvas || !back || !ctx || !backCtx) return;
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const bank = new SpriteBank((id) => assetUrl("fx", id));
    bank.preload(FX_ART);
    const engine = new FxEngine(bank, { reduced: reducedQuery.matches, shake: latest.current.shake });
    engineRef.current = engine;
    let size = { width: 0, height: 0, ratio: 1 };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      size = { width: rect.width, height: rect.height, ratio };
      for (const surface of [canvas, back]) {
        surface.width = Math.round(rect.width * ratio);
        surface.height = Math.round(rect.height * ratio);
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const current = latest.current;
      engine.setOptions({ reduced: reducedQuery.matches, shake: current.shake });
      engine.scene = toScene(current.placements, size.width, size.height);
      engine.foeArt = current.foeArt;
      engine.setReady(current.ready);
      engine.idle = current.idle;
      engine.update(dt);
      const playing = runner.current;
      if (playing) {
        const elapsed = engine.clock - playing.start;
        const { cues } = playing.timeline;
        while (playing.next < cues.length) {
          const cue = cues[playing.next];
          if (!cue || cue.at > elapsed) break;
          playing.next += 1;
          engine.play(cue);
          current.onCue(cue);
        }
        if (playing.next >= cues.length && elapsed >= playing.timeline.durationMs) {
          runner.current = undefined;
          current.onDone();
        }
      }
      backCtx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
      ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
      engine.drawBack(backCtx);
      engine.drawFront(ctx);
      const world = current.worldRef.current;
      if (world) {
        const offset = engine.shakeOffset();
        world.style.transform = offset.x === 0 && offset.y === 0 ? "" : `translate(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      engineRef.current = undefined;
    };
  }, []);

  // Effects run in the order they are declared, so on the first render the engine above already exists here.
  const { timeline } = props;
  useEffect(() => {
    const engine = engineRef.current;
    if (!timeline || !engine) return;
    runner.current = { timeline, start: engine.clock, next: 0 };
    latest.current.onStart();
  }, [timeline]);

  return (
    <>
      <canvas ref={backRef} className="shr-fx back" aria-hidden="true" />
      <canvas ref={canvasRef} className="shr-fx front" aria-hidden="true" />
    </>
  );
}

function toScene(placements: StagePlacements, width: number, height: number): Scene {
  const body = (placement: Placement) => ({
    x: placement.x * width,
    feet: placement.y * height,
    width: placement.width * width,
    height: placement.height * height,
  });
  const foes: Record<string, ReturnType<typeof body>> = {};
  for (const [uid, placement] of Object.entries(placements.foes)) foes[uid] = body(placement);
  return { width, height, hero: body(placements.hero), foes };
}
