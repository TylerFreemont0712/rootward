import type { ShardrunView, ShardView } from "@rootward/shared";
import { ComplexityTag, ShardIcon } from "./parts.tsx";

// A shard as a card (ADR-0020): a deck run's shards are its cards, so they are drawn like cards, with a cost gem, the
// shard's art, its name, what it does, and a frame in its rarity's color. Sizes: `hand` in the hand, `deck` in the Deck
// drawer and the deck panel, `mini` in a spell's slots and the hold.

export type CardSize = "hand" | "deck" | "mini";

const ICON: Readonly<Record<CardSize, number>> = { hand: 56, deck: 44, mini: 30 };

export function CardFace({
  run,
  shardId,
  size,
  count,
  badge,
}: {
  run: Pick<ShardrunView, "shards">;
  shardId: string;
  size: CardSize;
  /** Copies, shown as ×n when more than one. */
  count?: number;
  /** A word across the card's foot, such as "held". */
  badge?: string | undefined;
}) {
  const shard: ShardView | undefined = run.shards[shardId];
  return (
    <span className={`shr-cardface size-${size} rarity-${shard?.rarity ?? "common"}`}>
      <span className="shr-cardface-cost" title={`${shard?.cost ?? 0} mana of work, before the cast's curve`}>
        {shard?.cost ?? 0}
      </span>
      {size !== "mini" && shard && (
        <span className="shr-cardface-cx">
          <ComplexityTag complexity={shard.complexity} />
        </span>
      )}
      <span className="shr-cardface-art">
        <ShardIcon shardId={shardId} size={ICON[size]} />
      </span>
      <b className="shr-cardface-name">{shard?.name ?? shardId}</b>
      {size !== "mini" && (
        <span className="shr-cardface-text">
          {/* On Programmer there are no summaries: the card says which function it is, and the code says the rest. */}
          {shard?.summary ?? `${shard?.function ?? shardId}(bolts, battle)`}
        </span>
      )}
      {count !== undefined && count > 1 && <span className="shr-cardface-count">×{count}</span>}
      {badge !== undefined && <span className="shr-cardface-badge">{badge}</span>}
    </span>
  );
}

/** Cards grouped by kind with their counts, commons first and then by name. */
export function groupCards(cards: readonly string[], shards: ShardrunView["shards"]): { id: string; count: number }[] {
  const order = ["common", "uncommon", "rare"];
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card, (counts.get(card) ?? 0) + 1);
  const rank = (id: string) => order.indexOf(shards[id]?.rarity ?? "common");
  return [...counts]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => rank(a.id) - rank(b.id) || (shards[a.id]?.name ?? a.id).localeCompare(shards[b.id]?.name ?? b.id));
}
