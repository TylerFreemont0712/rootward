import type { ShardrunView } from "@rootward/shared";
import { assetUrl } from "../assets/AssetRegistry.ts";
import { useShardrun } from "../state/shardrun.ts";
import { RelicCard, ShardCard, ShardIcon } from "./parts.tsx";

// The rooms that are not battles: rewards (shards, relics, a new spell), rests, and forges.

export function RewardPanel({ run }: { run: ShardrunView }) {
  const command = useShardrun((s) => s.command);
  const busy = useShardrun((s) => s.busy);
  const reward = run.reward;
  if (!reward) return null;
  return (
    <section className="shr-room" aria-labelledby="shr-reward-title">
      <h2 id="shr-reward-title" className="crt-title">
        {reward.shards ? "Shards in the rubble" : "A sealed cache"}
      </h2>

      {reward.spell && (
        <div className="shr-reward-part shr-new-spell">
          <p className="narr">
            The guardian&apos;s core holds a spell of its own: <b>{reward.spell.name}</b>, with {reward.spell.capacity} empty slots.
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => {
              void command({ type: "claim-spell" });
            }}
          >
            Claim {reward.spell.name}
          </button>
        </div>
      )}

      {reward.relics && (
        <div className="shr-reward-part">
          <h3>{reward.relics.length === 1 ? "A relic" : `Choose a relic (${reward.relics.length})`}</h3>
          <div className="shr-cards">
            {reward.relics.map((relicId) => {
              const relic = run.relicInfo[relicId];
              if (!relic) return null;
              return (
                <RelicCard key={relicId} relic={relic}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => {
                      void command({ type: "claim-relic", relicId });
                    }}
                  >
                    Claim {relic.name}
                  </button>
                </RelicCard>
              );
            })}
          </div>
        </div>
      )}

      {reward.shards && (
        <div className="shr-reward-part">
          <h3>{run.playstyle === "deck" ? "Add one card to your deck" : "Take one shard"}</h3>
          <p className="meta">
            {run.playstyle === "deck"
              ? "It is shuffled in from the next fight on. A thinner deck draws its best cards together, so skipping is a real choice."
              : "It joins your spare shards; slot it into a spell before the next fight."}
          </p>
          <div className="shr-cards">
            {reward.shards.map((shardId) => {
              const shard = run.shards[shardId];
              if (!shard) return null;
              return (
                <ShardCard key={shardId} shard={shard} showCode>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => {
                      void command({ type: "take", shardId });
                    }}
                  >
                    {run.playstyle === "deck" ? "Add" : "Take"} {shard.name}
                  </button>
                </ShardCard>
              );
            })}
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              void command({ type: "take", shardId: null });
            }}
          >
            {run.playstyle === "deck" ? "Skip the cards" : "Skip the shards"}
          </button>
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            void command({ type: "leave" });
          }}
        >
          Leave the rest and move on
        </button>
      </div>
    </section>
  );
}

export function RestPanel({ run }: { run: ShardrunView }) {
  const command = useShardrun((s) => s.command);
  const busy = useShardrun((s) => s.busy);
  const heal = run.restHeal ?? 0;
  const art = assetUrl("shardrun", "map-rest") ?? assetUrl("rooms", "rest");
  return (
    <section className="shr-room shr-rest" aria-labelledby="shr-rest-title">
      {art !== undefined && <img src={art} alt="" />}
      <div>
        <h2 id="shr-rest-title" className="crt-title">
          A quiet alcove
        </h2>
        <p className="narr">
          The hum of the Machine is almost soothing. Rest to recover {heal} Integrity.{" "}
          {run.playstyle === "deck" ? "Resting moves you on." : "Rearrange your spells first if you like; resting moves you on."}
        </p>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => {
            void command({ type: "rest" });
          }}
        >
          Rest (+{heal} Integrity)
        </button>
      </div>
    </section>
  );
}

export function ForgePanel({ run }: { run: ShardrunView }) {
  const command = useShardrun((s) => s.command);
  const busy = useShardrun((s) => s.busy);
  const forge = run.forge ?? { shards: [], spells: [] };
  const deck = run.playstyle === "deck";
  return (
    <section className="shr-room" aria-labelledby="shr-forge-title">
      <h2 id="shr-forge-title" className="crt-title">
        An abandoned forge
      </h2>
      <p className="narr">
        {deck
          ? "Do one thing here: melt a card down to thin your deck, upgrade a card, widen a spell by one slot, or bind a new blank spell."
          : "Do one thing here: rework a shard (upgrade it, or repair a broken one), widen a spell by one slot, or bind a new spell to your book."}
      </p>

      {forge.purge && (
        <div className="shr-reward-part">
          <h3>Melt a card down</h3>
          <p className="meta">
            {forge.purge.length > 0
              ? `One copy leaves the deck for good (${run.deck.length} cards now). The fewer the cards, the more often the ones you keep come up.`
              : `Your deck is as small as it can be (${run.rules.deck.minCards} cards).`}
          </p>
          <div className="shr-deck-cards">
            {forge.purge.map((shardId) => {
              const shard = run.shards[shardId];
              const copies = run.deck.filter((card) => card === shardId).length;
              return (
                <button
                  key={shardId}
                  type="button"
                  className={`shr-chip rarity-${shard?.rarity ?? "common"}`}
                  disabled={busy}
                  title={shard?.summary}
                  onClick={() => {
                    void command({ type: "purge", shardId });
                  }}
                >
                  <ShardIcon shardId={shardId} size={24} />
                  <span>Melt {shard?.name ?? shardId}</span>
                  <b className="shr-deck-count">×{copies}</b>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {forge.bind && (
        <div className="shr-reward-part">
          <h3>Bind a new spell</h3>
          <p className="meta">
            {deck
              ? `A blank spell with ${forge.bind.capacity} slots: one more spell to build from your hand every turn.`
              : `An empty spell with ${forge.bind.capacity} slots, ready for the spare shards you are carrying.`}
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => {
              void command({ type: "bind" });
            }}
          >
            Bind {forge.bind.name}
          </button>
        </div>
      )}

      {forge.spells.length > 0 && (
        <div className="shr-reward-part">
          <h3>Widen a spell</h3>
          <div className="actions">
            {forge.spells.map((spellId) => {
              const spell = run.spells.find((candidate) => candidate.id === spellId);
              if (!spell) return null;
              return (
                <button
                  key={spellId}
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    void command({ type: "widen", spellId });
                  }}
                >
                  {spell.name}: {spell.capacity} → {spell.capacity + 1} slots
                </button>
              );
            })}
          </div>
        </div>
      )}

      {forge.shards.length > 0 && (
        <div className="shr-reward-part">
          <h3>{deck ? "Upgrade a card" : "Rework a shard"}</h3>
          <div className="shr-cards">
            {forge.shards.map((shardId) => {
              const shard = run.shards[shardId];
              const into = shard?.forge ? run.shards[shard.forge.into] : undefined;
              if (!shard?.forge || !into) return null;
              const verb = shard.forge.verb === "repair" ? "Repair" : "Upgrade";
              return (
                <ShardCard key={shardId} shard={shard} showCode>
                  <details className="shr-after" open>
                    <summary>
                      After: {into.name}
                      {into.summary !== undefined && ` · ${into.summary}`}
                    </summary>
                    <pre className="shr-code">
                      <code>{into.code}</code>
                    </pre>
                  </details>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => {
                      void command({ type: "forge", shardId });
                    }}
                  >
                    {verb} into {into.name}
                  </button>
                </ShardCard>
              );
            })}
          </div>
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            void command({ type: "forge", shardId: null });
          }}
        >
          Leave the forge
        </button>
      </div>
    </section>
  );
}
