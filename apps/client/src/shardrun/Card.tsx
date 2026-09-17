import type { ShardrunView, ShardView } from "@rootward/shared";
import { type FocusEvent, type PointerEvent, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { ComplexityTag, ShardIcon } from "./parts.tsx";

// A shard as a card (ADR-0020): a deck run's shards are its cards, so they are drawn like cards, with a cost gem, the
// shard's art, its name, what it does, and a frame in its rarity's color. Sizes: `hand` in the hand, `deck` in the Deck
// drawer and the deck panel, `mini` in a spell's slots and the hold.

export type CardSize = "hand" | "deck" | "mini";

const ICON: Readonly<Record<CardSize, number>> = { hand: 56, deck: 44, mini: 30 };
/** Past this many characters a summary is set a size smaller, so the few longest still fit a card whole. */
const LONG_SUMMARY = 118;

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
        <span className={`shr-cardface-text${(shard?.summary?.length ?? 0) > LONG_SUMMARY ? " long" : ""}`}>
          {/* On Programmer there are no summaries: the card says which function it is, and the code says the rest. */}
          {shard?.summary ?? `${shard?.function ?? shardId}(bolts, battle)`}
        </span>
      )}
      {count !== undefined && count > 1 && <span className="shr-cardface-count">×{count}</span>}
      {badge !== undefined && <span className="shr-cardface-badge">{badge}</span>}
    </span>
  );
}

/** The card whose code is showing, and the element it is drawn in. */
const useCardTip = create<{ tip: { card: string; anchor: HTMLElement } | undefined }>()(() => ({ tip: undefined }));

function showTip(card: string, anchor: HTMLElement) {
  useCardTip.setState({ tip: { card, anchor } });
}

function hideTip() {
  useCardTip.setState({ tip: undefined });
}

/**
 * Props that show a card's code while the pointer is over the card or the keyboard is on it, and put it away the
 * moment the card is pressed. Keyboard focus only: a click focuses a button too, and its code would outstay the pointer.
 */
export function cardTipHandlers(card: string) {
  return {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch") showTip(card, event.currentTarget);
    },
    onPointerLeave: hideTip,
    onPointerDownCapture: hideTip,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.target.matches(":focus-visible")) showTip(card, event.currentTarget);
    },
    onBlur: hideTip,
  };
}

/**
 * The code of the card under the pointer (ADR-0020): the function it runs, in the run's language. A difficulty that
 * shows only code sends no summaries, so there the card names its function and this is the rest of it. It floats over
 * the page, inside the window, above its card when there is room and below it when not. It is placed from the card
 * itself before the browser paints, follows the card when the page scrolls or the window changes size, and never
 * shows while a card is being dragged.
 */
export function CardTipLayer({ run, hidden }: { run: Pick<ShardrunView, "shards">; hidden: boolean }) {
  const tip = useCardTip((s) => s.tip);
  const box = useRef<HTMLDivElement>(null);
  const shard: ShardView | undefined = tip === undefined ? undefined : run.shards[tip.card];
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || !tip) return;
    const place = () => {
      // A card that left the table (played, or the turn ended) has nowhere to point.
      if (!tip.anchor.isConnected) {
        element.style.visibility = "hidden";
        return;
      }
      const card = tip.anchor.getBoundingClientRect();
      const margin = 12;
      const gap = 14;
      const { offsetWidth: width, offsetHeight: height } = element;
      const left = Math.max(margin, Math.min(window.innerWidth - margin - width, card.left + card.width / 2 - width / 2));
      const above = card.top - gap - height;
      const top = above >= margin ? above : Math.max(margin, Math.min(window.innerHeight - margin - height, card.bottom + gap));
      element.style.translate = `${Math.round(left)}px ${Math.round(top)}px`;
      element.style.visibility = "visible";
    };
    place();
    // A hovered card lifts a little; place the code again once it has.
    const settled = window.setTimeout(place, 160);
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(settled);
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [tip, shard, hidden]);
  useEffect(() => hideTip, []);
  if (!tip || !shard || hidden) return null;
  return createPortal(
    <div ref={box} className="shr-card-tip" style={{ visibility: "hidden" }} aria-hidden="true">
      <span className="shr-card-tip-head">
        <b>{shard.name}</b>
        <ComplexityTag complexity={shard.complexity} />
      </span>
      <code className="shr-card-tip-code">{shard.code.trimEnd()}</code>
    </div>,
    document.body,
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
