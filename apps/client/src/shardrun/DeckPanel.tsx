import type { ShardrunView } from "@rootward/shared";
import { useState } from "react";
import { CostRules, ShardCard, ShardIcon } from "./parts.tsx";

// A deck run's deck (ADR-0020), in the place the spellbook's workbench takes in a spellbook run: every card with how many
// copies the deck holds, the blank spells cards are played into, and the code of whichever card is being looked at.

const RARITY_ORDER = ["common", "uncommon", "rare"] as const;

/** One entry per kind of card, with its count, commons first and then by name. */
export function groupCards(deck: readonly string[], shards: ShardrunView["shards"]): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const card of deck) counts.set(card, (counts.get(card) ?? 0) + 1);
  const rank = (id: string) => RARITY_ORDER.indexOf(shards[id]?.rarity ?? "common");
  return [...counts]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => rank(a.id) - rank(b.id) || (shards[a.id]?.name ?? a.id).localeCompare(shards[b.id]?.name ?? b.id));
}

export function DeckPanel({ run }: { run: ShardrunView }) {
  const entries = groupCards(run.deck, run.shards);
  const [inspected, setInspected] = useState<string | undefined>(entries[0]?.id);
  const shard = inspected === undefined ? undefined : run.shards[inspected];
  const { deck } = run.rules;
  return (
    <section className="shr-bench shr-deck" aria-labelledby="shr-deck-title">
      <h2 id="shr-deck-title" className="crt-title">
        Deck
      </h2>
      <p className="meta">
        {run.deck.length} cards. Every fight shuffles them and deals {deck.handSize} a turn; play cards into a spell in the order they
        should run. A cast spends its cards, and the end of a turn lets the rest go.
      </p>
      <div className="shr-deck-spells">
        {run.spells.map((spell) => (
          <div className="shr-spellname" key={spell.id}>
            <b>{spell.name}</b>
            <span className="meta">
              {spell.capacity} {spell.capacity === 1 ? "slot" : "slots"}
            </span>
          </div>
        ))}
      </div>
      <div className="shr-deck-cards">
        {entries.map(({ id, count }) => {
          const card = run.shards[id];
          const looking = inspected === id;
          return (
            <button
              key={id}
              type="button"
              className={`shr-chip rarity-${card?.rarity ?? "common"}${looking ? " selected" : ""}`}
              aria-pressed={looking}
              title={card?.summary}
              onClick={() => {
                setInspected(id);
              }}
              onMouseEnter={() => {
                setInspected(id);
              }}
            >
              <ShardIcon shardId={id} size={24} />
              <span>{card?.name ?? id}</span>
              <b className="shr-deck-count">×{count}</b>
            </button>
          );
        })}
      </div>
      {shard && <ShardCard shard={shard} showCode />}
      <p className="meta shr-rules">
        A turn gives {deck.manaPerTurn} mana on the first layer and {deck.manaPerLayer} more on each one below. <CostRules rules={run.rules} />
      </p>
    </section>
  );
}
