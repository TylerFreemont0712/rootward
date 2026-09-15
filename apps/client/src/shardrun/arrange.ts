import type { ShardrunView } from "@rootward/shared";

// Moving shards around the workbench. The client only proposes a new arrangement; the server checks that no shard
// was created or lost and that no spell is over capacity (packages/core/src/shardrun/engine.ts, "arrange").

/** Where a shard sits: a slot in a spell, or a place in the inventory. */
export type Place = { kind: "spell"; spellId: string; index: number } | { kind: "inventory"; index: number };

export interface Arrangement {
  spells: { id: string; capacity: number; shards: string[] }[];
  inventory: string[];
}

export function arrangementOf(run: Pick<ShardrunView, "spells" | "inventory">): Arrangement {
  return {
    spells: run.spells.map((spell) => ({ id: spell.id, capacity: spell.capacity, shards: [...spell.shards] })),
    inventory: [...run.inventory],
  };
}

export function samePlace(a: Place, b: Place): boolean {
  return a.kind === b.kind && a.index === b.index && (a.kind === "inventory" || (b.kind === "spell" && a.spellId === b.spellId));
}

export function shardAt(arrangement: Arrangement, place: Place): string | undefined {
  return listAt(arrangement, place)?.[place.index];
}

function listAt(arrangement: Arrangement, place: Place): string[] | undefined {
  return place.kind === "inventory" ? arrangement.inventory : arrangement.spells.find((spell) => spell.id === place.spellId)?.shards;
}

/**
 * Move the shard at `from` so it ends up at `to`, the way dropping it there would. Dropped on a shard in a full spell,
 * the two swap places. Returns undefined when nothing would change or the move cannot happen.
 */
export function moveShard(arrangement: Arrangement, from: Place, to: Place): Arrangement | undefined {
  const next: Arrangement = {
    spells: arrangement.spells.map((spell) => ({ ...spell, shards: [...spell.shards] })),
    inventory: [...arrangement.inventory],
  };
  const source = listAt(next, from);
  const target = listAt(next, to);
  const shard = source?.[from.index];
  if (!source || !target || shard === undefined) return undefined;

  if (source === target) {
    if (from.index === to.index) return undefined;
    source.splice(from.index, 1);
    target.splice(Math.min(to.index, target.length), 0, shard);
    return next;
  }
  const capacity = to.kind === "spell" ? (next.spells.find((spell) => spell.id === to.spellId)?.capacity ?? 0) : Number.POSITIVE_INFINITY;
  if (target.length < capacity) {
    source.splice(from.index, 1);
    target.splice(Math.min(to.index, target.length), 0, shard);
    return next;
  }
  const displaced = target[to.index];
  if (displaced === undefined) return undefined;
  target[to.index] = shard;
  source[from.index] = displaced;
  return next;
}
