import { describe, expect, it } from "vitest";
import { challengeRating, expectedSuccess, updateRating } from "../src/planner/elo.ts";
import { balance } from "./fixtures.ts";

const rating = balance.rating;

describe("Elo helpers", () => {
  it("places difficulty 5 at the base rating and scales by difficulty", () => {
    expect(challengeRating(5, rating)).toBe(rating.challenge_rating_base);
    expect(challengeRating(7, rating) - challengeRating(5, rating)).toBe(2 * rating.challenge_rating_per_difficulty);
  });

  it("expects even odds for equal ratings and about 91% for a 400-point edge", () => {
    expect(expectedSuccess(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedSuccess(1400, 1000)).toBeCloseTo(10 / 11);
    expect(expectedSuccess(1000, 1400)).toBeCloseTo(1 / 11);
  });

  it("raises the rating more for an unexpected success and lowers it on a retreat", () => {
    const hard = challengeRating(8, rating);
    const easy = challengeRating(2, rating);
    const gainHard = updateRating(1000, hard, "unaided", 1, rating) - 1000;
    const gainEasy = updateRating(1000, easy, "unaided", 1, rating) - 1000;
    expect(gainHard).toBeGreaterThan(gainEasy);
    expect(gainEasy).toBeGreaterThan(0);
    expect(updateRating(1000, easy, "retreat", 1, rating)).toBeLessThan(1000);
  });

  it("never moves a rating further than the per-attempt limit", () => {
    // With the shipped K values one attempt cannot reach the limit, so exercise the clamp with an exaggerated K.
    const aggressive = { ...rating, k_by_tier: { ...rating.k_by_tier, "0": 1000 } };
    expect(updateRating(1000, 1000, "unaided", 0, aggressive) - 1000).toBe(rating.max_change_per_attempt);
    expect(updateRating(1000, 1000, "retreat", 0, aggressive) - 1000).toBe(-rating.max_change_per_attempt);
  });
});
