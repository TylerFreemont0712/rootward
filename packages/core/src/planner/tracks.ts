import type { LearnerSnapshot, NodeProgress, PlannerCatalog, PlannerNode } from "./types.ts";

// Language tracks (ideas/pedagogy/curriculum-sequencing.md). Node ids start with a track: a language (`py`, `js`)
// or a shared domain (`concept`, `ds`, `algo`). Language nodes point up to shared nodes with `transfers_to`, which is
// how progress carries over between languages and how a challenge tagged for one language can serve another.

export const LANGUAGE_TRACKS: Readonly<Record<string, string>> = {
  python: "py",
  javascript: "js",
  typescript: "ts",
  bash: "sh",
  sql: "sql",
  go: "go",
  rust: "rs",
  c: "c",
  cpp: "cpp",
};

const LANGUAGE_PREFIXES = new Set(Object.values(LANGUAGE_TRACKS));

export function trackOf(nodeId: string): string {
  return nodeId.split(".")[0] ?? nodeId;
}

/** True for nodes in a language's track (py.*, js.*); false for shared nodes (concept.*, ds.*). */
export function isLanguageNode(nodeId: string): boolean {
  return LANGUAGE_PREFIXES.has(trackOf(nodeId));
}

const UNSEEN = (initialRating: number): NodeProgress => ({ mastery: 0, rating: initialRating, rotting: false });

/** How the skill graph looks to a player of one language. */
export interface TrackView {
  /** Nodes the planner may schedule: the language's own track plus shared nodes it has no equivalent for. */
  applicable: readonly PlannerNode[];
  node(nodeId: string): PlannerNode | undefined;
  /** Progress on a node. A shared node's mastery is the best of itself and every language node that transfers to it. */
  progress(nodeId: string): NodeProgress;
  /** Mastery as this language sees it: a node from another language's track counts through its shared concept. */
  mastery(nodeId: string): number;
  /**
   * Node ids whose challenges count as practice for `nodeId`: itself, its shared concept, and other languages' nodes
   * for that concept. Two nodes of the same track that share a concept (`py.strings.basics` and `py.strings.split`)
   * are different lessons, so they never stand in for each other.
   */
  equivalents(nodeId: string): ReadonlySet<string>;
  /** True when every prerequisite has reached the given mastery, or is in `assumed` (introduced earlier in the run). */
  prerequisitesMet(nodeId: string, minMastery: number, assumed?: ReadonlySet<string>): boolean;
}

export function viewForLanguage(
  catalog: PlannerCatalog,
  learner: LearnerSnapshot,
  language: string,
  initialRating: number,
): TrackView {
  const byId = new Map(catalog.nodes.map((node) => [node.id, node]));
  const track = LANGUAGE_TRACKS[language];
  const transferredBy = new Map<string, PlannerNode[]>();
  for (const node of catalog.nodes) {
    if (node.transfersTo === undefined) continue;
    const list = transferredBy.get(node.transfersTo) ?? [];
    list.push(node);
    transferredBy.set(node.transfersTo, list);
  }

  const ownProgress = (id: string) => learner.nodes.get(id) ?? UNSEEN(initialRating);
  const progress = (id: string): NodeProgress => {
    const own = ownProgress(id);
    if (isLanguageNode(id)) return own;
    const children = transferredBy.get(id) ?? [];
    return children.reduce(
      (best, child) => {
        const other = ownProgress(child.id);
        return other.mastery > best.mastery ? { ...best, mastery: other.mastery } : best;
      },
      own,
    );
  };

  const applicable = catalog.nodes.filter((node) => {
    if (isLanguageNode(node.id)) return trackOf(node.id) === track;
    // A shared node is scheduled directly only when this language has no node of its own for that concept.
    return !(transferredBy.get(node.id) ?? []).some((child) => trackOf(child.id) === track);
  });

  const equivalents = (id: string): ReadonlySet<string> => {
    const result = new Set([id]);
    const ownTrack = isLanguageNode(id) ? trackOf(id) : undefined;
    const shared = ownTrack === undefined ? id : byId.get(id)?.transfersTo;
    if (shared !== undefined) {
      result.add(shared);
      for (const child of transferredBy.get(shared) ?? []) {
        if (trackOf(child.id) !== ownTrack) result.add(child.id);
      }
    }
    return result;
  };

  const masteryOf = (id: string): number => {
    // A node from another language's track counts through its shared concept.
    if (isLanguageNode(id) && trackOf(id) !== track) {
      const shared = byId.get(id)?.transfersTo;
      return Math.max(ownProgress(id).mastery, shared === undefined ? 0 : progress(shared).mastery);
    }
    return progress(id).mastery;
  };

  return {
    applicable,
    node: (id) => byId.get(id),
    progress,
    mastery: masteryOf,
    equivalents,
    prerequisitesMet: (id, minMastery, assumed) =>
      (byId.get(id)?.prerequisites ?? []).every((p) => assumed?.has(p) === true || masteryOf(p) >= minMastery),
  };
}
