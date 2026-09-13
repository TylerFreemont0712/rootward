import type { ContentIndex } from "@rootward/content-tools";
import type { LearnerSnapshot, PlannerCatalog, PlannerChallenge } from "@rootward/core";

/**
 * Reduce loaded content to what the planner needs (ADR-0007). Only challenges the run flow can play today are offered:
 * io-tested code challenges. A challenge guarded by a boss-tier enemy is a boss candidate.
 *
 * Shrine lessons and puzzles are left out on purpose until Shrine and Puzzle rooms are playable, so plans contain only
 * fight rooms (ADR-0008).
 */
export function buildPlannerCatalog(index: ContentIndex): PlannerCatalog {
  const challenges: PlannerChallenge[] = [];
  for (const { manifest } of index.challenges.values()) {
    if (manifest.deprecated || manifest.kind !== "code" || manifest.tests.form !== "io") continue;
    const enemy = index.enemies.get(manifest.enemy.template)?.value;
    challenges.push({
      id: manifest.id,
      kind: enemy?.tier === "boss" ? "boss" : "encounter",
      realm: manifest.realm,
      concepts: manifest.concepts,
      difficulty: manifest.difficulty,
      languages: manifest.languages,
    });
  }
  return {
    nodes: [...index.skills.values()].map(({ value }) => ({
      id: value.id,
      realm: value.realm,
      tier: value.tier,
      prerequisites: value.prerequisites,
      ...(value.transfers_to !== undefined ? { transfersTo: value.transfers_to } : {}),
    })),
    challenges,
    puzzles: [],
    lessons: new Set(),
  };
}

/** The learner as the planner sees them until the learner model exists: every node unseen, nothing due. */
export const EMPTY_LEARNER: LearnerSnapshot = { nodes: new Map(), dueCards: [], recentChallenges: new Set() };
