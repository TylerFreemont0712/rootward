import type { ElementView, ShardrunView } from "@rootward/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BattlePose } from "../assets/AssetRegistry.ts";
import { useT } from "../i18n/index.ts";
import { useShardrun } from "../state/shardrun.ts";
import { useGame } from "../state/store.ts";
import { CodeView } from "./CodeView.tsx";
import { shownIntegrity } from "./fx/pending.ts";
import { planTimeline } from "./fx/timeline.ts";
import { DragGhost, Hand, useTable } from "./Hand.tsx";
import { HeroPanel } from "./HeroPanel.tsx";
import { SpellCard } from "./SpellCard.tsx";
import { Stage } from "./Stage.tsx";

type Battle = NonNullable<ShardrunView["battle"]>;

/**
 * A turn-based battle (ADR-0012, ADR-0019): the stage, the Maintainer's portrait with their numbers in the lower left,
 * and the spells beside it. A cast first plays as code (when the code speed is not off), then its hits play over the
 * stage as effects.
 */
export function Arena({ run, battle: current, frozen }: { run: ShardrunView; battle: Battle; frozen: boolean }) {
  const t = useT();
  const staged = useShardrun((s) => s.staged);
  const beat = useShardrun((s) => s.beat);
  const shownBeat = useShardrun((s) => s.shownBeat);
  const busy = useShardrun((s) => s.busy);
  const history = useShardrun((s) => s.history);
  const command = useShardrun((s) => s.command);
  const replay = useShardrun((s) => s.replay);
  const replayFading = useShardrun((s) => s.replayFading);
  const phase = useShardrun((s) => s.phase);
  const pending = useShardrun((s) => s.pending);
  const codeSpeed = useShardrun((s) => s.codeSpeed);
  const buildCode = useShardrun((s) => s.buildCode);
  const setBuildCode = useShardrun((s) => s.setBuildCode);
  const finishReplay = useShardrun((s) => s.finishReplay);
  const markShown = useShardrun((s) => s.markShown);
  const profile = useGame((s) => s.activeProfile);
  const classes = useGame((s) => s.classes);
  const classId = profile?.classId ?? "artificer";
  const [exploring, setExploring] = useState<string | undefined>();
  const [ready, setReady] = useState<ElementView | undefined>();
  const [held, holdPose] = useHeldPose();
  const playingCode = replay !== undefined && phase === "code";
  // While a cast's code plays, the stage still shows the battle before it: the result arrives with the hits.
  const battle = playingCode && staged ? staged : current;
  const disabled = frozen || busy || playingCode;
  // A deck run (ADR-0020) plays cards from a hand into its spells; the hand is always the live battle's. Cards keep
  // moving while an answer is on its way (the table shows each move at once); only a fight's end or a cast's code stops them.
  const deck = run.playstyle === "deck";
  const table = useTable(run, current, frozen || playingCode);
  const closeExplore = useCallback(() => {
    setExploring(undefined);
  }, []);
  const hideBuild = useCallback(() => {
    setBuildCode(false);
  }, [setBuildCode]);

  // Each response's log plays once. A beat already shown (coming back to this screen) is not played again.
  const timeline = useMemo(() => {
    if (phase !== "log" || beat <= shownBeat) return undefined;
    const maxHp = Object.fromEntries(battle.foes.map((foe) => [foe.uid, foe.max]));
    return planTimeline(run.log, { maxHp, boss: battle.kind === "boss" });
  }, [phase, beat, shownBeat, run.log, battle.foes, battle.kind]);
  const started = useCallback(() => {
    markShown(beat);
  }, [beat, markShown]);

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

  // The pose on screen: whatever a cue is holding, else channelling while the cast runs as code, else readying the
  // spell under the pointer.
  const pose: BattlePose = held.pose !== "idle" ? held.pose : playingCode ? "channel" : ready !== undefined && !disabled ? "windup" : "idle";
  // The cast's own shards: a deck run's spell is blank again by the time its cast plays as code.
  const castFrom = replay ? run.spells.find((spell) => spell.id === replay.spellId) : undefined;
  const castSpell = replay && castFrom ? { ...castFrom, shards: replay.shards } : undefined;
  const exploreSpell = exploring === undefined ? undefined : run.spells.find((spell) => spell.id === exploring);
  // The cast's code while it plays, then its lingering score; a spell opened to read replaces the score.
  const castView = replay !== undefined && castSpell !== undefined && (playingCode || exploreSpell === undefined) ? { replay, spell: castSpell } : undefined;
  // While a deck run's spell is being built, its code is on screen and grows with every card (an option turns it off).
  const building = deck ? run.spells.find((spell) => spell.id === table.target) : undefined;
  const builtShards = table.table.spells.find((spell) => spell.id === building?.id)?.shards;
  const buildView =
    building && builtShards && buildCode && !frozen && castView === undefined && exploreSpell === undefined
      ? { spell: { ...building, shards: builtShards }, measured: builtShards.join() === building.shards.join() }
      : undefined;
  const className = classes.find((candidate) => candidate.id === classId)?.name;

  return (
    <div className="shr-battle">
      <Stage
        run={run}
        battle={battle}
        timeline={timeline}
        onStart={started}
        pending={playingCode ? undefined : pending}
        classId={classId}
        pose={pose}
        holdPose={holdPose}
        ready={disabled ? undefined : ready}
      >
        {castView && (
          <CodeView
            key={`cast-${castView.replay.beat}`}
            run={run}
            spell={castView.spell}
            spellRun={castView.replay.run}
            speed={codeSpeed}
            mode="cast"
            finished={!playingCode}
            fading={replayFading}
            onDone={finishReplay}
          />
        )}
        {buildView && (
          <CodeView
            key={`build-${buildView.spell.id}`}
            run={run}
            spell={buildView.spell}
            spellRun={buildView.measured ? buildView.spell.preview : undefined}
            speed={codeSpeed}
            mode="build"
            onDone={hideBuild}
          />
        )}
        {!playingCode && exploreSpell && (
          <CodeView
            key={`explore-${exploreSpell.id}-${run.revision}`}
            run={run}
            spell={exploreSpell}
            spellRun={exploreSpell.preview}
            speed={codeSpeed}
            mode="explore"
            onDone={closeExplore}
          />
        )}
      </Stage>

      <div className="shr-controls">
        <HeroPanel
          classId={classId}
          name={profile?.name ?? ""}
          className={className}
          integrity={shownIntegrity(pending, run.integrity, run.integrityMax)}
          integrityMax={run.integrityMax}
          battle={battle}
          pose={pose}
          element={held.element}
          history={history}
        >
          <button
            type="button"
            className="btn primary"
            disabled={disabled}
            onClick={() => {
              void command({ type: "end-turn" });
            }}
          >
            {t("battle.endTurn")} <kbd>E</kbd>
          </button>
        </HeroPanel>
        <div className={deck ? "shr-deck-side" : "shr-spells-side"}>
          <div className="shr-spells">
            {run.spells.map((spell, index) => (
              <SpellCard
                key={spell.id}
                run={run}
                spell={spell}
                index={index}
                disabled={disabled}
                casting={(playingCode && replay.spellId === spell.id) || (held.spell === spell.id && (held.pose === "windup" || held.pose === "cast"))}
                onCast={() => {
                  setExploring(undefined);
                  setReady(undefined);
                  void command({ type: "cast", spellId: spell.id });
                }}
                onExplore={() => {
                  setExploring((open) => (open === spell.id ? undefined : spell.id));
                }}
                onReady={setReady}
                table={deck ? table : undefined}
              />
            ))}
          </div>
          {deck && <Hand run={run} battle={current} controls={table} disabled={table.locked} />}
          {deck && <DragGhost run={run} card={table.dragging} />}
        </div>
      </div>
    </div>
  );
}

interface HeldPose {
  pose: BattlePose;
  element: ElementView;
  spell: string | undefined;
}

/** A pose that holds for a while and then settles back to idle; the element colors the portrait while casting. */
function useHeldPose(): [HeldPose, (pose: BattlePose, ms: number, element?: ElementView, spell?: string) => void] {
  const [held, setHeld] = useState<HeldPose>({ pose: "idle", element: "none", spell: undefined });
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );
  const hold = useCallback((pose: BattlePose, ms: number, element?: ElementView, spell?: string) => {
    window.clearTimeout(timer.current);
    setHeld((current) => ({ pose, element: element ?? current.element, spell: spell ?? current.spell }));
    if (Number.isFinite(ms)) {
      timer.current = window.setTimeout(() => {
        setHeld((current) => ({ ...current, pose: "idle" }));
      }, ms);
    }
  }, []);
  return [held, hold];
}
