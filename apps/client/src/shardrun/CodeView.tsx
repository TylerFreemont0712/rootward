import type { ShardrunView, SpellRunView, SpellView } from "@rootward/shared";
import { useEffect, useMemo, useState } from "react";
import { type CodeSpeed, CODE_SPEEDS, composeSpell, playbackFrames, playbackLength } from "./source.ts";

/**
 * A spell as one function, running line by line (ADR-0013). The cursor walks the code at the chosen speed; the damage
 * and block counters change only where the server measured the bolts: the start, after each shard, and the end. In
 * `cast` mode it plays once and hands over to the hits; in `explore` mode it can be replayed and closed.
 */
export function CodeView(props: {
  run: ShardrunView;
  spell: SpellView;
  spellRun: SpellRunView | undefined;
  speed: CodeSpeed;
  mode: "cast" | "explore";
  onDone: () => void;
}) {
  const { run, spell, spellRun, speed, mode, onDone } = props;
  const playSpeed = speed === "off" ? "fast" : speed;
  const source = useMemo(
    () => composeSpell(run.language, spell.name, spell.shards, run.shards, run.rules.baseBoltPower),
    [run.language, run.shards, run.rules.baseBoltPower, spell.name, spell.shards],
  );
  // A hidden prediction has no measured steps, so there is nothing to play: the code is shown still.
  const playable =
    spellRun !== undefined &&
    (spellRun.steps.length > 0 || spellRun.result !== undefined || spellRun.misfire !== undefined);
  const frames = useMemo(
    () => (spellRun !== undefined && playable ? playbackFrames(source, spellRun, playSpeed) : []),
    [playable, spellRun, source, playSpeed],
  );
  const [take, setTake] = useState(0);
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (frames.length === 0) return;
    const timers = frames.map((frame, i) =>
      window.setTimeout(() => {
        setIndex(i);
      }, frame.at),
    );
    if (mode === "cast") timers.push(window.setTimeout(onDone, playbackLength(frames, playSpeed)));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [frames, mode, onDone, playSpeed, take]);

  useEffect(() => {
    document
      .getElementById(`shr-line-${spell.id}-${frames[index]?.line ?? 0}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index, frames, spell.id]);

  // The pipeline's whole bill, for the header: the same units the rules charged, summed over the steps.
  const work = (spellRun?.steps ?? []).reduce((sum, step) => sum + step.work, 0);
  const shown = frames.slice(0, index + 1);
  const current = frames[index];
  const outcome = [...shown].reverse().find((frame) => frame.outcome)?.outcome;
  const bolts = [...shown].reverse().find((frame) => frame.bolts)?.bolts ?? [];
  const reached = new Map(
    shown
      .filter((frame) => frame.mark === "step" && frame.step !== undefined)
      .map((frame) => [frame.line, frame]),
  );
  const errored = current?.mark === "error";
  const activeShard = current ? source.lines[current.line - 1]?.shard : undefined;

  return (
    <section className={`shr-code-view mode-${mode}`} aria-label={`${spell.name} as code`}>
      <header>
        <h3>{spell.name}</h3>
        <span className="meta">
          {run.language} · {spell.shards.length} {spell.shards.length === 1 ? "shard" : "shards"}
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
          <button type="button" className="btn" onClick={onDone}>
            {mode === "cast" ? "Skip" : "Close"}
          </button>
        </span>
      </header>

      {playable ? (
        <div className="shr-scoreboard" aria-live="polite">
          <div className="shr-score bolts">
            <span>bolts</span>
            <b key={`b-${outcome?.bolts ?? 0}`}>{outcome?.bolts ?? 0}</b>
          </div>
          <div className="shr-score damage">
            <span>damage</span>
            <b key={`d-${outcome?.damage ?? 0}`}>{outcome?.damage ?? 0}</b>
          </div>
          <div className="shr-score block">
            <span>block</span>
            <b key={`k-${outcome?.block ?? 0}`}>{outcome?.block ?? 0}</b>
          </div>
        </div>
      ) : (
        <p className="meta shr-code-hint">
          {run.difficulty.showPredictions
            ? "Reading the shards…"
            : "No predictions on this difficulty: read the code, then cast it to watch it run."}
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

/** The speeds offered in options, with how long a line takes at each. */
export const SPEED_CHOICES: readonly { speed: CodeSpeed; label: string }[] = [
  { speed: "off", label: "Off" },
  { speed: "slow", label: `Slow (${CODE_SPEEDS.slow.line} ms a line)` },
  { speed: "normal", label: `Normal (${CODE_SPEEDS.normal.line} ms)` },
  { speed: "fast", label: `Fast (${CODE_SPEEDS.fast.line} ms)` },
];
