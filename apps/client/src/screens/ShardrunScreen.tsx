import "../theme/shardrun.css";
import type { ShardrunView } from "@rootward/shared";
import { useEffect, useState } from "react";
import { assetUrl } from "../assets/AssetRegistry.ts";
import { Arena } from "../shardrun/Arena.tsx";
import { ForgePanel, RestPanel, RewardPanel, SalvageMap } from "../shardrun/rooms.tsx";
import { Workbench } from "../shardrun/Workbench.tsx";
import { useShardrun } from "../state/shardrun.ts";
import { useGame } from "../state/store.ts";

const ENDED: ReadonlySet<ShardrunView["status"]> = new Set(["won", "lost", "abandoned"]);

/** Shardrun (ADR-0012): the roguelite mode. Spells are pipelines of found code; fights are turn by turn. */
export function ShardrunScreen() {
  const profileId = useGame((s) => s.activeProfile?.id);
  const run = useShardrun((s) => s.run);
  const loaded = useShardrun((s) => s.loaded);
  const languages = useShardrun((s) => s.languages);
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
    body = <StartPanel run={run} languages={languages} />;
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
            <SalvageMap run={run} />
          </div>
          <Workbench key={run.id} run={run} locked={false} />
        </div>
      </>
    );
  }

  const backdrop = assetUrl("backgrounds", "salvage");
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
  const depth = run.floors.filter((floor) => floor.some((node) => node.state === "visited")).length;
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
        Floor {Math.max(1, depth)} of {run.floors.length} · shards in {run.language}
      </span>
      <span className="shr-header-end">
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
    </header>
  );
}

function StartPanel({ run, languages }: { run: ShardrunView | undefined; languages: string[] }) {
  const start = useShardrun((s) => s.start);
  const busy = useShardrun((s) => s.busy);
  const showWorld = useGame((s) => s.showWorld);
  const emblem = assetUrl("brand", "shardrun");
  return (
    <section className="shr-start">
      {emblem !== undefined && <img className="shr-emblem" src={emblem} alt="" />}
      <h1 className="shr-title">SHARDRUN</h1>
      <p className="narr">
        Under the Bastion lies the Salvage: old programs, broken into shards. Every shard is a real function. Chain them into spells,
        fight your way down, and find out what your code can do.
      </p>
      {run && <EndSummary run={run} />}
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
        {languages.length === 0 && <span className="meta">No Python or JavaScript sandbox is available on this machine yet.</span>}
        <button type="button" className="btn" onClick={showWorld}>
          Back to the Bastion
        </button>
      </div>
      <ul className="shr-howto">
        <li>
          <b>A shard is a function</b> that takes a list of bolts and the battle, and returns bolts.
        </li>
        <li>
          <b>A spell runs its shards in order</b>, starting from one plain bolt. Order matters: amplify then fork is not fork then
          amplify.
        </li>
        <li>
          <b>Every bolt a shard handles costs mana</b>, and bolts past the cap fizzle, so a loop that makes a thousand bolts wins nothing.
        </li>
        <li>
          <b>Runs are short.</b> Fall, and you start again, knowing a little more.
        </li>
      </ul>
    </section>
  );
}

function EndSummary({ run }: { run: ShardrunView }) {
  const title = run.status === "won" ? "The Salvage is cleared" : run.status === "lost" ? "Kernel panic" : "You climbed back out";
  return (
    <div className={`shr-end ${run.status}`}>
      <h2 className="crt-title">{title}</h2>
      <p className="meta">
        {run.stats.fights} fights · {run.stats.turns} turns · {run.stats.casts} casts · {run.stats.damage} damage ·{" "}
        {run.stats.shards} shards salvaged
      </p>
    </div>
  );
}
