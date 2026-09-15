import type { ShardrunNodeView, ShardrunView } from "@rootward/shared";
import { assetUrl } from "../assets/AssetRegistry.ts";
import { useShardrun } from "../state/shardrun.ts";
import { ShardCard } from "./parts.tsx";

// The Salvage between fights: the floors to descend, and the rooms that are not battles (rewards, rests, forges).

const ROOM_ART: Readonly<Record<ShardrunNodeView["kind"], string>> = {
  fight: "encounter",
  elite: "elite",
  boss: "boss",
  rest: "rest",
  forge: "shrine",
};
const ROOM_NAME: Readonly<Record<ShardrunNodeView["kind"], string>> = {
  fight: "Fight",
  elite: "Elite",
  boss: "Guardian",
  rest: "Rest",
  forge: "Forge",
};

export function SalvageMap({ run }: { run: ShardrunView }) {
  const command = useShardrun((s) => s.command);
  const busy = useShardrun((s) => s.busy);
  return (
    <section className="shr-map" aria-labelledby="shr-map-title">
      <h2 id="shr-map-title" className="crt-title">
        The Salvage
      </h2>
      <ol className="shr-floors">
        {run.floors.map((floor, depth) => (
          <li key={depth} className="shr-floor">
            <span className="shr-depth" aria-label={`Floor ${depth + 1}`}>
              {depth + 1}
            </span>
            <div className="shr-nodes">
              {floor.map((node) => {
                const art = assetUrl("rooms", ROOM_ART[node.kind]);
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`shr-node kind-${node.kind} state-${node.state}`}
                    disabled={node.state !== "open" || busy}
                    onClick={() => {
                      void command({ type: "enter", nodeId: node.id });
                    }}
                  >
                    {art !== undefined ? <img src={art} alt="" /> : <span className="glyph">{ROOM_NAME[node.kind].slice(0, 1)}</span>}
                    <span className="shr-node-name">
                      {ROOM_NAME[node.kind]}
                      {node.state === "visited" && " ✓"}
                    </span>
                    <span className="shr-node-foes">
                      {node.foes.map((foe, index) => {
                        const sprite = assetUrl("creatures", foe.sprite);
                        return sprite !== undefined ? (
                          <img key={index} src={sprite} alt={foe.name} title={foe.name} />
                        ) : (
                          <span key={index}>{foe.name}</span>
                        );
                      })}
                    </span>
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RewardPanel({ run }: { run: ShardrunView }) {
  const command = useShardrun((s) => s.command);
  const busy = useShardrun((s) => s.busy);
  return (
    <section className="shr-room" aria-labelledby="shr-reward-title">
      <h2 id="shr-reward-title" className="crt-title">
        Shards in the rubble
      </h2>
      <p className="narr">Take one. It joins your spare shards; slot it into a spell before the next fight.</p>
      <div className="shr-cards">
        {(run.reward?.choices ?? []).map((shardId) => {
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
                Take {shard.name}
              </button>
            </ShardCard>
          );
        })}
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            void command({ type: "take", shardId: null });
          }}
        >
          Leave them
        </button>
      </div>
    </section>
  );
}

export function RestPanel({ run }: { run: ShardrunView }) {
  const command = useShardrun((s) => s.command);
  const busy = useShardrun((s) => s.busy);
  const heal = run.restHeal ?? 0;
  const art = assetUrl("rooms", "rest");
  return (
    <section className="shr-room shr-rest" aria-labelledby="shr-rest-title">
      {art !== undefined && <img src={art} alt="" />}
      <div>
        <h2 id="shr-rest-title" className="crt-title">
          A quiet alcove
        </h2>
        <p className="narr">
          The hum of the Machine is almost soothing. Rest to recover {heal} Integrity. Rearrange your spells first if you like; resting
          moves you on.
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
  return (
    <section className="shr-room" aria-labelledby="shr-forge-title">
      <h2 id="shr-forge-title" className="crt-title">
        An abandoned forge
      </h2>
      <p className="narr">Rework one shard you carry: upgrade it, or repair one that is broken. Compare the code, then choose.</p>
      <div className="shr-cards">
        {run.forgeable.map((shardId) => {
          const shard = run.shards[shardId];
          const into = shard?.forge ? run.shards[shard.forge.into] : undefined;
          if (!shard?.forge || !into) return null;
          const verb = shard.forge.verb === "repair" ? "Repair" : "Upgrade";
          return (
            <ShardCard key={shardId} shard={shard} showCode>
              <details className="shr-after" open>
                <summary>
                  After: {into.name} · {into.summary}
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
      {run.forgeable.length === 0 && <p className="meta">Nothing you carry can be reworked.</p>}
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
