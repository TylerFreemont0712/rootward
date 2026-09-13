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
}

/**
 * Challenges that can serve a node in the request's language, best first (PROMPT.md section 10, step 3): not seen
 * recently before seen, then closest to the target success rate, then by id so ties never depend on input order.
 */
export function rankChallenges(request: PlanRequest, view: TrackView, query: ChallengeQuery): ChallengePick[] {
  const equivalents = view.equivalents(query.nodeId);
  const rating = view.progress(query.nodeId).rating;
  return request.catalog.challenges
    .filter(
      (challenge) =>
        challenge.kind === query.kind &&
        challenge.languages.includes(request.language) &&
        !query.exclude.has(challenge.id) &&
        challenge.concepts.some((concept) => equivalents.has(concept)),
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
