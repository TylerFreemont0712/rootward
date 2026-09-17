import type { ShardrunView } from "@rootward/shared";
import { useState } from "react";
import { CardFace, groupCards } from "./Card.tsx";
import { CostRules, ShardCard } from "./parts.tsx";

// A deck run's deck (ADR-0020). Between fights, `DeckPanel` takes the place the spellbook's workbench has in a spellbook
// run: every card as a card, with how many copies the deck holds, and the code of whichever card is looked at. In the
// run header, `DeckDrawer` shows the same deck at any time, and during a fight where every card is: in the draw pile,
// the discard pile, or held.

/** Cards grouped by kind, each a button that shows its code. */
function CardGrid({ run, cards, onLook, looking }: { run: ShardrunView; cards: readonly string[]; onLook?: (id: string) => void; looking?: string | undefined }) {
  return (
    <div className="shr-card-grid">
      {groupCards(cards, run.shards).map(({ id, count }) =>
        onLook ? (
          <button
            key={id}
            type="button"
            className={`shr-card-button${looking === id ? " looking" : ""}`}
            aria-pressed={looking === id}
            title={run.shards[id]?.summary}
            onClick={() => {
              onLook(id);
            }}
            onMouseEnter={() => {
              onLook(id);
            }}
          >
            <CardFace run={run} shardId={id} size="deck" count={count} />
          </button>
        ) : (
          <CardFace key={id} run={run} shardId={id} size="deck" count={count} />
        ),
      )}
    </div>
  );
}

export function DeckPanel({ run }: { run: ShardrunView }) {
  const [looking, setLooking] = useState<string | undefined>(groupCards(run.deck, run.shards)[0]?.id);
  const shard = looking === undefined ? undefined : run.shards[looking];
  const { deck } = run.rules;
  return (
    <section className="shr-bench shr-deck" aria-labelledby="shr-deck-title">
      <h2 id="shr-deck-title" className="crt-title">
        Deck
      </h2>
      <p className="meta">
        {run.deck.length} cards. Every fight shuffles them and deals {deck.handSize} a turn; play cards into a spell in the order they
        should run, and hold up to {deck.hold} into the next turn. A cast spends its cards, and the end of a turn lets the rest go.
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
      <CardGrid run={run} cards={run.deck} onLook={setLooking} looking={looking} />
      {shard && <ShardCard shard={shard} showCode />}
      <p className="meta shr-rules">
        A turn gives {deck.manaPerTurn} mana on the first layer and {deck.manaPerLayer} more on each one below. <CostRules rules={run.rules} />
      </p>
    </section>
  );
}

export function DeckDrawer({ run }: { run: ShardrunView }) {
  const battle = run.battle;
  const [looking, setLooking] = useState<string | undefined>();
  const shard = looking === undefined ? undefined : run.shards[looking];
  return (
    <div className="shr-options shr-deck-drawer" role="group" aria-label="Deck">
      <section>
        <h3>
          Deck · {run.deck.length} {run.deck.length === 1 ? "card" : "cards"}
        </h3>
        <CardGrid run={run} cards={run.deck} onLook={setLooking} looking={looking} />
      </section>
      {battle && (
        <section className="shr-deck-piles">
          <div>
            <h3>Draw pile · {battle.drawPile.length}</h3>
            <p className="meta">In no particular order: which card comes next stays hidden.</p>
            {battle.drawPile.length > 0 ? <CardGrid run={run} cards={battle.drawPile} /> : <p className="meta">Empty: the discard pile is shuffled in next.</p>}
          </div>
          <div>
            <h3>Discard pile · {battle.discardPile.length}</h3>
            {battle.discardPile.length > 0 ? <CardGrid run={run} cards={battle.discardPile} /> : <p className="meta">Nothing cast or let go yet.</p>}
          </div>
          {battle.held.length > 0 && (
            <div>
              <h3>Held · {battle.held.length}</h3>
              <CardGrid run={run} cards={battle.held} />
            </div>
          )}
        </section>
      )}
      {shard && <ShardCard shard={shard} showCode />}
      <p className="meta">
        {battle
          ? `${battle.handSize} cards a turn · hold up to ${battle.holdLimit} · ${battle.manaMax} mana a turn.`
          : `${run.rules.deck.handSize} cards a turn · hold up to ${run.rules.deck.hold}.`}{" "}
        Hover or click a card in the deck to read its code.
      </p>
    </div>
  );
}
