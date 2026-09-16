import type { ElementView, RelicView, ShardrunRulesView, ShardView } from "@rootward/shared";
import type { ReactNode } from "react";
import { assetUrl, shardIconUrl } from "../assets/AssetRegistry.ts";

// Small pieces every Shardrun screen shares: shard and relic icons and cards, element tags, and mana costs. Each has a
// text or glyph fallback, since generated art is optional (AGENT.md).

const ELEMENT_LABEL: Readonly<Record<ElementView, string>> = {
  none: "plain",
  fire: "fire",
  frost: "frost",
  spark: "spark",
};

/** A shard's complexity class in the notation and in words (ADR-0015): what it is billed per bolt it handles. */
const COMPLEXITY: Readonly<Record<ShardView["complexity"], { notation: string; words: string }>> = {
  constant: { notation: "O(1)", words: "never walks the volley" },
  linear: { notation: "O(n)", words: "walks the volley once" },
  linearithmic: { notation: "O(n log n)", words: "sorts the volley" },
  quadratic: { notation: "O(n²)", words: "compares every pair of bolts" },
};

export function ComplexityTag({ complexity }: { complexity: ShardView["complexity"] }) {
  const { notation, words } = COMPLEXITY[complexity];
  return (
    <span
      className={`shr-complexity cx-${complexity}`}
      title={`${words}, and its work is billed accordingly`}
    >
      {notation}
    </span>
  );
}

/** How much of a pipeline's work a cast pays for. The curve, not the caps, is what a wide build lives or dies by. */
export const WORK_CURVE_WORDS: Readonly<Record<ShardrunRulesView["workCurve"], string>> = {
  linear: "all of it",
  sqrt: "its square root",
  log: "its logarithm",
};

/** The one paragraph that explains what a cast costs and how many bolts land, from the server's own numbers. */
export function CostRules({ rules }: { rules: ShardrunRulesView }) {
  return (
    <>
      A cast costs {rules.spellBaseCost} mana plus one bill for its work: every shard is charged by its
      complexity for the bolts it is handed, plus its own cost, at {rules.workPerMana} units to the mana — and
      that whole total is billed as {WORK_CURVE_WORDS[rules.workCurve]}, which is what makes a wide spell
      affordable. {rules.maxBolts} bolts land on the first layer and {rules.boltsPerLayer} more on each one
      below, up to {rules.maxBoltsEver}; the rest fizzle.
    </>
  );
}

export function boltUrl(kind: ElementView | "ward"): string | undefined {
  return assetUrl("shardrun", `bolt-${kind}`);
}

export function ElementTag({ element, prefix }: { element: ElementView; prefix?: string | undefined }) {
  const icon = boltUrl(element);
  return (
    <span className={`shr-el el-${element}`}>
      {icon !== undefined && <img src={icon} alt="" />}
      {prefix}
      {ELEMENT_LABEL[element]}
    </span>
  );
}

export function ShardIcon({ shardId, size }: { shardId: string; size: number }) {
  const url = shardIconUrl(shardId);
  return url !== undefined ? (
    <img className="shr-icon" src={url} alt="" width={size} height={size} draggable={false} />
  ) : (
    <span
      className="shr-icon glyph"
      style={{ width: size, height: size, fontSize: size * 0.6 }}
      aria-hidden="true"
    >
      ◆
    </span>
  );
}

export function RelicIcon({ relic, size }: { relic: RelicView; size: number }) {
  const url = assetUrl("shardrun", `relic-${relic.icon}`);
  return url !== undefined ? (
    <img className="shr-icon" src={url} alt="" width={size} height={size} draggable={false} />
  ) : (
    <span
      className="shr-icon glyph relic"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      aria-hidden="true"
    >
      ✦
    </span>
  );
}

export function ManaCost({ cost, of }: { cost: number; of?: "shard" }) {
  return (
    <span
      className="shr-mana"
      // A shard's cost is not flat mana any more: it is priced as work and billed on the cast's curve (ADR-0015).
      title={of === "shard" ? `${cost} mana of work, before the cast's curve` : `${cost} mana`}
    >
      {cost}
      <i aria-hidden="true" />
    </span>
  );
}

/** A shard with its rarity, cost, summary (when the difficulty shows one), and optionally its code. */
export function ShardCard({
  shard,
  showCode,
  children,
}: {
  shard: ShardView;
  showCode: boolean;
  children?: ReactNode;
}) {
  return (
    <article className={`shr-card rarity-${shard.rarity}`}>
      <header>
        <ShardIcon shardId={shard.id} size={48} />
        <div>
          <h3>{shard.name}</h3>
          <span className="meta">
            {shard.rarity} · <ComplexityTag complexity={shard.complexity} /> ·{" "}
            <code>{shard.function}(bolts, battle)</code>
          </span>
        </div>
        <ManaCost cost={shard.cost} of="shard" />
      </header>
      {shard.summary !== undefined && <p>{shard.summary}</p>}
      {shard.curse !== undefined && (
        <p className="shr-curse">Cursed: every cast burns {shard.curse} Integrity.</p>
      )}
      {shard.forge && (
        <p className="meta">
          A forge can {shard.forge.verb} it into {shard.forge.intoName}.
        </p>
      )}
      {showCode && (
        <pre className="shr-code">
          <code>{shard.code}</code>
        </pre>
      )}
      {children}
    </article>
  );
}

export function RelicCard({ relic, children }: { relic: RelicView; children?: ReactNode }) {
  return (
    <article className={`shr-card shr-relic-card relic-${relic.rarity}`}>
      <header>
        <RelicIcon relic={relic} size={48} />
        <div>
          <h3>{relic.name}</h3>
          <span className="meta">{relic.rarity === "boss" ? "guardian relic" : `${relic.rarity} relic`}</span>
        </div>
      </header>
      <p>{relic.summary}</p>
      <p className="shr-flavor">{relic.flavor}</p>
      {children}
    </article>
  );
}

/** The relics a run holds, as a row of icons that explain themselves on hover. */
export function RelicBar({
  relics,
  info,
}: {
  relics: readonly string[];
  info: Readonly<Record<string, RelicView>>;
}) {
  if (relics.length === 0) return null;
  return (
    <ul className="shr-relic-bar" aria-label="Relics">
      {relics.map((relicId) => {
        const relic = info[relicId];
        if (!relic) return null;
        return (
          <li key={relicId} title={`${relic.name}: ${relic.summary}`}>
            <RelicIcon relic={relic} size={28} />
          </li>
        );
      })}
    </ul>
  );
}
