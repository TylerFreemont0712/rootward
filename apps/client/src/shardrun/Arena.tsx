import type { ShardrunFoeView, ShardrunLogView, ShardrunView, SpellView } from "@rootward/shared";
import { type CSSProperties, Fragment, useCallback, useEffect, useState } from "react";
import { assetUrl, walkStripUrl } from "../assets/AssetRegistry.ts";
import { useShardrun } from "../state/shardrun.ts";
import { useGame } from "../state/store.ts";
import { CodeView } from "./CodeView.tsx";
import { boltUrl, ElementTag, ManaCost, ShardIcon } from "./parts.tsx";
import { type Effect, usePlayback } from "./playback.ts";

type Battle = NonNullable<ShardrunView["battle"]>;
interface Spot {
  x: number;
  y: number;
}

/** The Maintainer's feet on the stage, in percent; foes spread across the right half. */
const HERO: Spot = { x: 20, y: 64 };
function foeSpot(index: number, count: number): Spot {
  return { x: 50 + ((index + 0.5) * 42) / count, y: 60 };
}
const NO_LOG: readonly ShardrunLogView[] = [];

const INTENT_GLYPH: Readonly<Record<ShardrunFoeView["intent"]["kind"], string>> = {
  strike: "⚔",
  multi: "⚔⚔",
  shield: "⛨",
  stoke: "▲",
  heal: "✚",
};

/**
 * A turn-based battle: the stage with the Maintainer and foes, then spells, mana, and the battle log. A cast first plays
 * as code (when the code speed is not off), then its hits play over the stage.
 */
export function Arena({ run, battle: current, frozen }: { run: ShardrunView; battle: Battle; frozen: boolean }) {
  const staged = useShardrun((s) => s.staged);
  const beat = useShardrun((s) => s.beat);
  const busy = useShardrun((s) => s.busy);
  const history = useShardrun((s) => s.history);
  const command = useShardrun((s) => s.command);
  const replay = useShardrun((s) => s.replay);
  const phase = useShardrun((s) => s.phase);
  const codeSpeed = useShardrun((s) => s.codeSpeed);
  const finishReplay = useShardrun((s) => s.finishReplay);
  const classId = useGame((s) => s.activeProfile?.classId) ?? "artificer";
  const effects = usePlayback(phase === "log" ? run.log : NO_LOG, beat);
  const [exploring, setExploring] = useState<string | undefined>();
  const playingCode = replay !== undefined && phase === "code";
  // While a cast's code plays, the stage still shows the battle before it: the result arrives with the hits.
  const battle = playingCode && staged ? staged : current;
  const disabled = frozen || busy || playingCode;
  const closeExplore = useCallback(() => {
    setExploring(undefined);
  }, []);

  useEffect(() => {
    if (frozen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const state = useShardrun.getState();
      if (state.busy || state.phase === "code") return;
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
      const spell = run.spells[Number(event.key) - 1];
      if (spell) {
        if (!spell.spent && spell.preview?.affordable === true) void command({ type: "cast", spellId: spell.id });
      } else if (event.key.toLowerCase() === "e") {
        void command({ type: "end-turn" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [frozen, run.spells, command]);

  const spotOf = (uid: string | undefined): Spot => {
    const index = battle.foes.findIndex((foe) => foe.uid === uid);
    return index < 0 ? HERO : foeSpot(index, battle.foes.length);
  };
  const playing = (kinds: readonly string[], uid?: string) =>
    effects.some((effect) => kinds.includes(effect.entry.kind) && (uid === undefined || effect.entry.foe === uid));
  const strip = walkStripUrl(classId, "right");
  const backdrop = assetUrl("backgrounds", run.layer.backdrop) ?? assetUrl("backgrounds", "salvage");
  const banner = effects.find((effect) => effect.entry.kind === "turn");
  const castSpell = replay ? run.spells.find((spell) => spell.id === replay.spellId) : undefined;
  const exploreSpell = exploring === undefined ? undefined : run.spells.find((spell) => spell.id === exploring);

  return (
    <div className="shr-battle">
      <div className="shr-stage" style={backdrop !== undefined ? { backgroundImage: `url("${backdrop}")` } : undefined}>
        <div className="shr-stage-shade" aria-hidden="true" />
        <div
          className={`shr-hero${playing(["enemy", "curse"]) ? " hurt" : ""}${playingCode || playing(["cast", "ward"]) ? " casting" : ""}`}
          style={{ left: `${HERO.x}%`, top: `${HERO.y}%` }}
        >
          {battle.block > 0 && (
            <div className="shr-block" title="Block soaks enemy hits until your next turn">
              ⛨ {battle.block}
            </div>
          )}
          {strip !== undefined ? (
            <div className="shr-hero-sprite" style={{ backgroundImage: `url("${strip}")` }} />
          ) : (
            <div className="shr-hero-glyph">@</div>
          )}
        </div>

        {battle.foes.map((foe, index) => {
          const spot = foeSpot(index, battle.foes.length);
          const classes = [
            "shr-foe",
            foe.hp === 0 ? "defeated" : "",
            playing(["hit", "absorb", "glance"], foe.uid) ? "hit" : "",
            playing(["enemy"], foe.uid) ? "lunge" : "",
          ];
          return (
            <div key={foe.uid} className={classes.filter(Boolean).join(" ")} style={{ left: `${spot.x}%`, top: `${spot.y}%` }}>
              {foe.hp > 0 && (
                <div className={`shr-intent intent-${foe.intent.kind}`} title="What it will do when you end your turn">
                  {INTENT_GLYPH[foe.intent.kind]} {foe.intent.text}
                </div>
              )}
              <FoeSprite foe={foe} />
              <FoePlate foe={foe} />
            </div>
          );
        })}

        {effects.map((effect) => (
          <EffectLayer key={effect.id} effect={effect} from={HERO} to={spotOf(effect.entry.foe)} />
        ))}
        {banner && (
          <div key={banner.id} className="shr-turn-banner">
            Turn {banner.entry.amount}
          </div>
        )}

        {playingCode && castSpell && (
          <CodeView key={`cast-${replay.beat}`} run={run} spell={castSpell} spellRun={replay.run} speed={codeSpeed} mode="cast" onDone={finishReplay} />
        )}
        {!playingCode && exploreSpell && (
          <CodeView key={`explore-${exploreSpell.id}-${run.revision}`} run={run} spell={exploreSpell} spellRun={exploreSpell.preview} speed={codeSpeed} mode="explore" onDone={closeExplore} />
        )}
      </div>

      <div className="shr-controls">
        <div className="shr-self">
          <div className="shr-mana-orbs" aria-label={`${battle.mana} of ${battle.manaMax} mana`}>
            {Array.from({ length: battle.manaMax }, (_, index) => (
              <i key={index} className={index < battle.mana ? "full" : ""} />
            ))}
            <span>
              {battle.mana}/{battle.manaMax} mana
            </span>
          </div>
          <div className="meta">
            Turn {battle.turn} · {battle.kind === "boss" ? "guardian" : battle.kind}
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={disabled}
            onClick={() => {
              void command({ type: "end-turn" });
            }}
          >
            End turn <kbd>E</kbd>
          </button>
          <ul className="shr-log" aria-label="Battle log">
            {history.slice(-14).map((entry, index) => (
              <li key={index} className={`log-${entry.kind}`}>
                {entry.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="shr-spells">
          {run.spells.map((spell, index) => (
            <SpellCard
              key={spell.id}
              run={run}
              spell={spell}
              index={index}
              disabled={disabled}
              casting={(playingCode && replay.spellId === spell.id) || effects.some((effect) => effect.entry.kind === "cast" && effect.entry.spell === spell.id)}
              onCast={() => {
                setExploring(undefined);
                void command({ type: "cast", spellId: spell.id });
              }}
              onExplore={() => {
                setExploring((current) => (current === spell.id ? undefined : spell.id));
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FoeSprite({ foe }: { foe: ShardrunFoeView }) {
  const url = assetUrl("creatures", foe.sprite);
  return url !== undefined ? (
    <img className="shr-foe-sprite" src={url} alt={foe.name} title={foe.flavor} draggable={false} />
  ) : (
    <div className="shr-foe-glyph" title={foe.flavor}>
      {foe.name.slice(0, 1)}
    </div>
  );
}

function FoePlate({ foe }: { foe: ShardrunFoeView }) {
  return (
    <div className="shr-plate">
      <b>{foe.name}</b>
      <div className="shr-hp" aria-label={`${foe.hp} of ${foe.max} HP`}>
        <i style={{ width: `${(foe.hp / foe.max) * 100}%` }} />
        <span>
          {foe.hp}/{foe.max}
        </span>
      </div>
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
      {foe.trait && <div className="shr-trait-text">{foe.trait.text}</div>}
    </div>
  );
}

/** One log entry, drawn: a bolt flying to its target and the number it did, a ward rising, a foe's blow landing. */
function EffectLayer({ effect, from, to }: { effect: Effect; from: Spot; to: Spot }) {
  const { entry } = effect;
  const float = (spot: Spot, text: string, tone: string) => (
    <div className={`shr-float ${tone}`} style={{ left: `${spot.x}%`, top: `${spot.y - 30}%` }}>
      {text}
    </div>
  );
  switch (entry.kind) {
    case "hit":
    case "absorb":
    case "glance": {
      const element = entry.element ?? "none";
      const bolt = boltUrl(element);
      const flight = {
        "--from-x": `${from.x + 5}%`,
        "--from-y": `${from.y - 22}%`,
        "--to-x": `${to.x}%`,
        "--to-y": `${to.y - 16}%`,
      } as CSSProperties;
      const text = entry.kind === "hit" ? `-${entry.amount ?? 0}` : entry.kind === "absorb" ? "nullified" : "glanced off";
      return (
        <Fragment>
          <div className={`shr-bolt el-${element}`} style={flight}>
            {bolt !== undefined ? <img src={bolt} alt="" /> : <i />}
          </div>
          {float(to, text, entry.kind === "hit" ? "damage late" : "muted late")}
        </Fragment>
      );
    }
    case "ward":
      return float(from, `+${entry.amount ?? 0} block`, "block");
    case "enemy":
      return float(from, `-${entry.amount ?? 0}`, "hurt");
    case "curse":
      return float(from, `-${entry.amount ?? 0} curse`, "curse");
    case "fizzle":
      return float(from, "fizzle", "muted");
    case "shield":
      return float(to, `+${entry.amount ?? 0} shield`, "block");
    case "heal":
      return float(to, `+${entry.amount ?? 0}`, "heal");
    case "stoke":
      return float(to, "stoked!", "hurt");
    case "defeat":
      return float(to, "defeated", "muted late");
    default:
      return null;
  }
}

function SpellCard(props: {
  run: ShardrunView;
  spell: SpellView;
  index: number;
  disabled: boolean;
  casting: boolean;
  onCast: () => void;
  onExplore: () => void;
}) {
  const { run, spell, index, disabled, casting, onCast, onExplore } = props;
  const preview = spell.preview;
  const counts = preview?.steps.map((step) => step.returned) ?? [];
  const canCast = !disabled && !spell.spent && preview?.affordable === true;
  const label = spell.spent ? "Spent this turn" : !preview ? "Reading the shards…" : !preview.affordable ? "Not enough mana" : "Cast";
  return (
    <article className={`shr-spell${spell.spent ? " spent" : ""}${casting ? " casting" : ""}`}>
      <header>
        <kbd>{index + 1}</kbd>
        <h3>{spell.name}</h3>
        {preview && <ManaCost cost={preview.cost} />}
      </header>
      <div className="shr-flow" aria-label="The spell step by step, with how many bolts each shard passes on">
        <span className="shr-count" title="Every spell starts from one bolt">
          1
        </span>
        {spell.shards.map((shardId, step) => (
          <Fragment key={`${shardId}-${step}`}>
            <span className="shr-arrow" aria-hidden="true">
              →
            </span>
            <span className="shr-flow-shard" title={run.shards[shardId]?.summary ?? run.shards[shardId]?.function}>
              <ShardIcon shardId={shardId} size={20} />
              {run.shards[shardId]?.name ?? shardId}
            </span>
            {counts[step] !== undefined && <span className="shr-count">{counts[step]}</span>}
          </Fragment>
        ))}
        {spell.shards.length === 0 && <span className="meta">no shards: one plain bolt</span>}
      </div>
      <div className="shr-predict">
        {preview?.misfire !== undefined ? (
          <span className="shr-misfire">Misfire: {preview.misfire.reason}</span>
        ) : preview?.result ? (
          <>
            <span>
              {preview.result.bolts} {preview.result.bolts === 1 ? "bolt" : "bolts"}
            </span>
            {/* Zero damage is worth saying out loud: it is how a nullify or a thick hide shows up before the cast. */}
            {(preview.result.potential > 0 || preview.result.block === 0) && (
              <span className="dmg">
                {preview.result.potential} damage
                {preview.result.potential > preview.result.damage && (
                  <i className="over"> ({preview.result.damage} needed)</i>
                )}
              </span>
            )}
            {preview.result.block > 0 && <span className="blk">{preview.result.block} block</span>}
          </>
        ) : preview ? (
          <span className="meta">Read the code to predict it.</span>
        ) : (
          <span className="meta">Running the shards…</span>
        )}
      </div>
      {preview !== undefined && preview.console !== "" && <pre className="shr-console">{preview.console}</pre>}
      <div className="shr-spell-actions">
        <button type="button" className="btn" onClick={onExplore} title="See the whole spell as one function">
          {"</>"} Code
        </button>
        <button type="button" className="btn primary" disabled={!canCast} onClick={onCast}>
          {label}
        </button>
      </div>
    </article>
  );
}
