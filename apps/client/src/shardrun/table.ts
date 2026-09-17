// The deck playstyle's table (ADR-0020): every place a card can sit during a fight, and what moving one does. The client
// only proposes a new table; the server checks that no card was created or lost, that no spell overflows, that the hold
// is within its limit, and that a spell already cast stays shut ("compose" in the engine).

/** A place on the table: a slot of a spell, a place in the hand, or a place in the hold. */
export type Spot =
  | { zone: "spell"; spellId: string; index: number }
  | { zone: "hand"; index: number }
  | { zone: "hold"; index: number };

export interface Table {
  spells: { id: string; capacity: number; shards: string[]; spent: boolean }[];
  hand: string[];
  held: string[];
  holdLimit: number;
}

/** A spot as a string, for a `data-drop` attribute and for telling spots apart. */
export function spotKey(spot: Spot): string {
  return spot.zone === "spell" ? `spell:${spot.spellId}:${spot.index}` : `${spot.zone}:${spot.index}`;
}

/** The spot a `data-drop` attribute names, if it names one. */
export function parseSpot(key: string | null | undefined): Spot | undefined {
  const parts = key?.split(":") ?? [];
  const index = Number(parts.at(-1));
  if (!Number.isInteger(index) || index < 0) return undefined;
  if (parts[0] === "spell" && parts.length === 3 && parts[1]) return { zone: "spell", spellId: parts[1], index };
  if ((parts[0] === "hand" || parts[0] === "hold") && parts.length === 2) return { zone: parts[0], index };
  return undefined;
}

function cardsAt(table: Table, spot: Spot): string[] | undefined {
  switch (spot.zone) {
    case "hand":
      return table.hand;
    case "hold":
      return table.held;
    case "spell":
      return table.spells.find((spell) => spell.id === spot.spellId)?.shards;
  }
}

function roomAt(table: Table, spot: Spot): number {
  switch (spot.zone) {
    case "hand":
      return Number.POSITIVE_INFINITY;
    case "hold":
      return table.holdLimit;
    case "spell":
      return table.spells.find((spell) => spell.id === spot.spellId)?.capacity ?? 0;
  }
}

function spent(table: Table, spot: Spot): boolean {
  return spot.zone === "spell" && table.spells.some((spell) => spell.id === spot.spellId && spell.spent);
}

/**
 * Move the card at `from` so it ends up at `to`, the way dropping it there would. Into a list with room, the card is
 * inserted at `to.index` (anything past the end means last). Dropped on a card in a full list, the two swap places.
 * Returns undefined when nothing would change or the move cannot happen: a spent spell, a full list dropped past its
 * end, or a spot that holds no card.
 */
export function moveCard(table: Table, from: Spot, to: Spot): Table | undefined {
  if (spent(table, from) || spent(table, to)) return undefined;
  const next: Table = {
    ...table,
    spells: table.spells.map((spell) => ({ ...spell, shards: [...spell.shards] })),
    hand: [...table.hand],
    held: [...table.held],
  };
  const source = cardsAt(next, from);
  const target = cardsAt(next, to);
  const card = source?.[from.index];
  if (!source || !target || card === undefined) return undefined;

  if (source === target) {
    const index = Math.min(to.index, target.length - 1);
    if (index === from.index) return undefined;
    source.splice(from.index, 1);
    target.splice(index, 0, card);
    return next;
  }
  if (target.length < roomAt(next, to)) {
    source.splice(from.index, 1);
    target.splice(Math.min(to.index, target.length), 0, card);
    return next;
  }
  const displaced = target[to.index];
  if (displaced === undefined) return undefined;
  target[to.index] = card;
  source[from.index] = displaced;
  return next;
}
