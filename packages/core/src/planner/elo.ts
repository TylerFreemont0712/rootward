import type { Balance } from "@rootward/content-schema";
import { curriculumTierKey } from "../run/keys.ts";

// Elo-style difficulty matching (ideas/pedagogy/assessment-and-difficulty.md, ideas/solutions/adaptive-difficulty.md).
// LEARN: Elo turns "how strong is the player at this concept" and "how hard is this challenge" into numbers on one
// scale. The gap between them predicts the chance of success, and each result nudges the player's number toward
// what actually happened. With a population of one, challenge ratings stay fixed and only the player's move.

export type RatingOutcome = "unaided" | "assisted" | "retreat";

/** A challenge's rating: base + per_difficulty * (difficulty - 5), so difficulty 5 sits at the base. */
export function challengeRating(difficulty: number, rating: Balance["rating"]): number {
  return rating.challenge_rating_base + rating.challenge_rating_per_difficulty * (difficulty - 5);
}

/** Expected probability of success: 1 / (1 + 10^((challenge - player) / 400)). */
export function expectedSuccess(playerRating: number, challenge: number): number {
  return 1 / (1 + 10 ** ((challenge - playerRating) / 400));
}

/** The player's rating after one attempt, moved by K * (actual - expected) and clamped. */
export function updateRating(
  playerRating: number,
  challenge: number,
  outcome: RatingOutcome,
  nodeTier: number,
  rating: Balance["rating"],
): number {
  const k = rating.k_by_tier[curriculumTierKey(nodeTier)];
  const change = k * (rating.actual_score[outcome] - expectedSuccess(playerRating, challenge));
  const limit = rating.max_change_per_attempt;
  return playerRating + Math.max(-limit, Math.min(limit, change));
}
