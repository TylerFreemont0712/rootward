import type { ShardrunCodexResponse, ShardrunView } from "@rootward/shared";
import { useEffect, useState } from "react";
import { api } from "../api/client.ts";
import { useShardrun } from "../state/shardrun.ts";

// The dev drawer (ADR-0013): the sandbox tools. This is only rendered for a run whose `sandbox` is true, and the server
// refuses every one of these unless it was started with ROOTWARD_DEV *and* the run is a sandbox, so the guard is real
// rather than a hidden button. Nothing here computes a rule: each click is a command the engine applies.

export function DevDrawer({ run }: { run: ShardrunView }) {
  const devCommand = useShardrun((s) => s.devCommand);
  const busy = useShardrun((s) => s.busy);
  // Keyed by language so the render picks the matching data instead of an effect writing state during the render pass.
  const [loaded, setLoaded] = useState<{ language: string; data: ShardrunCodexResponse } | undefined>();
  const [failed, setFailed] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [spellName, setSpellName] = useState("Test Spell");
  const [capacity, setCapacity] = useState(4);
  const [integrity, setIntegrity] = useState(run.integrityMax);
  const [mana, setMana] = useState(9);
  const [party, setParty] = useState<string[]>([]);
  const codex = loaded?.language === run.language ? loaded.data : undefined;

  useEffect(() => {
    let cancelled = false;
    const language = run.language;
    api
      .shardrunCodex(language)
      .then((data) => {
        if (!cancelled) setLoaded({ language, data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailed(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [run.language]);

  const held = new Set(run.relics);
  const matches = (name: string, id: string) => {
    const needle = search.trim().toLowerCase();
    return needle === "" || name.toLowerCase().includes(needle) || id.toLowerCase().includes(needle);
  };

  return (
    <div className="shr-options shr-dev" role="group" aria-label="Dev tools">
      <section className="shr-dev-wide">
        <h3>Sandbox</h3>
        <p className="meta">
          Nothing here is earned. Grant what you want to try, then play the run as normal — the rules, costs, and sandbox are the real ones.
        </p>
        <input
          type="search"
          placeholder="Filter shards, relics, and foes"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        {failed !== undefined && <p className="meta">The Codex could not be read: {failed}</p>}
      </section>

      <section>
        <h3>Grant a shard</h3>
        <div className="shr-dev-chips shr-dev-scroll">
          {codex?.shards
            .filter((entry) => matches(entry.shard.name, entry.shard.id))
            .map((entry) => (
              <button
                key={entry.shard.id}
                type="button"
                className="shr-dev-chip"
                disabled={busy}
                title={entry.shard.summary}
                onClick={() => {
                  void devCommand({ type: "grant-shard", shardId: entry.shard.id });
                }}
              >
                {entry.shard.name}
              </button>
            ))}
        </div>
      </section>

      <section>
        <h3>Relics</h3>
        <div className="shr-dev-chips shr-dev-scroll">
          {codex?.relics
            .filter((entry) => matches(entry.relic.name, entry.relic.id))
            .map((entry) => {
              const on = held.has(entry.relic.id);
              return (
                <button
                  key={entry.relic.id}
                  type="button"
                  className={on ? "shr-dev-chip on" : "shr-dev-chip"}
                  disabled={busy}
                  title={entry.relic.summary}
                  onClick={() => {
                    void devCommand(on ? { type: "remove-relic", relicId: entry.relic.id } : { type: "grant-relic", relicId: entry.relic.id });
                  }}
                >
                  {entry.relic.name}
                </button>
              );
            })}
        </div>
      </section>

      <section>
        <h3>Add a spell</h3>
        <div className="shr-dev-row">
          <input
            type="text"
            aria-label="Spell name"
            value={spellName}
            onChange={(event) => {
              setSpellName(event.target.value);
            }}
          />
        </div>
        <div className="shr-dev-row">
          <label htmlFor="dev-capacity">Slots</label>
          <input
            id="dev-capacity"
            type="number"
            min={1}
            max={8}
            value={capacity}
            onChange={(event) => {
              setCapacity(Number(event.target.value));
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={busy || spellName.trim() === ""}
            onClick={() => {
              void devCommand({ type: "grant-spell", name: spellName.trim(), capacity: Math.max(1, Math.min(8, capacity)) });
            }}
          >
            Add
          </button>
        </div>
      </section>

      <section>
        <h3>Set</h3>
        <div className="shr-dev-row">
          <label htmlFor="dev-integrity">Integrity</label>
          <input
            id="dev-integrity"
            type="number"
            min={0}
            max={run.integrityMax}
            value={integrity}
            onChange={(event) => {
              setIntegrity(Number(event.target.value));
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              void devCommand({ type: "set", integrity: Math.max(0, integrity) });
            }}
          >
            Apply
          </button>
        </div>
        <div className="shr-dev-row">
          <label htmlFor="dev-mana">Mana</label>
          <input
            id="dev-mana"
            type="number"
            min={0}
            max={99}
            value={mana}
            onChange={(event) => {
              setMana(Number(event.target.value));
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={busy || !run.battle}
            onClick={() => {
              void devCommand({ type: "set", mana: Math.max(0, mana) });
            }}
          >
            Apply
          </button>
        </div>
      </section>

      <section>
        <h3>Spawn a fight</h3>
        <div className="shr-dev-chips shr-dev-scroll">
          {codex?.foes
            .filter((foe) => matches(foe.name, foe.id))
            .map((foe) => (
              <button
                key={foe.id}
                type="button"
                className="shr-dev-chip"
                disabled={busy || party.length >= 4}
                title={foe.flavor}
                onClick={() => {
                  setParty((chosen) => (chosen.length >= 4 ? chosen : [...chosen, foe.id]));
                }}
              >
                {foe.name}
              </button>
            ))}
        </div>
        <div className="shr-dev-row">
          <span className="meta">{party.length === 0 ? "No foes chosen" : party.join(", ")}</span>
          {party.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setParty([]);
              }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="shr-dev-row">
          {(["fight", "elite", "boss"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="btn"
              disabled={busy || party.length === 0}
              onClick={() => {
                void devCommand({ type: "spawn", kind, foes: party });
                setParty([]);
              }}
            >
              {kind}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Jump</h3>
        <div className="shr-dev-row">
          <button
            type="button"
            className="btn"
            disabled={busy || !run.battle}
            onClick={() => {
              void devCommand({ type: "end-battle", outcome: "win" });
            }}
          >
            Win the fight
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={busy || !run.battle}
            onClick={() => {
              void devCommand({ type: "end-battle", outcome: "lose" });
            }}
          >
            Lose
          </button>
        </div>
        <div className="shr-dev-row">
          {Array.from({ length: run.layer.count }, (_, index) => (
            <button
              key={index}
              type="button"
              className={index === run.layer.index ? "btn primary" : "btn"}
              disabled={busy}
              onClick={() => {
                void devCommand({ type: "goto-layer", layer: index });
              }}
            >
              Layer {index + 1}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
