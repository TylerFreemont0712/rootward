import { challengeRating, expectedSuccess } from "./elo.ts";
import type { TrackView } from "./tracks.ts";
import type { NodeProgress, PlannerChallenge, PlannerNode, PlanRequest } from "./types.ts";

export interface ChallengePick {
  challenge: PlannerChallenge;
  /** Expected P(success) for this player on this challenge. */
  expected: number;
  /** False when the challenge was seen within the recency window. */
  fresh: boolean;
}

export interface ChallengeQuery {
  nodeId: string;
  kind: PlannerChallenge["kind"];
  target: number;
  exclude: ReadonlySet<string>;
  /** Concepts this dungeon has introduced before the room being filled, with their equivalents (`familiarConcepts`). */
  familiar: ReadonlySet<string>;
}

/** Mastery at which the player has met a concept, so a challenge may use it without teaching it. */
const MET = 1;

/**
 * Challenges that can serve a node in the request's language, best first (PROMPT.md section 10, step 3): not seen
 * recently before seen, then closest to the target success rate, then by id so ties never depend on input order.
 * Every other concept a challenge uses must be familiar (met before, or introduced earlier in this dungeon), so a
 * first fight on strings never quietly needs dictionaries as well.
 */
export function rankChallenges(request: PlanRequest, view: TrackView, query: ChallengeQuery): ChallengePick[] {
  const equivalents = view.equivalents(query.nodeId);
  const rating = view.progress(query.nodeId).rating;
  const usable = (concept: string) =>
    equivalents.has(concept) || query.familiar.has(concept) || view.mastery(concept) >= MET;
  return request.catalog.challenges
    .filter(
      (challenge) =>
        challenge.kind === query.kind &&
        challenge.languages.includes(request.language) &&
        !query.exclude.has(challenge.id) &&
        challenge.concepts.some((concept) => equivalents.has(concept)) &&
        challenge.concepts.every(usable),
    )
    .map((challenge) => ({
      challenge,
      expected: expectedSuccess(rating, challengeRating(challenge.difficulty, request.balance.rating)),
      fresh: !request.learner.recentChallenges.has(challenge.id),
    }))
    .sort(
      (a, b) =>
        Number(b.fresh) - Number(a.fresh) ||
        Math.abs(a.expected - query.target) - Math.abs(b.expected - query.target) ||
        a.challenge.id.localeCompare(b.challenge.id),
    );
}

/** The concept ids a set of nodes stands for: each node and its equivalents. */
export function familiarConcepts(view: TrackView, nodeIds: Iterable<string>): Set<string> {
  const familiar = new Set<string>();
  for (const id of nodeIds) {
    for (const equivalent of view.equivalents(id)) familiar.add(equivalent);
  }
  return familiar;
}

export interface RankedNode {
  node: PlannerNode;
  progress: NodeProgress;
  score: number;
}

/**
 * Frontier nodes (PROMPT.md section 10, step 2): below mastery 3 with every prerequisite at mastery 3 or more,
 * ranked by Oath weight, class affinity, and closeness to completion.
 */
export function rankFrontier(request: PlanRequest, view: TrackView, jitter: () => number): RankedNode[] {
  return view.applicable
    .filter((node) => view.progress(node.id).mastery < 3 && view.prerequisitesMet(node.id, 3))
    .map((node) => scoreNode(request, view, node, jitter))
    .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id));
}

/**
 * Concepts that build directly on concepts this run already introduces (docs/PLANNER.md, step 2): below mastery 3, at
 * least one prerequisite in the run, and every other prerequisite at mastery 3. Lowest tier first.
 */
export function rankNext(
  request: PlanRequest,
  view: TrackView,
  inRun: ReadonlySet<string>,
  jitter: () => number,
): RankedNode[] {
  return view.applicable
    .filter(
      (node) =>
        !inRun.has(node.id) &&
        view.progress(node.id).mastery < 3 &&
        node.prerequisites.some((id) => inRun.has(id)) &&
        view.prerequisitesMet(node.id, 3, inRun),
    )
    .map((node) => scoreNode(request, view, node, jitter))
    .sort((a, b) => a.node.tier - b.node.tier || b.score - a.score || a.node.id.localeCompare(b.node.id));
}

/** The fallback when no frontier node has content yet: any node below mastery 5, lowest tier first. */
export function rankPractice(request: PlanRequest, view: TrackView, jitter: () => number): RankedNode[] {
  return view.applicable
    .filter((node) => view.progress(node.id).mastery < 5)
    .map((node) => scoreNode(request, view, node, jitter))
    .sort((a, b) => a.node.tier - b.node.tier || b.score - a.score || a.node.id.localeCompare(b.node.id));
}

function scoreNode(request: PlanRequest, view: TrackView, node: PlannerNode, jitter: () => number): RankedNode {
  const progress = view.progress(node.id);
  // Oath and class pull realms forward, partly finished nodes come next, and a tiny seeded jitter varies ties.
  const score =
    (request.oathRealms[node.realm] ?? 0) +
    (request.classAffinity[node.realm] ?? 0) +
    progress.mastery / 3 +
    jitter() * 0.01;
  return { node, progress, score };
}
