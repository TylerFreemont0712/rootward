import "../theme/shardrun.css";
import type { ShardrunView } from "@rootward/shared";
import { useEffect, useState } from "react";
import { assetUrl } from "../assets/AssetRegistry.ts";
import { Arena } from "../shardrun/Arena.tsx";
import { DevDrawer } from "../shardrun/DevDrawer.tsx";
import { SPEED_CHOICES } from "../shardrun/CodeView.tsx";
import { LayerMap } from "../shardrun/LayerMap.tsx";
import { RelicBar } from "../shardrun/parts.tsx";
import { ForgePanel, RestPanel, RewardPanel } from "../shardrun/rooms.tsx";
import { RunTotals, StatsPanel } from "../shardrun/StatsPanel.tsx";
import { Workbench } from "../shardrun/Workbench.tsx";
import { useShardrun } from "../state/shardrun.ts";
import { useGame } from "../state/store.ts";

const ENDED: ReadonlySet<ShardrunView["status"]> = new Set(["won", "lost", "abandoned"]);

/** Shardrun (ADR-0012, ADR-0013): the roguelite mode. Spells are pipelines of found code; fights are turn by turn. */
export function ShardrunScreen() {
  const profileId = useGame((s) => s.activeProfile?.id);
  const run = useShardrun((s) => s.run);
  const loaded = useShardrun((s) => s.loaded);
  const error = useShardrun((s) => s.error);
  const afterglow = useShardrun((s) => s.afterglow);
  const load = useShardrun((s) => s.load);
  const dismissError = useShardrun((s) => s.dismissError);

  useEffect(() => {
    if (profileId !== undefined) void load(profileId);
  }, [profileId, load]);

  let body;
  if (!loaded) {
    body = <p className="narr shr-loading">Lowering a lantern into the Salvage…</p>;
  } else if (afterglow) {
    body = (
      <>
        <RunHeader run={afterglow.run} />
        <Arena run={afterglow.run} battle={afterglow.battle} frozen />
      </>
    );
  } else if (!run || ENDED.has(run.status)) {
    body = <StartPanel run={run} />;
  } else if (run.status === "battle" && run.battle) {
    body = (
      <>
        <RunHeader run={run} />
        <Arena run={run} battle={run.battle} frozen={false} />
        <details className="shr-book">
          <summary>Spellbook and shard code</summary>
          <Workbench run={run} locked />
        </details>
      </>
    );
  } else {
    body = (
      <>
        <RunHeader run={run} />
        <div className="shr-between">
          <div className="shr-left">
            {run.status === "reward" && <RewardPanel run={run} />}
            {run.status === "rest" && <RestPanel run={run} />}
            {run.status === "forge" && <ForgePanel run={run} />}
            <LayerMap run={run} />
          </div>
          <Workbench key={run.id} run={run} locked={false} />
        </div>
      </>
    );
  }

  const backdrop = assetUrl("backgrounds", run?.layer.backdrop ?? "arena-salvage") ?? assetUrl("backgrounds", "salvage");
  return (
    <div className="shr-screen">
      {backdrop !== undefined && <div className="shr-backdrop" style={{ backgroundImage: `url("${backdrop}")` }} aria-hidden="true" />}
      {error !== undefined && (
        <div className="notice error" role="alert">
          {error}
          <button type="button" onClick={dismissError}>
            dismiss
          </button>
        </div>
      )}
      {body}
    </div>
  );
}

function RunHeader({ run }: { run: ShardrunView }) {
  const command = useShardrun((s) => s.command);
  const busy = useShardrun((s) => s.busy);
  const [confirming, setConfirming] = useState(false);
  // One drawer at a time: opening one closes the others.
  const [drawer, setDrawer] = useState<"none" | "stats" | "options" | "dev">("none");
  const toggle = (which: "stats" | "options" | "dev") => {
    setDrawer((open) => (open === which ? "none" : which));
  };
  return (
    <header className="shr-header">
      <span className="shr-logo">SHARDRUN</span>
      <div className="shr-integrity" aria-label={`Integrity ${run.integrity} of ${run.integrityMax}`}>
        <span>Integrity</span>
        <span className="shr-meter">
          <i style={{ width: `${(run.integrity / run.integrityMax) * 100}%` }} />
        </span>
        <b>
          {run.integrity}/{run.integrityMax}
        </b>
      </div>
      <span className="meta">
        {run.sandbox && <b className="shr-dev-tag">DEV</b>} {run.layer.name} ({run.layer.index + 1}/{run.layer.count}) · {run.difficulty.name} ·{" "}
        {run.language}
      </span>
      <RelicBar relics={run.relics} info={run.relicInfo} />
      <span className="shr-header-end">
        <button
          type="button"
          className="btn"
          aria-expanded={drawer === "stats"}
          onClick={() => {
            toggle("stats");
          }}
        >
          Stats
        </button>
        {run.sandbox && (
          <button
            type="button"
            className="btn dev"
            aria-expanded={drawer === "dev"}
            onClick={() => {
              toggle("dev");
            }}
          >
            Dev
          </button>
        )}
        <button
          type="button"
          className="btn"
          aria-expanded={drawer === "options"}
          onClick={() => {
            toggle("options");
          }}
        >
          ⚙ Options
        </button>
        {confirming ? (
          <>
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                void command({ type: "abandon" });
              }}
            >
              Abandon this run
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep going
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Abandon
          </button>
        )}
      </span>
      {drawer === "options" && <OptionsPanel />}
      {drawer === "stats" && <StatsPanel run={run} />}
      {drawer === "dev" && <DevDrawer run={run} />}
    </header>
  );
}

function OptionsPanel() {
  const codeSpeed = useShardrun((s) => s.codeSpeed);
  const setCodeSpeed = useShardrun((s) => s.setCodeSpeed);
  return (
    <div className="shr-options" role="group" aria-label="Options">
      <div className="shr-option">
        <span>Show each cast running as code</span>
        <div className="actions">
          {SPEED_CHOICES.map((choice) => (
            <button
              key={choice.speed}
              type="button"
              className={codeSpeed === choice.speed ? "btn primary" : "btn"}
              aria-pressed={codeSpeed === choice.speed}
              onClick={() => {
                setCodeSpeed(choice.speed);
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StartPanel({ run }: { run: ShardrunView | undefined }) {
  const start = useShardrun((s) => s.start);
  const busy = useShardrun((s) => s.busy);
  const languages = useShardrun((s) => s.languages);
  const difficulties = useShardrun((s) => s.difficulties);
  const difficulty = useShardrun((s) => s.difficulty);
  const setDifficulty = useShardrun((s) => s.setDifficulty);
  const dev = useShardrun((s) => s.dev);
  const showMenu = useGame((s) => s.showMenu);
  const showCodex = useGame((s) => s.showCodex);
  const emblem = assetUrl("brand", "shardrun");
  return (
    <section className="shr-start">
      {emblem !== undefined && <img className="shr-emblem" src={emblem} alt="" />}
      <h1 className="shr-title">SHARDRUN</h1>
      <p className="narr">
        Under the Bastion lies the Salvage: old programs, broken into shards. Every shard is a real function. Chain them into spells,
        climb through three layers of the Machine, and find out what your code can do.
      </p>
      {run && <EndSummary run={run} />}

      <div className="shr-difficulties" role="radiogroup" aria-label="Difficulty">
        {difficulties.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={difficulty === option.id}
            className={`shr-difficulty${difficulty === option.id ? " chosen" : ""}`}
            onClick={() => {
              setDifficulty(option.id);
            }}
          >
            <b>{option.name}</b>
            <span>{option.summary}</span>
          </button>
        ))}
      </div>

      <div className="actions">
        {languages.map((language) => (
          <button
            key={language}
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => {
              void start(language);
            }}
          >
            {run ? "New run" : "Descend"} in {language}
          </button>
        ))}
        {dev &&
          languages.map((language) => (
            <button
              key={`sandbox-${language}`}
              type="button"
              className="btn dev"
              disabled={busy}
              onClick={() => {
                void start(language, true);
              }}
            >
              Sandbox in {language}
            </button>
          ))}
        {languages.length === 0 && <span className="meta">No Python or JavaScript sandbox is available on this machine yet.</span>}
        <button type="button" className="btn" onClick={showCodex}>
          Codex
        </button>
        <button type="button" className="btn" onClick={showMenu}>
          Main menu
        </button>
      </div>
      <ul className="shr-howto">
        <li>
          <b>A shard is a function</b> that takes a list of bolts and the battle, and returns bolts.
        </li>
        <li>
          <b>A spell runs its shards in order</b>, starting from one plain bolt. Press <code>{"</>"} Code</code> on a spell to see it as
          one function, and watch every cast run line by line.
        </li>
        <li>
          <b>Every bolt a shard handles costs mana</b>, and bolts past the cap fizzle, so a loop that makes a thousand bolts wins nothing.
        </li>
        <li>
          <b>Relics</b> bend the rules for the rest of a run. Guardians guard the best of them.
        </li>
      </ul>
    </section>
  );
}

function EndSummary({ run }: { run: ShardrunView }) {
  const title = run.status === "won" ? "The Machine is cleared" : run.status === "lost" ? "Kernel panic" : "You climbed back out";
  return (
    <div className={`shr-end ${run.status}`}>
      <h2 className="crt-title">{title}</h2>
      <RunTotals run={run} />
    </div>
  );
}
