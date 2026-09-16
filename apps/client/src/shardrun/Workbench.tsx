import type { ShardrunView } from "@rootward/shared";
import { type DragEvent, Fragment, useState } from "react";
import { useShardrun } from "../state/shardrun.ts";
import { arrangementOf, moveShard, type Place, samePlace, shardAt } from "./arrange.ts";
import { CostRules, ManaCost, ShardCard, ShardIcon } from "./parts.tsx";

/**
 * The spellbook: each spell's slots, the spare shards, and the code of whichever shard is being looked at. Between
 * fights, a shard moves by clicking it and then its destination, or by dragging it there.
 */
export function Workbench({ run, locked }: { run: ShardrunView; locked: boolean }) {
  const command = useShardrun((s) => s.command);
  const busy = useShardrun((s) => s.busy);
  const [selected, setSelected] = useState<Place | undefined>();
  const [inspected, setInspected] = useState<string | undefined>(
    run.spells[0]?.shards[0] ?? run.inventory[0],
  );
  const arrangement = arrangementOf(run);
  const frozen = locked || busy;
  const inspectedShard = inspected === undefined ? undefined : run.shards[inspected];

  const moveTo = (to: Place) => {
    if (!selected) return;
    const next = moveShard(arrangement, selected, to);
    setSelected(undefined);
    if (!next) return;
    void command({
      type: "arrange",
      spells: next.spells.map((spell) => ({ id: spell.id, shards: spell.shards })),
      inventory: next.inventory,
    });
  };

  const pick = (place: Place) => {
    const shardId = shardAt(arrangement, place);
    if (shardId !== undefined) setInspected(shardId);
    if (frozen) return;
    if (selected && samePlace(selected, place)) setSelected(undefined);
    else if (selected) moveTo(place);
    else if (shardId !== undefined) setSelected(place);
  };

  // LEARN: native drag and drop needs `preventDefault` on dragover, or the browser refuses the drop. The dragged place
  // is kept in `selected` rather than in dataTransfer, so dropping reuses the same move as clicking.
  const dropTarget = (place: Place) =>
    frozen
      ? {}
      : {
          onDragOver: (event: DragEvent) => {
            event.preventDefault();
          },
          onDrop: (event: DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            moveTo(place);
          },
        };

  const chip = (shardId: string, place: Place) => {
    const shard = run.shards[shardId];
    const isSelected = selected !== undefined && samePlace(selected, place);
    return (
      <button
        type="button"
        className={`shr-chip rarity-${shard?.rarity ?? "common"}${isSelected ? " selected" : ""}`}
        title={shard?.summary}
        aria-pressed={isSelected}
        draggable={!frozen}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", shardId);
          setSelected(place);
        }}
        onClick={() => {
          pick(place);
        }}
        onMouseEnter={() => {
          setInspected(shardId);
        }}
        {...dropTarget(place)}
      >
        <ShardIcon shardId={shardId} size={24} />
        <span>{shard?.name ?? shardId}</span>
        <ManaCost cost={shard?.cost ?? 0} of="shard" />
      </button>
    );
  };

  return (
    <section className="shr-bench" aria-labelledby="shr-bench-title">
      <h2 id="shr-bench-title" className="crt-title">
        Spellbook
      </h2>
      <p className="meta">
        {locked
          ? "Spells are set while a fight is on. Hover a shard to read its code."
          : "Click a shard, then where it should go, or drag it. A spell runs its shards left to right."}
      </p>

      {run.spells.map((spell) => {
        // A cast's cost is one bill on a curve now (ADR-0015), so it cannot be added up from the slots: the only
        // honest number is the measured preview, when there is one.
        const end: Place = { kind: "spell", spellId: spell.id, index: spell.shards.length };
        return (
          <div className="shr-spellrow" key={spell.id}>
            <div className="shr-spellname">
              <b>{spell.name}</b>
              <span className="meta">
                {spell.shards.length}/{spell.capacity} slots
                {spell.preview && ` · ${spell.preview.cost} mana`}
              </span>
            </div>
            <div className="shr-slots">
              <span
                className="shr-source"
                title={`Every spell starts from one ${run.rules.baseBoltPower}-power bolt`}
              >
                bolt
              </span>
              {Array.from({ length: spell.capacity }, (_, index) => {
                const shardId = spell.shards[index];
                return (
                  <Fragment key={index}>
                    <span className="shr-arrow" aria-hidden="true">
                      →
                    </span>
                    {shardId !== undefined ? (
                      chip(shardId, { kind: "spell", spellId: spell.id, index })
                    ) : (
                      <button
                        type="button"
                        className="shr-slot"
                        disabled={frozen || selected === undefined}
                        onClick={() => {
                          moveTo(end);
                        }}
                        {...dropTarget(end)}
                      >
                        empty
                      </button>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="shr-inventory" {...dropTarget({ kind: "inventory", index: run.inventory.length })}>
        <h3>Spare shards</h3>
        {run.inventory.length === 0 && (
          <span className="meta">Nothing spare. Win fights to salvage more.</span>
        )}
        {run.inventory.map((shardId, index) => (
          <Fragment key={`${shardId}-${index}`}>{chip(shardId, { kind: "inventory", index })}</Fragment>
        ))}
        {selected?.kind === "spell" && !frozen && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              moveTo({ kind: "inventory", index: run.inventory.length });
            }}
          >
            Take it out
          </button>
        )}
      </div>

      {inspectedShard && <ShardCard shard={inspectedShard} showCode />}
      <p className="meta shr-rules">
        <CostRules rules={run.rules} />
      </p>
    </section>
  );
}
