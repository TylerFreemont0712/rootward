import "../theme/shardrun.css";
import type { CodexFoeView, CodexRelicView, CodexShardView, ShardrunCodexResponse } from "@rootward/shared";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.ts";
import { assetUrl } from "../assets/AssetRegistry.ts";
import { ElementTag, RelicCard, ShardCard, ShardIcon } from "../shardrun/parts.tsx";
import { useShardrun } from "../state/shardrun.ts";
import { useGame } from "../state/store.ts";

// The Codex: everything Shardrun content holds, readable outside a run. While a run is going it can be narrowed to what
// that run actually carries, which is the fastest way to answer "what do I have, and what does it do?".

type Tab = "shards" | "relics" | "foes" | "rules";
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "shards", label: "Shards" },
  { id: "relics", label: "Relics" },
  { id: "foes", label: "Foes" },
  { id: "rules", label: "Rules" },
];
const LANGUAGES = ["python", "javascript"] as const;

export function CodexScreen() {
  const run = useShardrun((s) => s.run);
  const showMenu = useGame((s) => s.showMenu);
  const showShardrun = useGame((s) => s.showShardrun);
  const [language, setLanguage] = useState<string>(run?.language ?? "python");
  // LEARN: the loaded Codex carries the language it is for, so switching language shows "loading" without an effect
  // having to clear state first (a synchronous setState in an effect costs a second render pass).
  const [loaded, setLoaded] = useState<{ language: string; data: ShardrunCodexResponse } | undefined>();
  const [error, setError] = useState<string | undefined>();
  const codex = loaded?.language === language ? loaded.data : undefined;
  const [tab, setTab] = useState<Tab>("shards");
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState(false);

  useEffect(() => {
    let current = true;
    api
      .shardrunCodex(language)
      .then((data) => {
        if (!current) return;
        setLoaded({ language, data });
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      current = false;
    };
  }, [language]);

  /** What this run carries right now: its spells' shards, spares, and relics. */
  const held = useMemo(() => {
    if (!run) return undefined;
    return {
      shards: new Set([...run.spells.flatMap((spell) => spell.shards), ...run.inventory]),
      relics: new Set(run.relics),
    };
  }, [run]);

  const needle = search.trim().toLowerCase();
  const matches = (...fields: (string | undefined)[]) => needle === "" || fields.some((field) => field?.toLowerCase().includes(needle));
  const shards = (codex?.shards ?? []).filter(
    (entry) =>
      (!mine || held?.shards.has(entry.shard.id) === true) &&
      matches(entry.shard.name, entry.shard.summary, entry.shard.code, entry.shard.tags.join(" "), entry.shard.rarity),
  );
  const relics = (codex?.relics ?? []).filter(
    (entry) => (!mine || held?.relics.has(entry.relic.id) === true) && matches(entry.relic.name, entry.relic.summary, entry.relic.flavor, entry.relic.rarity),
  );
  const foes = (codex?.foes ?? []).filter((foe) => matches(foe.name, foe.flavor, foe.trait?.name, foe.layers.map((layer) => layer.name).join(" ")));

  return (
    <div className="shr-screen codex-screen">
      <header className="shr-header">
        <span className="shr-logo">CODEX</span>
        <span className="meta">Every shard, relic, and foe in the Salvage</span>
        <span className="shr-header-end">
          {run && (
            <button type="button" className="btn" onClick={showShardrun}>
              Back to the run
            </button>
          )}
          <button type="button" className="btn" onClick={showMenu}>
            Main menu
          </button>
        </span>
      </header>

      <div className="codex-controls">
        <div className="codex-tabs" role="tablist" aria-label="Codex sections">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={tab === entry.id ? "btn primary" : "btn"}
              onClick={() => {
                setTab(entry.id);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="text-input"
          placeholder="Search name, code, or tag"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          aria-label="Search the Codex"
        />
        <div className="actions" role="group" aria-label="Code language">
          {LANGUAGES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={language === option}
              className={language === option ? "btn primary" : "btn"}
              onClick={() => {
                setLanguage(option);
              }}
            >
              {option}
            </button>
          ))}
        </div>
        {held && (
          <button type="button" className={mine ? "btn primary" : "btn"} aria-pressed={mine} onClick={() => { setMine((value) => !value); }}>
            Only what this run carries
          </button>
        )}
      </div>

      {error !== undefined && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!codex && error === undefined && <p className="narr shr-loading">Opening the Codex…</p>}

      {codex && tab === "shards" && (
        <section className="shr-cards codex-grid" aria-label="Shards">
          {shards.map((entry) => (
            <CodexShard key={entry.shard.id} entry={entry} />
          ))}
          {shards.length === 0 && <p className="meta">Nothing matches that.</p>}
        </section>
      )}

      {codex && tab === "relics" && (
        <section className="shr-cards codex-grid" aria-label="Relics">
          {relics.map((entry) => (
            <CodexRelic key={entry.relic.id} entry={entry} />
          ))}
          {relics.length === 0 && <p className="meta">Nothing matches that.</p>}
        </section>
      )}

      {codex && tab === "foes" && (
        <section className="shr-cards codex-grid" aria-label="Foes">
          {foes.map((foe) => (
            <CodexFoe key={foe.id} foe={foe} />
          ))}
          {foes.length === 0 && <p className="meta">Nothing matches that.</p>}
        </section>
      )}

      {codex && tab === "rules" && <CodexRules codex={codex} />}
    </div>
  );
}

function CodexShard({ entry }: { entry: CodexShardView }) {
  return (
    <ShardCard shard={entry.shard} showCode>
      <p className="meta">
        {entry.shard.tags.length > 0 && <>Teaches: {entry.shard.tags.join(", ")}. </>}
        {entry.found.length > 0 ? `Found in ${entry.found.join(", ")}.` : "Not found in runs."}
      </p>
    </ShardCard>
  );
}

function CodexRelic({ entry }: { entry: CodexRelicView }) {
  return (
    <RelicCard relic={entry.relic}>
      <p className="meta">{entry.found.length > 0 ? `Found in ${entry.found.join(", ")}.` : "Not found in runs."}</p>
    </RelicCard>
  );
}

function CodexFoe({ foe }: { foe: CodexFoeView }) {
  const sprite = assetUrl("creatures", foe.sprite);
  return (
    <article className="shr-card codex-foe">
      <header>
        {sprite !== undefined ? <img className="codex-foe-sprite" src={sprite} alt="" /> : <ShardIcon shardId={foe.id} size={48} />}
        <div>
          <h3>{foe.name}</h3>
          <span className="meta">
            {foe.hp} HP · {foe.layers.map((layer) => `${layer.name} (${layer.role})`).join(", ")}
          </span>
        </div>
      </header>
      <div className="shr-tags">
        {foe.weak.map((element) => (
          <ElementTag key={`weak-${element}`} element={element} prefix="weak: " />
        ))}
        {foe.resist.map((element) => (
          <ElementTag key={`resist-${element}`} element={element} prefix="resists " />
        ))}
        {foe.trait && (
          <span className="shr-tag trait" title={foe.trait.text}>
            {foe.trait.name}
          </span>
        )}
      </div>
      {foe.trait && <p className="meta">{foe.trait.text}</p>}
      <ol className="codex-intents">
        {foe.intents.map((intent, index) => (
          <li key={index}>{intent.text}</li>
        ))}
      </ol>
      <p className="shr-flavor">{foe.flavor}</p>
    </article>
  );
}

function CodexRules({ codex }: { codex: ShardrunCodexResponse }) {
  const { rules } = codex;
  const lines: [string, string][] = [
    ["Mana each turn", `${rules.manaPerTurn}`],
    ["Every spell starts from", `one ${rules.baseBoltPower}-power bolt`],
    ["A cast costs", `${rules.spellBaseCost} mana, plus each shard's cost, plus 1 per ${rules.workPerMana} bolts its shards handle`],
    ["Bolts that land", `the first ${rules.maxBolts}; the rest fizzle`],
    ["Strongest a bolt can be", `${rules.maxBoltPower} power`],
    ["Hitting a weakness", `×${rules.weakMultiplier}`],
    ["Hitting a resistance", `×${rules.resistMultiplier}`],
    ["A bolt aimed at everyone", `×${rules.scatterMultiplier} each`],
    ["Wrong element against a pattern ward", `×${rules.patternOffMultiplier}`],
    ["Resting restores", `${Math.round(rules.restHealFraction * 100)}% of your Integrity`],
    ["Reaching the next layer restores", `${Math.round(rules.layerHealFraction * 100)}%`],
    ["Spellbook", `up to ${rules.maxSpells} spells, ${rules.maxSpellCapacity} slots each`],
  ];
  return (
    <section className="shr-room codex-rules" aria-label="Rules">
      <h2 className="crt-title">The rules every run plays by</h2>
      <p className="meta">Relics change these during a run; the run's own Stats panel shows what yours are now.</p>
      <dl>
        {lines.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3>Layers</h3>
      <ul className="codex-layers">
        {codex.layers.map((layer) => (
          <li key={layer.id}>
            <b>{layer.name}</b> — {layer.rows} rows, guarded by {layer.bosses.join(", ")}. <span className="shr-flavor">{layer.flavor}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
