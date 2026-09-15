import { type MapRoomKind, type ShardrunLayer } from "@rootward/content-schema";
import { createRng, pickWeighted, shuffled } from "../rng.ts";
import type { LayerMap, MapNode } from "./types.ts";

// Layer maps (ADR-0013), in the spirit of Slay the Spire: several paths climb from the bottom row to the top, each step
// moving up one row and at most one column sideways, and no path crosses another. The rooms they touch are the map, so
// branches and merges come out of the walk itself. The boss waits alone above the top row.

const ROOM_KINDS: readonly MapRoomKind[] = ["fight", "elite", "rest", "forge", "treasure"];
/** Kinds that should not follow themselves along a path: two rests or two elites in a row waste a choice. */
const NO_REPEAT: ReadonlySet<MapRoomKind> = new Set(["elite", "rest", "forge", "treasure"]);
/** Attempts to find a kind that does not repeat its parent before settling for a fight. */
const KIND_ATTEMPTS = 8;

export function roomId(layer: number, row: number, col: number): string {
  return `l${layer}-r${row}-c${col}`;
}

export function bossId(layer: number): string {
  return `l${layer}-boss`;
}

export function generateLayerMap(seed: string, layerIndex: number, layer: ShardrunLayer): LayerMap {
  const rng = createRng(seed, `map:${layerIndex}`);
  const cells = new Map<string, { row: number; col: number }>();
  const edges = new Map<string, [string, string]>();
  /** Column moves already drawn, as `row:from>to`, to keep paths from crossing. */
  const moves = new Set<string>();
  const visit = (row: number, col: number): string => {
    const id = roomId(layerIndex, row, col);
    if (!cells.has(id)) cells.set(id, { row, col });
    return id;
  };
  // LEARN: two paths cross when one steps right exactly where a neighbor steps left. Checking the mirror move before
  // drawing is enough; going straight up can never cross anything, so every step has at least one legal choice.
  const crosses = (row: number, from: number, to: number): boolean =>
    (to === from + 1 && moves.has(`${row}:${from + 1}>${from}`)) || (to === from - 1 && moves.has(`${row}:${from - 1}>${from}`));

  const columns = Array.from({ length: layer.columns }, (_, col) => col);
  const starts = shuffled(columns, rng);
  for (let path = 0; path < layer.paths; path++) {
    // The first paths start in different columns, so the bottom row always offers a real choice.
    let col = path < starts.length ? (starts[path] ?? 0) : Math.floor(rng() * layer.columns);
    let from = visit(0, col);
    for (let row = 0; row < layer.rows - 1; row++) {
      const options = [col - 1, col, col + 1].filter((next) => next >= 0 && next < layer.columns && !crosses(row, col, next));
      const next = options[Math.floor(rng() * options.length)] ?? col;
      const to = visit(row + 1, next);
      edges.set(`${from}>${to}`, [from, to]);
      moves.add(`${row}:${col}>${next}`);
      col = next;
      from = to;
    }
  }

  const parents = new Map<string, string[]>();
  for (const [from, to] of edges.values()) parents.set(to, [...(parents.get(to) ?? []), from]);
  const kinds = new Map<string, MapRoomKind>();
  const ordered = [...cells.entries()].sort(([, a], [, b]) => a.row - b.row || a.col - b.col);
  const nodes: MapNode[] = ordered.map(([id, { row, col }]) => {
    const kind = fixedKind(layer, row) ?? pickKind(layer, row, parents.get(id) ?? [], kinds, rng);
    kinds.set(id, kind);
    return { id, row, col, kind };
  });

  const boss: MapNode = { id: bossId(layerIndex), row: layer.rows, col: Math.floor((layer.columns - 1) / 2), kind: "boss" };
  const topEdges = nodes.filter((node) => node.row === layer.rows - 1).map((node): [string, string] => [node.id, boss.id]);
  return { nodes: [...nodes, boss], edges: [...edges.values(), ...topEdges] };
}

/** The rooms that can be entered next: the bottom row before the first room of a layer, then the rooms above. */
export function nextRooms(map: LayerMap, position: string | null): MapNode[] {
  if (position === null) return map.nodes.filter((node) => node.row === 0);
  const targets = new Set(map.edges.filter(([from]) => from === position).map(([, to]) => to));
  return map.nodes.filter((node) => targets.has(node.id));
}

function fixedKind(layer: ShardrunLayer, row: number): MapRoomKind | undefined {
  return layer.fixed_rows[String(row)] ?? layer.fixed_rows[String(row - layer.rows)];
}

function pickKind(
  layer: ShardrunLayer,
  row: number,
  parents: readonly string[],
  kinds: ReadonlyMap<string, MapRoomKind>,
  rng: () => number,
): MapRoomKind {
  const candidates = ROOM_KINDS.filter((kind) => kind !== "elite" || row >= layer.elite_from_row).map((kind) => ({
    kind,
    weight: layer.weights[kind],
  }));
  for (let attempt = 0; attempt < KIND_ATTEMPTS; attempt++) {
    const kind = pickWeighted(candidates, rng())?.kind ?? "fight";
    const repeats = NO_REPEAT.has(kind) && parents.some((parent) => kinds.get(parent) === kind);
    if (!repeats) return kind;
  }
  return "fight";
}
