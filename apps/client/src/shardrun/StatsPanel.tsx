import type { ShardrunView } from "@rootward/shared";
import { type MessageKey, useT } from "../i18n/index.ts";
import { CostRules } from "./parts.tsx";

// The Stats panel: the rules this run plays by (and what its relics changed), plus what the run has done so far.
// Everything here is the server's own numbers; nothing is recomputed in the client.

export function StatsPanel({ run }: { run: ShardrunView }) {
  const { rules } = run;
  const t = useT();
  return (
    <div className="shr-options shr-stats" role="group" aria-label={t("stats.title")}>
      <section>
        <h3>{t("stats.rules")}</h3>
        <dl className="shr-stat-rules">
          {run.modifiers.map((modifier) => (
            <div key={modifier.label}>
              <dt>{modifier.label}</dt>
              <dd>
                <b>{modifier.now}</b>
                {modifier.now !== modifier.base && (
                  <span className="meta">
                    {" "}
                    {t("stats.was", { value: modifier.base })}
                    {modifier.from.length > 0 && ` · ${modifier.from.join(", ")}`}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="meta">
          <CostRules rules={rules} /> A bolt caps at {rules.maxBoltPower} power and ×{rules.maxBoltMult}.
          Resting restores {Math.round(rules.restHealFraction * 100)}% of your Integrity, and reaching a layer{" "}
          {Math.round(rules.layerHealFraction * 100)}%.
        </p>
      </section>

      <section>
        <h3>{t("stats.run")}</h3>
        <RunTotals run={run} />
      </section>

      <section>
        <h3>{t("stats.damageBySpell")}</h3>
        <DamageBySpell run={run} />
      </section>
    </div>
  );
}

/** The counters a run keeps, as a plain list. Shown in the Stats panel and again when the run ends. */
export function RunTotals({ run }: { run: ShardrunView }) {
  const { stats } = run;
  const t = useT();
  // The key is what identifies a row; the label is whatever the current language calls it.
  const rows: [MessageKey, number][] = [
    ["stats.layers", stats.layers],
    ["stats.fights", stats.fights],
    ["stats.turns", stats.turns],
    ["stats.casts", stats.casts],
    ["stats.damage", stats.damage],
    ["stats.bestCast", stats.bestCast],
    ["stats.bolts", stats.bolts],
    ["stats.fizzled", stats.fizzled],
    ["stats.manaSpent", stats.manaSpent],
    ["stats.shards", stats.shards],
    ["stats.relics", stats.relics],
  ];
  return (
    <ul className="shr-stat-list">
      {rows.map(([key, value]) => (
        <li key={key}>
          <span>{t(key)}</span>
          <b>{value}</b>
        </li>
      ))}
    </ul>
  );
}

function DamageBySpell({ run }: { run: ShardrunView }) {
  const t = useT();
  const damage = Object.entries(run.stats.damageBySpell).sort((a, b) => b[1] - a[1]);
  const most = damage[0]?.[1] ?? 0;
  if (damage.length === 0) return <p className="meta">{t("stats.nothingYet")}</p>;
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
