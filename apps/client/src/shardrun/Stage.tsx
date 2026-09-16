import type { ElementView, ShardrunFoeView, ShardrunView } from "@rootward/shared";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  assetUrl,
  BATTLE_FRAME,
  BATTLE_IDLE_FRAMES,
  BATTLE_POSES,
  type BattlePose,
  battleIdleUrl,
  battleStripUrl,
  foeSpriteUrl,
  walkStripUrl,
} from "../assets/AssetRegistry.ts";
import { useT } from "../i18n/index.ts";
import { useShardrun } from "../state/shardrun.ts";
import { type Pending, shownHp } from "./fx/pending.ts";
import type { FoeArt } from "./fx/engine.ts";
import { FxLayer, type StagePlacements } from "./fx/FxLayer.tsx";
import { heroPlacement, layoutFoes, type Placement } from "./fx/layout.ts";
import type { Cue, ImpactCue, Timeline } from "./fx/timeline.ts";
import { ElementTag } from "./parts.tsx";

type Battle = NonNullable<ShardrunView["battle"]>;

const INTENT_GLYPH: Readonly<Record<ShardrunFoeView["intent"]["kind"], string>> = {
  strike: "⚔",
  multi: "⚔⚔",
  shield: "⛨",
  stoke: "▲",
  heal: "✚",
};

/** At most this many numbers float at once; a huge volley still reads through the hit counter. */
const MAX_FLOATS = 28;
const FLOAT_MS = 1100;
/** The walk strip's frame, for classes without battle poses. */
const WALK_FRAME = { width: 32, height: 50 } as const;

type ReactionKind = "hit" | "heavy" | "absorb" | "glance" | "lunge" | "shield" | "stoke" | "heal" | "rise";

interface Reaction {
  kind: ReactionKind;
  element: ElementView;
  key: number;
}

interface Float {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: string;
  size: "s" | "m" | "l" | "xl";
  badge?: string | undefined;
}

export interface StageProps {
  run: ShardrunView;
  battle: Battle;
  /** A timeline to start playing; undefined leaves whatever is playing alone. */
  timeline: Timeline | undefined;
  /** The stage has started `timeline`. */
  onStart: () => void;
  /** What the stage still owes the bars; undefined while the stage shows the battle as it was before a cast. */
  pending: Pending | undefined;
  classId: string;
  pose: BattlePose;
  holdPose: (pose: BattlePose, ms: number, element?: ElementView, spell?: string) => void;
  ready: ElementView | undefined;
  /** Overlays that sit on the stage without shaking with it: the code views. */
  children?: ReactNode;
}

/**
 * The arena (ADR-0019): the backdrop, the Maintainer and the foes placed by size, and the effects canvas over them.
 * Every animation here is driven by the cues of one timeline, played on the effects engine's clock, so a number rises,
 * a bar drops and a foe flinches in the same frame the canvas shows the bolt arrive.
 */
export function Stage({ run, battle, timeline, onStart, pending, classId, pose, holdPose, ready, children }: StageProps) {
  const t = useT();
  const settle = useShardrun((s) => s.settle);
  const settleAll = useShardrun((s) => s.settleAll);
  const shake = useShardrun((s) => s.shake);
  const worldRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(2.8);
  const [spriteAspects, setSpriteAspects] = useState<Readonly<Record<string, number>>>({});
  const [reactions, setReactions] = useState<Readonly<Record<string, Reaction>>>({});
  const [floats, setFloats] = useState<readonly Float[]>([]);
  const [combo, setCombo] = useState<{ hits: number; total: number } | undefined>();
  const [banner, setBanner] = useState<{ key: number; title: string; subtitle?: string; tone: "turn" | "boss" } | undefined>();
  const timers = useRef(new Set<number>());
  const counter = useRef(0);

  useEffect(() => {
    // The world, not the stage: it is what the sprites' percentages and the effects canvas both measure against.
    const world = worldRef.current;
    if (!world) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.height > 0) setAspect(entry.contentRect.width / entry.contentRect.height);
    });
    observer.observe(world);
    const pendingTimers = timers.current;
    return () => {
      observer.disconnect();
      for (const timer of pendingTimers) window.clearTimeout(timer);
    };
  }, []);

  const later = useCallback((run: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, ms);
    timers.current.add(timer);
  }, []);

  const strip = battleStripUrl(classId);
  const idleStrip = strip !== undefined ? battleIdleUrl(classId) : undefined;
  const walk = walkStripUrl(classId, "right");
  // Both strips load up front: swapping from the idle strip to the poses must not flash an empty sprite on the first cast.
  useEffect(() => {
    for (const url of [strip, idleStrip]) {
      if (url === undefined) continue;
      const image = new Image();
      image.src = url;
    }
  }, [strip, idleStrip]);
  const frame = strip !== undefined ? BATTLE_FRAME : WALK_FRAME;
  const placements = useMemo<StagePlacements>(
    () => ({
      hero: heroPlacement(aspect, frame.width / frame.height),
      foes: layoutFoes(
        battle.foes.map((foe) => ({ uid: foe.uid, size: foe.size, aspect: spriteAspects[foe.sprite] })),
        aspect,
      ),
    }),
    [aspect, battle.foes, frame.height, frame.width, spriteAspects],
  );
  const foeArt = useMemo(
    () =>
      Object.fromEntries(
        battle.foes.map((foe): [string, FoeArt] => [foe.uid, { url: foeSpriteUrl(foe.sprite), aura: foe.size === "huge" || foe.size === "colossal" }]),
      ),
    [battle.foes],
  );
  // Guardians too big for a plate under their feet: their health goes across the top of the stage instead.
  const bosses = useMemo(
    () => (battle.kind === "boss" ? battle.foes.filter((foe) => foe.size === "huge" || foe.size === "colossal") : []),
    [battle.kind, battle.foes],
  );
  const bossIds = new Set(bosses.map((foe) => foe.uid));

  const react = useCallback(
    (uid: string, kind: ReactionKind, element: ElementView, ms: number) => {
      const key = ++counter.current;
      setReactions((current) => ({ ...current, [uid]: { kind, element, key } }));
      later(() => {
        setReactions((current) => {
          if (current[uid]?.key !== key) return current;
          const { [uid]: _gone, ...rest } = current;
          return rest;
        });
      }, ms);
    },
    [later],
  );

  const float = useCallback(
    (at: Placement, text: string, tone: string, size: Float["size"], spread = 0, badge?: string) => {
      const id = ++counter.current;
      const jitter = (((spread * 0.618034) % 1) - 0.5) * Math.max(at.width, 0.04) * 0.9;
      const entry: Float = { id, x: at.x + jitter, y: at.y - at.height * 0.82, text, tone, size, badge };
      setFloats((current) => [...current.slice(-(MAX_FLOATS - 1)), entry]);
      later(() => {
        setFloats((current) => current.filter((candidate) => candidate.id !== id));
      }, FLOAT_MS);
    },
    [later],
  );

  const impact = useCallback(
    (cue: ImpactCue) => {
      const at = placements.foes[cue.foe];
      if (cue.outcome === "absorb") {
        react(cue.foe, "absorb", cue.element, 360);
        if (at) float(at, t("fx.nullified"), "muted", "s", cue.bolt);
        return;
      }
      if (cue.outcome === "glance") {
        react(cue.foe, "glance", cue.element, 260);
        if (at) float(at, t("fx.glanced"), "muted", "s", cue.bolt);
        return;
      }
      const heavy = cue.weight >= 0.3 || cue.mult >= 5;
      react(cue.foe, heavy ? "heavy" : "hit", cue.element, heavy ? 420 : 260);
      setCombo((current) => ({ hits: (current?.hits ?? 0) + 1, total: (current?.total ?? 0) + cue.amount }));
      if (!at) return;
      const size = cue.weight >= 0.6 ? "xl" : cue.weight >= 0.3 ? "l" : cue.weight >= 0.08 ? "m" : "s";
      const tone = cue.affinity === "weak" ? "weak" : cue.affinity === "resist" ? "resist" : cue.mult >= 2 ? "empowered" : "damage";
      const badges = [
        cue.affinity === "weak" ? t("fx.weak") : cue.affinity === "resist" ? t("fx.resist") : undefined,
        cue.mult >= 2 ? `×${formatMult(cue.mult)}` : undefined,
        cue.blocked > 0 ? `⛨${cue.blocked}` : undefined,
      ].filter((badge) => badge !== undefined);
      float(at, String(cue.amount), tone, size, cue.bolt, badges.length > 0 ? badges.join(" ") : undefined);
    },
    [float, placements.foes, react, t],
  );

  const onCue = useCallback(
    (cue: Cue) => {
      settle(cue);
      const hero = placements.hero;
      switch (cue.kind) {
        case "enter": {
          if (bosses.length === 0) return;
          for (const boss of bosses) react(boss.uid, "rise", "none", cue.duration);
          const key = ++counter.current;
          setBanner({ key, title: bosses.map((boss) => boss.name).join(" · "), subtitle: t("battle.guardian", { layer: run.layer.name }), tone: "boss" });
          later(() => {
            setBanner((current) => (current?.key === key ? undefined : current));
          }, cue.duration + 400);
          return;
        }
        case "charge":
          setCombo(undefined);
          holdPose("windup", cue.duration, cue.element, cue.spell);
          return;
        case "launch":
          holdPose("cast", 320, cue.element);
          return;
        case "impact":
          impact(cue);
          return;
        case "ward":
          holdPose("ward", 480, cue.element);
          float(hero, t("fx.block", { amount: cue.amount }), "block", "m", cue.at);
          return;
        case "enemy":
          react(cue.foe, "lunge", "none", 460);
          return;
        case "blow":
          holdPose(cue.amount > 0 ? "hurt" : "ward", 380);
          float(hero, cue.amount > 0 ? `-${cue.amount}` : "0", "hurt", cue.amount >= 12 ? "l" : "m", cue.at, cue.blocked > 0 ? t("fx.blocked", { amount: cue.blocked }) : undefined);
          return;
        case "shield": {
          react(cue.foe, "shield", "none", 460);
          const at = placements.foes[cue.foe];
          if (at) float(at, t("fx.shield", { amount: cue.amount }), "block", "m");
          return;
        }
        case "stoke": {
          react(cue.foe, "stoke", "fire", 600);
          const at = placements.foes[cue.foe];
          if (at) float(at, t("fx.stoked"), "hurt", "m");
          return;
        }
        case "heal": {
          if (cue.foe !== undefined) react(cue.foe, "heal", "none", 500);
          const at = cue.foe === undefined ? hero : placements.foes[cue.foe];
          if (at) float(at, `+${cue.amount}`, "heal", "m");
          return;
        }
        case "curse":
          holdPose("hurt", 320);
          float(hero, `-${cue.amount}`, "curse", "m", cue.at);
          return;
        case "fizzle":
          holdPose("recover", 320);
          float(hero, t("fx.fizzle"), "muted", "s", cue.at);
          return;
        case "turn": {
          const key = ++counter.current;
          setBanner({ key, title: t("battle.turn", { turn: cue.turn }), tone: "turn" });
          later(() => {
            setBanner((current) => (current?.key === key ? undefined : current));
          }, 900);
          return;
        }
        case "victory":
          holdPose("victory", Number.POSITIVE_INFINITY);
          return;
        case "loss":
          holdPose("hurt", Number.POSITIVE_INFINITY);
          return;
        case "defeat":
          return;
      }
    },
    [bosses, float, holdPose, impact, later, placements, react, run.layer.name, settle, t],
  );

  const onDone = useCallback(() => {
    settleAll();
    later(() => {
      setCombo(undefined);
    }, 700);
  }, [later, settleAll]);

  const hpOf = (foe: ShardrunFoeView) => shownHp(pending, foe);
  // A foe breaks apart when its defeat plays, not when the response that killed it arrives.
  const broken = (foe: ShardrunFoeView) => hpOf(foe) === 0 && !(pending?.defeats.includes(foe.uid) ?? false);
  const backdrop = assetUrl("backgrounds", run.layer.backdrop) ?? assetUrl("backgrounds", "salvage");
  const hero = placements.hero;
  const frameIndex = BATTLE_POSES.indexOf(pose);

  return (
    <div className={`shr-stage${bosses.length > 0 ? " boss-fight" : ""}`}>
      <div ref={worldRef} className="shr-world" style={backdrop !== undefined ? { backgroundImage: `url("${backdrop}")` } : undefined}>
        <div className="shr-stage-shade" aria-hidden="true" />
        <FxLayer
          timeline={timeline}
          placements={placements}
          foeArt={foeArt}
          ready={ready}
          idle={pose === "idle"}
          shake={shake}
          worldRef={worldRef}
          onStart={onStart}
          onCue={onCue}
          onDone={onDone}
        />

        <div
          className={`shr-hero pose-${pose}${strip !== undefined ? " posed" : ""}`}
          style={place(hero, { aspectRatio: `${frame.width} / ${frame.height}` })}
        >
          <span className="shr-ground-shadow" aria-hidden="true" />
          {battle.block > 0 && (
            <div className="shr-block" title={t("battle.blockHint")}>
              ⛨ {battle.block}
            </div>
          )}
          {pose === "idle" && idleStrip !== undefined ? (
            <HeroSprite url={idleStrip} frames={BATTLE_IDLE_FRAMES} frame={0} idling />
          ) : strip !== undefined || walk !== undefined ? (
            <HeroSprite url={strip ?? walk ?? ""} frames={strip !== undefined ? BATTLE_POSES.length : 5} frame={strip !== undefined ? Math.max(0, frameIndex) : 0} />
          ) : (
            <div className="shr-hero-glyph">@</div>
          )}
        </div>

        {battle.foes.map((foe) => {
          const at = placements.foes[foe.uid];
          if (!at) return null;
          const reaction = reactions[foe.uid];
          const boss = bossIds.has(foe.uid);
          const classes = [
            "shr-foe",
            `size-${foe.size}`,
            broken(foe) ? "defeated" : "",
            foe.stoked ? "stoked" : "",
            reaction ? `react-${reaction.kind} react-${reaction.kind}-${reaction.key % 2} tint-${reaction.element}` : "",
          ];
          return (
            <div key={foe.uid} className={classes.filter(Boolean).join(" ")} style={place(at, { zIndex: Math.round(at.y * 100) })}>
              <span className="shr-ground-shadow" aria-hidden="true" />
              {!boss && !broken(foe) && (
                <div className={`shr-intent intent-${foe.intent.kind}`} title={t("battle.intentHint")}>
                  {INTENT_GLYPH[foe.intent.kind]} {foe.intent.text}
                </div>
              )}
              <FoeSprite
                foe={foe}
                onAspect={(value) => {
                  setSpriteAspects((current) => (current[foe.sprite] === value ? current : { ...current, [foe.sprite]: value }));
                }}
              />
              {!boss && <FoePlate foe={foe} hp={hpOf(foe)} />}
            </div>
          );
        })}

        {floats.map((entry) => (
          <div
            key={entry.id}
            className={`shr-float ${entry.tone} size-${entry.size}`}
            style={{ left: `${entry.x * 100}%`, top: `${entry.y * 100}%` }}
          >
            {entry.badge !== undefined && <small>{entry.badge}</small>}
            {entry.text}
          </div>
        ))}
      </div>

      {bosses.length > 0 && (
        <div className="shr-boss-bars">
          {bosses.map((foe) => (
            <BossBar key={foe.uid} foe={foe} hp={hpOf(foe)} />
          ))}
        </div>
      )}
      {combo !== undefined && combo.hits >= 2 && (
        <div className="shr-combo" key={combo.hits}>
          <b>{combo.total}</b>
          <span>{t(combo.hits === 1 ? "fx.hits.one" : "fx.hits.many", { count: combo.hits })}</span>
        </div>
      )}
      {banner && (
        <div key={banner.key} className={`shr-banner tone-${banner.tone}`}>
          <b>{banner.title}</b>
          {banner.subtitle !== undefined && <span>{banner.subtitle}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/** A placement as CSS: the element's bottom centre stands on the spot. */
function place(at: Placement, extra: CSSProperties = {}): CSSProperties {
  return { left: `${at.x * 100}%`, top: `${at.y * 100}%`, height: `${at.height * 100}%`, ...extra };
}

function formatMult(mult: number): string {
  return Number.isInteger(mult) ? String(mult) : mult.toFixed(1);
}

/**
 * A sprite with a flash laid over it. The flash is a colored box masked by the sprite's own image, so a hit can light a
 * body up in the bolt's color without recoloring the art (a hue filter would turn a purple wraith green).
 */
function mask(url: string, size = "100% 100%", position = "0 0"): CSSProperties {
  const image = `url("${url}")`;
  return { maskImage: image, WebkitMaskImage: image, maskSize: size, WebkitMaskSize: size, maskPosition: position, WebkitMaskPosition: position };
}

/** `idling` steps through the strip's frames by CSS animation (which overrides the inline frame position). */
function HeroSprite({ url, frames, frame, idling = false }: { url: string; frames: number; frame: number; idling?: boolean }) {
  const size = `${frames * 100}% 100%`;
  const position = `${frames > 1 ? (frame / (frames - 1)) * 100 : 0}% 0`;
  return (
    <div
      className={`shr-body shr-hero-sprite${idling ? " idling" : ""}`}
      style={{ backgroundImage: `url("${url}")`, backgroundSize: size, backgroundPosition: position }}
    >
      <span className="shr-flash" style={mask(url, size, position)} />
    </div>
  );
}

function FoeSprite({ foe, onAspect }: { foe: ShardrunFoeView; onAspect: (aspect: number) => void }) {
  const url = foeSpriteUrl(foe.sprite);
  return url !== undefined ? (
    <span className="shr-body">
      <img
        className="shr-foe-sprite"
        src={url}
        alt={foe.name}
        title={foe.flavor}
        draggable={false}
        onLoad={(event) => {
          const image = event.currentTarget;
          if (image.naturalHeight > 0) onAspect(image.naturalWidth / image.naturalHeight);
        }}
      />
      <span className="shr-flash" style={mask(url)} />
    </span>
  ) : (
    <div className="shr-foe-glyph" title={foe.flavor}>
      {foe.name.slice(0, 1)}
    </div>
  );
}

function FoeTags({ foe }: { foe: ShardrunFoeView }) {
  return (
    <div className="shr-tags">
      {foe.shield > 0 && <span className="shr-tag shield">⛨ {foe.shield}</span>}
      {foe.stoked && <span className="shr-tag stoked">stoked</span>}
      {foe.weak.map((element) => (
        <ElementTag key={`weak-${element}`} element={element} prefix="weak: " />
      ))}
      {foe.resist.map((element) => (
        <ElementTag key={`resist-${element}`} element={element} prefix="resists " />
      ))}
      {foe.pattern !== undefined && <ElementTag element={foe.pattern} prefix="now: " />}
      {foe.trait && (
        <span className="shr-tag trait" title={foe.trait.text}>
          {foe.trait.name}
        </span>
      )}
    </div>
  );
}

function HpBar({ hp, max }: { hp: number; max: number }) {
  return (
    <div className="shr-hp" aria-label={`${hp} of ${max} HP`}>
      <em style={{ width: `${max > 0 ? (hp / max) * 100 : 0}%` }} />
      <i style={{ width: `${max > 0 ? (hp / max) * 100 : 0}%` }} />
      <span>
        {hp}/{max}
      </span>
    </div>
  );
}

function FoePlate({ foe, hp }: { foe: ShardrunFoeView; hp: number }) {
  return (
    <div className="shr-plate">
      <b>{foe.name}</b>
      <HpBar hp={hp} max={foe.max} />
      <FoeTags foe={foe} />
      {foe.trait && <div className="shr-trait-text">{foe.trait.text}</div>}
    </div>
  );
}

/** A guardian's name and health across the top of the stage: it is too big to wear a plate under its feet. */
function BossBar({ foe, hp }: { foe: ShardrunFoeView; hp: number }) {
  const t = useT();
  return (
    <div className={`shr-boss-bar${hp === 0 ? " defeated" : ""}`}>
      <div className="shr-boss-head">
        <b>{foe.name}</b>
        {hp > 0 && (
          <span className={`shr-intent intent-${foe.intent.kind}`} title={t("battle.intentHint")}>
            {INTENT_GLYPH[foe.intent.kind]} {foe.intent.text}
          </span>
        )}
      </div>
      <HpBar hp={hp} max={foe.max} />
      <FoeTags foe={foe} />
      {foe.trait && <div className="shr-trait-text">{foe.trait.text}</div>}
    </div>
  );
}
