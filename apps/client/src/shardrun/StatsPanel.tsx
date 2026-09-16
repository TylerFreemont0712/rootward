import type { ShardrunView } from "@rootward/shared";

// The Stats panel: the rules this run plays by (and what its relics changed), plus what the run has done so far.
// Everything here is the server's own numbers; nothing is recomputed in the client.

export function StatsPanel({ run }: { run: ShardrunView }) {
  const { rules } = run;
  return (
    <div className="shr-options shr-stats" role="group" aria-label="Stats">
      <section>
        <h3>The rules you play by</h3>
        <dl className="shr-stat-rules">
          {run.modifiers.map((modifier) => (
            <div key={modifier.label}>
              <dt>{modifier.label}</dt>
              <dd>
                <b>{modifier.now}</b>
                {modifier.now !== modifier.base && (
                  <span className="meta">
                    {" "}
                    was {modifier.base}
                    {modifier.from.length > 0 && ` · ${modifier.from.join(", ")}`}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="meta">
          A cast costs {rules.spellBaseCost} mana, plus each shard&apos;s cost, plus 1 for every {rules.workPerMana} bolts its shards handle.
          The first {rules.maxBolts} bolts land and the rest fizzle; a bolt caps at {rules.maxBoltPower} power. Resting restores{" "}
          {Math.round(rules.restHealFraction * 100)}% of your Integrity, and reaching a layer {Math.round(rules.layerHealFraction * 100)}%.
        </p>
      </section>

      <section>
        <h3>This run</h3>
        <RunTotals run={run} />
      </section>

      <section>
        <h3>Damage by spell</h3>
        <DamageBySpell run={run} />
      </section>
    </div>
  );
}

/** The counters a run keeps, as a plain list. Shown in the Stats panel and again when the run ends. */
export function RunTotals({ run }: { run: ShardrunView }) {
  const { stats } = run;
  const rows: [string, number][] = [
    ["Layers cleared", stats.layers],
    ["Fights", stats.fights],
    ["Turns", stats.turns],
    ["Casts", stats.casts],
    ["Damage dealt", stats.damage],
    ["Bolts fired", stats.bolts],
    ["Bolts fizzled", stats.fizzled],
    ["Mana spent", stats.manaSpent],
    ["Shards salvaged", stats.shards],
    ["Relics claimed", stats.relics],
  ];
  return (
    <ul className="shr-stat-list">
      {rows.map(([label, value]) => (
        <li key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </li>
      ))}
    </ul>
  );
}

function DamageBySpell({ run }: { run: ShardrunView }) {
  const damage = Object.entries(run.stats.damageBySpell).sort((a, b) => b[1] - a[1]);
  const most = damage[0]?.[1] ?? 0;
  if (damage.length === 0) return <p className="meta">Nothing has landed yet.</p>;
  return (
    <ul className="shr-stat-bars">
      {damage.map(([spellId, value]) => (
        <li key={spellId}>
          <span>{run.spells.find((spell) => spell.id === spellId)?.name ?? spellId}</span>
          <span className="shr-stat-bar" aria-hidden="true">
            <i style={{ width: `${most === 0 ? 0 : (value / most) * 100}%` }} />
          </span>
          <b>{value}</b>
        </li>
      ))}
    </ul>
  );
}
