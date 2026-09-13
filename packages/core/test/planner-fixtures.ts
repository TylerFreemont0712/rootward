import type {
  LearnerSnapshot,
  NodeProgress,
  PlanRequest,
  PlannerCatalog,
  PlannerChallenge,
  PlannerNode,
  PlannerPuzzle,
} from "../src/planner/types.ts";
import { createRng } from "../src/rng.ts";
import { balance } from "./fixtures.ts";

/** A random but valid catalog: a prerequisite DAG where every node has fights, plus some bosses, puzzles, lessons. */
export function syntheticCatalog(seed: string, nodeCount = 12): PlannerCatalog {
  const next = createRng(seed, "catalog");
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const nodes: PlannerNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const earlier = nodes.map((node) => node.id);
    const prerequisites = i < 3 ? [] : [...new Set([earlier[int(0, i - 1)], earlier[int(0, i - 1)]])].filter(
      (id): id is string => id !== undefined,
    );
    nodes.push({ id: `py.topic.n${i}`, realm: i % 3 === 0 ? "grove" : "foundry", tier: Math.min(4, Math.floor(i / 4)), prerequisites });
  }

  const challenges: PlannerChallenge[] = [];
  const puzzles: PlannerPuzzle[] = [];
  for (const node of nodes) {
    const count = int(2, 5);
    for (let c = 0; c < count; c++) {
      challenges.push({
        id: `${node.id}.fight${c}`,
        kind: "encounter",
        realm: node.realm,
        concepts: [node.id],
        difficulty: int(1, 9),
        languages: next() < 0.5 ? ["python"] : ["python", "javascript"],
      });
    }
    for (let p = int(0, 3); p > 0; p--) puzzles.push({ id: `${node.id}.puzzle${p}`, concepts: [node.id], difficulty: int(1, 5) });
  }
  for (let b = 0; b < 3; b++) {
    const first = nodes[int(0, nodes.length - 1)];
    const second = nodes[int(0, nodes.length - 1)];
    if (!first || !second) continue;
    challenges.push({
      id: `boss${b}`,
      kind: "boss",
      realm: first.realm,
      concepts: [...new Set([first.id, second.id])],
      difficulty: int(6, 9),
      languages: ["python"],
    });
  }
  const lessons = new Set(nodes.filter(() => next() < 0.7).map((node) => node.id));
  return { nodes, challenges, puzzles, lessons };
}

/** A random learner: some mastered nodes, some rotting, a few due cards, some recently seen challenges. */
export function syntheticLearner(seed: string, catalog: PlannerCatalog): LearnerSnapshot {
  const next = createRng(seed, "learner");
  const nodes = new Map<string, NodeProgress>();
  for (const node of catalog.nodes) {
    const mastery = next() < 0.4 ? 3 + Math.floor(next() * 3) : Math.floor(next() * 3);
    nodes.set(node.id, { mastery, rating: 800 + Math.floor(next() * 400), rotting: mastery >= 3 && next() < 0.2 });
  }
  const dueCards = catalog.nodes
    .filter((node) => (nodes.get(node.id)?.mastery ?? 0) >= 1 && next() < 0.3)
    .map((node, index) => ({ cardId: `${node.id}#card${index}`, nodeId: node.id }));
  const recentChallenges = new Set(catalog.challenges.filter(() => next() < 0.2).map((challenge) => challenge.id));
  return { nodes, dueCards, recentChallenges };
}

export const EMPTY_LEARNER: LearnerSnapshot = { nodes: new Map(), dueCards: [], recentChallenges: new Set() };

export function planRequest(parts: Partial<PlanRequest> & Pick<PlanRequest, "catalog">): PlanRequest {
  return {
    seed: "plan-seed",
    length: "long",
    language: "python",
    learner: EMPTY_LEARNER,
    oathRealms: { foundry: 1 },
    classAffinity: { foundry: 1, grove: 1 },
    balance,
    ...parts,
  };
}
