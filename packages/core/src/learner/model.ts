import type { Balance } from "@rootward/content-schema";
import { challengeRating, type RatingOutcome, updateRating } from "../planner/elo.ts";
import type { LearnerSnapshot, PlannerNode } from "../planner/types.ts";
import { creditedNodes } from "./credit.ts";
import type { DungeonEvidence, Evidence, FightEvidence, LearnerModel, NodeState, Version } from "./types.ts";

export interface LearnerContext {
  balance: Balance;
  /** Skill nodes by id: their tiers set the rating K factor, and their `transfersTo` links route credit. */
  nodes: ReadonlyMap<string, PlannerNode>;
}

/** Mastery levels (PROMPT.md section 9.2). Mastered (5) needs a Teach-back, which arrives with the AI layer. */
export const MASTERY = { unseen: 0, seen: 1, assisted: 2, unaided: 3, retained: 4, mastered: 5 } as const;

/** A new Maintainer ships as 1.0.0, so the first realm boss makes 2.0.0 and its unlock (PROMPT.md section 9.4). */
const FIRST_VERSION: Version = { major: 1, minor: 0, patch: 0 };
const DAY_MS = 24 * 60 * 60 * 1000;

export function emptyLearnerModel(): LearnerModel {
  return {
    nodes: new Map(),
    weakSpots: new Map(),
    lastPlayed: new Map(),
    version: FIRST_VERSION,
    fights: 0,
    dungeonsCleared: 0,
  };
}

/** Fold evidence, oldest first, into a learner model. */
export function buildLearnerModel(evidence: readonly Evidence[], ctx: LearnerContext): LearnerModel {
  // LEARN: Array.prototype.sort is stable, so evidence with the same timestamp keeps its log order.
  return [...evidence]
    .sort((a, b) => a.at.localeCompare(b.at))
    .reduce((model, item) => applyEvidence(model, item, ctx), emptyLearnerModel());
}

/** The only way the learner model changes (PROMPT.md section 14.3). Pure: it returns a new model. */
export function applyEvidence(model: LearnerModel, evidence: Evidence, ctx: LearnerContext): LearnerModel {
  return evidence.kind === "fight" ? applyFight(model, evidence, ctx) : applyDungeon(model, evidence, ctx.balance);
}

function applyFight(model: LearnerModel, fight: FightEvidence, { balance, nodes }: LearnerContext): LearnerModel {
  const credited = creditedNodes(fight.concepts, fight.language, nodes);
  const won = fight.outcome === "won";
  const unaided = won && fight.hintsTaken === 0;
  // A retreat, running out of Focus, and a Kernel Panic all score 0 for the rating, and they still count as having met
  // the concept: the player worked on it and, except after a panic, studied the reference solution.
  const ratingOutcome: RatingOutcome = unaided ? "unaided" : won ? "assisted" : "retreat";
  const reached = unaided ? MASTERY.unaided : won ? MASTERY.assisted : MASTERY.seen;
  const challenge = challengeRating(fight.difficulty, balance.rating);
  // A boss's Commits are shared among its concepts; any other fight gives each concept the full amount.
  const splitBoss = fight.tier === "boss" && balance.commits.boss_split_across_concepts;
  const commits = !won ? 0 : splitBoss ? Math.floor(fight.commits / Math.max(1, credited.length)) : fight.commits;

  const nextNodes = new Map(model.nodes);
  for (const id of credited) {
    const before: NodeState = nextNodes.get(id) ?? {
      mastery: MASTERY.unseen,
      rating: balance.rating.initial_player,
      commits: 0,
      attempts: 0,
      wins: 0,
      lastSeen: fight.at,
      unaidedWins: [],
    };
    const unaidedWins = unaided ? [...before.unaidedWins, fight.at] : before.unaidedWins;
    const spaced = unaided && spansDays(unaidedWins, balance.mastery.retained_min_days_between_passes);
    nextNodes.set(id, {
      mastery: Math.max(before.mastery, spaced ? MASTERY.retained : reached),
      rating: updateRating(before.rating, challenge, ratingOutcome, nodes.get(id)?.tier ?? 0, balance.rating),
      commits: before.commits + commits,
      attempts: before.attempts + 1,
      wins: before.wins + (won ? 1 : 0),
      lastSeen: fight.at,
      unaidedWins,
    });
  }

  const weakSpots = new Map(model.weakSpots);
  for (const category of fight.failingCategories) weakSpots.set(category, (weakSpots.get(category) ?? 0) + 1);
  const version = won
    ? { ...model.version, patch: model.version.patch + balance.character_version.patch_per_encounter }
    : model.version;
  return {
    ...model,
    nodes: nextNodes,
    weakSpots,
    lastPlayed: new Map(model.lastPlayed).set(fight.challengeId, fight.at),
    version,
    fights: model.fights + 1,
  };
}

function applyDungeon(model: LearnerModel, dungeon: DungeonEvidence, balance: Balance): LearnerModel {
  if (dungeon.outcome !== "completed") return model;
  // A minor release resets the patch number, as semver does.
  const { major, minor } = model.version;
  return {
    ...model,
    version: { major, minor: minor + balance.character_version.minor_per_dungeon, patch: 0 },
    dungeonsCleared: model.dungeonsCleared + 1,
  };
}

/** True when the earliest and latest timestamps are at least `days` apart. */
function spansDays(timestamps: readonly string[], days: number): boolean {
  const times = timestamps.map((at) => Date.parse(at));
  return Math.max(...times) - Math.min(...times) >= days * DAY_MS;
}

export function formatVersion({ major, minor, patch }: Version): string {
  return `${major}.${minor}.${patch}`;
}

/** What the planner reads from the model (`PlanRequest.learner`), as of `now` (an ISO timestamp). */
export function learnerSnapshot(model: LearnerModel, now: string, balance: Balance): LearnerSnapshot {
  const recentSince = Date.parse(now) - balance.planner.recency_exclusion_days * DAY_MS;
  return {
    nodes: new Map([...model.nodes].map(([id, node]) => [id, { mastery: node.mastery, rating: node.rating, rotting: false }])),
    // Review cards and Bit Rot need FSRS, which arrives with Rest rooms (ADR-0009).
    dueCards: [],
    recentChallenges: new Set([...model.lastPlayed].flatMap(([id, at]) => (Date.parse(at) >= recentSince ? [id] : []))),
  };
}
