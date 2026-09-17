import type { ShardrunView, SpellView } from "@rootward/shared";
import { type DragEvent, useState } from "react";
import { useShardrun } from "../state/shardrun.ts";
import { type Arrangement, moveShard, type Place } from "./arrange.ts";
import { ManaCost, ShardIcon } from "./parts.tsx";

// The deck playstyle's table (ADR-0020): the hand of cards, and how a card moves between it and the blank spells. As
// on the workbench, the client only proposes where cards should sit; the server checks that no card was created or
// lost, that no spell overflows, and that a spell already cast stays shut ("compose" in the engine).

type Battle = NonNullable<ShardrunView["battle"]>;

/** What makes an element something a card can be dragged from, or dropped on. Empty while nothing may move. */
export interface DragProps {
  draggable?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onDragOver?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
}

/** A blank spell's side of the table, handed to its SpellCard. */
export interface SpellSlots {
  /** Clicked cards go into this spell. */
  targeted: boolean;
  onTarget: () => void;
  /** The card in this slot goes back to the hand. */
  onUnplay: (index: number) => void;
  drag: (index: number) => DragProps;
  drop: (index: number) => DragProps;
}

export interface Composer {
  /** The spell a clicked card goes into, if any spell can still take one. */
  target: string | undefined;
  /** Play the hand's card at `index` into the target spell. */
  play: (index: number) => void;
  slotsFor: (spell: SpellView) => SpellSlots;
  drag: (place: Place) => DragProps;
  drop: (place: Place) => DragProps;
}

export function useComposer(run: ShardrunView, battle: Battle, disabled: boolean): Composer {
  const command = useShardrun((s) => s.command);
  const [chosen, setChosen] = useState<string | undefined>();
  // LEARN: the dragged card's place lives in state rather than in dataTransfer, so a drop reuses the same move a click
  // makes (the workbench does the same).
  const [dragging, setDragging] = useState<Place | undefined>();
  const open = run.spells.filter((spell) => !spell.spent);
  const hasRoom = (spell: SpellView) => spell.shards.length < spell.capacity;
  // The spell the player picked, while it can still be played into; otherwise the first one with room, or a full one.
  const target = (open.find((spell) => spell.id === chosen) ?? open.find(hasRoom) ?? open[0])?.id;
  const spent = (place: Place) =>
    place.kind === "spell" && run.spells.some((spell) => spell.id === place.spellId && spell.spent);

  const move = (from: Place, to: Place) => {
    if (disabled || spent(from) || spent(to)) return;
    const arrangement: Arrangement = {
      spells: run.spells.map((spell) => ({ id: spell.id, capacity: spell.capacity, shards: [...spell.shards] })),
      inventory: [...battle.hand],
    };
    const next = moveShard(arrangement, from, to);
    if (!next) return;
    void command({
      type: "compose",
      spells: next.spells.map((spell) => ({ id: spell.id, shards: spell.shards })),
      hand: next.inventory,
    });
  };

  const drag = (place: Place): DragProps =>
    disabled || spent(place)
      ? {}
      : {
          draggable: true,
          onDragStart: (event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", "card");
            setDragging(place);
          },
        };

  // LEARN: native drag and drop needs `preventDefault` on dragover, or the browser refuses the drop.
  const drop = (place: Place): DragProps =>
    disabled || spent(place)
      ? {}
      : {
          onDragOver: (event) => {
            event.preventDefault();
          },
          onDrop: (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (dragging) move(dragging, place);
            setDragging(undefined);
          },
        };

  return {
    target,
    play: (index) => {
      const spell = run.spells.find((candidate) => candidate.id === target);
      if (spell) move({ kind: "inventory", index }, { kind: "spell", spellId: spell.id, index: spell.shards.length });
    },
    slotsFor: (spell) => ({
      targeted: target === spell.id,
      onTarget: () => {
        setChosen(spell.id);
      },
      onUnplay: (index) => {
        move({ kind: "spell", spellId: spell.id, index }, { kind: "inventory", index: battle.hand.length });
      },
      drag: (index) => drag({ kind: "spell", spellId: spell.id, index }),
      drop: (index) => drop({ kind: "spell", spellId: spell.id, index }),
    }),
    drag,
    drop,
  };
}

/** The hand, between the draw pile and the discard pile. */
export function Hand({ run, battle, composer, disabled }: { run: ShardrunView; battle: Battle; composer: Composer; disabled: boolean }) {
  const target = run.spells.find((spell) => spell.id === composer.target);
  const targetFull = target !== undefined && target.shards.length >= target.capacity;
  return (
    <section className="shr-hand" aria-label="Your hand" {...composer.drop({ kind: "inventory", index: battle.hand.length })}>
      <div className="shr-pile" title="Cards still to draw. When they run out, the discard pile is shuffled into a new one.">
        <b>{battle.drawPile}</b>
        <span>draw</span>
      </div>
      <div className="shr-hand-cards">
        {battle.hand.map((card, index) => {
          const shard = run.shards[card];
          return (
            <button
              key={`${card}-${index}`}
              type="button"
              className={`shr-hand-card rarity-${shard?.rarity ?? "common"}`}
              disabled={disabled || target === undefined}
              title={shard?.summary ?? `${shard?.function ?? card}(bolts, battle)`}
              onClick={() => {
                composer.play(index);
              }}
              {...composer.drag({ kind: "inventory", index })}
            >
              <ShardIcon shardId={card} size={36} />
              <span className="shr-hand-name">{shard?.name ?? card}</span>
              <ManaCost cost={shard?.cost ?? 0} of="shard" />
            </button>
          );
        })}
        {battle.hand.length === 0 && (
          <span className="meta">No cards in hand. Cast what you built, or end the turn to draw {run.rules.deck.handSize}.</span>
        )}
      </div>
      <div className="shr-pile" title="Cards cast or let go this fight">
        <b>{battle.discardPile}</b>
        <span>discard</span>
      </div>
      <p className="meta shr-hand-hint">
        {target === undefined
          ? "Every spell has been cast this turn."
          : targetFull
            ? `${target.name} is full: cast it, pick the other spell, or click a played card to take it back.`
            : `Click a card to play it into ${target.name}, or drag it to a slot. Cards run left to right; click a played card to take it back.`}
      </p>
    </section>
  );
}
