import type { DomainError } from "../result.ts";
import { createRng } from "../rng.ts";
import { branchFloors } from "./branches.ts";
import { buildSpine } from "./spine.ts";
import { viewForLanguage } from "./tracks.ts";
import type { DungeonPlan, PlanRequest, RationaleEntry } from "./types.ts";

export type PlanResult =
  | { ok: true; plan: DungeonPlan }
  | { ok: false; error: DomainError; rationale: RationaleEntry[] };

/**
 * Planner v1 (PROMPT.md section 10, docs/PLANNER.md): build a seeded, branching dungeon from content and the learner
 * model. Pure: the same request always produces the same plan, and nothing here reads files, clocks, or randomness
 * other than the request's seed.
 */
export function planDungeon(request: PlanRequest): PlanResult {
  const rng = createRng(request.seed, "planner");
  const view = viewForLanguage(request.catalog, request.learner, request.language, request.balance.rating.initial_player);
  const rationale: RationaleEntry[] = [];

  const spine = buildSpine(request, view, rng, rationale);
  if (!spine) {
    return {
      ok: false,
      error: { code: "no-content", message: `There are no ${request.language} challenges this character can play yet.` },
      rationale,
    };
  }
  const { rooms, floors, edges } = branchFloors(request, view, spine, rng, rationale);
  return {
    ok: true,
    plan: { seed: request.seed, length: request.length, language: request.language, floors, rooms, edges, rationale },
  };
}
