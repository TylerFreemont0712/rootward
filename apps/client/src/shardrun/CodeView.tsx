import type { BoltOutcomeView, ShardrunView, SpellRunView, SpellView } from "@rootward/shared";
import { useEffect, useMemo, useState } from "react";
import { useShardrun } from "../state/shardrun.ts";
import { type CodeSpeed, CODE_SPEEDS, composeSpell, playbackFrames, playbackLength, type SpellSource } from "./source.ts";

/**
 * A spell as one function, running line by line (ADR-0013). The cursor walks the code at the chosen speed; the damage
 * and block counters change only where the server measured the bolts: the start, after each shard, and the end. In
 * `cast` mode it plays once and hands over to the hits, then, `finished`, folds down to its final score, which stays
 * up while the hits land (ADR-0019); in `explore` mode it can be replayed and closed. In `build` mode (a deck run's spell
 * being put together, ADR-0020) nothing plays: every measured step is shown at once, and the lines a card just brought
 * in light up, so the function is seen growing card by card.
 */
export function CodeView(props: {
  run: ShardrunView;
  spell: SpellView;
  spellRun: SpellRunView | undefined;
  speed: CodeSpeed;
  mode: "cast" | "explore" | "build";
  /** The code has run: show only the final score. */
  finished?: boolean;
  /** The score is leaving. */
  fading?: boolean;
  onDone: () => void;
}) {
  const { run, spell, spellRun, speed, mode, onDone } = props;
  const finished = props.finished === true;
  const building = mode === "build";
  const predictions = useShardrun((s) => s.predictions);
  const playSpeed = speed === "off" ? "fast" : speed;
  const source = useMemo(
    () => composeSpell(run.language, spell.name, spell.shards, run.shards, run.rules.baseBoltPower),
    [run.language, run.shards, run.rules.baseBoltPower, spell.name, spell.shards],
  );
  // A hidden prediction has no measured steps, so there is nothing to play: the code is shown still.
  const playable =
    !building &&
    spellRun !== undefined &&
    (spellRun.steps.length > 0 || spellRun.result !== undefined || spellRun.misfire !== undefined);
  const added = useAddedLines(source, spell.shards, spell.id, building);
  const frames = useMemo(
    () => (spellRun !== undefined && playable ? playbackFrames(source, spellRun, playSpeed) : []),
    [playable, spellRun, source, playSpeed],
  );
  const [take, setTake] = useState(0);
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    // A cast that is already finished (its code was skipped, or the option is off) has nothing left to play.
    if (frames.length === 0 || finished) return;
    const timers = frames.map((frame, i) =>
      window.setTimeout(() => {
        setIndex(i);
      }, frame.at),
    );
    if (mode === "cast") timers.push(window.setTimeout(onDone, playbackLength(frames, playSpeed)));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [finished, frames, mode, onDone, playSpeed, take]);

  useEffect(() => {
    document
      .getElementById(`shr-line-${spell.id}-${frames[index]?.line ?? 0}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index, frames, spell.id]);

  // The pipeline's whole bill, for the header: the same units the rules charged, summed over the steps.
  const work = (spellRun?.steps ?? []).reduce((sum, step) => sum + step.work, 0);
  const shown = frames.slice(0, index + 1);
  const current = frames[index];
  // Once finished, the score is the cast's result, however far the cursor got (a skip, or no playback at all).
  const outcome = building
    ? spellRun?.result
    : ((finished ? spellRun?.result : undefined) ?? [...shown].reverse().find((frame) => frame.outcome)?.outcome);
  const bolts = building
    ? (spellRun?.steps.at(-1)?.bolts ?? spellRun?.base.bolts ?? [])
    : ([...shown].reverse().find((frame) => frame.bolts)?.bolts ?? []);
  // Which call lines have a measured result to show beside them: the ones the cursor has passed, or while building, all.
  const reached = new Map<number, { step?: number | undefined; outcome?: BoltOutcomeView | undefined }>(
    building
      ? source.calls.flatMap((call, index) => {
          const step = spellRun?.steps[index];
          return step ? [[call.line, { step: index, outcome: step.outcome }] as const] : [];
        })
      : shown.filter((frame) => frame.mark === "step" && frame.step !== undefined).map((frame) => [frame.line, frame] as const),
  );
  const scored = playable || (building && outcome !== undefined);
  const errored = current?.mark === "error";
  const activeShard = current ? source.lines[current.line - 1]?.shard : undefined;

  return (
    <section
      className={`shr-code-view mode-${mode}${finished ? " finished" : ""}${props.fading === true ? " fading" : ""}`}
      aria-label={`${spell.name} as code`}
    >
      <header>
        <h3>{spell.name}</h3>
        {building && <span className="shr-building">building</span>}
        <span className="meta">
          {run.language} · {spell.shards.length} {run.playstyle === "deck" ? (spell.shards.length === 1 ? "card" : "cards") : spell.shards.length === 1 ? "shard" : "shards"}
          {spellRun && ` · ${spellRun.cost} mana`}
          {work > 0 && ` · ${work} work`}
        </span>
        <span className="shr-code-actions">
          {mode === "explore" && playable && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setIndex(-1);
                setTake((value) => value + 1);
              }}
            >
              Run it
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={onDone}
            title={building ? "Hide the code while building (Options turns it back on)" : undefined}
          >
            {mode === "cast" ? "Skip" : building ? "Hide" : "Close"}
          </button>
        </span>
      </header>

      {scored ? (
        <div className="shr-scoreboard" aria-live="polite">
          <div className="shr-score bolts">
            <span>bolts</span>
            <b key={`b-${outcome?.bolts ?? 0}`}>{outcome?.bolts ?? 0}</b>
          </div>
          <div className="shr-score damage">
            <span>damage</span>
            <b key={`d-${outcome?.damage ?? 0}`}>{outcome?.damage ?? 0}</b>
            {/* The score is what lands on these foes, exactly. What the volley would do to foes that cannot die is the
                footnote, so a build that outgrows its target still shows how big it got (ADR-0022, amending ADR-0016). */}
            {outcome !== undefined && outcome.potential > outcome.damage && (
              <i key={`w-${outcome.potential}`} className="shr-overkill">
                worth {outcome.potential}
                {outcome.damage > 0 && ` · ×${Math.round((outcome.potential / outcome.damage) * 10) / 10} over`}
              </i>
            )}
          </div>
          <div className="shr-score block">
            <span>block</span>
            <b key={`k-${outcome?.block ?? 0}`}>{outcome?.block ?? 0}</b>
          </div>
        </div>
      ) : (
        <p className="meta shr-code-hint">
          {!run.difficulty.showPredictions
            ? "No predictions on this difficulty: read the code, then cast it to watch it run."
            : !predictions
              ? "Predictions are off in Options: read the code, then cast it to watch it run."
              : building
                ? "Running the cards…"
                : "Reading the shards…"}
        </p>
      )}

      {bolts.length > 0 && (
        <div className="shr-bolt-row" aria-label="Bolts at this point">
          {bolts.map((bolt, i) => (
            <span
              key={i}
              className={`shr-bolt-chip el-${bolt.element}${bolt.ward ? " ward" : ""}`}
              title={`${bolt.target}${bolt.pierce ? ", pierces" : ""}`}
            >
              {bolt.ward ? "⛨" : "◆"} {bolt.power}
              {bolt.mult !== 1 && <b className="shr-bolt-mult">×{bolt.mult}</b>}
            </span>
          ))}
        </div>
      )}

      <ol className="shr-code-lines">
        {source.lines.map((line) => {
          const step = reached.get(line.number);
          // A frame only knows which call returned; the work it was billed comes from the run's own step.
          const billed = step?.step === undefined ? undefined : spellRun?.steps[step.step]?.work;
          const classes = [
            `kind-${line.kind}`,
            current?.line === line.number ? (errored ? "error" : "current") : "",
            activeShard !== undefined && line.shard === activeShard ? "active-fn" : "",
            added.has(line.number) ? "added" : "",
          ];
          return (
            <li
              key={line.number}
              id={`shr-line-${spell.id}-${line.number}`}
              className={classes.filter(Boolean).join(" ")}
            >
              <span className="shr-gutter">{line.number}</span>
              <code>{line.text || " "}</code>
              {step?.outcome && (
                <span className="shr-annotation">
                  → {step.outcome.bolts} {step.outcome.bolts === 1 ? "bolt" : "bolts"}
                  {step.outcome.damage > 0 && ` · ${step.outcome.damage} dmg`}
                  {step.outcome.block > 0 && ` · ${step.outcome.block} block`}
                  {billed !== undefined && (
                    <i className="shr-work" title="Work units this line was billed">{` · ${billed} work`}</i>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {errored && spellRun?.misfire && <p className="shr-misfire">Misfire: {spellRun.misfire.reason}</p>}
      {spellRun && spellRun.console !== "" && <pre className="shr-console">{spellRun.console}</pre>}
    </section>
  );
}

/**
 * The lines a card just played brought into a spell's code: its call and, for a card the spell did not hold yet, its
 * function. They light up for a moment, and the first of them is scrolled into view.
 */
function useAddedLines(source: SpellSource, shards: readonly string[], spellId: string, active: boolean): ReadonlySet<number> {
  const key = shards.join("|");
  const [seen, setSeen] = useState({ key, shards });
  const [lines, setLines] = useState<ReadonlySet<number>>(() => new Set());
  // LEARN: state that follows a changing prop is adjusted while rendering, not in an effect: React renders again at once
  // with the new state, and nothing on screen ever shows the stale value in between.
  if (seen.key !== key) {
    const previous = seen.shards;
    setSeen({ key, shards });
    if (active) {
      const fresh = new Set<number>();
      for (const [index, id] of shards.entries()) {
        if (previous[index] === id) continue;
        const call = source.calls[index];
        if (call) fresh.add(call.line);
        const fn = source.functions.get(id);
        if (fn && !previous.includes(id)) for (const line of [fn.defLine, ...fn.body]) fresh.add(line);
      }
      setLines(fresh);
    }
  }
  useEffect(() => {
    if (lines.size === 0) return;
    document.getElementById(`shr-line-${spellId}-${Math.min(...lines)}`)?.scrollIntoView({ block: "nearest" });
    const timer = window.setTimeout(() => {
      setLines(new Set());
    }, 1600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [lines, spellId]);
  return lines;
}

/** The speeds offered in options, with how long a line takes at each. */
export const SPEED_CHOICES: readonly { speed: CodeSpeed; label: string }[] = [
  { speed: "off", label: "Off" },
  { speed: "slow", label: `Slow (${CODE_SPEEDS.slow.line} ms a line)` },
  { speed: "normal", label: `Normal (${CODE_SPEEDS.normal.line} ms)` },
  { speed: "fast", label: `Fast (${CODE_SPEEDS.fast.line} ms)` },
];
