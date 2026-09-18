import type { ShardrunView } from "@rootward/shared";
import { type MouseEvent, type PointerEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { useShardrun } from "../state/shardrun.ts";
import { CardFace, cardTipHandlers } from "./Card.tsx";
import { moveCard, parseSpot, type Spot, spotKey, type Table } from "./table.ts";

// The deck playstyle's hand (ADR-0020): the cards, the hold, the piles, and how a card is picked up. A card is played by
// clicking it (into the targeted spell) or by dragging it: pressed and moved, it lifts off the table and follows the
// pointer, the place under it lights up, and letting go there proposes the move ("compose") to the server.

type Battle = NonNullable<ShardrunView["battle"]>;

/** How far a pressed pointer has to travel before the press is a drag rather than a click. */
const DRAG_THRESHOLD = 6;

/**
 * Where the pointer is during a drag. It changes on every pointer move, so it lives in a store of its own that only the
 * ghost reads: the rest of the battle does not render again for each pixel the pointer travels.
 */
const usePointer = create<{ x: number; y: number }>()(() => ({ x: 0, y: 0 }));

export interface CardHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onClick: (event: MouseEvent<HTMLElement>) => void;
}

interface Drag {
  from: Spot;
  card: string;
  pointerId: number;
  startX: number;
  startY: number;
  moving: boolean;
  over: Spot | undefined;
}

export interface TableControls {
  /** The table as it stands, a move still on its way to the server included. */
  table: Table;
  /** Nothing can move: the fight is over, or a cast is playing as code. */
  locked: boolean;
  /** The spell a clicked card goes into, if any spell can still take cards this turn. */
  target: string | undefined;
  choose: (spellId: string) => void;
  /** Pointer and click handlers for the card at a spot. */
  grab: (spot: Spot, card: string) => CardHandlers;
  /** What makes an element a place a card can be dropped. */
  dropAt: (spot: Spot) => { "data-drop": string; "data-over"?: "true" };
  /** Set the hand's card at `index` aside, to keep into the next turn. */
  hold: (index: number) => void;
  /** Whether the card at a spot is the one being dragged. */
  lifted: (spot: Spot) => boolean;
  /** The card being dragged, if one is. */
  dragging: string | undefined;
}

export function useTable(
  run: ShardrunView,
  battle: Battle,
  disabled: boolean,
  onBuild: (spellId: string) => void,
): TableControls {
  const command = useShardrun((s) => s.command);
  const busy = useShardrun((s) => s.busy);
  const [chosen, setChosen] = useState<string | undefined>();
  const [pending, setPending] = useState<Table | undefined>();
  const [shown, setShown] = useState<{ from: string; card: string; over: string | undefined } | undefined>();
  const drag = useRef<Drag | undefined>(undefined);

  // A move is shown the moment it is made, and replaced by the server's answer when it arrives.
  const table: Table =
    busy && pending
      ? pending
      : {
          spells: run.spells.map((spell) => ({ id: spell.id, capacity: spell.capacity, shards: [...spell.shards], spent: spell.spent })),
          hand: [...battle.hand],
          held: [...battle.held],
          holdLimit: battle.holdLimit,
        };

  const open = table.spells.filter((spell) => !spell.spent);
  const hasRoom = (spell: Table["spells"][number]) => spell.shards.length < spell.capacity;
  // The spell the player picked while it has room; otherwise the first with room; otherwise the picked (full) one.
  const target = (
    open.find((spell) => spell.id === chosen && hasRoom(spell)) ??
    open.find(hasRoom) ??
    open.find((spell) => spell.id === chosen) ??
    open[0]
  )?.id;

  const move = (from: Spot, to: Spot) => {
    if (disabled || busy) return;
    const next = moveCard(table, from, to);
    if (!next) return;
    // The card target may advance when a spell becomes full, but the code follows the spell the player actually
    // edited. Keeping those two selections separate stops a completed function from vanishing under their pointer.
    if (to.zone === "spell") onBuild(to.spellId);
    setPending(next);
    void command({
      type: "compose",
      spells: next.spells.map((spell) => ({ id: spell.id, shards: spell.shards })),
      hand: next.hand,
      held: next.held,
    }).then(() => {
      setPending(undefined);
    });
  };

  // A click: a card in the hand goes into the target spell; a card anywhere else goes back to the hand.
  const tap = (spot: Spot) => {
    if (spot.zone !== "hand") {
      move(spot, { zone: "hand", index: table.hand.length });
      return;
    }
    const spell = table.spells.find((candidate) => candidate.id === target);
    if (spell) move(spot, { zone: "spell", spellId: spell.id, index: spell.shards.length });
  };

  const release = () => {
    drag.current = undefined;
    setShown(undefined);
  };

  const grab = (spot: Spot, card: string): CardHandlers => ({
    onPointerDown: (event) => {
      if (disabled || event.button !== 0) return;
      // LEARN: pointer capture sends every later move and the release to this element, even once the pointer has left
      // it, which is what lets one element own a whole drag without listeners on the window.
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { from: spot, card, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moving: false, over: undefined };
    },
    onPointerMove: (event) => {
      const current = drag.current;
      if (current?.pointerId !== event.pointerId) return;
      if (!current.moving) {
        if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_THRESHOLD) return;
        current.moving = true;
        setShown({ from: spotKey(current.from), card: current.card, over: undefined });
      }
      usePointer.setState({ x: event.clientX, y: event.clientY });
      // The ghost ignores the pointer (pointer-events: none), so what is under the pointer is the table itself.
      const over = parseSpot(document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-drop]")?.getAttribute("data-drop"));
      if ((over && spotKey(over)) !== (current.over && spotKey(current.over))) {
        current.over = over;
        setShown((view) => view && { ...view, over: over && spotKey(over) });
      }
    },
    onPointerUp: (event) => {
      const current = drag.current;
      if (current?.pointerId !== event.pointerId) return;
      release();
      if (!current.moving) tap(current.from);
      else if (current.over) move(current.from, current.over);
    },
    onPointerCancel: release,
    // Enter or Space on a focused card clicks it with no pointer behind the click (detail 0): play it the same way.
    onClick: (event) => {
      if (event.detail === 0 && !disabled) tap(spot);
    },
  });

  return {
    table,
    locked: disabled,
    target,
    choose: setChosen,
    grab,
    dropAt: (spot) => {
      const key = spotKey(spot);
      return shown?.over === key ? { "data-drop": key, "data-over": "true" } : { "data-drop": key };
    },
    hold: (index) => {
      move({ zone: "hand", index }, { zone: "hold", index: table.held.length });
    },
    lifted: (spot) => shown?.from === spotKey(spot),
    dragging: shown?.card,
  };
}

/** The card following the pointer while one is dragged. It lives on the page's body, clear of the stage's shaking. */
export function DragGhost({ run, card }: { run: ShardrunView; card: string | undefined }) {
  const x = usePointer((s) => s.x);
  const y = usePointer((s) => s.y);
  if (card === undefined) return null;
  return createPortal(
    // Centered under the pointer and a little above it, so the place it is over stays in sight.
    <div className="shr-drag-ghost" style={{ transform: `translate(${x - 58}px, ${y - 48}px) rotate(-4deg)` }} aria-hidden="true">
      <CardFace run={run} shardId={card} size="hand" />
    </div>,
    document.body,
  );
}

/** The hand between the draw pile and the discard pile, with the hold beside it. */
export function Hand({ run, battle, controls, disabled }: { run: ShardrunView; battle: Battle; controls: TableControls; disabled: boolean }) {
  const { table } = controls;
  const target = run.spells.find((spell) => spell.id === controls.target);
  const targetSlots = table.spells.find((spell) => spell.id === controls.target);
  const targetFull = targetSlots !== undefined && targetSlots.shards.length >= targetSlots.capacity;
  const holdFull = table.held.length >= table.holdLimit;
  return (
    <section className="shr-hand" aria-label="Your hand">
      <div className="shr-pile" title="Cards still to draw. When they run out, the discard pile is shuffled into a new one.">
        <b>{battle.drawPile.length}</b>
        <span>draw</span>
      </div>

      <div className="shr-hand-cards" {...controls.dropAt({ zone: "hand", index: table.hand.length })}>
        {table.hand.map((card, index) => {
          const spot: Spot = { zone: "hand", index };
          const name = run.shards[card]?.name ?? card;
          return (
            <div
              key={`${card}-${index}`}
              className={`shr-hand-card${controls.lifted(spot) ? " lifted" : ""}`}
              {...controls.dropAt(spot)}
              {...cardTipHandlers(card)}
            >
              <button
                type="button"
                className="shr-card-button"
                disabled={disabled}
                aria-label={target ? `${name}: play it into ${target.name}` : name}
                {...controls.grab(spot, card)}
              >
                <CardFace run={run} shardId={card} size="hand" />
              </button>
              {table.holdLimit > 0 && (
                <button
                  type="button"
                  className="shr-hold-pin"
                  disabled={disabled || holdFull}
                  title={holdFull ? "The hold is full" : "Keep this card into the next turn"}
                  onClick={() => {
                    controls.hold(index);
                  }}
                >
                  hold
                </button>
              )}
            </div>
          );
        })}
        {table.hand.length === 0 && <span className="meta">No cards in hand. Cast what you built, or end the turn to draw {battle.handSize}.</span>}
      </div>

      {table.holdLimit > 0 && (
        <div className="shr-hold" {...controls.dropAt({ zone: "hold", index: table.held.length })}>
          <span className="shr-hold-label" title="Held cards stay in your hand when the turn ends; a full hand is drawn on top of them.">
            hold {table.held.length}/{table.holdLimit}
          </span>
          <div className="shr-hold-slots">
            {Array.from({ length: table.holdLimit }, (_, index) => {
              const card = table.held[index];
              const spot: Spot = { zone: "hold", index };
              return card === undefined ? (
                <span key={`hold-${index}`} className="shr-slot-card" {...controls.dropAt(spot)}>
                  keep
                </span>
              ) : (
                <button
                  key={`hold-${index}`}
                  type="button"
                  className={`shr-card-button${controls.lifted(spot) ? " lifted" : ""}`}
                  disabled={disabled}
                  aria-label={`${run.shards[card]?.name ?? card}, held. Click to take it back into the hand.`}
                  {...controls.dropAt(spot)}
                  {...controls.grab(spot, card)}
                  {...cardTipHandlers(card)}
                >
                  <CardFace run={run} shardId={card} size="mini" badge="held" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="shr-pile" title="Cards cast or let go this fight">
        <b>{battle.discardPile.length}</b>
        <span>discard</span>
      </div>

      <p className="meta shr-hand-hint">
        {target === undefined
          ? `Every spell has been cast this turn.${table.holdLimit > 0 ? " Hold a card to keep it for the next one." : ""}`
          : targetFull
            ? `${target.name} is full: cast it, pick the other spell, or take a card back.`
            : `Click a card to play it into ${target.name}, or drag it to a slot. Cards run left to right.`}
      </p>
    </section>
  );
}
