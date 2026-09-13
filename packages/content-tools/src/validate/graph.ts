/**
 * Find cycles in a directed graph given as `id -> ids it points to`. Each cycle is returned as a path whose first id
 * is repeated at the end (a -> b -> a). An acyclic graph returns [].
 *
 * LEARN: depth-first search with three states. "visiting" means the node is on the current path; reaching a visiting
 * node again means the path looped back on itself. Iterating ids in sorted order keeps the output deterministic.
 */
export function findCycles(edges: ReadonlyMap<string, readonly string[]>): string[][] {
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];
  const cycles: string[][] = [];

  const visit = (id: string): void => {
    state.set(id, "visiting");
    path.push(id);
    for (const next of edges.get(id) ?? []) {
      const seen = state.get(next);
      if (seen === "visiting") {
        cycles.push([...path.slice(path.indexOf(next)), next]);
      } else if (seen === undefined) {
        visit(next);
      }
    }
    path.pop();
    state.set(id, "done");
  };

  for (const id of [...edges.keys()].sort()) {
    if (!state.has(id)) visit(id);
  }
  return cycles;
}
