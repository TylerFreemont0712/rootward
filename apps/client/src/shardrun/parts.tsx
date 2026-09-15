import type { ElementView, ShardView } from "@rootward/shared";
import type { ReactNode } from "react";
import { assetUrl, shardIconUrl } from "../assets/AssetRegistry.ts";

// Small pieces every Shardrun screen shares: shard icons and cards, element tags, and mana costs. Each has a text or
// glyph fallback, since generated art is optional (AGENT.md).

const ELEMENT_LABEL: Readonly<Record<ElementView, string>> = { none: "plain", fire: "fire", frost: "frost", spark: "spark" };

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
    <span className="shr-icon glyph" style={{ width: size, height: size, fontSize: size * 0.6 }} aria-hidden="true">
      ◆
    </span>
  );
}

export function ManaCost({ cost }: { cost: number }) {
  return (
    <span className="shr-mana" title={`${cost} mana`}>
      {cost}
      <i aria-hidden="true" />
    </span>
  );
}

/** A shard with its rarity, cost, summary, and (optionally) its code: the thing a player is deciding about. */
export function ShardCard({ shard, showCode, children }: { shard: ShardView; showCode: boolean; children?: ReactNode }) {
  return (
    <article className={`shr-card rarity-${shard.rarity}`}>
      <header>
        <ShardIcon shardId={shard.id} size={48} />
        <div>
          <h3>{shard.name}</h3>
          <span className="meta">
            {shard.rarity} · <code>{shard.function}(bolts, battle)</code>
          </span>
        </div>
        <ManaCost cost={shard.cost} />
      </header>
      <p>{shard.summary}</p>
      {shard.curse !== undefined && <p className="shr-curse">Cursed: every cast burns {shard.curse} Integrity.</p>}
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
